import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UpliftError } from './log.js';

export async function readJson<T = unknown>(file: string): Promise<T> {
  let raw: string;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch {
    throw new UpliftError(
      `读不到 JSON 文件：${file}`,
      '文件不存在或没有读权限',
      '确认路径，或先用 --help 看该命令要求的输入'
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new UpliftError(
      `JSON 解析失败：${file}`,
      e instanceof Error ? e.message : String(e),
      '检查逗号 / 引号 / 尾随逗号，或用 `uplift taskset validate` 定位字段'
    );
  }
}

export function readJsonSync<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 模型爱把 JSON 包在 ```json 里，剥掉（不信任 response_format） */
export function stripCodeFences(text: string): string {
  const fence = text.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return text.trim();
}

export function extractJson<T = unknown>(text: string): T | null {
  const candidates = [stripCodeFences(text), text];
  for (const cand of candidates) {
    try {
      return JSON.parse(cand) as T;
    } catch {
      /* continue */
    }
  }
  // 最后尝试截取第一个 {...} 或 [...] 块
  const objMatch = text.match(/[{[][\s\S]*[}\]]/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[Circular]';
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = walk(obj[k]);
    return out;
  };
  return JSON.stringify(walk(value), null, 2);
}
