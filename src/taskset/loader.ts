import path from 'node:path';
import { readJson } from '../util/json.js';
import { pathExists } from '../util/fsx.js';
import { UpliftError } from '../util/log.js';
import type { TaskSetJson } from '../types.js';

export interface LoadedTaskset {
  ref: string;
  /** taskset.json 所在目录（相对路径解析的基准） */
  dir: string;
  json: TaskSetJson;
}

/** 仓库内置的任务集根目录 */
export function tasksetRoot(cwd = process.cwd()): string {
  return path.join(cwd, 'tasksets');
}

/**
 * 解析 `domain@version` 或本地路径。
 * 内置任务集布局：tasksets/<domain>/taskset.json（版本写在文件里）
 */
export async function loadTaskset(ref: string, cwd = process.cwd()): Promise<LoadedTaskset> {
  const candidates: string[] = [];
  if (ref.includes('/') || ref.includes('\\') || ref.endsWith('.json')) {
    const abs = path.isAbsolute(ref) ? ref : path.resolve(cwd, ref);
    candidates.push(abs.endsWith('.json') ? abs : path.join(abs, 'taskset.json'));
  } else if (ref.includes('@')) {
    const [domain, version] = ref.split('@');
    candidates.push(path.join(tasksetRoot(cwd), domain, version, 'taskset.json'));
    candidates.push(path.join(tasksetRoot(cwd), domain, 'taskset.json'));
  } else {
    candidates.push(path.join(tasksetRoot(cwd), ref, 'taskset.json'));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      const json = await readJson<TaskSetJson>(candidate);
      const dir = path.dirname(candidate);
      return { ref: `${json.domain}@${json.version}`, dir, json };
    }
  }
  throw new UpliftError(
    `找不到任务集：${ref}`,
    `已尝试：${candidates.join(' , ')}`,
    '用 `uplift taskset list` 看本地已有哪些，或传本地路径 ./tasksets/<domain>'
  );
}

export function listLocalTasksets(cwd = process.cwd()): Array<{ domain: string; path: string }> {
  const root = tasksetRoot(cwd);
  const fs = require('node:fs') as typeof import('node:fs');
  if (!fs.existsSync(root)) return [];
  const out: Array<{ domain: string; path: string }> = [];
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name, 'taskset.json');
    if (fs.existsSync(p)) out.push({ domain: name, path: p });
  }
  return out;
}

export async function loadTaskPrompt(taskset: LoadedTaskset, taskId: string): Promise<string> {
  const task = taskset.json.tasks.find((t) => t.id === taskId);
  if (!task) throw new UpliftError(`任务集里没有任务 ${taskId}`, `任务集：${taskset.ref}`, '检查 id 拼写');
  const p = path.resolve(taskset.dir, task.prompt_file);
  const { readTextFile } = await import('../util/fsx.js');
  return readTextFile(p);
}

export function taskFixtureDir(taskset: LoadedTaskset, taskId: string): string | null {
  const task = taskset.json.tasks.find((t) => t.id === taskId);
  if (!task?.fixture) return null;
  return path.resolve(taskset.dir, task.fixture);
}

export function taskVerifyPath(taskset: LoadedTaskset, taskId: string): string | null {
  const task = taskset.json.tasks.find((t) => t.id === taskId);
  const rel = task?.verify ?? taskset.json.grader.entry;
  if (!rel) return null;
  return path.resolve(taskset.dir, rel);
}
