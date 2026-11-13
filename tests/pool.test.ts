import { describe, expect, it } from 'vitest';
import { poolRuns } from '../src/metrics/pool.js';
import type { ArmName, RunRow } from '../src/types.js';

/** 造一批 run：同一题每臂给固定通过数，方便手算。 */
function rows(spec: Record<string, Record<ArmName, number[]>>): RunRow[] {
  const out: RunRow[] = [];
  let i = 0;
  for (const [task_id, arms] of Object.entries(spec)) {
    for (const arm of ['baseline', 'placebo', 'treatment'] as ArmName[]) {
      for (const pass of arms[arm]) {
        i += 1;
        out.push({
          id: `r${i}`,
          skill_repo: 'x/y',
          skill_commit: 'abc1234',
          taskset: 'web-guidance@1.5.0',
          arm,
          task_id,
          repeat_idx: 0,
          model: 'm',
          harness: 'openai-compat',
          temperature: 0,
          seed: null,
          started_at: '2026-11-13T00:00:00Z',
          ended_at: '2026-11-13T00:00:10Z',
          pass,
          failure_kind: null,
          tokens_in: 1,
          tokens_out: 1,
          tool_calls: 0,
          wall_ms: 1,
          cost_usd: 0,
          transcript_path: null,
          meta_json: null
        });
      }
    }
  }
  return out;
}

describe('多轮合并（poolRuns）', () => {
  it('按题求均值再求块均值，不是把所有 run 混在一起', () => {
    // 两题题量不同：题 A 每臂 4 次，题 B 每臂 2 次。
    // 混算 treatment = (4+2)/6 = 100%，按题算 = (100% + 100%)/2 = 100%；下面让它们不同：
    const r = rows({
      'A': { baseline: [1, 1, 1, 1], placebo: [1, 1, 1, 1], treatment: [1, 1, 1, 0] }, // A: +0pp… 见断言
      'B': { baseline: [0, 0], placebo: [0, 0], treatment: [1, 1] }
    });
    const p = poolRuns(r, { iters: 200 });
    // A: treatment 75% − placebo 100% = −25pp；B: 100% − 0% = +100pp
    expect(p.tasks.map((t) => t.task_id)).toEqual(['A', 'B']);
    expect(p.tasks[0].uplift).toBeCloseTo(-0.25, 6);
    expect(p.tasks[1].uplift).toBeCloseTo(1, 6);
    // 按题均值 = (−0.25 + 1)/2 = +37.5pp；若混算所有 run 会得到另一个数
    expect(p.uplift_pp).toBeCloseTo(37.5, 6);
    expect(p.task_count).toBe(2);
  });

  it('缺某一臂的题被丢掉，并记在 dropped 里', () => {
    const r = rows({
      'A': { baseline: [1], placebo: [1], treatment: [1] },
      'B': { baseline: [1], placebo: [], treatment: [1] }
    });
    const p = poolRuns(r);
    expect(p.task_count).toBe(1);
    expect(p.dropped).toEqual(['B']);
  });

  it('pass 为 null（grader_error）不计入分母', () => {
    const good = rows({ 'A': { baseline: [1, 0], placebo: [1, 0], treatment: [1, 1] } });
    const broken: RunRow = { ...good[0], id: 'bad', pass: null, arm: 'treatment' };
    const p = poolRuns([...good, broken]);
    expect(p.tasks[0].n.treatment).toBe(2);
    expect(p.tasks[0].rate.treatment).toBe(1);
  });

  it('安慰剂效应单独报，且可以从三臂直接复算', () => {
    const r = rows({
      'A': { baseline: [1, 1, 1, 1], placebo: [1, 0, 1, 0], treatment: [1, 1, 1, 1] }
    });
    const p = poolRuns(r);
    expect(p.rate.baseline).toBe(1);
    expect(p.rate.placebo).toBe(0.5);
    expect(p.placebo_effect_pp).toBeCloseTo(-50, 6);
    expect(p.uplift_pp).toBeCloseTo(50, 6);
  });

  it('同一份数据、同一个种子，区间完全一样', () => {
    const r = rows({
      'A': { baseline: [1, 0, 1], placebo: [0, 0, 1], treatment: [1, 1, 1] },
      'B': { baseline: [1, 1, 0], placebo: [1, 0, 0], treatment: [1, 0, 1] },
      'C': { baseline: [0, 0, 0], placebo: [0, 1, 0], treatment: [1, 1, 0] }
    });
    const a = poolRuns(r, { iters: 2000, seed: 7 });
    const b = poolRuns(r, { iters: 2000, seed: 7 });
    expect(a.ci95).toEqual(b.ci95);
  });

  it('全负的块，区间也应该整个在零以下', () => {
    const r = rows({
      'A': { baseline: [1, 1, 1], placebo: [1, 1, 1], treatment: [0, 0, 0] },
      'B': { baseline: [1, 1, 1], placebo: [1, 1, 1], treatment: [0, 0, 1] }
    });
    const p = poolRuns(r, { iters: 2000 });
    expect(p.uplift_pp).toBeLessThan(0);
    expect(p.ci95[1]).toBeLessThan(0);
  });
});
