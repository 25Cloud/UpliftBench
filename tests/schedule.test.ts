import { describe, expect, it } from 'vitest';
import { buildSchedule, isInterleaved, unitKey } from '../src/runner/arms.js';
import { ARM_NAMES } from '../src/types.js';

describe('三臂调度（协议 §2 顺序约束）', () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'];

  it('三个臂在前三个 unit 里都出现（交错，而不是跑完一臂再跑下一臂）', () => {
    const units = buildSchedule(tasks, 1, 42);
    expect(isInterleaved(units, ARM_NAMES)).toBe(true);
  });

  it('总 unit 数 = 任务数 × 臂数 × 重复数', () => {
    const units = buildSchedule(tasks, 3, 42);
    expect(units.length).toBe(tasks.length * ARM_NAMES.length * 3);
  });

  it('没有重复 unit', () => {
    const units = buildSchedule(tasks, 2, 7);
    const keys = new Set(units.map(unitKey));
    expect(keys.size).toBe(units.length);
  });

  it('同一 seed 结果完全一致（可复现）', () => {
    const a = buildSchedule(tasks, 2, 99);
    const b = buildSchedule(tasks, 2, 99);
    expect(a).toEqual(b);
  });

  it('不同 seed 会打乱任务顺序', () => {
    const a = buildSchedule(tasks, 1, 1).map(unitKey);
    const b = buildSchedule(tasks, 1, 2).map(unitKey);
    expect(a).not.toEqual(b);
  });

  it('每个 (臂,任务,重复) 恰好出现一次', () => {
    const units = buildSchedule(tasks, 2, 5);
    const count = new Map<string, number>();
    for (const u of units) count.set(unitKey(u), (count.get(unitKey(u)) ?? 0) + 1);
    for (const [, n] of count) expect(n).toBe(1);
  });

  it('只跑两臂时调度也只含两臂', () => {
    const units = buildSchedule(tasks, 1, 42, ['baseline', 'placebo']);
    expect(new Set(units.map((u) => u.arm))).toEqual(new Set(['baseline', 'placebo']));
  });
});
