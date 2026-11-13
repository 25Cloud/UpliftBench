import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { readTextFile, walkFiles, writeTextFile } from '../util/fsx.js';
import { runShell } from '../util/shell.js';
import type { InstalledSkill } from '../harness/types.js';
import type { UninstallCleanProbe } from '../types.js';

export interface UninstallOptions {
  skills: InstalledSkill[];
  /** 技能包根目录：用来找它自己的安装脚本 / hooks */
  packageRoot?: string;
  timeoutSec?: number;
}

interface InstallerFacts {
  scripts: string[];
  hooks: string[];
  manifests: string[];
}

/**
 * 探针 6：可卸载性（docs/03）。
 *
 * 做法：把 HOME 指到一个临时目录，在那里跑技能包**自己的**安装脚本（如果有），
 * 再模拟用户的朴素卸载（只删技能目录），最后对比前后快照——多出来的每一处都是残留。
 *
 * 这里刻意不再自己伪造 `~/.claude/settings.json`：
 * 探针若自己写入再把它算成「残留」，那测的是探针，不是技能包。
 */
export async function runUninstallClean(opts: UninstallOptions): Promise<UninstallCleanProbe> {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-home-'));
  const workspace = path.join(home, 'workspace');
  await fsp.mkdir(path.join(workspace, '.git', 'hooks'), { recursive: true });

  try {
    const facts = opts.packageRoot ? await detectInstallers(opts.packageRoot) : { scripts: [], hooks: [], manifests: [] };
    const before = await snapshot(home);

    const notes: string[] = [];
    // 1) 跑技能包自己的安装脚本（这是唯一可能写到全局目录的路径）
    const ranInstallers: string[] = [];
    for (const script of facts.scripts) {
      const abs = path.join(opts.packageRoot!, script);
      const res = await runShell(`${process.platform === 'win32' ? 'bash' : 'sh'} "${abs}"`, {
        cwd: workspace,
        env: { HOME: home, USERPROFILE: home, CLAUDE_HOME: path.join(home, '.claude') },
        timeoutMs: (opts.timeoutSec ?? 60) * 1000
      });
      ranInstallers.push(`${script} (exit ${res.code}${res.timedOut ? ', timeout' : ''})`);
    }

    // 2) 装技能：模拟用户把技能拷进全局目录
    for (const s of opts.skills) {
      for (const base of ['.claude/skills', '.codex/skills']) {
        await writeTextFile(path.join(home, base, s.name, 'SKILL.md'), s.body);
      }
    }

    // 3) 朴素卸载：只删技能目录
    for (const s of opts.skills) {
      for (const base of ['.claude/skills', '.codex/skills']) {
        await fsp.rm(path.join(home, base, s.name), { recursive: true, force: true });
      }
    }

    // 4) 对比
    const after = await snapshot(home);
    const leaked: string[] = [];
    for (const [rel, hash] of after) {
      if (before.get(rel) !== hash && !rel.startsWith('workspace/')) leaked.push(rel);
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) leaked.push(`${rel} (被删)`);
    }

    if (ranInstallers.length > 0) notes.push(`跑了安装脚本：${ranInstallers.join(' / ')}`);
    if (facts.hooks.length > 0) notes.push(`包内声明了 ${facts.hooks.length} 个 hook 目录/文件，安装器通常会注册到全局配置`);
    if (facts.manifests.length > 0) notes.push(`包内带插件清单：${facts.manifests.slice(0, 4).join(', ')}`);
    if (facts.scripts.length === 0 && facts.hooks.length === 0) {
      notes.push('包内没有安装脚本也没有 hooks：只可能污染技能目录本身（已测，无残留）');
    }

    return {
      probe: 'uninstall-clean',
      supported: true,
      clean: leaked.length === 0,
      residual_delta_pp: null,
      leaked_paths: leaked.slice(0, 40),
      note: `${notes.join('；')}${leaked.length > 0 ? `；卸载后仍有 ${leaked.length} 处残留` : ''}`,
      declared_hooks: [...facts.hooks, ...facts.manifests].slice(0, 40)
    } as UninstallCleanProbe & { declared_hooks: string[] };
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

/** 找技能包自带的安装入口与 hooks（只读，不执行） */
async function detectInstallers(packageRoot: string): Promise<InstallerFacts> {
  const files = await walkFiles(packageRoot, { skipDirs: ['.git', 'node_modules'] });
  const scripts: string[] = [];
  const hooks: string[] = [];
  const manifests: string[] = [];
  for (const abs of files) {
    const rel = path.relative(packageRoot, abs).split(path.sep).join('/');
    const base = path.basename(abs).toLowerCase();
    if (/^(install|setup)\.(sh|bash)$/.test(base)) scripts.push(rel);
    if (base === 'postinstall.js' || base === 'install.mjs') scripts.push(rel);
    if (rel.startsWith('hooks/') || rel.includes('/hooks/')) hooks.push(rel);
    if (base === 'plugin.json' || base === '.claude-plugin.json') manifests.push(rel);
  }
  if (scripts.length === 0) {
    // package.json 里的 postinstall 也算安装入口
    try {
      const pkgPath = path.join(packageRoot, 'package.json');
      const pkg = JSON.parse(await readTextFile(pkgPath)) as { scripts?: Record<string, string> };
      if (pkg.scripts?.postinstall) manifests.push(`package.json#postinstall: ${pkg.scripts.postinstall}`);
    } catch {
      /* 没有就算了 */
    }
  }
  return { scripts: scripts.sort(), hooks: hooks.sort(), manifests: manifests.sort() };
}

async function snapshot(root: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const files = await walkFiles(root, { skipDirs: [] });
  const { createHash } = await import('node:crypto');
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    try {
      const buf = await fsp.readFile(f);
      map.set(rel, createHash('sha256').update(buf).digest('hex'));
    } catch {
      map.set(rel, 'unreadable');
    }
  }
  return map;
}
