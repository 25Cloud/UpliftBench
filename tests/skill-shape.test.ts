import { describe, expect, it } from 'vitest';
import { parseFrontmatter, runSkillShape } from '../src/probes/skill-shape.js';
import type { InstalledSkill } from '../src/harness/types.js';

function skill(partial: Partial<InstalledSkill> & { name: string; body: string }): InstalledSkill {
  return {
    description: '',
    dir: `skills/${partial.name}`,
    tokens: Math.max(1, partial.body.length / 4),
    ...partial
  };
}

describe('探针 7：技能形状', () => {
  it('解析 frontmatter 的 name / description', () => {
    const body = ['---', 'name: pdf-tools', 'description: Use when the user has a PDF to fill', '---', '', '# PDF', 'body'].join(
      '\n'
    );
    const fm = parseFrontmatter(body);
    expect(fm.has).toBe(true);
    expect(fm.fields.name).toBe('pdf-tools');
    expect(fm.fields.description).toContain('PDF');
  });

  it('没有 frontmatter 时如实报告，不假装有', () => {
    const fm = parseFrontmatter('# 就是一个标题\n\n正文');
    expect(fm.has).toBe(false);
    expect(fm.fields).toEqual({});
  });

  it('空包 → supported:false，而不是一堆 0 冒充数据', () => {
    const p = runSkillShape({ skills: [] });
    expect(p.supported).toBe(false);
    expect(p.skill_count).toBe(0);
  });

  it('区分「按需加载」与「巨石单文件」', () => {
    const good = skill({
      name: 'good',
      body: ['---', 'name: good', 'description: Use when you need to render a chart from tabular data in a browser', '---', 'short body'].join('\n'),
      resources: ['references/api.md', 'references/examples.md']
    });
    const bad = skill({
      name: 'bad',
      body: ['---', 'name: bad', 'description: helps', '---', 'x'.repeat(40_000)].join('\n'),
      resources: []
    });
    const p = runSkillShape({ skills: [good, bad], monolithTokens: 6_000 });
    expect(p.supported).toBe(true);
    expect(p.skill_count).toBe(2);
    expect(p.frontmatter_rate).toBe(1);
    expect(p.described_rate).toBe(1);
    // good 正文占比低且有 resources → 计为按需加载；bad 没有 resources → 不算
    expect(p.deferred_share).toBeCloseTo(0.5, 3);
    expect(p.monolith_share).toBeCloseTo(0.5, 3);
    // 最长的排在最前面，方便读卡的人先看到问题技能
    expect(p.skills[0].name).toBe('bad');
    expect(p.warnings.join(' ')).toContain('巨石');
  });

  it('description 太短与太长都会进 warnings', () => {
    const thin = skill({ name: 'thin', body: '---\ndescription: helps\n---\nbody' });
    const fat = skill({ name: 'fat', body: `---\ndescription: ${'use this when '.repeat(80)}\n---\nbody` });
    const p = runSkillShape({ skills: [thin, fat], thinDescriptionTokens: 20, fatDescriptionTokens: 200 });
    expect(p.warnings.join(' ')).toContain('短于 20');
    expect(p.warnings.join(' ')).toContain('超过 200');
  });
});
