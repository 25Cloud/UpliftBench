import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { ensureDir, removeDir, writeTextFile } from '../util/fsx.js';

/** 造一个一次性的工作目录，跑完自动删 */
export async function withTempWorkspace<T>(
  files: Record<string, string>,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-probe-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await writeTextFile(path.join(dir, rel), content);
    }
    await ensureDir(dir);
    return await fn(dir);
  } finally {
    await removeDir(dir);
  }
}

export interface TriggerCase {
  prompt: string;
  /** docs/11 Q6：三档负样本 —— unrelated / adjacent / same-domain-different-task */
  kind?: 'unrelated' | 'adjacent' | 'same_domain';
}

export interface TriggersFile {
  positive: Array<string | TriggerCase>;
  negative: Array<string | TriggerCase>;
}

export function normalizeCases(list: Array<string | TriggerCase>): TriggerCase[] {
  return list.map((c) => (typeof c === 'string' ? { prompt: c } : c));
}

export async function loadTriggers(file: string): Promise<{ positive: TriggerCase[]; negative: TriggerCase[] }> {
  const raw = await fsp.readFile(file, 'utf8');
  const json = JSON.parse(raw) as TriggersFile;
  return {
    positive: normalizeCases(json.positive ?? []),
    negative: normalizeCases(json.negative ?? [])
  };
}

export const PROBE_INSTRUCTIONS =
  'You are being evaluated for skill selection. ' +
  'If any installed skill applies to this request, call activate_skill first. ' +
  'Then call finish immediately with a one-line decision. Do not do any other work.';
