import { countTokens, estimateTokens } from '../tokenize.js';
import { mulberry32, hashSeed, seededShuffle } from '../version.js';
import { NEUTRAL_CONNECTORS, NEUTRAL_HEADINGS, NEUTRAL_PARAGRAPHS } from './corpus.js';
import type { InstalledSkill } from '../harness/types.js';

export const PLACEBO_MAX_DELTA = 0.02;

export interface PlaceboSpec {
  targetTokens: number;
  seed: number;
  title?: string;
  /** 是否加标题/列表结构（默认 true，匹配技能包的 markdown 形状） */
  structured?: boolean;
}

/**
 * 生成一份「目标 token 数 ± 2%」的中性文档。
 *
 * 做法：按种子洗牌段落 → 逐段追加直到接近目标 → 用连接句与标题微调到落在容差内。
 * 全程只有一个随机源（seed），同一目标长度 + 同一 seed 必然得到同一份文本。
 */
export function generatePlaceboDocument(spec: PlaceboSpec): string {
  const target = Math.max(40, Math.floor(spec.targetTokens));
  const rnd = mulberry32(spec.seed >>> 0);
  const structured = spec.structured !== false;
  const title = spec.title ?? '工程实践笔记';

  const parts: string[] = [];
  if (structured) parts.push(`# ${title}`, '');
  let order = seededShuffle(NEUTRAL_PARAGRAPHS, spec.seed);
  let cursor = 0;
  let headingCounter = 0;
  let length = parts.join('\n').length;

  /*
   * 组合阶段的性能很关键：292k token 的安慰剂如果每加一段就重新分词，是 O(n²)。
   * 所以大循环用「字符数上界估算」终止（纯英文约 4 chars/token，取 4.2 保证只会过长），
   * 精确收敛交给后面的二分——二分只能往下收，所以宁可多写。
   */
  const estimatedChars = Math.ceil(target * 4.2);

  while (length < estimatedChars) {
    if (cursor >= order.length) {
      order = seededShuffle(NEUTRAL_PARAGRAPHS, Math.floor(rnd() * 2 ** 31));
      cursor = 0;
    }
    if (structured && headingCounter % 4 === 0) {
      const h = NEUTRAL_HEADINGS[Math.floor(rnd() * NEUTRAL_HEADINGS.length)];
      parts.push('', `## ${h}`, '');
      length += h.length + 5;
    }
    headingCounter += 1;
    const para = order[cursor++];
    const connector = structured && rnd() < 0.25 ? NEUTRAL_CONNECTORS[Math.floor(rnd() * NEUTRAL_CONNECTORS.length)] : '';
    const chunk = `${connector}${para}`;
    parts.push(chunk, '');
    length += chunk.length + 2;
    if (structured && rnd() < 0.18) {
      const list = '- 先写清楚目标再动手\n- 把边界条件提到最前面\n- 改动之后立刻验证一次\n';
      parts.push(list);
      length += list.length + 1;
    }
  }

  let composed = parts.join('\n');
  // 兜底：估算不够就一次性补一大块（只调一次 countTokens，避免回到 O(n²)）
  const deficit = target - countTokens(composed);
  if (deficit > 0) {
    composed += padText(Math.ceil(deficit * 4.2) + 32);
  }
  return fitToTarget(composed, target);
}

/**
 * 二分收敛到目标 token 数。
 *
 * 为什么不按「差值 × 4 字符」线性逼近：中英混排时 chars/token 在 1.7~4 之间浮动，
 * 线性步长必然震荡。二分只依赖 countTokens 的单调性，跟文本语言无关。
 */
function fitToTarget(text: string, target: number): string {
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (countTokens(text.slice(0, mid)) <= target) lo = mid;
    else hi = mid - 1;
  }
  let best = text.slice(0, lo);
  // 停在词边界更好看，但只在偏差不扩大时才剥词
  const tail = best.match(/\S+$/);
  if (tail && tail[0].length < 16) {
    const cand = best.slice(0, best.length - tail[0].length);
    if (cand.length > 0 && Math.abs(countTokens(cand) - target) / target <= 0.005) best = cand;
  }
  return best.trimEnd();
}

/** 只按字符裁尾部（保留给极端情况） */
function cutTail(text: string, chars: number): string {
  const head = text.slice(0, Math.max(0, text.length - chars));
  const m = head.match(/\S*$/);
  const idx = m ? m.index ?? head.length : head.length;
  return head.slice(0, idx).replace(/\s+$/, '');
}

const PAD_SENTENCES = [
  '这一段只陈述通用工程常识，不与任何具体任务相关。',
  '以上内容仅用于占位，不含任何领域术语或操作指令。',
  'This paragraph only states generic engineering commonplaces and nothing task specific. ',
  'It carries no domain terminology, no instructions, and no formatting requirements. '
];

function padText(chars: number): string {
  let out = '\n\n';
  let i = 0;
  while (out.length < chars) {
    out += PAD_SENTENCES[i % PAD_SENTENCES.length];
    if (i % PAD_SENTENCES.length === PAD_SENTENCES.length - 1) out += ' ';
    i += 1;
    if (i > 400) break;
  }
  return out.slice(0, Math.max(0, chars));
}

export interface PlaceboSkillPlan {
  name: string;
  targetTokens: number;
  text: string;
  deltaPct: number;
}

/**
 * 为整个技能包生成等量安慰剂：**每个技能一份，逐技能对齐 token**。
 *
 * 为什么不生成一大坨：技能包的真实行为是「激活某一个技能」，激活成本按技能计。
 * 一个 40k token 的巨型安慰剂会让安慰剂臂的上下文行为与真实臂完全不同，
 * 那就不是安慰剂，而是另一种干预了。
 */
export function planPlaceboSkills(
  skills: Array<{ name: string; tokens: number }>,
  seedSource: string
): PlaceboSkillPlan[] {
  const baseSeed = hashSeed(seedSource);
  return skills.map((s, i) => {
    const target = Math.max(60, s.tokens);
    const text = generatePlaceboDocument({
      targetTokens: target,
      seed: (baseSeed + i * 7919) >>> 0,
      title: `通用工程实践笔记（第 ${i + 1} 部分）`
    });
    const actual = countTokens(text);
    return {
      name: `placebo-${i + 1}`,
      targetTokens: target,
      text,
      deltaPct: target === 0 ? 0 : Math.abs(actual - target) / target
    };
  });
}

export interface PlaceboValidation {
  ok: boolean;
  treatmentTokens: number;
  placeboTokens: number;
  deltaPct: number;
  maxSkillDeltaPct: number;
  messages: string[];
}

export function validatePlacebo(
  treatmentTokens: number,
  plans: PlaceboSkillPlan[],
  maxDelta = PLACEBO_MAX_DELTA
): PlaceboValidation {
  const placeboTokens = plans.reduce((s, p) => s + countTokens(p.text), 0);
  const deltaPct = treatmentTokens === 0 ? 0 : Math.abs(placeboTokens - treatmentTokens) / treatmentTokens;
  const maxSkillDeltaPct = plans.reduce((m, p) => Math.max(m, p.deltaPct), 0);
  const messages: string[] = [];
  if (deltaPct > maxDelta) {
    messages.push(`安慰剂总 token 偏差 ${(deltaPct * 100).toFixed(2)}% 超过 ${(maxDelta * 100).toFixed(0)}%`);
  }
  if (maxSkillDeltaPct > maxDelta * 2) {
    messages.push(`单个技能安慰剂偏差 ${(maxSkillDeltaPct * 100).toFixed(2)}% 偏大`);
  }
  return { ok: messages.length === 0, treatmentTokens, placeboTokens, deltaPct, maxSkillDeltaPct, messages };
}

/** 把安慰剂计划变成 harness 可加载的技能对象 */
export function placeboInstalledSkills(plans: PlaceboSkillPlan[], dirPrefix = '.uplift-skills'): InstalledSkill[] {
  return plans.map((p) => ({
    name: p.name,
    description: '通用工程实践笔记（中性参考材料，无特定领域）',
    dir: `${dirPrefix}/${p.name}`,
    body: p.text,
    tokens: countTokens(p.text)
  }));
}
