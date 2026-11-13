import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadTaskset } from '../src/taskset/loader.js';
import { admissionCheck, validateTasksetJson } from '../src/taskset/validate.js';

const CWD = process.cwd();

describe('任务集校验与准入检查（docs/04 §6）', () => {
  it('web-guidance@1.0 通过 schema 与结构性检查', async () => {
    const ts = await loadTaskset('web-guidance@1.0', CWD);
    const schema = await validateTasksetJson(ts.json);
    expect(schema.errors).toEqual([]);
    const report = await admissionCheck(ts.dir, ts.json);
    expect(report.ok).toBe(true);
    expect(ts.json.task_count).toBe(30);
    expect(ts.json.tasks.length).toBe(30);
  });

  it('general-20@1.0 有 20 个任务且都是 A 级', async () => {
    const ts = await loadTaskset('general-20@1.0', CWD);
    expect(ts.json.tasks.length).toBe(20);
    expect(ts.json.grader.tier).toBe('A');
    const report = await admissionCheck(ts.dir, ts.json);
    expect(report.ok).toBe(true);
  });

  it('行为性检查如实标 skipped（不假装验过）', async () => {
    const ts = await loadTaskset('web-guidance@1.0', CWD);
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
