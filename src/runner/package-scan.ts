import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadSkillPackage, type SkillPackage } from '../skill/package.js';
import { readTextFile, relPath } from '../util/fsx.js';
import { runGit } from './worktree.js';

export interface LoadedSkillPackage {
  pkg: SkillPackage;
  /** 40 位或 7+ 位 sha；不是 git 仓库时用内容哈希（前缀标记 content:） */
  commit: string;
  source: 'github' | 'local';
}

/**
 * 技能包身份（docs/05 §1：skill.commit 必填）。
 * 协议要求锁定 commit 才能复现，所以：
 * - 在 git 仓库里 → 取 HEAD
 * - 不在 git 里 → 对全部参与计量的文件做 sha256，记成 `content:<hash>`，并打 flag
 */
export async function loadSkillsForPackage(skillPath: string): Promise<LoadedSkillPackage> {
  const root = path.resolve(skillPath);
  const pkg = await loadSkillPackage(root);
  const gitHead = await runGit(['rev-parse', 'HEAD'], root);
  if (gitHead.code === 0 && /^[0-9a-f]{7,40}$/.test(gitHead.stdout.trim())) {
    return { pkg, commit: gitHead.stdout.trim(), source: 'local' };
  }
  const hash = createHash('sha256');
  for (const file of [...pkg.files].sort()) {
    hash.update(relPath(root, file));
    hash.update(await readTextFile(file));
  }
  return { pkg, commit: `content:${hash.digest('hex').slice(0, 40)}`, source: 'local' };
}
