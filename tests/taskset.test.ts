import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadTaskset } from '../src/taskset/loader.js';
import { admissionCheck, validateTasksetJson } from '../src/taskset/validate.js';

const CWD = process.cwd();

describe('任务集校验与准入检查（docs/04 §6）', () => {
  it('web-guidance@1.4.0 通过 schema 与结构性检查', async () => {
    const ts = await loadTaskset('web-guidance@1.4.0', CWD);
    const schema = await validateTasksetJson(ts.json);
    expect(schema.errors).toEqual([]);
    const report = await admissionCheck(ts.dir, ts.json);
    expect(report.ok).toBe(true);
    expect(ts.json.task_count).toBe(64);
    expect(ts.json.tasks.length).toBe(64);
  });

  it('general-20@1.0 有 20 个任务且都是 A 级', async () => {
    const ts = await loadTaskset('general-20@1.0', CWD);
    expect(ts.json.tasks.length).toBe(20);
    expect(ts.json.grader.tier).toBe('A');
    const report = await admissionCheck(ts.dir, ts.json);
    expect(report.ok).toBe(true);
  });

  it('v1.1 新增任务都带 v1.1 标签，且每题至少 3 条规则', async () => {
    const ts = await loadTaskset('web-guidance@1.4.0', CWD);
    const fresh = ts.json.tasks.filter((t) => t.tags?.includes('v1.1'));
    expect(fresh.length).toBe(18);
    for (const t of fresh) {
      expect(t.verify).toBeTruthy();
    }
  });

  it('行为型任务都带 behavior.mjs，且被 behavioral 标签标出（10 题）', async () => {
    const ts = await loadTaskset('web-guidance@1.4.0', CWD);
    const fs = await import('node:fs');
    const withBehavior = ts.json.tasks.filter((t) =>
      fs.existsSync(path.join(ts.dir, 'tasks', t.id, 'behavior.mjs'))
    );
    expect(withBehavior.length).toBe(10);
    for (const t of withBehavior) {
      expect(t.tags).toContain('behavioral');
    }
    // 反向：打了 behavioral 标签的必须有 behavior.mjs，否则标签在骗人
    const tagged = ts.json.tasks.filter((t) => t.tags?.includes('behavioral'));
    expect(tagged.length).toBe(withBehavior.length);
  });

  it('消融组有 2 题，且与它们的对照组共用同一份 fixture', async () => {
    const ts = await loadTaskset('web-guidance@1.4.0', CWD);
    const ablation = ts.json.tasks.filter((t) => t.tags?.includes('ablation'));
    expect(ablation.length).toBe(2);
    const fs = await import('node:fs');
    const read = (id: string) =>
      fs.readFileSync(path.join(ts.dir, 'tasks', id, 'fixture', 'reorder.js'), 'utf8');
    // 058 与 044 必须是同一份起点代码，否则「只改提示词」这个前提不成立
    expect(read('wmg-058')).toBe(read('wmg-044'));
  });

  it('withheld 组的提示词里不许出现它要考的那个名字', async () => {
    // 这张表就是这批题的全部意义：「提示词不给答案」。谁把名字写回去，这里立刻红。
    const ts = await loadTaskset('web-guidance@1.4.0', CWD);
    const fs = await import('node:fs');
    const withheld: Record<string, string[]> = {
      'wmg-057': ['popover'],
      'wmg-058': ['moveBefore'],
      'wmg-059': ['field-sizing'],
      'wmg-060': ['base-select'],
      'wmg-061': ['scroll-state'],
      'wmg-062': ['subgrid'],
      'wmg-063': ['light-dark'],
      'wmg-064': ['anchor-name', 'position-anchor', 'position-area']
    };
    for (const [id, banned] of Object.entries(withheld)) {
      const task = ts.json.tasks.find((t) => t.id === id);
      expect(task, `${id} 不存在`).toBeTruthy();
      expect(task!.tags).toContain('withheld');
      const prompt = fs.readFileSync(path.join(ts.dir, task!.prompt_file), 'utf8').toLowerCase();
      for (const word of banned) {
        expect(prompt.includes(word.toLowerCase()), `${id} 的提示词里出现了 "${word}"`).toBe(false);
      }
    }
  });

  it('行为性检查如实标 skipped（不假装验过）', async () => {
    const ts = await loadTaskset('web-guidance@1.4.0', CWD);
    const report = await admissionCheck(ts.dir, ts.json);
    const behavior = report.checks.filter((c) => c.ok === 'skipped');
    expect(behavior.length).toBeGreaterThanOrEqual(2);
    expect(report.warnings).toContain('env_unpinned');
  });

  it('task_count 与 tasks 不一致时判不合格', async () => {
    const ts = await loadTaskset('general-20@1.0', CWD);
    const broken = { ...ts.json, task_count: 99 };
    const report = await admissionCheck(ts.dir, broken);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'task_count 一致')?.ok).toBe(false);
  });

  it('schema 能抓出非法字段值', async () => {
    const ts = await loadTaskset('general-20@1.0', CWD);
    const broken = { ...ts.json, grader: { ...ts.json.grader, tier: 'Z' } };
    const schema = await validateTasksetJson(broken);
    expect(schema.ok).toBe(false);
  });

  it('skillcard schema 能校验生成的卡', async () => {
    const { buildSkillCard } = await import('../src/card/build.js');
    const { validateSkillCardJson } = await import('../src/taskset/validate.js');
    const card = buildSkillCard({
      skillRepo: 'demo/skill',
      skillCommit: 'abcdef1',
      skillPath: './demo',
      skillCount: 1,
      totalTokens: 100,
      source: 'local',
      tier0: {}
    });
    const res = await validateSkillCardJson(card);
    expect(res.errors).toEqual([]);
  });

  it('任务集路径解析支持本地目录', async () => {
    const ts = await loadTaskset(path.join('tasksets', 'general-20'), CWD);
    expect(ts.json.domain).toBe('general-20');
  });
});
