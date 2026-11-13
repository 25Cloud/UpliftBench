import { mulberry32 } from '../version.js';

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 样本标准差（ddof=1）；n<2 时返回 0 而不是 NaN */
export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface BootstrapOptions {
  /** 重采样次数，默认 1000（docs/11 Q3 默认值） */
  iterations?: number;
  /** 显著性水平，默认 0.05 → 95% CI */
  alpha?: number;
  seed?: number;
}

/**
 * 配对 bootstrap 置信区间。
 *
 * 为什么用配对：同一道题在三个臂里跑的是同一个 fixture，天然成对。
 * 重采样单位是「任务」而不是「单次 run」，否则重复次数会伪造出更窄的区间。
 */
export function pairedBootstrapCI(
  diffs: number[],
  opts: BootstrapOptions = {}
): { ci95: [number, number]; bootMean: number; n: number; iterations: number } {
  const iterations = opts.iterations ?? 1000;
  const alpha = opts.alpha ?? 0.05;
  const n = diffs.length;
  if (n === 0) return { ci95: [0, 0], bootMean: 0, n: 0, iterations: 0 };
  if (n === 1) return { ci95: [diffs[0], diffs[0]], bootMean: diffs[0], n: 1, iterations: 0 };
  const rnd = mulberry32(opts.seed ?? 42);
  const stats: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += diffs[Math.floor(rnd() * n)];
    }
    stats.push(sum / n);
  }
  return {
    ci95: [quantile(stats, alpha / 2), quantile(stats, 1 - alpha / 2)],
    bootMean: mean(stats),
    n,
    iterations
  };
}

/** Wilson 区间：单个比例的置信区间，bootstrap 不适用时（如 n 太小）用它兜底 */
export function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / denom), Math.min(1, (centre + spread) / denom)];
}

/** Cohen's κ：B 级评分器与人工抽检的一致性（docs/02 §4.1） */
export function cohensKappa(labelsA: number[], labelsB: number[]): number {
  const n = Math.min(labelsA.length, labelsB.length);
  if (n === 0) return 0;
  const values = Array.from(new Set([...labelsA.slice(0, n), ...labelsB.slice(0, n)]));
  let agree = 0;
  for (let i = 0; i < n; i++) if (labelsA[i] === labelsB[i]) agree += 1;
  const po = agree / n;
  let pe = 0;
  for (const v of values) {
    const pa = labelsA.slice(0, n).filter((x) => x === v).length / n;
    const pb = labelsB.slice(0, n).filter((x) => x === v).length / n;
    pe += pa * pb;
  }
  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}
