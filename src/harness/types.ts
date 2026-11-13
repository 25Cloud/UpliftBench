/**
 * harness 适配层契约。
 *
 * 关键设计决定：**技能激活（activation）必须是可观测事件**。
 * 这不是装饰——探针 2（触发精度）和探针 3/4 全靠它。
 * 能自己掌控 agent loop 的 harness（openai-compat / mock）把 activation 做成显式工具调用；
 * 只能外挂的 harness（claude-code）读 hook 日志，读不到就老实标 unsupported，绝不编数字。
 */
export interface InstalledSkill {
  /** 技能名（catalog 里显示的名字） */
  name: string;
  description: string;
  /** 技能目录（相对 workspace） */
  dir: string;
  /** SKILL.md 全文，activate 时原样注入 */
  body: string;
  /** 该技能 SKILL.md 的近似 token 数 */
  tokens: number;
  /** 额外可加载文件（references/*.md 等），activate 时列出文件名 */
  resources?: string[];
}

export interface HarnessContext {
  /** 隔离工作区根目录（通常是 git worktree） */
  cwd: string;
  /** 本臂可用的技能目录（baseline 为空） */
  skills: InstalledSkill[];
  model: string;
  /** 额外系统提示（探针用） */
  systemExtra?: string;
}

export interface RunRequest {
  prompt: string;
  maxSteps?: number;
  timeoutMs?: number;
  temperature?: number;
  seed?: number;
  /** 允许的工具名子集，默认全开 */
  tools?: string[];
  /** 是否允许 run_command（注入探针里有时要关掉） */
  allowShell?: boolean;
  /** 附加到用户消息末尾的内容（注入探针的「工具输出」用） */
  injectedToolOutput?: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_source?: 'provider' | 'price_table' | 'unpriced';
}

export type TranscriptEventType =
  | 'system'
  | 'user'
  | 'assistant_text'
  | 'tool_call'
  | 'tool_result'
  | 'activation'
  | 'final'
  | 'error'
  | 'usage';

export interface TranscriptEvent {
  ts: string;
  type: TranscriptEventType;
  [key: string]: unknown;
}

export interface RunResult {
  finalText: string;
  /** 本臂实际激活过的技能名（顺序即激活顺序） */
  activated: string[];
  events: TranscriptEvent[];
  usage: Usage;
  toolCalls: number;
  wallMs: number;
  timedOut: boolean;
  error?: string;
  steps: number;
}

export interface HarnessAvailability {
  ok: boolean;
  detail: string;
  /** 该 harness 能否观测「哪个技能被激活」 */
  activationEvents: boolean;
}

export interface Harness {
  name: string;
  supportsActivationEvents: boolean;
  available(): Promise<HarnessAvailability>;
  run(ctx: HarnessContext, req: RunRequest): Promise<RunResult>;
}

export const DEFAULT_MAX_STEPS = 14;
export const DEFAULT_TIMEOUT_MS = 180_000;
