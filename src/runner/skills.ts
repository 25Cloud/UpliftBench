import path from 'node:path';
import fsp from 'node:fs/promises';
import { MEASURED_EXTENSIONS, loadSkillPackage, type SkillPackage } from '../skill/package.js';
import { countTokens } from '../tokenize.js';
import { ensureDir, readTextFile, relPath, walkFiles, writeTextFile } from '../util/fsx.js';
import type { InstalledSkill } from '../harness/types.js';
import type { ArmName } from '../types.js';

export const SKILL_INSTALL_DIR = '.uplift-skills';
const MAX_RESOURCE_FILES = 12;
const MAX_RESOURCE_BYTES = 24_000;

/**
 * 把技能包变成「可安装的技能集合」。
 *
 * 安装位置在 worktree 内部的 .uplift-skills/：
 * - 放在内部，agent 的 read_file 才能读到 references/*.md（工具沙箱以 workspace 为根）
 * - 每次 run 前 git clean 会把它们清掉再重装，所以不会污染基线
 */
export async function buildTreatmentSkills(pkg: SkillPackage): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  for (const s of pkg.skills) {
    const dirAbs = s.dir === '.' ? pkg.root : path.join(pkg.root, s.dir);
    const body = await readTextFile(s.skillMdPath);
    const all = await walkFiles(dirAbs, { skipDirs: ['.git', 'node_modules'] });
    const resources: Array<{ rel: string; content: string }> = [];
    for (const abs of all.sort()) {
      const rel = relPath(dirAbs, abs);
      if (rel === 'SKILL.md') continue;
      if (!MEASURED_EXTENSIONS.has(path.extname(abs).toLowerCase())) continue;
      if (resources.length >= MAX_RESOURCE_FILES) break;
      const content = await readTextFile(abs);
      if (Buffer.byteLength(content, 'utf8') > MAX_RESOURCE_BYTES) continue;
      resources.push({ rel, content });
    }
    out.push({
      name: s.name,
      description: s.description,
      dir: `${SKILL_INSTALL_DIR}/${safeName(s.name)}`,
      body,
      tokens: countTokens(body),
      resources: resources.map((r) => `${SKILL_INSTALL_DIR}/${safeName(s.name)}/${r.rel}`)
    });
    (out[out.length - 1] as InstalledSkill & { fileMap?: Array<{ rel: string; content: string }> }).fileMap = resources;
  }
  return out;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
}

/** 把技能写进 worktree（SKILL.md + references） */
export async function materializeSkills(worktree: string, skills: InstalledSkill[]): Promise<void> {
  for (const s of skills) {
    const targetDir = path.join(worktree, s.dir);
    await ensureDir(targetDir);
    await writeTextFile(path.join(targetDir, 'SKILL.md'), s.body);
    const fileMap = (s as InstalledSkill & { fileMap?: Array<{ rel: string; content: string }> }).fileMap ?? [];
    for (const f of fileMap) {
      await writeTextFile(path.join(targetDir, f.rel), f.content);
    }
  }
}

/** 本臂应该装什么：baseline 什么都不装，placebo 装等量中性文本，treatment 装真技能 */
export interface ArmSkillsPlan {
  arm: ArmName;
  skills: InstalledSkill[];
  /** 三臂 token 对齐信息 */
  tokens: number;
  notes: string[];
}

export async function readSkillTexts(dir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name === 'SKILL.md') {
        map.set(dir, await readTextFile(path.join(dir, e.name)));
      }
    }
  } catch {
    /* 目录不存在就返回空 */
  }
  return map;
}

export async function loadPackageForRun(root: string): Promise<SkillPackage> {
  return loadSkillPackage(root);
}
