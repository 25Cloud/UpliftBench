/**
 * 数据模型（docs/05 §1 的 TypeScript 影子）。
 * 字段名必须与 schema/skillcard.schema.json 一致，改这里就要改 schema。
 */
import type { TokenEstimate } from './tokenize.js';

export type ArmName = 'baseline' | 'placebo' | 'treatment';
export const ARM_NAMES: ArmName[] = ['baseline', 'placebo', 'treatment'];

export type GraderTier = 'A' | 'B' | 'C';

export type FailureKind =
  | 'wrong_answer'
  | 'gave_up'
  | 'hallucinated'
  | 'constraint_violated'
  | 'broke_something'
  | 'timeout'
  | 'tool_error'
  | 'grader_error';

export const FAILURE_KINDS: FailureKind[] = [
  'wrong_answer',
  'gave_up',
  'hallucinated',
  'constraint_violated',
  'broke_something',
  'timeout',
  'tool_error',
  'grader_error'
];

export interface ProbeBase {
  probe: string;
  supported: boolean;
  reason?: string;
}

export interface StaticCostProbe extends ProbeBase {
  probe: 'static-cost';
  /** 包内全部被计量文件（含脚本），按 docs/03 的输入定义 */
  total_tokens: number;
  /** 真正会进上下文的那些（md/json/yaml/txt），预算判定用它 */
  context_tokens: number;
  tokenizer: string;
  file_count: number;
  skill_count: number;
  per_file: Array<{ path: string; tokens: number; bytes: number }>;
  budget: {
    limit: number;
    /** package = 按整包上下文判定；largest_skill = 按最大单技能判定（多技能包的默认口径） */
    basis: 'package' | 'largest_skill';
    subject_tokens: number;
    over_by: number;
    over_pct: number;
    /** 整包上下文超预算的部分（信息性，不参与判定） */
    package_over_by: number;
    largest_skill_tokens: number;
  };
  duplicates: Array<{ hash: string; files: string[]; wasted_tokens: number }>;
  structure: { headings: number; lists: number; code_blocks: number };
  warnings: string[];
}

export interface TriggerPrecisionProbe extends ProbeBase {
  probe: 'trigger-precision';
  precision: number | null;
  recall: number | null;
  f1: number | null;
  false_positives: Array<{ prompt: string; why: string }>;
  false_negatives: Array<{ prompt: string; why: string }>;
  n_positive: number;
  n_negative: number;
  by_negative_kind?: Record<string, { n: number; precision: number | null }>;
}

export interface ConstraintFollowingProbe extends ProbeBase {
  probe: 'constraint-following';
  constraints: Array<{ id: string; text: string; kind: 'forbid' | 'require'; testable: boolean }>;
  violations: Array<{ constraint_id: string; task: string; evidence: string }>;
  violation_rate: number | null;
  n_checked: number;
}

export interface InjectionResistanceProbe extends ProbeBase {
  probe: 'injection-resistance';
  hijacked: number;
  total: number;
  cases: Array<{ id: string; type: string; hijacked: boolean; evidence: string }>;
  baseline_hijacked: number;
  delta: number;
}

export interface NegativeTransferProbe extends ProbeBase {
  probe: 'negative-transfer';
  pass_rate_without: number;
  pass_rate_with: number;
  delta_pp: number;
  ci95: [number, number];
  n: number;
}

export interface UninstallCleanProbe extends ProbeBase {
  probe: 'uninstall-clean';
  clean: boolean;
  residual_delta_pp: number | null;
  leaked_paths: string[];
  note?: string;
}

export type ProbeResult =
  | StaticCostProbe
  | TriggerPrecisionProbe
  | ConstraintFollowingProbe
  | InjectionResistanceProbe
  | NegativeTransferProbe
  | UninstallCleanProbe;

export interface ArmStats {
  pass_rate: number;
  pass_rate_std?: number;
}

export interface Tier1Metrics {
  uplift_pp: number;
  headroom_closed: number;
  raw_gain_pp?: number;
  placebo_effect_pp: number;
  ci95: [number, number];
}

export interface Tier1Cost {
  tokens_in_total: number;
  tokens_out_total: number;
  token_overhead_pct: number;
  wall_time_p50_ms: number;
  wall_time_p95_ms: number;
  tool_calls_mean: number;
  cost_usd_total: number;
}

export interface Tier1Stability {
  flaky_tasks: string[];
  determinism_gain: number;
}

export interface Tier1Block {
  taskset: string;
  grader_tier: GraderTier;
  n: number;
  arms: Record<ArmName, ArmStats>;
  metrics: Tier1Metrics;
  cost?: Tier1Cost;
  stability?: Tier1Stability;
  failures?: Record<FailureKind, number>;
  protocol_notes?: string[];
}

export interface SkillCardJson {
  schema_version: string;
  protocol_version: string;
  generated_at: string;
  skill: {
    source: 'github' | 'local' | 'npm' | 'skills-cli';
    repo: string;
    commit: string;
    path?: string;
    skill_count?: number;
    license?: string;
    version?: string;
    total_tokens?: number;
    tokenizer?: TokenEstimate['tokenizer'];
  };
  tier0: Partial<Record<'static_cost' | 'trigger_precision' | 'constraint_following' | 'injection_resistance' | 'negative_transfer' | 'uninstall_clean', ProbeResult>>;
  tier1?: Tier1Block;
  verdict: {
    headline: string;
    grade: GraderTier | 'unrated';
    flags: string[];
  };
}

export interface TaskSetTask {
  id: string;
  title: string;
  prompt_file: string;
  fixture?: string;
  verify?: string;
  weight?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  expected_baseline?: { min?: number; max?: number };
  tags?: string[];
}

export interface TaskSetJson {
  schema_version: string;
  domain: string;
  version: string;
  title: string;
  description?: string;
  maintainer?: string;
  official?: boolean;
  grader: {
    kind: 'tests' | 'exact' | 'rubric' | 'visual-diff' | 'human';
    tier: GraderTier;
    entry?: string;
    version?: string;
    timeout_sec?: number;
    normalize?: Array<'trim' | 'collapse_whitespace' | 'lowercase'>;
    numeric_tolerance?: number;
    judge_model?: string;
    judge_temperature?: number;
    judge_prompt_file?: string;
    rubric_file?: string;
    kappa?: number;
    kappa_samples?: number;
    engine?: string;
    threshold?: number;
    viewport?: { width: number; height: number };
  };
  env: {
    kind: 'docker' | 'local';
    image?: string;
    image_digest?: string;
    commit?: string;
  };
  task_count: number;
  tasks: TaskSetTask[];
}

export interface RunRow {
  id: string;
  skill_repo: string;
  skill_commit: string;
  taskset: string;
  arm: ArmName;
  task_id: string;
  repeat_idx: number;
  model: string;
  harness: string;
  temperature: number | null;
  seed: number | null;
  started_at: string;
  ended_at: string;
  pass: number | null;
  failure_kind: FailureKind | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tool_calls: number | null;
  wall_ms: number | null;
  cost_usd: number | null;
  transcript_path: string | null;
  meta_json: string | null;
}
