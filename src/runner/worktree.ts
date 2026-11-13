import path from 'node:path';
import fsp from 'node:fs/promises';
import { copyDir, ensureDir, pathExists, removeDir, writeTextFile } from '../util/fsx.js';
import { runShell } from '../util/shell.js';
import { UpliftError } from '../util/log.js';

/**
 * 隔离层（AGENTS.md §2：git worktree + 子进程）。
 *
 * 为什么要给每个任务单独初始化一个库里：
 * 一个任务的 workspace 应该是 taskset 的 fixture，而不是 UpliftBench 自己的源码树。
 * 所以流程是 fixture -> 一个极小的 git 仓库（一次提交）-> 每个 worker 从这里 `git worktree add`
 * 出一份干净树。重置成本低（reset --hard + clean -fdx），且天然可复现。
 */
export async function ensureGitRepoAt(dir: string): Promise<void> {
  await ensureDir(dir);
  const gitDir = path.join(dir, '.git');
  if (!(await pathExists(gitDir))) {
    await runGit(['init', '-b', 'main'], dir);
  }
  await runGit(['config', 'user.email', 'runner@upliftbench.dev'], dir);
  await runGit(['config', 'user.name', 'UpliftBench Runner'], dir);
  // 已经有提交就直接用；只有 .git 但没提交（上次中断）就补一次
  const head = await runGit(['rev-parse', 'HEAD'], dir);
  if (head.code === 0 && head.stdout.trim().length > 0) return;
  await runGit(['add', '-A'], dir);
  const commit = await runGit(['commit', '-m', 'task fixture', '--allow-empty', '--no-gpg-sign'], dir);
  if (commit.code !== 0) {
    throw new UpliftError('初始化任务仓库失败', commit.stderr.slice(0, 400), '确认 git 可用且 fixture 目录可写');
  }
}

/** fixture -> 一次性 git 仓库（缓存复用；内容变了就重建） */
export async function prepareTaskRepo(fixtureDir: string | null, dest: string): Promise<string> {
  const marker = path.join(dest, '.git');
  if (await pathExists(marker)) {
    const head = await runGit(['rev-parse', 'HEAD'], dest);
    if (head.code === 0 && head.stdout.trim().length > 0) return dest;
    await ensureGitRepoAt(dest);
    return dest;
  }
  await removeDir(dest);
  await ensureDir(dest);
  if (fixtureDir && (await pathExists(fixtureDir))) {
    await copyDir(fixtureDir, dest);
  } else {
    await writeTextFile(path.join(dest, 'README.md'), '# 空 fixture\n\n这个任务没有预置文件。\n');
  }
  await ensureGitRepoAt(dest);
  return dest;
}

export async function createWorktree(repo: string, dest: string): Promise<string> {
  await removeDir(dest);
  await ensureDir(path.dirname(dest));
  // 上一次中断可能留下 locked 的 worktree 记录，先 prune 再 add
  await runGit(['worktree', 'prune'], repo);
  let res = await runGit(['worktree', 'add', '--detach', '--force', dest, 'HEAD'], repo);
  if (res.code !== 0 && /locked/i.test(res.stderr)) {
    res = await runGit(['worktree', 'add', '--detach', '--force', '--force', dest, 'HEAD'], repo);
  }
  if (res.code !== 0) {
    throw new UpliftError(
      `git worktree add 失败：${dest}`,
      res.stderr.slice(0, 500),
      '确认目标目录没被占用，以及磁盘可写；中断过的 run 会在下次自动 prune'
    );
  }
  return dest;
}

export async function removeWorktree(repo: string, dest: string): Promise<void> {
  await runGit(['worktree', 'remove', '--force', dest], repo);
  await runGit(['worktree', 'prune'], repo);
  await removeDir(dest);
}

/** 回到干净状态：丢掉上一次 run 留下的一切 */
export async function resetWorktree(dir: string): Promise<void> {
  await runGit(['reset', '--hard', 'HEAD'], dir);
  await runGit(['clean', '-fdx'], dir);
}

export async function currentCommit(dir: string): Promise<string> {
  const res = await runGit(['rev-parse', 'HEAD'], dir);
  return res.stdout.trim() || '0000000';
}

export function runGit(args: string[], cwd: string) {
  return runShell(`git ${args.map(quote).join(' ')}`, { cwd, timeoutMs: 120_000 });
}

function quote(a: string): string {
  return /\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

export async function findRepoRoot(start: string): Promise<string | null> {
  let cur = path.resolve(start);
  while (true) {
    if (await pathExists(path.join(cur, '.git'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export async function writeFileInWorktree(worktree: string, rel: string, content: string): Promise<void> {
  await writeTextFile(path.join(worktree, rel), content);
}

export async function listWorktreeStatus(dir: string): Promise<string> {
  const res = await runGit(['status', '--porcelain'], dir);
  return res.stdout;
}

export async function snapshotFiles(root: string): Promise<string[]> {
  const { walkFiles } = await import('../util/fsx.js');
  const files = await walkFiles(root, { skipDirs: ['.git'] });
  return files.map((f) => path.relative(root, f).split(path.sep).join('/')).sort();
}

export async function readDirSafe(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir);
  } catch {
    return [];
  }
}
