/**
 * 运行态体检：看某个 runs.db 的进度、成本、三臂通过率、以及技能激活率。
 * 用法：node tools/inspect-runs.mjs [dbPath]
 */
import Database from 'better-sqlite3';

const dbPath = process.argv[2] ?? '.uplift/v11/runs.db';
const db = new Database(dbPath, { readonly: true });

const totals = db.prepare('select count(*) c, sum(cost_usd) cost from runs').get();
const byArm = db.prepare('select arm, count(*) c, sum(pass) p, avg(wall_ms) w from runs group by arm').all();

console.log(`rows ${totals.c}  cost $${(totals.cost ?? 0).toFixed(2)}`);
for (const a of byArm) {
  const rate = a.p === null ? 'n/a' : `${((a.p / a.c) * 100).toFixed(1)}%`;
  console.log(`  ${a.arm.padEnd(9)} n=${String(a.c).padEnd(4)} pass=${rate.padEnd(6)} avg_wall=${Math.round(a.w)}ms`);
}

const rows = db.prepare("select arm, task_id, meta_json from runs where arm in ('treatment','placebo')").all();
let activated = 0;
const names = {};
for (const r of rows) {
  const meta = JSON.parse(r.meta_json ?? '{}');
  const list = meta.activated ?? [];
  if (list.length > 0) activated += 1;
  for (const n of list) names[n] = (names[n] ?? 0) + 1;
}
console.log(`activation: ${activated}/${rows.length} (${((activated / Math.max(1, rows.length)) * 100).toFixed(0)}%)`, JSON.stringify(names));

const distinct = db.prepare('select count(distinct task_id) c from runs').get();
console.log(`tasks touched: ${distinct.c}`);
