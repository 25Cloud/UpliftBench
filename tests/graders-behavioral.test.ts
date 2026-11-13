import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 行为型评分器的自检（wmg-049 之后的任务）。
 *
 * 一个 A 级评分器必须同时满足两件事，缺一条它就是废的：
 *   1. 对**原始 fixture**（有 bug 的老代码）判不通过 —— 否则「什么都不做」也能得分；
 *   2. 对**参考解**判通过 —— 否则这题根本做不出来，或者在测模型猜谜的能力。
 *
 * 为什么值得单独一组测试：`/grader-solutions` 里的参考解是人写的，只要新 API 在某天
 * 被运行时不支持（比如 URL.parse 在旧 Node 上不存在），这组测试会立刻红，
 * 而不是等到跑完一晚上模型才发现 8 道题全是 0 分。
 */

// vitest 从仓库根启动，其他测试也按相对路径取
const root = process.cwd();
const tasksetDir = path.join(root, 'tasksets', 'web-guidance');
const solutionsDir = path.join(root, 'tests', 'fixtures', 'grader-solutions');

const taskset = JSON.parse(fs.readFileSync(path.join(tasksetDir, 'taskset.json'), 'utf8')) as {
  tasks: Array<{ id: string }>;
};

/** 只有带 behavior.mjs 的任务是行为型 */
const behavioral = taskset.tasks
  .map((t) => t.id)
  .filter((id) => fs.existsSync(path.join(tasksetDir, 'tasks', id, 'behavior.mjs')));

interface GradeOutcome {
  pass: boolean;
  detail?: string;
  metrics?: Record<string, number>;
}

function grade(taskId: string, workspace: string): GradeOutcome {
  const verify = path.join(tasksetDir, 'tasks', taskId, 'verify.mjs');
  const res = spawnSync(process.execPath, [verify], {
    input: JSON.stringify({ task_id: taskId, workspace }),
    encoding: 'utf8',
    timeout: 120_000
  });
  if (res.error) throw res.error;
  const line = (res.stdout ?? '').trim().split('\n').filter(Boolean).pop();
  if (!line) throw new Error(`${taskId}: 评分器没有输出（stderr: ${(res.stderr ?? '').slice(0, 400)}）`);
  try {
    return JSON.parse(line) as GradeOutcome;
  } catch {
    throw new Error(`${taskId}: 评分器输出不是 JSON：${line.slice(0, 300)}`);
  }
}

function makeWorkspace(taskId: string, withSolution: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `uplift-grade-${taskId}-`));
  const fixture = path.join(tasksetDir, 'tasks', taskId, 'fixture');
  fs.cpSync(fixture, dir, { recursive: true });
  if (withSolution) {
    const sol = path.join(solutionsDir, taskId);
    if (!fs.existsSync(sol)) throw new Error(`${taskId}: 缺少参考解 ${sol}`);
    fs.cpSync(sol, dir, { recursive: true });
  }
  return dir;
}

describe('行为型评分器自检', () => {
  it('至少有 8 道行为型任务', () => {
    expect(behavioral.length).toBeGreaterThanOrEqual(8);
  });

  for (const id of behavioral) {
    it(`${id}：原始 fixture 判不过`, () => {
      const ws = makeWorkspace(id, false);
      try {
        const out = grade(id, ws);
        expect(out.pass, `fixture 竟然通过了，评分器太松：${out.detail}`).toBe(false);
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    });

    it(`${id}：参考解判通过`, () => {
      const ws = makeWorkspace(id, true);
      try {
        const out = grade(id, ws);
        expect(out.pass, `参考解没通过，题目不可解或规则写错：${out.detail}`).toBe(true);
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    });
  }
});
