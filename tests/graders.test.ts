import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exactGrader, normalizeText } from '../src/graders/exact.js';
import { testsGrader } from '../src/graders/tests.js';
import type { GradeContext } from '../src/graders/tests.js';
import type { TaskSetJson } from '../src/types.js';

let tmp: string;

beforeAll(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-grader-'));
});

afterAll(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

function ctx(overrides: Partial<GradeContext> & { workspace: string }): GradeContext {
  const taskset: TaskSetJson = {
    schema_version: '1.0.0',
    domain: 'demo',
    version: '1.0.0',
    title: 'demo',
    grader: { kind: 'tests', tier: 'A', entry: 'verify.mjs', timeout_sec: 20, normalize: ['trim', 'collapse_whitespace'] },
    env: { kind: 'local' },
    task_count: 1,
    tasks: [{ id: 'demo-001', title: 't', prompt_file: 'p.md' }]
  };
  return {
    taskId: 'demo-001',
    tasksetDir: tmp,
    taskset,
    ...overrides
  };
}

describe('归一化', () => {
  it('trim / collapse / lowercase 组合', () => {
    expect(normalizeText('  A   B \n C  ', ['trim', 'collapse_whitespace', 'lowercase'])).toBe('a b\nc');
  });
});

describe('A 级 exact 评分器（协议 §4.2）', () => {
  it('精确匹配通过', async () => {
    const taskDir = path.join(tmp, 'tasks', 'demo-001');
    await fsp.mkdir(taskDir, { recursive: true });
    await fsp.writeFile(path.join(taskDir, 'expected.txt'), 'hello world\n');
    const ws = path.join(tmp, 'ws1');
    await fsp.mkdir(ws, { recursive: true });
    await fsp.writeFile(path.join(ws, 'answer.txt'), '  hello world  \n');
    const r = await exactGrader.grade(ctx({ workspace: ws }), null);
    expect(r.pass).toBe(true);
  });

  it('不匹配时判失败而不是 grader_error', async () => {
    const ws = path.join(tmp, 'ws2');
    await fsp.mkdir(ws, { recursive: true });
    await fsp.writeFile(path.join(ws, 'answer.txt'), 'something else');
    const r = await exactGrader.grade(ctx({ workspace: ws }), null);
    expect(r.pass).toBe(false);
    expect(r.graderError).toBeUndefined();
  });

  it('缺少 expected.txt 是 grader_error（不计入 pass_rate）', async () => {
    const ws = path.join(tmp, 'ws3');
    await fsp.mkdir(ws, { recursive: true });
    await fsp.writeFile(path.join(ws, 'answer.txt'), 'x');
    const r = await exactGrader.grade(ctx({ workspace: ws, taskId: 'missing-999' }), null);
    expect(r.pass).toBeNull();
    expect(r.graderError).toContain('expected.txt');
  });
});

describe('A 级 tests 评分器（协议 §4.1）', () => {
  it('verify 输出 JSON pass=true', async () => {
    const ws = path.join(tmp, 'ws4');
    await fsp.mkdir(ws, { recursive: true });
    const verify = path.join(tmp, 'ok.mjs');
    await fsp.writeFile(
      verify,
      `import { readFileSync } from 'node:fs';\nconst input = JSON.parse(readFileSync(0,'utf8'));\nconsole.log(JSON.stringify({ pass: Boolean(input.workspace), detail: 'ok' }));\n`
    );
    const r = await testsGrader.grade(ctx({ workspace: ws }), verify);
    expect(r.pass).toBe(true);
    expect(r.detail).toBe('ok');
  });

  it('verify 非零退出 → grader_error', async () => {
    const ws = path.join(tmp, 'ws5');
    await fsp.mkdir(ws, { recursive: true });
    const verify = path.join(tmp, 'bad.mjs');
    await fsp.writeFile(verify, `process.exit(2);\n`);
    const r = await testsGrader.grade(ctx({ workspace: ws }), verify);
    expect(r.pass).toBeNull();
    expect(r.graderError).toContain('exit 2');
  });

  it('verify 输出不是 JSON → grader_error', async () => {
    const ws = path.join(tmp, 'ws6');
    await fsp.mkdir(ws, { recursive: true });
    const verify = path.join(tmp, 'garbage.mjs');
    await fsp.writeFile(verify, `console.log('not json');\n`);
    const r = await testsGrader.grade(ctx({ workspace: ws }), verify);
    expect(r.pass).toBeNull();
    expect(r.graderError).toContain('JSON');
  });

  it('缺 verify 路径 → grader_error', async () => {
    const ws = path.join(tmp, 'ws7');
    await fsp.mkdir(ws, { recursive: true });
    const r = await testsGrader.grade(ctx({ workspace: ws }), null);
    expect(r.pass).toBeNull();
    expect(r.graderError).toContain('verify');
  });
});
