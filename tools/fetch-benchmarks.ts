/**
 * 拉取 benchmarks/manifest.json 里列的真实技能包（shallow clone）。
 *
 * 为什么要脚本而不是直接写 curl：我们需要**记录每个包的 commit**，
 * 否则 SkillCard 里的 skill.commit 就是假的，卡也就不可复现。
 */
import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = path.join(root, 'benchmarks', 'manifest.json');
const targetDir = path.join(root, 'benchmarks', 'skills');

interface Entry {
  id: string;
  repo: string;
  url: string;
  why: string;
  path?: string;
  /** 只检出这些目录（大仓库用，例如 hallmark 233MB 里只有 skills/ 有用） */
  sparse?: string[];
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8')) as { skills: Entry[] };
  await fsp.mkdir(targetDir, { recursive: true });
  const lock: Record<string, { repo: string; commit: string; skill_path: string; fetched_at: string }> = {};

  for (const entry of manifest.skills) {
    const dest = path.join(targetDir, entry.id);
    const exists = await fsp
      .stat(path.join(dest, '.git'))
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      console.log(`clone ${entry.repo}${entry.sparse ? '（sparse）' : ''} ...`);
      const args = entry.sparse
        ? ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '-q', entry.url, dest]
        : ['clone', '--depth', '1', '--single-branch', '-q', entry.url, dest];
      const res = spawnSync('git', args, { encoding: 'utf8' });
      if (res.status !== 0) {
        console.log(`  ✗ ${entry.repo}: ${(res.stderr || '').slice(0, 200)}`);
        continue;
      }
      if (entry.sparse) {
        spawnSync('git', ['sparse-checkout', 'set', ...entry.sparse], { cwd: dest, encoding: 'utf8' });
      }
    }
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dest, encoding: 'utf8' });
    const commit = head.stdout.trim();
    lock[entry.id] = {
      repo: entry.repo,
      commit,
      skill_path: path.posix.join(entry.id, entry.path ?? '.'),
      fetched_at: new Date().toISOString()
    };
    console.log(`  ✓ ${entry.repo} @ ${commit.slice(0, 7)}`);
  }

  const lockPath = path.join(root, 'benchmarks', 'skills.lock.json');
  await fsp.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  console.log(`锁文件写入 ${path.relative(root, lockPath)}（${Object.keys(lock).length} 个包）`);
}

void main();
