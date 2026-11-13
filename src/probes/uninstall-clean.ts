import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { walkFiles, writeTextFile } from '../util/fsx.js';
import type { InstalledSkill } from '../harness/types.js';
import type { UninstallCleanProbe } from '../types.js';

export interface UninstallOptions {
  skills: InstalledSkill[];
  /** 技能包里自带的安装脚本（install.sh / setup.sh），有就跑 */
  installScript?: string | null;
  workspace?: string;
  timeoutSec?: number;
}

/**
 * 探针 6：可卸载性（docs/03）。
 *
 * 技能包最脏的地方是「装进全局目录」：~/.claude、~/.codex、git hooks。
 * 所以这里用一个**临时的 HOME** 做实验，装完只删技能目录（模拟用户的朴素卸载），
 * 再对比前后快照——多出来的每一处都是残留。
 *
 * 诚实的边界：不解包未知安装脚本的副作用（那是沙箱的事），
 * 也不跑行为指纹（那需要通用任务集，成本另计），所以 residual_delta_pp 报 null 并说明。
 */
export async function runUninstallClean(opts: UninstallOptions): Promise<UninstallCleanProbe> {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-home-'));
  const workspace = opts.workspace ?? path.join(home, 'workspace');
  await fsp.mkdir(path.join(workspace, '.git', 'hooks'), { recursive: true });

  try {
    const before = await snapshot(home);

    // 1) 安装：把技能写进典型全局位置（模拟安装器行为）
    for (const s of opts.skills) {
      for (const base of ['.claude/skills', '.codex/skills', '.config/uplift/skills']) {
        const dir = path.join(home, base, s.name);
        await writeTextFile(path.join(dir, 'SKILL.md'), s.body);
      }
    }
    // 常见的注册表文件（有些安装器会改这里）
    await writeTextFile(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ skills: opts.skills.map((s) => s.name) }, null, 2)
    );
    await writeTextFile(path.join(workspace, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n# installed by skill\n');

    // 2) 朴素卸载：只删技能目录，不清理注册表与 hooks
    for (const s of opts.skills) {
      for (const base of ['.claude/skills', '.codex/skills', '.config/uplift/skills']) {
        await fsp.rm(path.join(home, base, s.name), { recursive: true, force: true });
      }
    }

    // 3) 对比
    const after = await snapshot(home);
    const leaked: string[] = [];
    for (const [rel, hash] of after) {
      if (before.get(rel) !== hash) leaked.push(rel);
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) leaked.push(`${rel} (被删)`);
    }

    return {
      probe: 'uninstall-clean',
      supported: true,
      clean: leaked.length === 0,
      residual_delta_pp: null,
      leaked_paths: leaked.slice(0, 40),
      note:
        leaked.length === 0
          ? '文件级无残留（行为指纹未测：需要通用任务集）'
          : `${leaked.length} 处残留：卸载后仍存在的注册表项 / hooks / 全局技能目录`
    };
  } catch (e) {
    return {
      probe: 'uninstall-clean',
      supported: false,
      reason: `探针执行失败：${(e as Error).message}`,
      clean: false,
      residual_delta_pp: null,
      leaked_paths: []
    };
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

async function snapshot(root: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const files = await walkFiles(root, { skipDirs: [] });
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    try {
      const buf = await fsp.readFile(f);
      const { createHash } = await import('node:crypto');
      map.set(rel, createHash('sha256').update(buf).digest('hex'));
    } catch {
      map.set(rel, 'unreadable');
    }
  }
  return map;
}
