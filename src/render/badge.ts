import type { SkillCardJson } from '../types.js';
import { signed1, trim1 } from '../util/num.js';
import { PROTOCOL_VERSION } from '../version.js';

export type BadgeStyle = 'full' | 'compact';

export interface BadgeOptions {
  style?: BadgeStyle;
  /** 覆盖颜色（一般不用） */
  color?: string;
}

/** 颜色规则（docs/05 §5.2 / docs/09 §5.4） */
export function upliftColor(pp: number): string {
  if (pp >= 15) return '#2ea44f';
  if (pp >= 5) return '#4c9a2a';
  if (pp >= 0) return '#9e9e9e';
  return '#d73a49';
}

export function badgeText(card: SkillCardJson, style: BadgeStyle = 'compact'): { label: string; value: string } {
  if (!card.tier1) {
    const tok = card.skill.total_tokens ?? 0;
    return { label: 'uplift', value: `${(tok / 1000).toFixed(1)}k tok` };
  }
  const m = card.tier1.metrics;
  // 文案格式按 AGENTS.md T6 验收：`uplift 41% (base 40 → treat 76, placebo 45) A级`
  const pct = `${Math.round(m.uplift_pp)}%`;
  if (style === 'compact') return { label: 'uplift', value: pct };
  const grade = card.verdict.grade === 'unrated' ? '?' : card.verdict.grade;
  const value = `${pct} (base ${Math.round(card.tier1.arms.baseline.pass_rate * 100)} → treat ${Math.round(
    card.tier1.arms.treatment.pass_rate * 100
  )}, placebo ${Math.round(card.tier1.arms.placebo.pass_rate * 100)}) ${grade}级`;
  return { label: 'uplift', value };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textWidth(s: string): number {
  // 粗略估计：ASCII 6.2px，CJK 12px
  let w = 0;
  for (const ch of s) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 12 : 6.2;
  }
  return Math.ceil(w + 12);
}

/** 生成 badge.svg（shields 风格，单个自包含 SVG，不依赖外链） */
export function renderBadgeSvg(card: SkillCardJson, opts: BadgeOptions = {}): string {
  const style = opts.style ?? 'compact';
  const { label, value } = badgeText(card, style);
  const warning =
    card.tier1 && card.tier1.metrics.placebo_effect_pp > card.tier1.metrics.uplift_pp ? ' ⚠️' : '';
  const shownValue = `${value}${warning}`;
  const color = opts.color ?? (card.tier1 ? upliftColor(card.tier1.metrics.uplift_pp) : '#9e9e9e');
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(shownValue);
  const width = labelWidth + valueWidth;
  const height = 20;

  const tooltip = buildTooltip(card);
  const gradId = `s${Math.abs(hash(label + value)) % 100000}`;
  const valueX = labelWidth + valueWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" role="img" aria-label="${esc(label)}: ${esc(shownValue)}">
  <title>${esc(tooltip)}</title>
  <linearGradient id="${gradId}" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r${gradId}">
    <rect width="${width}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r${gradId})">
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${color}"/>
    <rect width="${width}" height="${height}" fill="url(#${gradId})"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(label)}</text>
    <text x="${labelWidth / 2}" y="13">${esc(label)}</text>
    <text x="${valueX}" y="14" fill="#010101" fill-opacity=".3">${esc(shownValue)}</text>
    <text x="${valueX}" y="13">${esc(shownValue)}</text>
  </g>
</svg>`;
}

/** 悬停信息（docs/05 §5.3）：把方法学暴露在 hover 里，这是防刷分的最好设计 */
export function buildTooltip(card: SkillCardJson): string {
  const lines: string[] = [];
  if (!card.tier1) {
    lines.push(`UpliftBench · ${card.skill.repo} · Tier 0`);
    lines.push(`静态开销 ${(card.skill.total_tokens ?? 0).toLocaleString('en-US')} tok（${card.skill.tokenizer ?? 'approx:weighted'}）`);
    lines.push(`Tier 1 未测（需要任务集）`);
    lines.push(`${card.protocol_version} · ${card.generated_at.slice(0, 10)}`);
    return lines.join('\n');
  }
  const m = card.tier1.metrics;
  const grade = card.verdict.grade === 'unrated' ? card.tier1.grader_tier : card.verdict.grade;
  lines.push(`UpliftBench · ${card.tier1.taskset} · ${grade}级`);
  lines.push(
    `uplift ${signed1(m.uplift_pp)}pp (headroom ${trim1(m.headroom_closed * 100)}%), N=${card.tier1.n}, 95%CI [${trim1(m.ci95[0])}, ${trim1(m.ci95[1])}]`
  );
  lines.push(
    `placebo effect ${signed1(m.placebo_effect_pp)}pp, baseline ${Math.round(
      card.tier1.arms.baseline.pass_rate * 100
    )}%, treatment ${Math.round(card.tier1.arms.treatment.pass_rate * 100)}%`
  );
  lines.push(`${card.protocol_version} · ${card.generated_at.slice(0, 10)}`);
  return lines.join('\n');
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function badgeMarkdown(card: SkillCardJson, relPath = 'badge.svg'): string {
  const alt = badgeText(card, 'compact');
  const url = `https://img.shields.io/endpoint?url=${encodeURIComponent(relPath)}`;
  void url;
  return `![uplift](${relPath})`;
}

export const BADGE_PROTOCOL = PROTOCOL_VERSION;
