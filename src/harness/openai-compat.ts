import { env } from '../util/env.js';
import { UpliftError } from '../util/log.js';
import { costFromUsage } from './pricing.js';
import {
  buildToolSpecs,
  executeTool,
  filterToolSpecs,
  type ToolSpec
} from './tools.js';
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_TIMEOUT_MS,
  type Harness,
  type HarnessAvailability,
  type HarnessContext,
  type InstalledSkill,
  type RunRequest,
  type RunResult,
  type TranscriptEvent
} from './types.js';

interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAICompatConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** 单次 HTTP 请求超时 */
  requestTimeoutMs?: number;
  /** 网络/5xx/429 重试次数 */
  maxRetries?: number;
  /** 额外请求体字段（某些中转站要 stream=false / thinking 开关等） */
  extraBody?: Record<string, unknown>;
}

export function buildSystemPrompt(ctx: HarnessContext): string {
  const lines: string[] = [];
  lines.push('You are an autonomous coding agent working inside an isolated workspace.');
  lines.push(`Workspace root: ${ctx.cwd}`);
  lines.push('All file paths are relative to the workspace root. Use the provided tools; do not assume files you have not read.');
  lines.push('');
  if (ctx.skills.length > 0) {
    lines.push('## Available skills');
    lines.push('');
    for (const s of ctx.skills) {
      lines.push(`- **${s.name}** — ${s.description || '(no description)'}`);
    }
    lines.push('');
    lines.push(
      'Rules for skills: before starting work, decide whether any skill above applies to the task. ' +
        'If one does, call `activate_skill` with its exact name FIRST, then follow its instructions. ' +
        'If none applies, do not call `activate_skill` at all.'
    );
  } else {
    lines.push('No skills are installed in this environment.');
  }
  lines.push('');
  lines.push('When the workspace is in its final state, call `finish` with a one-line summary.');
  if (ctx.systemExtra) {
    lines.push('');
    lines.push(ctx.systemExtra);
  }
  return lines.join('\n');
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export class OpenAICompatHarness implements Harness {
  name = 'openai-compat';
  supportsActivationEvents = true;
  private cfg: OpenAICompatConfig;

  constructor(cfg: OpenAICompatConfig = {}) {
    this.cfg = cfg;
  }

  private get baseUrl(): string {
    return (this.cfg.baseUrl ?? env('UPLIFT_BASE_URL') ?? env('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  private get apiKey(): string {
    return this.cfg.apiKey ?? env('UPLIFT_API_KEY') ?? env('OPENAI_API_KEY') ?? '';
  }

  private get model(): string {
    return this.cfg.model ?? env('UPLIFT_MODEL') ?? '';
  }

  async available(): Promise<HarnessAvailability> {
    const key = this.apiKey;
    if (!key) {
      return { ok: false, detail: 'UPLIFT_API_KEY / OPENAI_API_KEY 都没设', activationEvents: true };
    }
    if (!this.model) {
      return { ok: false, detail: '没有模型 id（--model 或 UPLIFT_MODEL）', activationEvents: true };
    }
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000)
      });
      if (!res.ok) return { ok: false, detail: `GET /models -> HTTP ${res.status}`, activationEvents: true };
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      const ids = (body.data ?? []).map((d) => d.id).filter(Boolean) as string[];
      if (ids.length > 0 && !ids.includes(this.model)) {
        return {
          ok: false,
          detail: `模型 ${this.model} 不在端点清单里（可用示例：${ids.slice(0, 6).join(', ')}）`,
          activationEvents: true
        };
      }
      return { ok: true, detail: `${this.baseUrl} · ${this.model}`, activationEvents: true };
    } catch (e) {
      return {
        ok: false,
        detail: `连不上 ${this.baseUrl}：${e instanceof Error ? e.message : String(e)}`,
        activationEvents: true
      };
    }
  }

  private async post(pathname: string, body: unknown, deadline: number): Promise<any> {
    const attemptMax = this.cfg.maxRetries ?? 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < attemptMax; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 1000) throw new Error('deadline exceeded before request');
      const perReq = Math.min(this.cfg.requestTimeoutMs ?? 120_000, remaining);
      try {
        const res = await fetch(`${this.baseUrl}${pathname}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(perReq)
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (RETRYABLE_STATUS.has(res.status) && attempt < attemptMax - 1) {
            await sleep(600 * 2 ** attempt);
            continue;
          }
          throw new UpliftError(
            `模型端点返回 HTTP ${res.status}`,
            text.slice(0, 500) || res.statusText,
            res.status === 401 ? '检查 UPLIFT_API_KEY' : '稍后重试，或用 --model 换一个可用模型',
            1
          );
        }
        return await res.json();
      } catch (e) {
        lastErr = e;
        if (e instanceof UpliftError) throw e;
        if (attempt < attemptMax - 1) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async run(ctx: HarnessContext, req: RunRequest): Promise<RunResult> {
    const startedAt = Date.now();
    const maxSteps = req.maxSteps ?? DEFAULT_MAX_STEPS;
    const deadline = startedAt + (req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const model = this.model;
    if (!model) throw new UpliftError('缺模型 id', '--model 必填，且不许用 latest', '例如 --model glm-5.3-flash');
    if (!this.apiKey) throw new UpliftError('缺 API key', 'UPLIFT_API_KEY / OPENAI_API_KEY 都没设', '在环境变量里给一个 key');

    const events: TranscriptEvent[] = [];
    const activated: string[] = [];
    const push = (type: TranscriptEvent['type'], data: Record<string, unknown> = {}) =>
      events.push({ ts: new Date().toISOString(), type, ...data });

    // forced activation：把指定技能的正文直接注入系统提示，并记成 activation 事件
    const preloaded = (req.preloadSkillNames ?? [])
      .map((name) => ctx.skills.find((s) => s.name === name))
      .filter((s): s is InstalledSkill => Boolean(s));

    let systemPrompt = buildSystemPrompt(ctx);
    if (preloaded.length > 0) {
      const blocks = preloaded.map((s) => `### ${s.name}\n\n${s.body}`).join('\n\n---\n\n');
      systemPrompt +=
        `\n\n## Preloaded skill instructions\n\n` +
        `The following skill(s) have already been activated for this task. Follow them.\n\n${blocks}`;
      for (const s of preloaded) {
        activated.push(s.name);
        push('activation', { name: s.name, forced: true });
      }
    }
    push('system', { content: systemPrompt });

    const userContent = req.injectedToolOutput
      ? `${req.prompt}\n\n[workspace/tool-output.txt]\n${req.injectedToolOutput}`
      : req.prompt;
    push('user', { content: userContent });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    const specs: ToolSpec[] = filterToolSpecs(
      buildToolSpecs(ctx.skills.map((s) => s.name), req.allowShell !== false),
      req.tools
    );
    const toolNames = specs.map((s) => s.function.name);

    let finalText = '';
    let toolCalls = 0;
    let steps = 0;
    let timedOut = false;
    let error: string | undefined;
    let usageIn = 0;
    let usageOut = 0;
    let providerCost: number | null = null;

    try {
      for (let step = 0; step < maxSteps; step++) {
        steps = step + 1;
        if (Date.now() > deadline) {
          timedOut = true;
          break;
        }
        const body: Record<string, unknown> = {
          model,
          messages,
          temperature: req.temperature ?? 0,
          max_tokens: 4096,
          tools: specs,
          tool_choice: 'auto',
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
          ...(this.cfg.extraBody ?? {})
        };
        const response = await this.post('/chat/completions', body, deadline);
        const choice = response?.choices?.[0];
        const u = response?.usage ?? {};
        usageIn += Number(u.prompt_tokens ?? 0);
        usageOut += Number(u.completion_tokens ?? 0);
        if (typeof u.credit === 'number') providerCost = (providerCost ?? 0) + u.credit;
        push('usage', { prompt_tokens: u.prompt_tokens ?? 0, completion_tokens: u.completion_tokens ?? 0 });

        const msg = choice?.message ?? {};
        const calls: ChatToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        const text: string = typeof msg.content === 'string' ? msg.content : '';
        if (text.trim()) push('assistant_text', { content: text.slice(0, 4000) });

        if (calls.length === 0) {
          finalText = text.trim();
          break;
        }

        messages.push({ role: 'assistant', content: text || null, tool_calls: calls });
        let finished = false;
        for (const call of calls) {
          toolCalls += 1;
          const name = call.function?.name ?? '';
          let args: Record<string, unknown> = {};
          try {
            args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          push('tool_call', { name, args });
          if (!toolNames.includes(name)) {
            messages.push({ role: 'tool', tool_call_id: call.id, content: `tool ${name} is not available` });
            push('tool_result', { name, ok: false, content: 'not available' });
            continue;
          }
          const outcome = await executeTool(ctx.cwd, ctx.skills, name, args);
          if (outcome.activatedSkill && !activated.includes(outcome.activatedSkill)) {
            activated.push(outcome.activatedSkill);
            push('activation', { name: outcome.activatedSkill });
          }
          push('tool_result', {
            name,
            ok: outcome.ok,
            content: outcome.content.slice(0, 1500)
          });
          messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.content });
          if (outcome.finished) {
            finished = true;
            finalText = outcome.finalText ?? '';
          }
        }
        if (finished) break;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout|deadline/i.test(error);
      timedOut = timedOut || isTimeout;
      push('error', { error });
    }

    const total = usageIn + usageOut;
    const tableCost = costFromUsage(model, usageIn, usageOut);
    const cost = providerCost !== null ? providerCost : (tableCost ?? 0);
    const costSource: 'provider' | 'price_table' | 'unpriced' =
      providerCost !== null ? 'provider' : tableCost !== null ? 'price_table' : 'unpriced';

    if (finalText) push('final', { content: finalText.slice(0, 2000) });

    return {
      finalText,
      activated,
      events,
      usage: {
        prompt_tokens: usageIn,
        completion_tokens: usageOut,
        total_tokens: total,
        cost_usd: Number(cost.toFixed(6)),
        cost_source: costSource
      },
      toolCalls,
      wallMs: Date.now() - startedAt,
      timedOut,
      error,
      steps
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 给探针用：一次简单问答，不挂工具 */
export async function askOnce(
  harness: OpenAICompatHarness,
  prompt: string,
  opts: { system?: string; model?: string; maxTokens?: number } = {}
): Promise<{ text: string; usage: { prompt_tokens: number; completion_tokens: number } }> {
  const model = opts.model ?? env('UPLIFT_MODEL') ?? '';
  const baseUrl = (env('UPLIFT_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = env('UPLIFT_API_KEY') ?? env('OPENAI_API_KEY') ?? '';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: opts.maxTokens ?? 1024
    }),
    signal: AbortSignal.timeout(180_000)
  });
  if (!res.ok) {
    throw new UpliftError(`judge 调用失败 HTTP ${res.status}`, await res.text().catch(() => ''), '检查 key 与模型');
  }
  const body = (await res.json()) as any;
  return {
    text: body?.choices?.[0]?.message?.content ?? '',
    usage: {
      prompt_tokens: body?.usage?.prompt_tokens ?? 0,
      completion_tokens: body?.usage?.completion_tokens ?? 0
    }
  };
}

export type { InstalledSkill };
