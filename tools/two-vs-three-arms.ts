/**
 * 「两臂 vs 三臂」对比（docs/07 阶段 2 的核心传播素材）。
 *
 * 同一批 run，分别按两种口径算 uplift：
 *   两臂（业界通行）：treatment − baseline   → 这是「技能 + 长度 + 噪声」
 *   三臂（本项目）：  treatment − placebo    → 这才是「技能本身」
 *
 * 两者的差 = 安慰剂效应。只要这个差不为 0，两臂口径就在系统性高估或低估。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, queryRuns } from '../src/runner/store.js';
import { computeTier1 } from '../src/metrics/uplift.js';

const root = fileURLToPath(new URL('..', import.meta.url));

async function main(): Promise<void> {
  const dbPath = process.argv[2] ?? path.join(root, '.uplift', 'main', 'runs.db');
  const db = openStore(dbPath);
  const repos = db.prepare('select distinct skill_repo r from runs').all() as Array<{ r: string }>;
  for (const { r } of repos) {
    const rows = queryRuns(db, { skill_repo: r });
    if (rows.length === 0) continue;
    const taskset = rows[0].taskset;
    const repeats = Math.max(...rows.map((x) => x.repeat_idx)) + 1;
    const block = computeTier1(rows, { taskset, graderTier: 'A', repeats, seed: 42 });
    const twoArm = block.metrics.raw_gain_pp ?? 0;
    const threeArm = block.metrics.uplift_pp;
    const placebo = block.metrics.placebo_effect_pp;
    const gap = threeArm - twoArm;
    console.log(`\n${r}  ·  ${taskset}  ·  N=${block.n}  ·  repeats=${repeats}`);
    console.log(`  baseline   ${(block.arms.baseline.pass_rate * 100).toFixed(1)}%`);
    console.log(`  placebo    ${(block.arms.placebo.pass_rate * 100).toFixed(1)}%`);
    console.log(`  treatment  ${(block.arms.treatment.pass_rate * 100).toFixed(1)}%`);
    console.log(`  两臂 uplift (t − b)   ${twoArm >= 0 ? '+' : ''}${twoArm.toFixed(1)}pp`);
    console.log(`  三臂 uplift (t − p)   ${threeArm >= 0 ? '+' : ''}${threeArm.toFixed(1)}pp   ← 协议口径`);
    console.log(`  安慰剂效应  (p − b)   ${placebo >= 0 ? '+' : ''}${placebo.toFixed(1)}pp`);
    console.log(
      `  两臂−三臂差          ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}pp  ${
        Math.abs(gap) < 1 ? '（几乎没差，这次安慰剂没起作用）' : '（两臂口径在这一批上就偏了）'
      }`
    );
    console.log(
      `  95%CI（三臂）        [${block.metrics.ci95[0].toFixed(1)}, ${block.metrics.ci95[1].toFixed(1)}]  ${
        block.metrics.ci95[0] <= 0 && block.metrics.ci95[1] >= 0 ? '跨 0 → 不显著' : '不跨 0 → 显著'
      }`
    );
  }
  db.close();
}

void main();
