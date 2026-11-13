import path from 'node:path';
import { readTextFile, relPath, walkFiles } from '../util/fsx.js';
import { countTokens } from '../tokenize.js';
import { UpliftError } from '../util/log.js';

export interface SkillEntry {
  /** 相对包根的目录（'.' 表示包根本身就是一个技能） */
  dir: string;
  name: string;
  description: string;
  skillMdPath: string;
  tokens: number;
}

export interface SkillPackage {
  root: string;
  /** 展示名，默认取目录名；由 CLI 覆盖成 owner/repo */
  label: string;
  skills: SkillEntry[];
  /** 包内所有参与计量的文件（绝对路径） */
  files: string[];
  totalTokens: number;
}

/** 参与 token 计量的扩展名（docs/03 探针 1 输入定义） */
export const MEASURED_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.json',
  '.yaml',
  '.yml',
  '.sh',
  '.bash',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.txt'
]);

/** 从 SKILL.md 的 frontmatter 里抠 name / description；没有就走标题兜底 */
export function parseFrontmatter(text: string, fallbackName: string): { name: string; description: string } {
  let name = fallbackName;
  let description = '';
  const fm = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    const body = fm[1];
    const nameMatch = body.match(/^name:\s*(.+)$/m);
    const descMatch = body.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!description) {
    const h1 = text.match(/^#\s+(.+)$/m);
    if (h1) description = h1[1].trim();
  }
  return { name, description };
}

/**
 * 读一个技能包目录。
 *
 * 判定规则（docs/06 §11 的错误文案要求）：
 * - 根目录有 SKILL.md → 单技能包
 * - 根目录没有但有 `skills/<name>/SKILL.md` 或任意一层子目录里的 SKILL.md → 多技能包
 * - 一个都没有 → 报错并给出修复建议
 */
export async function loadSkillPackage(root: string, opts: { label?: string } = {}): Promise<SkillPackage> {
  const all = await walkFiles(root, {
    skipDirs: ['.git', 'node_modules', 'dist', 'build', 'coverage', '.uplift', '.worktrees', '.next', 'target']
  });
  const skillMdFiles = all.filter((f) => path.basename(f) === 'SKILL.md');
  if (skillMdFiles.length === 0) {
    throw new UpliftError(
      `技能包不合法：找不到 SKILL.md`,
      `路径：${root}`,
      'UpliftBench 要求技能包根目录（或其 skills/<name>/ 子目录）含 SKILL.md；用 --path 指定具体技能目录'
    );
  }

  const skills: SkillEntry[] = [];
  for (const md of skillMdFiles.sort()) {
    const dirAbs = path.dirname(md);
    const text = await readTextFile(md);
    const fallback = path.basename(dirAbs) === path.basename(root) ? path.basename(root) : path.basename(dirAbs);
    const fm = parseFrontmatter(text, fallback);
    // 单技能的 token = SKILL.md + 同目录下（非子技能目录）的被计量文件
    let tokens = countTokens(text);
    const dirRel = relPath(root, dirAbs);
    for (const f of all) {
      if (f === md) continue;
      const rel = relPath(root, f);
      if (dirRel !== '.' && !rel.startsWith(`${dirRel}/`)) continue;
      if (!MEASURED_EXTENSIONS.has(path.extname(f).toLowerCase())) continue;
      const sub = path.dirname(rel);
      if (dirRel === '.' && skillMdFiles.length > 1 && sub.includes('/')) continue;
      tokens += countTokens(await readTextFile(f));
    }
    skills.push({
      dir: dirRel,
      name: fm.name,
      description: fm.description,
      skillMdPath: md,
      tokens
    });
  }

  const measured = all.filter((f) => MEASURED_EXTENSIONS.has(path.extname(f).toLowerCase()));
  let totalTokens = 0;
  for (const f of measured) totalTokens += countTokens(await readTextFile(f));

  return {
    root,
    label: opts.label ?? path.basename(root),
    skills,
    files: measured,
    totalTokens
  };
}
