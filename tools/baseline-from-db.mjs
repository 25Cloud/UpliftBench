/**
 * 从一份 runs.db 汇总每个任务的 baseline 通过率（多 repeat 才有意义）。
 * 用法：node tools/baseline-from-db.mjs [dbPath] [--arm baseline]
 */
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith('--')) ?? '.uplift/v11/runs.db';
const armIdx = args.indexOf('--arm');
const arm = armIdx >= 0 ? args[armIdx + 1] : 'baseline';

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare('select task_id, repeat_idx, pass from runs where arm = ? and pass is not null')
  .all(arm);

const byTask = new Map();
for (const r of rows) {
  const a = byTask.get(r.task_id) ?? [];
  a.push(r.pass);
  byTask.set(r.task_id, a);
}

const out = [];
for (const [id, list] of byTask) {
  const rate = list.reduce((s, v) => s + v, 0) / list.length;
  out.push({ id, rate, n: list.length });
}
out.sort((a, b) => a.id.localeCompare(b.id));

const bucket = { '0%': 0, '1–33%': 0, '34–66%': 0, '67–99%': 0, '100%': 0 };
for (const o of out) {
  if (o.rate <= 0) bucket['0%']++;
  else if (o.rate < 0.34) bucket['1–33%']++;
  else if (o.rate <= 0.66) bucket['34–66%']++;
  else if (o.rate < 1) bucket['67–99%']++;
  else bucket['100%']++;
}

console.log(`${dbPath} · arm=${arm} · ${out.length} 题`);
for (const o of out) {
  const bar = '█'.repeat(Math.round(o.rate * 10)).padEnd(10, '░');
  console.log(`  ${o.id}  ${bar} ${(o.rate * 100).toFixed(0).padStart(4)}%  n=${o.n}`);
}
console.log('\n分布');
for (const [k, v] of Object.entries(bucket)) {
  console.log(`  ${k.padEnd(7)} ${String(v).padStart(3)} 题  (${((v / Math.max(1, out.length)) * 100).toFixed(0)}%)`);
}
db.close();
