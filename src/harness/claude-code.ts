import fs from 'node:fs';
import path from 'node:path';
import { env } from '../util/env.js';
import { runShell } from '../util/shell.js';
import {
  type Harness,
  type HarnessAvailability,
  type HarnessContext,
  type RunRequest,
  type RunResult,
  type TranscriptEvent
} from './types.js';

/**
 * Claude Code 适配器（外挂式）。
 *
 * 老实说清楚边界（docs/03 探针 2 的「最容易造假」警告）：
 * - 能跑：`claude -p <prompt> --output-format json`，读它的 result/usage。
 * - 激活事件：只有在设置了 UPLIFT_CLAUDE_HOOK_LOG 且那个 jsonl 里确实记了
 *   PreToolUse/Skill 事件时才可用；否则 supportsActivationEvents = false，
 *   探针 2 必须报 supported:false，而不是编一个 precision。
 */
export interface ClaudeCodeConfig {
  bin?: string;
  model?: string;
  hookLog?: string;
}

export class ClaudeCodeHarness implements Harness {
  name = 'claude-code';
  supportsActivationEvents = false;
  private cfg: ClaudeCodeConfig;

  constructor(cfg: ClaudeCodeConfig = {}) {
    this.cfg = cfg;
    this.supportsActivationEvents = Boolean(cfg.hookLog ?? env('UPLIFT_CLAUDE_HOOK_LOG'));
  }

  private get bin(): string {
    return this.cfg.bin ?? env('UPLIFT_CLAUDE_BIN') ?? 'claude';
  }

  async available(): Promise<HarnessAvailability> {
    const isWin = process.platform === 'win32';
    const probe = isWin ? `where ${this.bin}` : `command -v ${this.bin}`;
    const res = await runShell(probe, { timeoutMs: 10_000 });
    if (res.code !== 0 || !res.stdout.trim()) {
      return {
        ok: false,
        detail: `找不到 claude 可执行文件（${this.bin}）。装上 Claude Code 或改用 --harness openai-compat`,
        activationEvents: this.supportsActivationEvents
      };
    }
    return {
      ok: true,
      detail: `${res.stdout.split(/\r?\n/)[0]}${this.supportsActivationEvents ? ' · hook 日志可用' : ' · 激活事件不可观测'}`,
      activationEvents: this.supportsActivationEvents
    };
  }

  async run(ctx: HarnessContext, req: RunRequest): Promise<RunResult> {
    const t0 = Date.now();
    const hookLog = this.cfg.hookLog ?? env('UPLIFT_CLAUDE_HOOK_LOG');
    const before = hookLog && fs.existsSync(hookLog) ? fs.statSync(hookLog).size : 0;

    const args = ['-p', req.prompt, '--output-format', 'json'];
    if (this.cfg.model ?? env('UPLIFT_MODEL')) args.push('--model', (this.cfg.model ?? env('UPLIFT_MODEL')) as string);
    const cmd = [this.bin, ...args.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(' ');
    const res = await runShell(cmd, { cwd: ctx.cwd, timeoutMs: req.timeoutMs ?? 180_000 });

    let usageIn = 0;
    let usageOut = 0;
    let finalText = res.stdout;
    try {
      const parsed = JSON.parse(res.stdout) as {
        result?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        total_cost_usd?: number;
      };
      finalText = parsed.result ?? res.stdout;
      usageIn = parsed.usage?.input_tokens ?? 0;
      usageOut = parsed.usage?.output_tokens ?? 0;
      if (typeof parsed.total_cost_usd === 'number') {
        return this.finish(t0, finalText, [], [], usageIn, usageOut, parsed.total_cost_usd, res.timedOut, res.code !== 0, req, hookLog, before);
      }
    } catch {
      /* 非 JSON 输出就按纯文本处理 */
    }
    return this.finish(t0, finalText, [], [], usageIn, usageOut, null, res.timedOut, res.code !== 0, req, hookLog, before);
  }

  private finish(
    t0: number,
    finalText: string,
    _a: string[],
    _b: TranscriptEvent[],
    usageIn: number,
    usageOut: number,
    cost: number | null,
    timedOut: boolean,
    failed: boolean,
    _req: RunRequest,
    hookLog: string | undefined,
    before: number
  ): RunResult {
    const activated = hookLog ? readActivations(hookLog, before) : [];
    const events: TranscriptEvent[] = [
      { ts: new Date().toISOString(), type: 'assistant_text', content: finalText.slice(0, 4000) },
      ...activated.map((name) => ({ ts: new Date().toISOString(), type: 'activation' as const, name })),
      { ts: new Date().toISOString(), type: 'final', content: finalText.slice(0, 1500) }
    ];
    if (failed) events.push({ ts: new Date().toISOString(), type: 'error', error: 'claude exited non-zero' });
    return {
      finalText,
      activated,
      events,
      usage: {
        prompt_tokens: usageIn,
        completion_tokens: usageOut,
        total_tokens: usageIn + usageOut,
        cost_usd: cost ?? 0,
        cost_source: cost === null ? 'unpriced' : 'provider'
      },
      toolCalls: 0,
      wallMs: Date.now() - t0,
      timedOut,
      steps: 1
    };
  }
}

/** 从 hook jsonl 的新增尾部读技能激活记录 */
function readActivations(logPath: string, offsetBytes: number): string[] {
  try {
    const fd = fs.openSync(logPath, 'r');
    const size = fs.fstatSync(fd).size;
    if (size <= offsetBytes) {
      fs.closeSync(fd);
      return [];
    }
    const len = size - offsetBytes;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, offsetBytes);
    fs.closeSync(fd);
    const names: string[] = [];
    for (const line of buf.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as { hook_event_name?: string; tool_name?: string; tool_input?: { name?: string; skill?: string } };
        if (rec.hook_event_name === 'PreToolUse' && rec.tool_name === 'Skill') {
          const name = rec.tool_input?.name ?? rec.tool_input?.skill;
          if (name) names.push(name);
        }
      } catch {
        /* 坏行跳过 */
      }
    }
    return names;
  } catch {
    return [];
  }
}

export function hookLogPath(): string | undefined {
  const p = env('UPLIFT_CLAUDE_HOOK_LOG');
  return p ? path.resolve(p) : undefined;
}
