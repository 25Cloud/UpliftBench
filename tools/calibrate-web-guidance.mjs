#!/usr/bin/env node
/**
 * 标定脚本：把 `uplift run --arms baseline` 的实测结果写成 tasksets/<domain>/calibration.json。
 *
 * 为什么单独一个脚本：标定是**可重跑**的动作，不是一次性手工操作。
 * 改了任务、换了模型、换了 harness，都应该重跑标定，让 expected_baseline 跟着实测走。
 *
 * 用法：
 *   node tools/calibrate-web-guidance.mjs --db .uplift/calib/runs.db --domain web-guidance
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
}

const dbPath = arg('db', '.uplift/calib/runs.db');
const domain = arg('domain', 'web-guidance');
const outPath = path.join('tasksets', domain, 'calibration.json');

if (!fs.existsSync(dbPath)) {
  console.error(`✗ 找不到 ${dbPath} —— 先跑 uplift run --arms baseline`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare('select task_id, pass, model, harness from runs order by task_id').all();
db.close();

if (rows.length === 0) {
  console.error('✗ runs 表是空的');
  process.exit(1);
}

const tasks = {};
for (const r of rows) {
  if (r.pass === null) continue;
  tasks[r.task_id] = { baseline: r.pass, samples: 1 };
}

const out = {
  $comment:
    '由 uplift run --arms baseline 实测得到，用于回填 expected_baseline 与难度标签。改动任务后必须重跑标定。',
  measured_at: new Date().toISOString(),
  model: rows[0].model,
  harness: rows[0].harness,
  repeats: 1,
  tasks
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
const pass = Object.values(tasks).filter((t) => t.baseline === 1).length;
console.log(`标定写入 ${outPath}：${Object.keys(tasks).length} 个任务，baseline ${pass}/${Object.keys(tasks).length}`);
