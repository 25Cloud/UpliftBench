/**
 * 对 benchmarks/manifest.json 里的技能包批量跑 Tier 0 探针，产出 SkillCard + badge。
 *
 * 默认只跑两个便宜探针（static-cost / uninstall-clean），`--full` 才跑需要模型的那些。
 * 每条结果写进 results/<id>.json，供 `uplift site` 生成榜单页。
 */
import path from 'node:path';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runProbes, type ProbeName } from '../src/probes/index.js';
import { createHarness } from '../src/harness/index.js';
import { buildSkillCard } from '../src/card/build.js';
import { renderCardText } from '../src/render/card.js';
import { renderBadgeSvg } from '../src/render/badge.js';
import { loadSkillPackage } from '../src/skill/package.js';
import { loadSkillsForPackage } from '../src/runner/package-scan.js';
import { writeJson } from '../src/util/json.js';
import { ensureDir, writeTextFile } from '../src/util/fsx.js';
import { setColor } from '../src/util/log.js';
import { env, loadEnv } from '../src/util/env.js';

loadEnv();
setColor(true);

const root = fileURLToPath(new URL('..', import.meta.url));

interface Entry {
  id: string;
  repo: string;
  url: string;
  why: string;
  /** 技能包在仓库内的相对路径（默认仓库根） */
  path?: string;
  triggers?: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const onlyIds = args.filter((a) => !a.startsWith('--'));
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'benchmarks', 'manifest.json'), 'utf8')) as {
    skills: Entry[];
  };

  const resultsDir = path.join(root, 'results');
  await ensureDir(resultsDir);

  const model = process.env.UPLIFT_MODEL ?? 'glm-5.3-flash';
  const harness = createHarness('openai-compat', { model });
  const cheapOnly: ProbeName[] = ['static-cost', 'uninstall-clean'];

  for (const entry of manifest.skills) {
    if (onlyIds.length > 0 && !onlyIds.includes(entry.id)) continue;
    const base = path.join(root, 'benchmarks', 'skills', entry.id);
    const skillPath = path.join(base, entry.path ?? '.');
    const exists = await fsp
      .stat(skillPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      console.log(`✗ ${entry.id}: 没克隆（先跑 pnpm fetch:skills）`);
      continue;
    }

    const scanned = await loadSkillsForPackage(skillPath);
    const pkg = await loadSkillPackage(skillPath);
    console.log(`\n=== ${entry.repo} ===`);
    console.log(`  ${pkg.skills.length} 个技能 · 路径 ${path.relative(root, skillPath)}`);

    const bundle = await runProbes({
      cwd: root,
      skillPath,
      skillLabel: entry.repo,
      harness,
      only: full ? undefined : cheapOnly,
      triggersFile: entry.triggers ? path.join(root, entry.triggers) : undefined,
      genericTasksetRef: 'general-20',
      model,
      jobs: 4,
      timeoutSec: 180,
      ntTasks: 8,
      cfTasks: 2,
      onProgress: (m) => console.log(`  · ${m}`)
    });

    const card = buildSkillCard({
      skillRepo: entry.repo,
      skillCommit: scanned.commit,
      skillPath: path.relative(root, skillPath),
      skillCount: pkg.skills.length,
      totalTokens: pkg.totalTokens,
      source: 'github',
      tier0: bundle.tier0,
      extraFlags: bundle.problems
    });

    await writeJson(path.join(resultsDir, `${entry.id}.json`), card);
    await writeTextFile(path.join(resultsDir, `${entry.id}.badge.svg`), renderBadgeSvg(card, { style: 'full' }));
    console.log(renderCardText(card));
  }
  console.log(`\n结果写入 ${path.relative(root, resultsDir)}/`);
  void env;
}

void main();
