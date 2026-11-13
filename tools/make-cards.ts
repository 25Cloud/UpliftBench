/**
 * 出卡：对 5 个真实技能包跑 Tier 0（便宜探针），
 * 若 .uplift/main/runs.db 里有该包的三臂数据，就把 Tier 1 一并并进同一张卡。
 *
 * 结果写进 results/<id>.json + results/<id>.badge.svg，供 `uplift site` 生成榜单页。
 * 之所以拆成"探针"和"跑分"两步：Tier 0 秒级、不花钱；Tier 1 要钱要时间。合成一张卡是最后一步。
 */
import path from 'node:path';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runProbes } from '../src/probes/index.js';
import { createHarness } from '../src/harness/index.js';
import { buildSkillCard } from '../src/card/build.js';
import { renderCardText, renderCardMarkdown } from '../src/render/card.js';
import { renderBadgeSvg } from '../src/render/badge.js';
import { loadSkillsForPackage } from '../src/runner/package-scan.js';
import { openStore, queryRuns } from '../src/runner/store.js';
import { computeTier1 } from '../src/metrics/uplift.js';
import { writeJson } from '../src/util/json.js';
import { ensureDir, pathExists, writeTextFile } from '../src/util/fsx.js';
import { loadEnv } from '../src/util/env.js';

loadEnv();

const root = fileURLToPath(new URL('..', import.meta.url));

interface Entry {
  id: string;
  repo: string;
  path?: string;
  triggers?: string;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'benchmarks', 'manifest.json'), 'utf8')) as {
    skills: Entry[];
  };
  const resultsDir = path.join(root, 'results');
  await ensureDir(resultsDir);
  const model = process.env.UPLIFT_MODEL ?? 'glm-5.3-flash';
  const harness = createHarness('openai-compat', { model });
  const runsDb = path.join(root, '.uplift', 'main', 'runs.db');

  for (const entry of manifest.skills) {
    const skillPath = path.join(root, 'benchmarks', 'skills', entry.id, entry.path ?? '.');
    if (!(await pathExists(skillPath))) {
      console.log(`✗ ${entry.id}: 未克隆`);
      continue;
    }
    const scanned = await loadSkillsForPackage(skillPath);
    console.log(`\n=== ${entry.repo} ===`);

    const bundle = await runProbes({
      cwd: root,
      skillPath,
      skillLabel: entry.repo,
      harness,
      only: ['static-cost', 'uninstall-clean'],
      model,
      onProgress: (m) => console.log(`  · ${m}`)
    });

    let tier1;
    if (await pathExists(runsDb)) {
      const db = openStore(runsDb);
      const rows = queryRuns(db, { skill_repo: entry.repo });
      if (rows.length > 0) {
        const tasksetName = rows[0].taskset;
        const repeats = Math.max(...rows.map((r) => r.repeat_idx)) + 1;
        tier1 = computeTier1(rows, {
          taskset: tasksetName,
          graderTier: 'A',
          repeats,
          seed: 42,
          protocolNotes: [`harness=openai-compat`, `model=${rows[0].model}`, `repeats=${repeats}`]
        });
        console.log(`  · tier1: ${rows.length} 行原始记录，N=${tier1.n}`);
      }
      db.close();
    }

    const card = buildSkillCard({
      skillRepo: entry.repo,
      skillCommit: scanned.commit,
      skillPath: path.relative(root, skillPath).split(path.sep).join('/'),
      skillCount: scanned.pkg.skills.length,
      totalTokens: scanned.pkg.totalTokens,
      source: 'github',
      tier0: bundle.tier0,
      tier1,
      extraFlags: bundle.problems
    });

    await writeJson(path.join(resultsDir, `${entry.id}.json`), card);
    await writeTextFile(path.join(resultsDir, `${entry.id}.badge.svg`), renderBadgeSvg(card, { style: 'full' }));
    await writeTextFile(path.join(resultsDir, `${entry.id}.md`), renderCardMarkdown(card));
    console.log(renderCardText(card));
  }
  console.log(`\n结果写入 ${path.relative(root, resultsDir)}/`);
}

void main();
