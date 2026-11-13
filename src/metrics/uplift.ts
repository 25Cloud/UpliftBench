import type { ArmName, FailureKind, GraderTier, RunRow, Tier1Block, Tier1Metrics } from '../types.js';
import { ARM_NAMES } from '../types.js';
import { mean, pairedBootstrapCI, sampleStd } from './stats.js';

export interface UpliftInput {
  baseline: number;
  placebo: number;
  treatment: number;
  /** 每个任务的配对差值（treatment − placebo），用于 bootstrap */
  pairedDiffs?: number[];
  seed?: number;
}

/**
 * 协议 §1.1 的唯一定义来源。
 *
 *   uplift_pp       = treatment − placebo
 *   headroom_closed = uplift_pp / (1 − placebo)
 *   raw_gain_pp     = treatment − baseline      （未校正，不得单独进榜）
 *   placebo_effect  = placebo − baseline        （安慰剂效应本身，必须公开）
 */
export function upliftMetrics(input: UpliftInput): Tier1Metrics {
  const { baseline, placebo, treatment } = input;
  const uplift = (treatment - placebo) * 100;
  const rawGain = (treatment - baseline) * 100;
  const placeboEffect = (placebo - baseline) * 100;
  const denom = 1 - placebo;
  const headroom = denom <= 1e-9 ? 0 : uplift / 100 / denom;
  const diffs = input.pairedDiffs ?? [];
  const boot = pairedBootstrapCI(diffs, { seed: input.seed ?? 42 });
  return {
    uplift_pp: round2(uplift),
    headroom_closed: round4(headroom),
    raw_gain_pp: round2(rawGain),
    placebo_effect_pp: round2(placeboEffect),
    ci95: [round2(boot.ci95[0] * 100), round2(boot.ci95[1] * 100)]
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface PerArmObservations {
  arm: ArmName;
  /** taskId -> 每次重复的 pass（null 表示 grader_error，直接剔除） */
  byTask: Map<string, Array<number | null>>;
  rows: RunRow[];
}

export function groupByArm(rows: RunRow[]): Map<ArmName, RunRow[]> {
  const map = new Map<ArmName, RunRow[]>();
  for (const arm of ARM_NAMES) map.set(arm, []);
  for (const r of rows) {
    const list = map.get(r.arm) ?? [];
    list.push(r);
    map.set(r.arm, list);
  }
  return map;
}

export function observations(rows: RunRow[]): PerArmObservations[] {
  const grouped = groupByArm(rows);
  const out: PerArmObservations[] = [];
  for (const [arm, list] of grouped) {
    const byTask = new Map<string, Array<number | null>>();
    for (const r of list) {
      const arr = byTask.get(r.task_id) ?? [];
      arr.push(r.pass === null ? null : Number(r.pass));
      byTask.set(r.task_id, arr);
    }
    out.push({ arm, byTask, rows: list });
  }
  return out;
}

export interface ComputeTier1Options {
  taskset: string;
  graderTier: GraderTier;
  repeats: number;
  seed?: number;
  protocolNotes?: string[];
}

/**
 * 从原始 runs 算出整块 tier1。
 * 注意：pass_rate 按 run 计权（每臂 run 数相同，等价于按任务均权）。
 */
export function computeTier1(rows: RunRow[], opts: ComputeTier1Options): Tier1Block {
  const grouped = groupByArm(rows);
  const passRateOf = (arm: ArmName): number => {
    const scored = (grouped.get(arm) ?? []).filter((r) => r.pass !== null);
    if (scored.length === 0) return 0;
    return scored.reduce((s, r) => s + (r.pass as number), 0) / scored.length;
  };

  const base = passRateOf('baseline');
  const placebo = passRateOf('placebo');
  const treatment = passRateOf('treatment');

  const taskIds = Array.from(new Set(rows.map((r) => r.task_id))).sort();
  const perTaskRate = (arm: ArmName, taskId: string): number | null => {
    const list = (grouped.get(arm) ?? []).filter((r) => r.task_id === taskId && r.pass !== null);
    if (list.length === 0) return null;
    return mean(list.map((r) => r.pass as number));
  };
  const pairedDiffs: number[] = [];
  for (const id of taskIds) {
    const t = perTaskRate('treatment', id);
    const p = perTaskRate('placebo', id);
    if (t === null || p === null) continue;
    pairedDiffs.push(t - p);
  }

  const metrics = upliftMetrics({ baseline: base, placebo, treatment, pairedDiffs, seed: opts.seed });

  const stdOf = (arm: ArmName): number => {
    const byRepeat = new Map<number, number[]>();
    for (const r of grouped.get(arm) ?? []) {
      if (r.pass === null) continue;
      const arr = byRepeat.get(r.repeat_idx) ?? [];
      arr.push(r.pass as number);
      byRepeat.set(r.repeat_idx, arr);
    }
    const perRepeatRate = Array.from(byRepeat.values()).map((v) => mean(v));
    return sampleStd(perRepeatRate);
  };

  const flaky: string[] = [];
  for (const arm of ARM_NAMES) {
    const byTask = new Map<string, number[]>();
    for (const r of grouped.get(arm) ?? []) {
      if (r.pass === null) continue;
      const arr = byTask.get(r.task_id) ?? [];
      arr.push(Number(r.pass));
      byTask.set(r.task_id, arr);
    }
    for (const [taskId, values] of byTask) {
      if (values.length > 1 && new Set(values).size > 1 && !flaky.includes(taskId)) flaky.push(taskId);
    }
  }

  const failures: Record<FailureKind, number> = {
    wrong_answer: 0,
    gave_up: 0,
    hallucinated: 0,
    constraint_violated: 0,
    broke_something: 0,
    timeout: 0,
    tool_error: 0,
    grader_error: 0
  };
  for (const r of rows) {
    if (r.failure_kind) failures[r.failure_kind] += 1;
  }

  const all = grouped.get('baseline')?.length ? rows : rows;
  const walls = all.map((r) => r.wall_ms ?? 0).sort((a, b) => a - b);
  const tokensIn = (arm: ArmName) => (grouped.get(arm) ?? []).reduce((s, r) => s + (r.tokens_in ?? 0), 0);
  const tokensOut = (arm: ArmName) => (grouped.get(arm) ?? []).reduce((s, r) => s + (r.tokens_out ?? 0), 0);
  const baseTokensIn = tokensIn('baseline');
  const overhead = baseTokensIn > 0 ? ((tokensIn('treatment') - baseTokensIn) / baseTokensIn) * 100 : 0;

  return {
    taskset: opts.taskset,
    grader_tier: opts.graderTier,
    n: taskIds.length,
    arms: {
      baseline: { pass_rate: round4(base), pass_rate_std: round4(stdOf('baseline')) },
      placebo: { pass_rate: round4(placebo), pass_rate_std: round4(stdOf('placebo')) },
      treatment: { pass_rate: round4(treatment), pass_rate_std: round4(stdOf('treatment')) }
    },
    metrics,
    cost: {
      tokens_in_total: tokensIn('treatment'),
      tokens_out_total: tokensOut('treatment'),
      token_overhead_pct: round2(overhead),
      wall_time_p50_ms: Math.round(walls.length ? walls[Math.floor(0.5 * walls.length)] : 0),
      wall_time_p95_ms: Math.round(walls.length ? walls[Math.min(walls.length - 1, Math.floor(0.95 * walls.length))] : 0),
      tool_calls_mean: round2(mean(all.map((r) => r.tool_calls ?? 0))),
      cost_usd_total: round2(all.reduce((s, r) => s + (r.cost_usd ?? 0), 0))
    },
    stability: {
      flaky_tasks: flaky,
      determinism_gain: round4(stdOf('baseline') - stdOf('treatment'))
    },
    failures,
    protocol_notes: opts.protocolNotes
  };
}

/** 协议 §6：任何对外数字都必须带这五项，缺一项就不合格 */
export function formatHeadlineMetrics(block: Tier1Block, grade: GraderTier): string {
  const m = block.metrics;
  const sign = (v: number) => (v >= 0 ? '+' : '');
  return [
    `uplift ${sign(m.uplift_pp)}${m.uplift_pp.toFixed(0)}pp`,
    `headroom ${(m.headroom_closed * 100).toFixed(0)}%`,
    `N=${block.n}`,
    `95%CI [${m.ci95[0].toFixed(0)}, ${m.ci95[1].toFixed(0)}]`,
    `${grade}级`,
    `placebo_effect ${sign(m.placebo_effect_pp)}${m.placebo_effect_pp.toFixed(0)}pp`
  ].join('  |  ');
}

export interface GradeDecision {
  grade: GraderTier | 'unrated';
  flags: string[];
}

/**
 * 定级规则（docs/02 §4 + docs/05 §1 + docs/11 Q9）：
 * - 没有 tier1 → unrated（Tier 0 只出事实，不评级）
 * - n < 30 → 最高 B
 * - 评分器自称 A 但没 verify 脚本 → 降 B（防止「自称可执行验证」）
 * - placebo_effect > uplift → 打 placebo_dominant 标记
 * - uplift 的 95%CI 跨 0 → 打 ci_crosses_zero
 */
export function decideGrade(block: Tier1Block | undefined, flags: string[] = []): GradeDecision {
  const out = [...flags];
  if (!block) return { grade: 'unrated', flags: out };
  let grade: GraderTier | 'unrated' = block.grader_tier;
  if (block.n < 30 && grade === 'A') {
    grade = 'B';
    out.push('n_lt_30');
  }
  if (block.metrics.placebo_effect_pp > block.metrics.uplift_pp) {
    out.push('placebo_dominant');
  }
  if (block.metrics.ci95[0] <= 0 && block.metrics.ci95[1] >= 0) {
    out.push('ci_crosses_zero');
  }
  if (block.metrics.uplift_pp < 0) out.push('negative_uplift');
  if (block.stability && block.stability.flaky_tasks.length > 0) out.push('flaky_tasks');
  return { grade, flags: out };
}
