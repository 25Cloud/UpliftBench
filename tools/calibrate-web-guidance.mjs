#!/usr/bin/env node
/**
 * 标定脚本：把 `uplift run` 的实测结果写成 tasksets/<domain>/calibration.json。
 *
 * 为什么单独一个脚本：标定是**可重跑**的动作，不是一次性手工操作。
 * 改了任务、换了模型、换了 harness，都应该重跑标定，让 expected_baseline 跟着实测走。
 *
 * 用法：
 *   node tools/calibrate-web-guidance.mjs --db .uplift/v11/runs.db --domain web-guidance
 *   node tools/calibrate-web-guidance.mjs --db x.db --arm baseline --min-samples 2
 *
 * 两个以前埋着的坑，这个版本修掉了：
 * 1. 老版本不筛 arm，库里同时有三臂时，会把 treatment 的 pass 当成 baseline 写进标定；
 * 2. 老版本 samples 恒为 1，多 repeat 的库被当成一次采样，均值/方差信息全丢。
 *    现在按任务求均值，samples 记实际样本数。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
}

const dbPaths = (arg('db', '.uplift/calib/runs.db') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const domain = arg('domain', 'web-guidance');
const arm = arg('arm', 'baseline');
const minSamples = Number(arg('min-samples', '1'));
const outPath = path.join('tasksets', domain, 'calibration.json');

for (const p of dbPaths) {
  if (!fs.existsSync(p)) {
    console.error(`✗ 找不到 ${p}，先跑 uplift run --arms ${arm}`);
    process.exit(1);
  }
}

/** 多份库合并：同一个任务在不同库里都有样本时**合到一起算均值**，不是后写的覆盖前写的 */
const rows = [];
const meta = [];
for (const dbPath of dbPaths) {
  const db = new Database(dbPath, { readonly: true });
  rows.push(
    ...db
      .prepare('select task_id, pass, model, harness, taskset from runs where arm = ? and pass is not null order by task_id')
      .all(arm)
  );
  db.close();
  meta.push(dbPath);
}

if (rows.length === 0) {
  console.error(`✗ 这些库里没有 arm=${arm} 的评分结果：${meta.join(', ')}`);
  process.exit(1);
}

const acc = new Map();
for (const r of rows) {
  const a = acc.get(r.task_id) ?? [];
  a.push(r.pass);
  acc.set(r.task_id, a);
}

const tasks = {};
const skipped = [];
for (const [id, list] of [...acc.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
  if (list.length < minSamples) {
    skipped.push(`${id}(n=${list.length})`);
    continue;
  }
  const mean = list.reduce((s, v) => s + v, 0) / list.length;
  tasks[id] = { baseline: Math.round(mean * 100) / 100, samples: list.length };
}

const samples = [...new Set(Object.values(tasks).map((t) => t.samples))];
const tasksets = [...new Set(rows.map((r) => r.taskset))];

const out = {
  $comment:
    '由 uplift run 实测得到，用于回填 expected_baseline 与难度标签。改动任务后必须重跑标定。',
  measured_at: new Date().toISOString(),
  source_db: meta.join(','),
  taskset: tasksets.join(','),
  model: rows[0].model,
  harness: rows[0].harness,
  arm,
  repeats: samples.length === 1 ? samples[0] : samples,
  min_samples: minSamples,
  tasks
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

const ids = Object.keys(tasks);
const saturated = ids.filter((id) => tasks[id].baseline >= 1).length;
const zero = ids.filter((id) => tasks[id].baseline <= 0).length;
const mid = ids.length - saturated - zero;
console.log(`标定写入 ${outPath}`);
console.log(`  ${ids.length} 个任务 · ${tasksets.join(',')} · arm=${arm} · 每任务 ${samples.join('/')} 次采样`);
console.log(`  100%: ${saturated}   中间难度: ${mid}   0%: ${zero}`);
if (skipped.length > 0) console.log(`  样本不足被跳过：${skipped.join(', ')}`);
