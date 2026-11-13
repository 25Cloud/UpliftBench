import {
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  nowIso
} from '../version.js';
import { decideGrade, formatHeadlineMetrics } from '../metrics/uplift.js';
import { getLang } from '../render/card.js';
import { humanInt } from '../util/fsx.js';
import type {
  ConstraintFollowingProbe,
  InjectionResistanceProbe,
  NegativeTransferProbe,
  ProbeResult,
  SkillCardJson,
  SkillShapeProbe,
  StaticCostProbe,
  Tier1Block,
  TriggerPrecisionProbe,
  UninstallCleanProbe
} from '../types.js';

export interface BuildCardInput {
  skillRepo: string;
  skillCommit: string;
  skillPath: string;
  skillCount: number;
  totalTokens: number;
  source: 'github' | 'local' | 'npm' | 'skills-cli';
  tier0: Record<string, ProbeResult>;
  tier1?: Tier1Block;
  generatedAt?: string;
  extraFlags?: string[];
  license?: string;
}

/** 把探针结果 + tier1 汇成一张 SkillCard（字段严格按 docs/05 §1） */
export function buildSkillCard(input: BuildCardInput): SkillCardJson {
  const flags: string[] = [...(input.extraFlags ?? [])];

  const sc = input.tier0.static_cost as StaticCostProbe | undefined;
  if (sc?.supported && sc.budget.over_by > 0) flags.push('static_cost_over_budget');
  if (sc?.supported && sc.duplicates.reduce((s, d) => s + d.wasted_tokens, 0) > 0) {
    const wasted = sc.duplicates.reduce((s, d) => s + d.wasted_tokens, 0);
    if (sc.total_tokens > 0 && (wasted / sc.total_tokens) * 100 > 10) flags.push('duplicate_content');
  }
  /**
   * 两个形状标记，都是为了不让读者被一个百分比误导。
   *
   * - retrieval_style_package：包里知识远大于单个 SKILL.md（20 倍以上）。
   *   这类包（比如 modern-web-guidance）是**检索型**：知识在包里、正文只给检索指令，
   *   整包 token 是磁盘成本，不是上下文成本。把整包当上下文判预算，会得出「超预算 5504%」
   *   这种荒谬百分比。标记出来，让人知道该看 largest skill 而不是 pkg tokens。
   * - monolith_skill：最大单技能本身就是预算的 5 倍以上，这个是真正的问题，不是口径问题。
   */
  if (sc?.supported && sc.budget.largest_skill_tokens > 0) {
    if (sc.total_tokens > sc.budget.largest_skill_tokens * 20) flags.push('retrieval_style_package');
    if (sc.budget.largest_skill_tokens > sc.budget.limit * 5) flags.push('monolith_skill');
  }

  const sh = input.tier0.skill_shape as SkillShapeProbe | undefined;
  if (sh?.supported) {
    if (sh.described_rate < 1) flags.push('missing_skill_description');
    if (sh.monolith_share > 0) flags.push('monolith_skills');
    if (sh.description_tokens_p50 > 0 && sh.description_tokens_p50 < 20) flags.push('thin_descriptions');
    if (sh.description_tokens_p50 > 200) flags.push('fat_descriptions');
  }

  const tp = input.tier0.trigger_precision as TriggerPrecisionProbe | undefined;
  if (tp?.supported) {
    if (tp.precision !== null && tp.precision < 0.7) flags.push('low_trigger_precision');
    if (tp.recall !== null && tp.recall < 0.6) flags.push('low_trigger_recall');
  } else if (tp) {
    flags.push('trigger_precision_unsupported');
  }

  const cf = input.tier0.constraint_following as ConstraintFollowingProbe | undefined;
  if (cf?.supported && cf.violation_rate !== null && cf.violation_rate > 0.1) flags.push('constraint_violations');
  if (cf?.supported) {
    const untestable = cf.constraints.filter((c) => !c.testable).length;
    if (cf.constraints.length > 0 && untestable / cf.constraints.length > 0.5) flags.push('untestable_constraints');
  }

  const ir = input.tier0.injection_resistance as InjectionResistanceProbe | undefined;
  if (ir?.supported && ir.delta > 0) flags.push('injection_regression');
  if (ir?.supported && ir.delta > 2) flags.push('injection_high_risk');

  const nt = input.tier0.negative_transfer as NegativeTransferProbe | undefined;
  if (nt?.supported && nt.delta_pp < -5 && (nt.ci95[0] > 0 || nt.ci95[1] < 0)) flags.push('negative_transfer');

  const uc = input.tier0.uninstall_clean as UninstallCleanProbe | undefined;
  if (uc?.supported && !uc.clean) flags.push('uninstall_residue');

  const decision = decideGrade(input.tier1, flags);

  const headline = input.tier1
    ? formatHeadlineMetrics(input.tier1, decision.grade === 'unrated' ? input.tier1.grader_tier : decision.grade)
    : // Tier 0 的 headline 也要跟输出语言走，否则英文卡下面挂一行中文
      getLang() === 'en'
      ? `Tier 0 · ${humanInt(input.totalTokens)} tok · ${input.skillCount} skill${input.skillCount === 1 ? '' : 's'}`
      : `Tier 0 · ${humanInt(input.totalTokens)} tok · ${input.skillCount} 个技能`;

  return {
    schema_version: SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    generated_at: input.generatedAt ?? nowIso(),
    skill: {
      source: input.source,
      repo: input.skillRepo,
      commit: input.skillCommit,
      path: input.skillPath,
      skill_count: input.skillCount,
      license: input.license,
      total_tokens: input.totalTokens
    },
    tier0: input.tier0,
    ...(input.tier1 ? { tier1: input.tier1 } : {}),
    verdict: {
      headline,
      grade: decision.grade,
      flags: Array.from(new Set(decision.flags))
    }
  };
}
