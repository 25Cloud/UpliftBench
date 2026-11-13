/**
 * 看某题某臂的失败原因与最终产物摘要。
 * 用法：node tools/inspect-task.mjs [dbPath] --task=wmg-044 [--arm=treatment]
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith('--')) ?? '.uplift/v11/runs.db';
const task = args.find((a) => a.startsWith('--task='))?.split('=')[1];
const arm = args.find((a) => a.startsWith('--arm='))?.split('=')[1];

const db = new Database(dbPath, { readonly: true });
const sql = 'select arm, task_id, repeat_idx, pass, failure_kind, transcript_path, meta_json from runs where pass is not null'
  + (task ? ' and task_id = ?' : '')
  + (arm ? ' and arm = ?' : '')
  + ' order by task_id, arm, repeat_idx';
const params = [];
if (task) params.push(task);
if (arm) params.push(arm);
const rows = db.prepare(sql).all(...params);
db.close();

for (const r of rows) {
  const meta = JSON.parse(r.meta_json || '{}');
  console.log(`\n${r.task_id} · ${r.arm} · r${r.repeat_idx} · pass=${r.pass}${r.failure_kind ? ' · ' + r.failure_kind : ''}`);
  console.log('  detail: ' + String(meta.detail || '').slice(0, 400));
  if (r.transcript_path && fs.existsSync(r.transcript_path)) {
    const lines = fs.readFileSync(r.transcript_path, 'utf8').trim().split('\n');
    const last = lines.slice(-4).map((l) => l.slice(0, 300));
    for (const l of last) console.log('  · ' + l);
  }
}
