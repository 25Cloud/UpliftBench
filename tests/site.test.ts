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
    expect(html).toContain('+2.2pp');
    expect(html).toContain('8.7%');
    expect(html).toContain('[-2.2, 6.7]');
    expect(html).toContain('>30<');
  });

  it('auto 与 forced 是两个条件，分成两张表而不是混排', () => {
    const forced: Tier1Block = {
      ...tier1(),
      activation: { mode: 'forced', rate: 1, by_arm: { placebo: 1, treatment: 1 }, preloaded_tokens_p50: 12000 }
    };
    const auto: Tier1Block = { ...tier1(), activation: { mode: 'auto', rate: 0.23, preloaded_tokens_p50: null } };
    const out = renderSite([
      { card: card('owner/same-skill-auto', auto), cardPath: 'a.json' },
      { card: card('owner/same-skill-forced', forced), cardPath: 'b.json' }
    ]);
    expect(out).toContain('自动激活');
    expect(out).toContain('强制注入');
    // auto 表在 forced 表之前：默认条件先出现，不许只挂好看的那个
    expect(out.indexOf('自动激活')).toBeLessThan(out.indexOf('强制注入'));
    // 两个条件各成一张表
    expect(out.match(/<table>/g)).toHaveLength(2);
  });

  it('激活未知时显示 —，不编一个 0%', () => {
    expect(html).toContain('<td class="num">—</td>');
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
