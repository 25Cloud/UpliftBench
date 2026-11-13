import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** 递归找文件；跳过 .git / node_modules / dist 等噪声目录 */
export async function walkFiles(
  root: string,
  opts: { skipDirs?: string[]; maxFiles?: number } = {}
): Promise<string[]> {
  const skip = new Set(
    opts.skipDirs ?? ['.git', 'node_modules', 'dist', '.uplift', '.worktrees', 'coverage', '.next', 'target', 'vendor']
  );
  const out: string[] = [];
  const max = opts.maxFiles ?? 20_000;
  async function visit(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) return;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        await visit(abs);
      } else if (e.isFile()) {
        out.push(abs);
      }
    }
  }
  await visit(root);
  return out;
}

export async function readTextFile(file: string): Promise<string> {
  const buf = await fsp.readFile(file);
  return buf.toString('utf8');
}

export function readTextFileSync(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export async function writeTextFile(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, content, 'utf8');
}

/** 内容哈希：去空白后 sha256，用于重复检测（docs/03 探针 1） */
export function contentHash(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function shortHash(text: string, len = 6): string {
  return contentHash(text).slice(0, len);
}

export function relPath(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsSync(p: string): boolean {
  return fs.existsSync(p);
}

export async function statSafe(p: string): Promise<fs.Stats | null> {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) {
      await ensureDir(path.dirname(d));
      await fsp.copyFile(s, d);
    }
  }
}

export async function removeDir(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function humanInt(n: number): string {
  return n.toLocaleString('en-US');
}
