import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runStaticCost } from '../src/probes/static-cost.js';
import { loadSkillPackage } from '../src/skill/package.js';

let tmp: string;

beforeAll(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-static-'));
  await fsp.mkdir(path.join(tmp, 'references'), { recursive: true });
  await fsp.writeFile(
    path.join(tmp, 'SKILL.md'),
    ['---', 'name: demo', 'description: demo skill', '---', '', '# Demo', '', '- one', '- two', '```js', 'const a = 1;', '```', ''].join(
      '\n'
    )
  );
  const big = 'This is a repeated paragraph about engineering. '.repeat(40);
  await fsp.writeFile(path.join(tmp, 'references/a.md'), big);
  await fsp.writeFile(path.join(tmp, 'references/b.md'), big);
});

afterAll(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

describe('探针 1：静态开销', () => {
  it('找出技能、算总 token、标出重复内容', async () => {
    const res = await runStaticCost(tmp, { budget: 100 });
    expect(res.supported).toBe(true);
    expect(res.skill_count).toBe(1);
    expect(res.total_tokens).toBeGreaterThan(100);
    expect(res.per_file.length).toBe(3);
    expect(res.duplicates.length).toBe(1);
    expect(res.duplicates[0].files.length).toBe(2);
    expect(res.duplicates[0].wasted_tokens).toBeGreaterThan(0);
  });

  it('超预算时 over_by 正确（预算按注入上下文算，不含脚本）', async () => {
    const res = await runStaticCost(tmp, { budget: 10 });
    expect(res.budget.over_by).toBe(res.context_tokens - 10);
    expect(res.budget.over_pct).toBeCloseTo(((res.context_tokens - 10) / 10) * 100, 0);
    expect(res.warnings.some((w) => w.includes('超出预算'))).toBe(true);
  });

  it('total 与 context 分别统计', async () => {
    const res = await runStaticCost(tmp);
    expect(res.context_tokens).toBeLessThanOrEqual(res.total_tokens);
    expect(res.context_tokens).toBeGreaterThan(0);
  });

  it('统计 markdown 结构', async () => {
    const res = await runStaticCost(tmp);
    expect(res.structure.headings).toBeGreaterThanOrEqual(1);
    expect(res.structure.lists).toBeGreaterThanOrEqual(2);
    expect(res.structure.code_blocks).toBe(1);
  });

  it('没有 SKILL.md 时返回 supported:false 而不是抛错', async () => {
    const empty = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-empty-'));
    await fsp.writeFile(path.join(empty, 'readme.md'), 'nope');
    const res = await runStaticCost(empty);
    expect(res.supported).toBe(false);
    expect(res.warnings[0]).toContain('SKILL.md');
    await fsp.rm(empty, { recursive: true, force: true });
  });
});

describe('技能包解析', () => {
  it('多技能包按 SKILL.md 计数', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-multi-'));
    for (const name of ['alpha', 'beta']) {
      await fsp.mkdir(path.join(dir, 'skills', name), { recursive: true });
      await fsp.writeFile(
        path.join(dir, 'skills', name, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n`
      );
    }
    const pkg = await loadSkillPackage(dir);
    expect(pkg.skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    await fsp.rm(dir, { recursive: true, force: true });
  });
});
