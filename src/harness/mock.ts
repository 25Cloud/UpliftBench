import { mulberry32 } from '../version.js';
import {
  type Harness,
  type HarnessAvailability,
  type HarnessContext,
  type RunRequest,
  type RunResult,
  type TranscriptEvent
} from './types.js';

/**
 * 无网络的确定性 harness —— **只用于跑通管线，不许出对外数字**。
 *
 * 它的存在理由：三臂编排 / worktree 隔离 / SQLite 落库 / 指标计算 / resume
 * 这些逻辑必须在没有 key 的机器上可测。所以它构造**合成**结果，
 * 并在每张卡的 verdict.flags 里留 `synthetic_data`，谁想拿它发榜都会先看到这个标记。
 */
export interface MockConfig {
  seed?: number;
  /** 合成通过率的基准值，三臂各偏移一点，便于验证指标链路 */
  baseRate?: number;
}

export const MOCK_FLAG = 'synthetic_data';

export class MockHarness implements Harness {
  name = 'mock';
  supportsActivationEvents = true;
  private cfg: MockConfig;

  constructor(cfg: MockConfig = {}) {
    this.cfg = cfg;
  }

  async available(): Promise<HarnessAvailability> {
    return { ok: true, detail: 'synthetic harness（不调模型，只验证管线）', activationEvents: true };
  }

  async run(ctx: HarnessContext, req: RunRequest): Promise<RunResult> {
    const t0 = Date.now();
    const seed = this.cfg.seed ?? 42;
    const rnd = mulberry32(seed + hashString(req.prompt));
    const base = this.cfg.baseRate ?? 0.45;
    const skillBoost = ctx.skills.length > 0 ? 0.18 : 0;
    const placementBoosts = ctx.skills.some((s) => s.name.startsWith('placebo')) ? 0.06 : 0;
    const p = Math.min(0.98, base + skillBoost + placementBoosts);
    const pass = rnd() < p;

    const events: TranscriptEvent[] = [
      { ts: new Date().toISOString(), type: 'system', content: `mock harness · ${ctx.skills.length} skills` },
      { ts: new Date().toISOString(), type: 'user', content: req.prompt.slice(0, 400) },
      { ts: new Date().toISOString(), type: 'assistant_text', content: pass ? '(solved)' : '(gave up)' }
    ];
    const activated: string[] = [];
    if (ctx.skills.length > 0) {
      const chosen = ctx.skills[rnd() < 0.8 ? 0 : Math.min(1, ctx.skills.length - 1)];
      if (chosen) {
        activated.push(chosen.name);
        events.push({ ts: new Date().toISOString(), type: 'activation', name: chosen.name });
      }
    }
    events.push({ ts: new Date().toISOString(), type: 'final', content: pass ? 'mock pass' : 'mock fail' });

    return {
      finalText: pass ? 'mock pass' : 'mock fail',
      activated,
      events,
      usage: {
        prompt_tokens: 800 + Math.floor(rnd() * 200),
        completion_tokens: 120 + Math.floor(rnd() * 80),
        total_tokens: 1000,
        cost_usd: 0,
        cost_source: 'unpriced'
      },
      toolCalls: 2,
      wallMs: Date.now() - t0,
      timedOut: false,
      steps: 3
    };
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
