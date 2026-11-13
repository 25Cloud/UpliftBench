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

  const current = () => countTokens(parts.join('\n'));

  while (current() < target) {
    if (cursor >= order.length) {
      order = seededShuffle(NEUTRAL_PARAGRAPHS, Math.floor(rnd() * 2 ** 31));
      cursor = 0;
    }
    if (structured && headingCounter % 4 === 0) {
      const h = NEUTRAL_HEADINGS[Math.floor(rnd() * NEUTRAL_HEADINGS.length)];
      parts.push('', `## ${h}`, '');
    }
    headingCounter += 1;
    const para = order[cursor++];
    const connector = structured && rnd() < 0.25 ? NEUTRAL_CONNECTORS[Math.floor(rnd() * NEUTRAL_CONNECTORS.length)] : '';
    parts.push(`${connector}${para}`, '');
    if (structured && rnd() < 0.18) {
      parts.push(
        '- 先写清楚目标再动手',
        '- 把边界条件提到最前面',
        '- 改动之后立刻验证一次',
        ''
      );
    }
  }

  // 超出目标就回退最后一段，再按需截断
  let text = parts.join('\n');
  while (text && countTokens(text) > target * (1 + PLACEBO_MAX_DELTA / 2)) {
    const idx = text.lastIndexOf('\n\n');
    if (idx < 0) break;
    text = text.slice(0, idx);
  }
  // 不足就补中性句子
  const filler = '这一段只陈述通用的工程常识，不涉及任何具体领域、接口或任务要求。';
  let guard = 0;
  while (countTokens(text) < target * (1 - PLACEBO_MAX_DELTA / 2) && guard < 200) {
    text += `\n\n${filler}`;
    guard += 1;
  }
  const fitted = fitToTarget(text, target);
  return fitted;
}

/** 逐字符微调，保证落在 ±1% 内（比边加边测更快收敛） */
function fitToTarget(text: string, target: number): string {
  const est = estimateTokens(text).tokens;
  if (est === target) return text;
  const ratio = target / Math.max(1, est);
  let next = text;
  if (ratio < 1) {
    const keep = Math.max(1, Math.floor(text.length * ratio));
    next = text.slice(0, keep);
    const cut = next.lastIndexOf('\n\n');
    if (cut > 0) next = next.slice(0, cut);
  } else {
    const tail = '\n\n以上各条都是与具体任务无关的一般性说明，只用于占位。';
    let guard = 0;
    while (countTokens(next) < target && guard < 400) {
      next += tail;
      guard += 1;
    }
  }
  return next;
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
