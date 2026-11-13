import path from 'node:path';
import fsp from 'node:fs/promises';
import type { GradeContext, GradeOutcome, Grader } from './tests.js';

export type NormalizeOp = 'trim' | 'collapse_whitespace' | 'lowercase';

export function normalizeText(text: string, ops: NormalizeOp[] = []): string {
  let out = text;
  for (const op of ops) {
    if (op === 'trim') out = out.trim();
    if (op === 'collapse_whitespace') out = out.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    if (op === 'lowercase') out = out.toLowerCase();
  }
  return out;
}

/**
 * A 级 exact 评分器（协议 §4.2）。
 * 约定：任务目录下 expected.txt 是期望输出；workspace 下 answer.txt（或任务声明的 output）是实际输出。
 */
export const exactGrader: Grader = {
  kind: 'exact',
  async grade(ctx: GradeContext, _verifyPath: string | null): Promise<GradeOutcome> {
    const task = ctx.taskset.tasks.find((t) => t.id === ctx.taskId);
    const outputRel = (task as { output?: string } | undefined)?.output ?? 'answer.txt';
    const expectedPath = path.join(ctx.tasksetDir, 'tasks', ctx.taskId, 'expected.txt');
    const actualPath = path.join(ctx.workspace, outputRel);
    let expected: string;
    let actual: string;
    try {
      expected = await fsp.readFile(expectedPath, 'utf8');
    } catch {
      return { pass: null, detail: '', graderError: `缺少 expected.txt：${expectedPath}` };
    }
    try {
      actual = await fsp.readFile(actualPath, 'utf8');
    } catch {
      return { pass: false, detail: `没有产出 ${outputRel}` };
    }
    const ops = ctx.taskset.grader.normalize ?? ['trim', 'collapse_whitespace'];
    const tol = ctx.taskset.grader.numeric_tolerance;
    const a = normalizeText(actual, ops);
    const e = normalizeText(expected, ops);
    if (tol !== undefined) {
      const na = Number(a);
      const ne = Number(e);
      if (Number.isFinite(na) && Number.isFinite(ne)) {
        const pass = Math.abs(na - ne) <= tol;
        return { pass, detail: pass ? `数值匹配 (${na})` : `数值差 ${Math.abs(na - ne)}` };
      }
    }
    const pass = a === e;
    return {
      pass,
      detail: pass ? '精确匹配' : `不匹配：期望 ${e.slice(0, 80)}… 实际 ${a.slice(0, 80)}…`
    };
  }
};
