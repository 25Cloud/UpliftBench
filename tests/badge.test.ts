import { describe, expect, it } from 'vitest';
import { badgeText, buildTooltip, renderBadgeSvg, upliftColor } from '../src/render/badge.js';
import { buildSkillCard } from '../src/card/build.js';
import type { SkillCardJson, Tier1Block } from '../src/types.js';

function tier1(overrides: Partial<Tier1Block> = {}): Tier1Block {
  return {
    taskset: 'web-guidance@1.0',
    grader_tier: 'A',
    n: 30,
    arms: {
      baseline: { pass_rate: 0.4 },
      placebo: { pass_rate: 0.45 },
      treatment: { pass_rate: 0.76 }
    },
    metrics: {
      uplift_pp: 31,
      headroom_closed: 0.5636,
      raw_gain_pp: 36,
      placebo_effect_pp: 5,
      ci95: [22, 40]
    },
    ...overrides
  };
}

function card(t1?: Tier1Block): SkillCardJson {
  return buildSkillCard({
    skillRepo: 'addyosmani/agent-skills',
    skillCommit: 'a1b2c3d4e5f6',
    skillPath: './agent-skills',
    skillCount: 25,
    totalTokens: 12400,
    source: 'github',
    tier0: {},
    tier1: t1,
    generatedAt: '2026-11-13T13:00:00Z'
  });
}

describe('badge 文案（AGENTS.md T6 验收格式）', () => {
  it('完整版格式：uplift 31% (base 40 → treat 76, placebo 45) A级', () => {
    const c = card(tier1());
    const text = badgeText(c, 'full');
    expect(text.label).toBe('uplift');
    expect(text.value).toBe('31% (base 40 → treat 76, placebo 45) A级');
  });

  it('精简版 ≤ 12 字符', () => {
    const c = card(tier1());
    const text = badgeText(c, 'compact');
    expect(`${text.label} ${text.value}`.length).toBeLessThanOrEqual(12);
    expect(text.value).toBe('31%');
  });

  it('negative uplift 带负号', () => {
    const c = card(
      tier1({
        metrics: { uplift_pp: -8, headroom_closed: -0.15, placebo_effect_pp: 3, ci95: [-14, -1] },
        arms: { baseline: { pass_rate: 0.5 }, placebo: { pass_rate: 0.55 }, treatment: { pass_rate: 0.47 } }
      })
    );
    expect(badgeText(c, 'compact').value).toBe('-8%');
    expect(upliftColor(-8)).toBe('#d73a49');
  });

  it('颜色阈值按 docs/05 §5.2', () => {
    expect(upliftColor(16)).toBe('#2ea44f');
    expect(upliftColor(15)).toBe('#2ea44f');
    expect(upliftColor(10)).toBe('#4c9a2a');
    expect(upliftColor(3)).toBe('#9e9e9e');
    expect(upliftColor(-1)).toBe('#d73a49');
  });

  it('placebo 效应大于 uplift 时 SVG 里加 ⚠️ 角标', () => {
    const c = card(
      tier1({
        metrics: { uplift_pp: 4, headroom_closed: 0.07, placebo_effect_pp: 12, ci95: [0, 8] },
        arms: { baseline: { pass_rate: 0.4 }, placebo: { pass_rate: 0.52 }, treatment: { pass_rate: 0.56 } }
      })
    );
    const svg = renderBadgeSvg(c, { style: 'compact' });
    expect(svg).toContain('⚠️');
    // 精简版本身仍然保持 ≤12 字符（角标只加在 SVG 上）
    expect(badgeText(c, 'compact').value).toBe('4%');
  });

  it('渲染出合法 SVG 且带 <title> 悬停信息', () => {
    const svg = renderBadgeSvg(card(tier1()), { style: 'full' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<title>');
    expect(svg).toContain('#2ea44f');
    expect(svg).toContain('A级');
  });

  it('悬停信息含 N 与置信区间（协议 §6 强制字段）', () => {
    const tip = buildTooltip(card(tier1()));
    expect(tip).toContain('N=30');
    expect(tip).toContain('95%CI [22, 40]');
    expect(tip).toContain('placebo effect +5pp');
    expect(tip).toContain('protocol/1.0.0');
  });
});

describe('SkillCard 定级', () => {
  it('没有 tier1 时不评级（Tier 0 只出事实）', () => {
    const c = card(undefined);
    expect(c.verdict.grade).toBe('unrated');
    expect(c.verdict.headline).toContain('Tier 0');
  });

  it('n=30 且 A 级时保持 A', () => {
    const c = card(tier1());
    expect(c.verdict.grade).toBe('A');
  });

  it('n<30 时降为 B', () => {
    const c = card(tier1({ n: 12 }));
    expect(c.verdict.grade).toBe('B');
    expect(c.verdict.flags).toContain('n_lt_30');
  });

  it('CI 跨 0 时打标记', () => {
    const c = card(tier1({ metrics: { uplift_pp: 3, headroom_closed: 0.05, placebo_effect_pp: 1, ci95: [-2, 9] } }));
    expect(c.verdict.flags).toContain('ci_crosses_zero');
  });
});
