import path from 'node:path';
import { runArgv } from '../util/shell.js';
import type { TaskSetJson } from '../types.js';

export interface GradeOutcome {
  pass: boolean | null;
  detail: string;
  metrics?: Record<string, number | string | boolean | null>;
  /** 非 null 表示评分器自身出错（协议 §4.1：不计入 pass_rate） */
  graderError?: string;
  raw?: string;
}

export interface GradeContext {
  taskId: string;
  workspace: string;
  tasksetDir: string;
  taskset: TaskSetJson;
  /** 轨迹里模型最终说了什么，rubric 评分器要用 */
  finalText?: string;
}

export interface Grader {
  kind: TaskSetJson['grader']['kind'];
  grade(ctx: GradeContext, verifyPath: string | null): Promise<GradeOutcome>;
}

/**
 * A 级 tests 评分器（协议 §4.1）。
 *
 * 约定：verify 脚本从 stdin 收 JSON `{task_id, workspace}`，
 * stdout 回 JSON `{pass, detail, metrics}`；exit != 0 = grader_error，不算失败。
 */
export const testsGrader: Grader = {
  kind: 'tests',
  async grade(ctx, verifyPath) {
    if (!verifyPath) {
      return { pass: null, detail: '', graderError: 'A 级任务集缺少 verify 脚本' };
    }
    const timeoutSec = ctx.taskset.grader.timeout_sec ?? 120;
    const ext = path.extname(verifyPath).toLowerCase();
    const argv =
      ext === '.py'
        ? [process.platform === 'win32' ? 'python' : 'python3', verifyPath]
        : ext === '.sh'
          ? [process.platform === 'win32' ? 'bash' : 'sh', verifyPath]
          : ext === '.ps1'
            ? [process.platform === 'win32' ? 'powershell' : 'pwsh', '-NoProfile', '-File', verifyPath]
            : [process.execPath, verifyPath];
    const input = JSON.stringify({ task_id: ctx.taskId, workspace: ctx.workspace });
    const res = await runArgv(argv, { cwd: ctx.workspace, timeoutMs: timeoutSec * 1000, input });
    if (res.timedOut) {
      return { pass: null, detail: 'verify 超时', graderError: `grader timeout > ${timeoutSec}s`, raw: res.stderr.slice(0, 500) };
    }
    if (res.code !== 0) {
      return {
        pass: null,
        detail: 'verify 非零退出',
        graderError: `verify exit ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}`,
        raw: res.stdout.slice(0, 1000)
      };
    }
    try {
      const parsed = JSON.parse(res.stdout.trim()) as {
        pass?: boolean;
        detail?: string;
        metrics?: Record<string, number>;
      };
      return {
        pass: Boolean(parsed.pass),
        detail: parsed.detail ?? '',
        metrics: parsed.metrics,
        raw: res.stdout.slice(0, 2000)
      };
    } catch {
      return { pass: null, detail: '', graderError: 'verify stdout 不是合法 JSON', raw: res.stdout.slice(0, 500) };
    }
  }
};

export { exactGrader } from './exact.js';
export { rubricGrader } from './rubric.js';
export { visualDiffGrader } from './visual-diff.js';
