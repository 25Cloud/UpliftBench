import type { Harness } from '../harness/types.js';
import type { InstalledSkill } from '../harness/types.js';
import type { TriggerPrecisionProbe } from '../types.js';
import { PROBE_INSTRUCTIONS, type TriggerCase } from './util.js';
import { withTempWorkspace } from './util.js';

export interface TriggerPrecisionOptions {
  skills: InstalledSkill[];
  positive: TriggerCase[];
  negative: TriggerCase[];
  harness: Harness;
  timeoutMs?: number;
  concurrency?: number;
}

/**
 * 探针 2：触发精度（docs/03）。
 *
 * 「技能是否被激活」必须从 harness 的可观测事件里读，不许猜。
 * openai-compat / mock 的 activation 是显式工具调用；claude-code 没有 hook 日志时直接 unsupported。
 */
export async function runTriggerPrecision(opts: TriggerPrecisionOptions): Promise<TriggerPrecisionProbe> {
  if (!opts.harness.supportsActivationEvents) {
    return {
      probe: 'trigger-precision',
      supported: false,
      reason: `${opts.harness.name} 不暴露技能激活事件（未设置 UPLIFT_CLAUDE_HOOK_LOG）`,
      precision: null,
      recall: null,
      f1: null,
      false_positives: [],
      false_negatives: [],
      n_positive: opts.positive.length,
      n_negative: opts.negative.length
    };
  }
  if (opts.positive.length === 0 && opts.negative.length === 0) {
    return {
      probe: 'trigger-precision',
      supported: false,
      reason: '没有提供 triggers.json（positive / negative 都为空）',
      precision: null,
      recall: null,
      f1: null,
      false_positives: [],
      false_negatives: [],
      n_positive: 0,
      n_negative: 0
    };
  }

  const names = new Set(opts.skills.map((s) => s.name));
  const asks: Array<{ case: TriggerCase; positive: boolean }> = [
    ...opts.positive.map((c) => ({ case: c, positive: true })),
    ...opts.negative.map((c) => ({ case: c, positive: false }))
  ];

  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const results: Array<{ c: TriggerCase; positive: boolean; activated: boolean; finalText: string }> = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= asks.length) return;
      const ask = asks[idx];
      const outcome = await withTempWorkspace({ 'readme.md': '# workspace\n' }, async (dir) => {
        try {
          const run = await opts.harness.run(
            { cwd: dir, skills: opts.skills, model: '', systemExtra: PROBE_INSTRUCTIONS },
            { prompt: ask.case.prompt, maxSteps: 2, timeoutMs: opts.timeoutMs ?? 90_000, allowShell: false }
          );
          return { activated: run.activated.some((a) => names.has(a)), finalText: run.finalText };
        } catch (e) {
          return { activated: false, finalText: `harness error: ${(e as Error).message}` };
        }
      });
      results.push({ c: ask.case, positive: ask.positive, ...outcome });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, asks.length) }, worker));

  const positives = results.filter((r) => r.positive);
  const negatives = results.filter((r) => !r.positive);
  const tp = positives.filter((r) => r.activated).length;
  const fn = positives.length - tp;
  const fp = negatives.filter((r) => r.activated).length;
  const tn = negatives.length - fp;

  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = positives.length === 0 ? null : tp / positives.length;
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  const byKind: Record<string, { n: number; activated: number }> = {};
  for (const r of negatives) {
    const kind = r.c.kind ?? 'unrelated';
    const entry = byKind[kind] ?? { n: 0, activated: 0 };
    entry.n += 1;
    if (r.activated) entry.activated += 1;
    byKind[kind] = entry;
  }

  return {
    probe: 'trigger-precision',
    supported: true,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    false_positives: negatives
      .filter((r) => r.activated)
      .map((r) => ({ prompt: r.c.prompt, why: `负样本被误触发（kind=${r.c.kind ?? 'unrelated'}）` })),
    false_negatives: positives
      .filter((r) => !r.activated)
      .map((r) => ({ prompt: r.c.prompt, why: r.finalText.slice(0, 160) || '没有调用 activate_skill' })),
    n_positive: positives.length,
    n_negative: negatives.length,
    by_negative_kind: Object.fromEntries(
      Object.entries(byKind).map(([k, v]) => [
        k,
        { n: v.n, precision: v.n === 0 ? null : round((v.n - v.activated) / v.n) }
      ])
    )
  };
}

function round(n: number | null): number | null {
  return n === null ? null : Math.round(n * 1000) / 1000;
}
