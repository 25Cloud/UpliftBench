/**
 * 逐题 × 逐臂矩阵。跑完小样本实验先看这个，比看总分有用。
 * 用法：node tools/arm-matrix.mjs [dbPath] [--tasks id1,id2]
 */
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith('--')) ?? '.uplift/v11/runs.db';
const tasksArg = args.find((a) => a.startsWith('--tasks='))?.split('=')[1];
const only = tasksArg ? new Set(tasksArg.split(',').map((s) => s.trim())) : null;

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare('select task_id, arm, repeat_idx, pass from runs where pass is not null order by task_id')
  .all();
db.close();

const byTask = new Map();
for (const r of rows) {
  if (only && !only.has(r.task_id)) continue;
  const t = byTask.get(r.task_id) ?? { baseline: [], placebo: [], treatment: [] };
  t[r.arm].push(r.pass);
  byTask.set(r.task_id, t);
}

const rate = (list) => (list.length === 0 ? null : list.reduce((s, v) => s + v, 0) / list.length);
const fmt = (v) => (v === null ? '  — ' : (v * 100).toFixed(0).padStart(3) + '%');

console.log(`逐题矩阵 · ${dbPath}`);
console.log('题号       baseline  placebo  treatment   uplift(t−p)');
for (const [id, t] of [...byTask.entries()].sort()) {
  const b = rate(t.baseline);
  const p = rate(t.placebo);
  const tr = rate(t.treatment);
  const up = tr === null || p === null ? null : (tr - p) * 100;
  const upStr = up === null ? '    —' : (up >= 0 ? '+' : '') + up.toFixed(0) + 'pp';
  console.log(`${id.padEnd(10)} ${fmt(b)}     ${fmt(p)}    ${fmt(tr)}     ${upStr}`);
}

const all = { baseline: [], placebo: [], treatment: [] };
for (const t of byTask.values()) for (const arm of Object.keys(all)) all[arm].push(...t[arm]);
console.log('\n合计     ' + ['baseline', 'placebo', 'treatment'].map((a) => fmt(rate(all[a]))).join('     '));
