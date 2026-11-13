import type { ArmName } from '../types.js';
import { ARM_NAMES } from '../types.js';
import { seededShuffle } from '../version.js';

export interface RunUnit {
  arm: ArmName;
  taskId: string;
  repeatIdx: number;
}

/**
 * 三臂编排（协议 §2 的「顺序」与「任务顺序」两条）。
 *
 * - **三臂交错**：b,a,c,a,b,c… 而不是先跑完一臂再跑下一臂。
 *   理由写在协议里：排除时间漂移（API 限速、服务降级）。这条最容易被忽略，
 *   但它是唯一不需要额外成本的方差控制手段。
 * - **每臂内任务顺序随机化**：种子固定，可复现。
 */
export function buildSchedule(
  taskIds: string[],
  repeats: number,
  seed: number,
  arms: ArmName[] = ARM_NAMES
): RunUnit[] {
  const out: RunUnit[] = [];
  const activeArms = arms.length > 0 ? arms : ARM_NAMES;
  for (let r = 0; r < repeats; r++) {
    const orders = activeArms.map((arm) =>
      seededShuffle(taskIds, seed + armSeed(arm) + r * 97)
    );
    const maxLen = Math.max(...orders.map((o) => o.length));
    for (let i = 0; i < maxLen; i++) {
      for (let a = 0; a < activeArms.length; a++) {
        const taskId = orders[a][i];
        if (taskId === undefined) continue;
        out.push({ arm: activeArms[a], taskId, repeatIdx: r });
      }
    }
  }
  return out;
}

function armSeed(arm: ArmName): number {
  switch (arm) {
    case 'baseline':
      return 0;
    case 'placebo':
      return 1013;
    case 'treatment':
      return 2027;
  }
}

export function unitKey(u: RunUnit): string {
  return `${u.arm}|${u.taskId}|${u.repeatIdx}`;
}

/** 交错性自检：前 3 个 unit 必须是三个不同的臂（用于单元测试） */
export function isInterleaved(units: RunUnit[], arms: ArmName[]): boolean {
  if (units.length < arms.length) return false;
  const head = units.slice(0, arms.length).map((u) => u.arm);
  return new Set(head).size === arms.length;
}

export interface ArmPlan {
  arm: ArmName;
  /** 装进 worktree 的技能名（baseline 为空） */
  skillNames: string[];
  description: string;
}

export function armDescription(arm: ArmName): string {
  switch (arm) {
    case 'baseline':
      return '不装任何技能';
    case 'placebo':
      return '装等 token 量中性文本';
    case 'treatment':
      return '装真实技能包';
  }
}
