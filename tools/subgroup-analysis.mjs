/**
 * 亚组分析：把任务按「baseline 是否满分」切开，分别看 uplift。
 *
 * 为什么必须做：本轮 48 题里有一大半 baseline 就是 100%，天花板已经顶死，
 * 它们在总体 uplift 里只贡献噪声。把它们单独切出来看，
 * 才知道技能到底在「有空间的题」上起了什么作用。
 *
 * 声明：这是**事后**亚组分析（post-hoc），只能作为探索性证据，不能当作主结论。
 * 主结论仍然是全集上的 ITT 数字。
 *
 * 用法：node tools/subgroup-analysis.mjs [dbPath]
 */
import Database from 'better-sqlite3';

const dbPath = process.argv[2] ?? '.uplift/v11/runs.db';
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare('select arm, task_id, repeat_idx, pass from runs').all();

const byArmTask = new Map();
for (const r of rows) {
  const key = `${r.arm}|${r.task_id}`;
  const arr = byArmTask.get(key) ?? [];
  if (r.pass !== null) arr.push(r.pass);
  byArmTask.set(key, arr);
}

const tasks = [...new Set(rows.map((r) => r.task_id))].sort();
const rate = (arm, task) => {
  const arr = byArmTask.get(`${arm}|${task}`) ?? [];
  return arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length;
};

const saturated = [];
const headroom = [];
for (const t of tasks) {
  const b = rate('baseline', t);
  if (b === null) continue;
  (b >= 0.999 ? saturated : headroom).push(t);
}

function summarize(label, list) {
  if (list.length === 0) return;
  const avg = (arm) => {
    const vals = list.map((t) => rate(arm, t)).filter((v) => v !== null);
    return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const b = avg('baseline');
  const p = avg('placebo');
  const tr = avg('treatment');
  const uplift = tr === null || p === null ? null : (tr - p) * 100;
  const raw = tr === null || b === null ? null : (tr - b) * 100;
  const placebo = p === null || b === null ? null : (p - b) * 100;
  const fmt = (v) => (v === null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`);
  console.log(`\n${label}  n=${list.length} 题`);
  console.log(`  baseline ${(b * 100).toFixed(1)}%  placebo ${(p * 100).toFixed(1)}%  treatment ${(tr * 100).toFixed(1)}%`);
  console.log(`  三臂 uplift (t−p) ${fmt(uplift)}   两臂 (t−b) ${fmt(raw)}   安慰剂效应 (p−b) ${fmt(placebo)}`);
}

console.log(`任务总数 ${tasks.length}`);
summarize('全集（主结论 ITT）', tasks);
summarize('基线天花板组（baseline=100%，无空间）', saturated);
summarize('有空间组（baseline<100%，探索性）', headroom);

const names = {};
for (const r of rows) {
  if (r.arm === 'baseline') continue;
  const meta = db.prepare('select meta_json from runs where arm=? and task_id=? limit 1').get(r.arm, r.task_id);
  try {
    const m = JSON.parse(meta?.meta_json ?? '{}');
    for (const n of m.activated ?? []) names[n] = (names[n] ?? 0) + 1;
  } catch {
    /* ignore */
  }
}
console.log('\n激活统计（treatment+placebo）:', JSON.stringify(names));

/*
 * per-protocol：只看 treatment 臂里「技能真的被激活」的那些 run。
 *
 * 声明：这不是随机对照，激活是模型自己选的（难任务更容易去求助），
 * 所以这一栏只能说明「激活之后表现如何」，不能当作因果效应。
 */
const treatmentRows = db
  .prepare("select task_id, repeat_idx, pass, meta_json from runs where arm='treatment' and pass is not null")
  .all();
const activatedRuns = [];
const notActivatedRuns = [];
for (const r of treatmentRows) {
  const meta = JSON.parse(r.meta_json ?? '{}');
  const didActivate = (meta.activated ?? []).length > 0;
  (didActivate ? activatedRuns : notActivatedRuns).push(r.pass);
}
const avgOf = (arr) => (arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length);
const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
console.log(
  `\nper-protocol（treatment 臂内部，非随机）：激活组 ${pct(avgOf(activatedRuns))} (n=${activatedRuns.length}) vs 未激活组 ${pct(avgOf(notActivatedRuns))} (n=${notActivatedRuns.length})`
);
