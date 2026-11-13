import { describe, expect, it } from 'vitest';
import { renderSite } from '../src/render/site.js';
import { buildSkillCard } from '../src/card/build.js';
import type { SkillCardJson, Tier1Block } from '../src/types.js';

function tier1(): Tier1Block {
  return {
    taskset: 'web-guidance@1.0',
    grader_tier: 'A',
    n: 30,
    arms: {
      baseline: { pass_rate: 0.789 },
      placebo: { pass_rate: 0.744 },
      treatment: { pass_rate: 0.767 }
    },
    metrics: { uplift_pp: 2.22, headroom_closed: 0.087, raw_gain_pp: -2.22, placebo_effect_pp: -4.44, ci95: [-2.22, 6.69] }
  };
}

function card(repo: string, t1?: Tier1Block): SkillCardJson {
  return buildSkillCard({
    skillRepo: repo,
    skillCommit: 'abcdef123456',
    skillPath: './x',
    skillCount: 3,
    totalTokens: 1000,
    source: 'github',
    tier0: {},
    tier1: t1
  });
}

describe('静态榜单页', () => {
  const html = renderSite([
    { card: card('owner/with-tier1', tier1()), cardPath: 'a.json' },
    { card: card('owner/tier0-only'), cardPath: 'b.json' }
  ]);

  it('产出完整 HTML', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('charset="utf-8"');
  });

  it('Tier 1 与 Tier 0 分组显示，不混排（协议 §4 铁律）', () => {
    expect(html).toContain('web-guidance@1.0 · A级');
    expect(html).toContain('Tier 0 · 事实查询（不排名）');
    expect(html.indexOf('Tier 0 · 事实查询')).toBeGreaterThan(html.indexOf('web-guidance@1.0'));
  });

  it('显示 uplift / headroom / placebo / CI / N', () => {
    expect(html).toContain('+2pp');
    expect(html).toContain('9%');
    expect(html).toContain('[-2, 7]');
    expect(html).toContain('>30<');
  });

  it('placebo 效应大于 uplift 时加 ⚠️', () => {
    const warnCard = card('owner/placebo-heavy', {
      ...tier1(),
      metrics: { uplift_pp: 1, headroom_closed: 0.02, placebo_effect_pp: 9, ci95: [0, 3] }
    });
    const out = renderSite([{ card: warnCard, cardPath: 'c.json' }]);
    expect(out).toContain('⚠️');
  });

  it('Tier 0 条目注明不进主榜', () => {
    expect(html).toContain('不进主榜');
  });
});
