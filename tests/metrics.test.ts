import { describe, expect, it } from 'vitest';
import {
  computeActivation,
  computeTier1,
  decideGrade,
  formatHeadlineMetrics,
  upliftMetrics
} from '../src/metrics/uplift.js';
import { cohensKappa, pairedBootstrapCI, sampleStd, wilsonInterval } from '../src/metrics/stats.js';
import type { ArmName, RunRow, Tier1Block } from '../src/types.js';

function row(arm: ArmName, task: string, pass: number | null, repeat = 0, extra: Partial<RunRow> = {}): RunRow {
  return {
    id: `${arm}-${task}-${repeat}`,
    skill_repo: 'demo/skill',
    skill_commit: 'abcdef1',
    taskset: 'demo@1.0',
    arm,
    task_id: task,
    repeat_idx: repeat,
    model: 'test-model',
    harness: 'mock',
    temperature: 0,
    seed: 42,
    started_at: '2026-01-01T00:00:00Z',
    ended_at: '2026-01-01T00:00:01Z',
    pass,
    failure_kind: pass === 0 ? 'wrong_answer' : null,
    tokens_in: 100,
    tokens_out: 10,
    tool_calls: 2,
    wall_ms: 1000,
    cost_usd: 0.01,
    transcript_path: null,
    meta_json: null,
    ...extra
  };
}

describe('uplift 定义（协议 §1.1）', () => {
  it('样例 1：0.40 / 0.45 / 0.76', () => {
    const m = upliftMetrics({ baseline: 0.4, placebo: 0.45, treatment: 0.76 });
    expect(m.uplift_pp).toBeCloseTo(31, 6);
    expect(m.raw_gain_pp).toBeCloseTo(36, 6);
    expect(m.placebo_effect_pp).toBeCloseTo(5, 6);
    expect(m.headroom_closed).toBeCloseTo(31 / 55, 4);
  });

  it('样例 2：安全审计 20% → 60%，headroom 50%', () => {
    const m = upliftMetrics({ baseline: 0.2, placebo: 0.2, treatment: 0.6 });
    expect(m.uplift_pp).toBeCloseTo(40, 6);
    expect(m.headroom_closed).toBeCloseTo(0.5, 6);
  });

  it('样例 3：baseline = 0 的边界', () => {
    const m = upliftMetrics({ baseline: 0, placebo: 0.1, treatment: 0.5 });
    expect(m.uplift_pp).toBeCloseTo(40, 6);
    expect(m.raw_gain_pp).toBeCloseTo(50, 6);
    expect(m.headroom_closed).toBeCloseTo(40 / 90, 4);
  });

  it('样例 4：baseline = 1 的边界（分母为 0，headroom 落 0 而不是 NaN）', () => {
    const m = upliftMetrics({ baseline: 1, placebo: 1, treatment: 1 });
    expect(m.uplift_pp).toBe(0);
    expect(m.headroom_closed).toBe(0);
    expect(Number.isFinite(m.headroom_closed)).toBe(true);
  });

  it('样例 5：负增益', () => {
    const m = upliftMetrics({ baseline: 0.5, placebo: 0.55, treatment: 0.45 });
    expect(m.uplift_pp).toBeCloseTo(-10, 6);
    expect(m.headroom_closed).toBeCloseTo(-10 / 45, 4);
    expect(m.placebo_effect_pp).toBeCloseTo(5, 6);
  });
});

describe('bootstrap 与统计量', () => {
  it('差值恒定时区间退化为一个点', () => {
    const r = pairedBootstrapCI([0.5, 0.5, 0.5, 0.5], { seed: 1 });
    expect(r.ci95[0]).toBeCloseTo(0.5, 6);
    expect(r.ci95[1]).toBeCloseTo(0.5, 6);
  });

  it('同一 seed 结果可复现', () => {
    const a = pairedBootstrapCI([0, 1, 0, 1, 1, 0], { seed: 7 });
    const b = pairedBootstrapCI([0, 1, 0, 1, 1, 0], { seed: 7 });
    expect(a.ci95).toEqual(b.ci95);
  });

  it('区间包住样本均值附近', () => {
    const diffs = [1, 1, 1, 0, 1, 0, 1, 1];
    const r = pairedBootstrapCI(diffs, { seed: 3 });
    expect(r.ci95[0]).toBeLessThanOrEqual(0.75);
    expect(r.ci95[1]).toBeGreaterThanOrEqual(0.75);
  });

  it('样本标准差 n<2 时为 0', () => {
    expect(sampleStd([1])).toBe(0);
    expect(sampleStd([1, 3])).toBeCloseTo(Math.SQRT2, 6);
  });

  it('Wilson 区间在 0/1 边界仍然有界', () => {
    const [lo, hi] = wilsonInterval(0, 10);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi).toBeGreaterThan(0);
  });

  it('Cohen κ：完全一致 = 1', () => {
    expect(cohensKappa([1, 0, 1, 1], [1, 0, 1, 1])).toBeCloseTo(1, 6);
  });
});

describe('激活统计（computeActivation）', () => {
  const meta = (o: Record<string, unknown>) => JSON.stringify(o);

  it('一行都没有 activated 字段时返回 undefined —— 不知道不等于 0%', () => {
    expect(computeActivation([row('baseline', 't1', 1), row('treatment', 't1', 1)])).toBeUndefined();
  });

  it('baseline 不计入激活率（它不装技能，算进去就是稀释）', () => {
    const act = computeActivation([
      row('baseline', 't1', 1, 0, { meta_json: meta({ activated: [], activation_mode: 'auto' }) }),
      row('placebo', 't1', 1, 0, { meta_json: meta({ activated: [], activation_mode: 'auto' }) }),
      row('treatment', 't1', 1, 0, { meta_json: meta({ activated: ['web-guidance'], activation_mode: 'auto' }) }),
      row('treatment', 't2', 0, 0, { meta_json: meta({ activated: [], activation_mode: 'auto' }) })
    ]);
    expect(act).toBeDefined();
    expect(act!.mode).toBe('auto');
    expect(act!.rate).toBeCloseTo(1 / 3, 4);
    expect(act!.by_arm?.treatment).toBeCloseTo(0.5, 4);
    expect(act!.by_arm?.placebo).toBe(0);
    expect(act!.preloaded_tokens_p50).toBeNull();
  });

  it('forced 模式被识别，并给出注入 token 中位数', () => {
    const act = computeActivation([
      row('placebo', 't1', 1, 0, { meta_json: meta({ activated: ['p'], activation_mode: 'forced', preloaded_tokens: 11000 }) }),
      row('treatment', 't1', 1, 0, { meta_json: meta({ activated: ['s'], activation_mode: 'forced', preloaded_tokens: 12000 }) }),
      row('treatment', 't2', 1, 1, { meta_json: meta({ activated: ['s'], activation_mode: 'forced', preloaded_tokens: 13000 }) })
    ]);
    expect(act!.mode).toBe('forced');
    expect(act!.rate).toBe(1);
    expect(act!.preloaded_tokens_p50).toBe(12000);
  });

  it('坏 meta_json 不会让整块指标炸掉', () => {
    const act = computeActivation([row('treatment', 't1', 1, 0, { meta_json: '{oops' })]);
    expect(act).toBeUndefined();
    const block = computeTier1(
      [
        row('baseline', 't1', 0),
        row('placebo', 't1', 0),
        row('treatment', 't1', 1, 0, { meta_json: '{oops' })
      ],
      { taskset: 'demo@1.0', graderTier: 'A', repeats: 1, seed: 42 }
    );
    expect(block.metrics.uplift_pp).toBe(100);
  });
});

describe('computeTier1', () => {
  const rows: RunRow[] = [];
  // baseline 2/4，placebo 2/4，treatment 3/4（4 个任务各跑一次）
  const tasks = ['t1', 't2', 't3', 't4'];
  for (const t of tasks) {
    rows.push(row('baseline', t, t === 't1' || t === 't2' ? 1 : 0));
    rows.push(row('placebo', t, t === 't1' || t === 't2' ? 1 : 0));
    rows.push(row('treatment', t, t === 't3' ? 0 : 1));
  }

  it('三臂通过率与指标一致', () => {
    const block = computeTier1(rows, { taskset: 'demo@1.0', graderTier: 'A', repeats: 1, seed: 42 });
    expect(block.arms.baseline.pass_rate).toBeCloseTo(0.5, 6);
    expect(block.arms.placebo.pass_rate).toBeCloseTo(0.5, 6);
    expect(block.arms.treatment.pass_rate).toBeCloseTo(0.75, 6);
    expect(block.metrics.uplift_pp).toBeCloseTo(25, 6);
    expect(block.metrics.placebo_effect_pp).toBeCloseTo(0, 6);
    expect(block.metrics.headroom_closed).toBeCloseTo(0.5, 6);
    expect(block.n).toBe(4);
  });

  it('grader_error 不进 pass_rate', () => {
    const withGraderError = [...rows, row('treatment', 't5', null, 0, { failure_kind: 'grader_error' })];
    const block = computeTier1(withGraderError, { taskset: 'demo@1.0', graderTier: 'A', repeats: 1, seed: 42 });
    expect(block.arms.treatment.pass_rate).toBeCloseTo(0.75, 6);
    expect(block.failures?.grader_error).toBe(1);
  });

  it('n < 30 时 A 级降为 B（docs/05 字段约束）', () => {
    const block = computeTier1(rows, { taskset: 'demo@1.0', graderTier: 'A', repeats: 1, seed: 42 });
    const decision = decideGrade(block);
    expect(decision.grade).toBe('B');
    expect(decision.flags).toContain('n_lt_30');
  });

  it('placebo 效应大于 uplift 时打标记', () => {
    const block = computeTier1(
      [
        row('baseline', 't1', 0),
        row('placebo', 't1', 1),
        row('treatment', 't1', 1),
        row('baseline', 't2', 0),
        row('placebo', 't2', 1),
        row('treatment', 't2', 1)
      ],
      { taskset: 'demo@1.0', graderTier: 'B', repeats: 1, seed: 1 }
    );
    expect(block.metrics.uplift_pp).toBe(0);
    expect(block.metrics.placebo_effect_pp).toBe(100);
    expect(decideGrade(block).flags).toContain('placebo_dominant');
  });

  it('flaky 任务被记录', () => {
    const flaky = [
      row('baseline', 't1', 1, 0),
      row('baseline', 't1', 0, 1),
      row('placebo', 't1', 0, 0),
      row('treatment', 't1', 1, 0)
    ];
    const block = computeTier1(flaky, { taskset: 'demo@1.0', graderTier: 'B', repeats: 2, seed: 1 });
    expect(block.stability?.flaky_tasks).toContain('t1');
  });

  it('对外 headline 必须带五项（协议 §6）', () => {
    const block = computeTier1(rows, { taskset: 'demo@1.0', graderTier: 'A', repeats: 1, seed: 42 });
    const text = formatHeadlineMetrics(block, 'B');
    expect(text).toContain('uplift');
    expect(text).toContain('headroom');
    expect(text).toContain('N=4');
    expect(text).toContain('95%CI');
    expect(text).toContain('placebo_effect');
    expect(text).toContain('B级');
  });

  it('headline 不做整数四舍五入：−2.5pp 不许写成 −3pp', () => {
    const block: Tier1Block = {
      taskset: 'demo@1.0',
      grader_tier: 'A',
      n: 48,
      arms: {
        baseline: { pass_rate: 0.7375 },
        placebo: { pass_rate: 0.7375 },
        treatment: { pass_rate: 0.7125 }
      },
      metrics: { uplift_pp: -2.5, headroom_closed: -0.0952, placebo_effect_pp: 0, ci95: [-7.92, 2.5] }
    };
    const text = formatHeadlineMetrics(block, 'A');
    expect(text).toContain('uplift -2.5pp');
    expect(text).toContain('[-7.9, 2.5]');
    expect(text).not.toContain('-3pp');
    expect(text).toContain('placebo_effect 0pp');
  });
});
