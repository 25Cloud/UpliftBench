/**
 * 多轮合并（pooling）。
 *
 * 为什么需要它：单个 `run` 只看到自己那一轮。同一个块跑四遍会得到 +36 / +30 / +27 / +39，
 * 每轮都自带一个看着很紧的区间，而它们其实是同一个量的四次抽样。
 * 把几轮的 run 合起来重算，才知道这个块到底值多少、以及不确定度有多大。
 *
 * 两个口径必须说清楚：
 * - **按题合并**：先把同一题在几轮里的 run 全并起来算通过率，再对题目求均值。
 *   这样题目之间的差异（有的题 +90，有的题 0）会被如实算进区间。
 * - **区间用按题 bootstrap**：重采样的是「题」，不是 run。run 之间的抖动已经被重复次数压小了，
 *   剩下的主要不确定度是「这批题能不能代表那类任务」。
 */
import type { ArmName, RunRow } from '../types.js';

export const ARMS: ArmName[] = ['baseline', 'placebo', 'treatment'];

export interface PooledTask {
  task_id: string;
  n: Record<ArmName, number>;
  rate: Record<ArmName, number>;
  /** treatment − placebo */
  uplift: number;
}

export interface PooledBlock {
  tasks: PooledTask[];
  /** 题数 */
  task_count: number;
  /** 每臂总 run 数 */
  runs: Record<ArmName, number>;
  /** 三臂的块均值 */
  rate: Record<ArmName, number>;
  /** 块的 uplift（按题求均值的均值） */
  uplift_pp: number;
  /** 块的安慰剂效应 */
  placebo_effect_pp: number;
  /** 按题 bootstrap 的 95% 区间（pp） */
  ci95: [number, number];
  /** 被丢掉的不完整题（缺某一臂） */
  dropped: string[];
  /** 参与合并的轮次数 */
  blocks: number;
}

const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** 把多轮 run 按题聚合。pass 为 null（grader_error）的不计入分母。 */
export function poolRuns(rows: RunRow[], opts: { blocks?: number; iters?: number; seed?: number } = {}): PooledBlock {
  const byTask = new Map<string, Record<ArmName, number[]>>();
  for (const r of rows) {
    if (r.pass === null || r.pass === undefined) continue;
    if (!ARMS.includes(r.arm)) continue;
    let slot = byTask.get(r.task_id);
    if (!slot) {
      slot = { baseline: [], placebo: [], treatment: [] };
      byTask.set(r.task_id, slot);
    }
    slot[r.arm].push(r.pass ? 1 : 0);
  }

  const tasks: PooledTask[] = [];
  const dropped: string[] = [];
  for (const [task_id, slot] of [...byTask.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ARMS.some((a) => slot[a].length === 0)) {
      dropped.push(task_id);
      continue;
    }
    tasks.push({
      task_id,
      n: { baseline: slot.baseline.length, placebo: slot.placebo.length, treatment: slot.treatment.length },
      rate: {
        baseline: mean(slot.baseline),
        placebo: mean(slot.placebo),
        treatment: mean(slot.treatment)
      },
      uplift: mean(slot.treatment) - mean(slot.placebo)
    });
  }

  const rate: Record<ArmName, number> = {
    baseline: mean(tasks.map((t) => t.rate.baseline)),
    placebo: mean(tasks.map((t) => t.rate.placebo)),
    treatment: mean(tasks.map((t) => t.rate.treatment))
  };
  const runs: Record<ArmName, number> = { baseline: 0, placebo: 0, treatment: 0 };
  for (const t of tasks) for (const a of ARMS) runs[a] += t.n[a];

  const uplift_pp = tasks.length === 0 ? 0 : mean(tasks.map((t) => t.uplift)) * 100;
  const placebo_effect_pp = (rate.placebo - rate.baseline) * 100;

  // 按题重采样。固定种子，同一份数据每次跑出同一个区间。
  let seed = opts.seed ?? 20260101;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const iters = opts.iters ?? 20000;
  const boots: number[] = [];
  if (tasks.length > 0) {
    for (let i = 0; i < iters; i += 1) {
      let sum = 0;
      for (let j = 0; j < tasks.length; j += 1) sum += tasks[Math.floor(rnd() * tasks.length)].uplift;
      boots.push((sum / tasks.length) * 100);
    }
    boots.sort((a, b) => a - b);
  }
  const lo = boots.length > 0 ? boots[Math.floor(0.025 * boots.length)] : 0;
  const hi = boots.length > 0 ? boots[Math.floor(0.975 * boots.length)] : 0;

  return {
    tasks,
    task_count: tasks.length,
    runs,
    rate,
    uplift_pp,
    placebo_effect_pp,
    ci95: [round1(lo), round1(hi)],
    dropped,
    blocks: opts.blocks ?? 1
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
