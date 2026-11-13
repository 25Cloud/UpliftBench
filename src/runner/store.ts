import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { ArmName, FailureKind, RunRow } from '../types.js';
import { ensureDir } from '../util/fsx.js';

export type Store = Database.Database;

export const RUNS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  skill_repo    TEXT NOT NULL,
  skill_commit  TEXT NOT NULL,
  taskset       TEXT NOT NULL,
  arm           TEXT NOT NULL,
  task_id       TEXT NOT NULL,
  repeat_idx    INTEGER NOT NULL,
  model         TEXT NOT NULL,
  harness       TEXT NOT NULL,
  temperature   REAL,
  seed          INTEGER,
  started_at    TEXT NOT NULL,
  ended_at      TEXT NOT NULL,
  pass          INTEGER,
  failure_kind  TEXT,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  tool_calls    INTEGER,
  wall_ms       INTEGER,
  cost_usd      REAL,
  transcript_path TEXT,
  meta_json     TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_skill ON runs(skill_repo, skill_commit);
CREATE INDEX IF NOT EXISTS idx_runs_taskset ON runs(taskset, arm);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_unit ON runs(skill_repo, skill_commit, taskset, arm, task_id, repeat_idx, model);
`;

export const VIEW_SQL = `
CREATE VIEW IF NOT EXISTS v_arm_stats AS
SELECT skill_repo, skill_commit, taskset, arm,
       AVG(CASE WHEN pass IS NULL THEN NULL ELSE pass END) AS pass_rate,
       COUNT(*) AS n_runs,
       COUNT(DISTINCT task_id) AS n_tasks
FROM runs
WHERE pass IS NOT NULL
GROUP BY skill_repo, skill_commit, taskset, arm;
`;

export function openStore(dbPath: string): Store {
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(RUNS_TABLE_SQL);
  db.exec(VIEW_SQL);
  return db;
}

export interface InsertRunInput extends RunRow {}

export function insertRun(db: Store, row: InsertRunInput): void {
  db.prepare(
    `INSERT OR REPLACE INTO runs
     (id, skill_repo, skill_commit, taskset, arm, task_id, repeat_idx, model, harness, temperature, seed,
      started_at, ended_at, pass, failure_kind, tokens_in, tokens_out, tool_calls, wall_ms, cost_usd,
      transcript_path, meta_json)
     VALUES (@id, @skill_repo, @skill_commit, @taskset, @arm, @task_id, @repeat_idx, @model, @harness,
             @temperature, @seed, @started_at, @ended_at, @pass, @failure_kind, @tokens_in, @tokens_out,
             @tool_calls, @wall_ms, @cost_usd, @transcript_path, @meta_json)`
  ).run(row);
}

export interface RunFilter {
  skill_repo?: string;
  skill_commit?: string;
  taskset?: string;
  arm?: ArmName;
  model?: string;
}

export function queryRuns(db: Store, filter: RunFilter = {}): RunRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  for (const key of ['skill_repo', 'skill_commit', 'taskset', 'arm', 'model'] as const) {
    const v = filter[key];
    if (v !== undefined) {
      where.push(`${key} = @${key}`);
      params[key] = v;
    }
  }
  const sql = `SELECT * FROM runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at`;
  return db.prepare(sql).all(params) as RunRow[];
}

export function completedUnits(db: Store, filter: RunFilter = {}): Set<string> {
  const rows = queryRuns(db, filter);
  const set = new Set<string>();
  for (const r of rows) set.add(`${r.arm}|${r.task_id}|${r.repeat_idx}`);
  return set;
}

export function deleteRuns(db: Store, filter: RunFilter): number {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  for (const key of ['skill_repo', 'skill_commit', 'taskset', 'arm', 'model'] as const) {
    const v = filter[key];
    if (v !== undefined) {
      where.push(`${key} = @${key}`);
      params[key] = v;
    }
  }
  if (where.length === 0) throw new Error('deleteRuns 需要至少一个过滤条件');
  const info = db.prepare(`DELETE FROM runs WHERE ${where.join(' AND ')}`).run(params);
  return info.changes;
}

export interface ArmSummaryRow {
  arm: ArmName;
  pass_rate: number;
  n_runs: number;
  n_tasks: number;
  tokens_in_total: number;
  tokens_out_total: number;
  cost_usd_total: number;
  tool_calls_mean: number;
  wall_p50: number;
  wall_p95: number;
  failures: Partial<Record<FailureKind, number>>;
  grader_errors: number;
}

export function armSummaries(db: Store, filter: RunFilter): ArmSummaryRow[] {
  const rows = queryRuns(db, filter);
  const byArm = new Map<ArmName, RunRow[]>();
  for (const r of rows) {
    const list = byArm.get(r.arm) ?? [];
    list.push(r);
    byArm.set(r.arm, list);
  }
  const out: ArmSummaryRow[] = [];
  for (const [arm, list] of byArm) {
    const scored = list.filter((r) => r.pass !== null);
    const passRate = scored.length ? scored.reduce((s, r) => s + (r.pass as number), 0) / scored.length : 0;
    const walls = list.map((r) => r.wall_ms ?? 0).sort((a, b) => a - b);
    const failures: Partial<Record<FailureKind, number>> = {};
    let graderErrors = 0;
    for (const r of list) {
      if (r.failure_kind === 'grader_error') graderErrors += 1;
      else if (r.failure_kind) failures[r.failure_kind] = (failures[r.failure_kind] ?? 0) + 1;
    }
    out.push({
      arm,
      pass_rate: passRate,
      n_runs: list.length,
      n_tasks: new Set(list.map((r) => r.task_id)).size,
      tokens_in_total: list.reduce((s, r) => s + (r.tokens_in ?? 0), 0),
      tokens_out_total: list.reduce((s, r) => s + (r.tokens_out ?? 0), 0),
      cost_usd_total: Number(list.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(6)),
      tool_calls_mean: list.length ? list.reduce((s, r) => s + (r.tool_calls ?? 0), 0) / list.length : 0,
      wall_p50: percentile(walls, 0.5),
      wall_p95: percentile(walls, 0.95),
      failures,
      grader_errors: graderErrors
    });
  }
  return out;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export function storePath(cwd = process.cwd()): string {
  return path.join(cwd, '.uplift', 'runs.db');
}

export function ensureStoreDir(cwd = process.cwd()): void {
  const dir = path.join(cwd, '.uplift');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
