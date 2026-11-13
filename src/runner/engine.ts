import path from 'node:path';
import { buildSchedule, unitKey, type RunUnit } from './arms.js';
import { createWorktree, prepareTaskRepo, removeWorktree } from './worktree.js';
import { buildTreatmentSkills, materializeSkills } from './skills.js';
import { insertRun, openStore, completedUnits, queryRuns } from './store.js';
import { loadSkillsForPackage } from './package-scan.js';
import { loadTaskPrompt, loadTaskset, taskFixtureDir, taskVerifyPath, type LoadedTaskset } from '../taskset/loader.js';
import { pickGrader } from '../graders/index.js';
import { computeTier1 } from '../metrics/uplift.js';
import { planPlaceboSkills, placeboInstalledSkills, validatePlacebo } from '../placebo/generate.js';
import { nowIso, stableId } from '../version.js';
import { ensureDir, writeTextFile } from '../util/fsx.js';
import { UpliftError } from '../util/log.js';
import type { ArmName, FailureKind, RunRow, Tier1Block } from '../types.js';
import type { Harness, InstalledSkill } from '../harness/types.js';

export interface RunnerConfig {
  cwd: string;
  skillPath: string;
  skillLabel: string;
  tasksetRef: string;
  harness: Harness;
  arms: ArmName[];
  repeats: number;
  model: string;
  temperature: number;
  seed: number;
  jobs: number;
  timeoutSec: number;
  maxCostUsd: number;
  resume: boolean;
  taskIds?: string[];
  dbPath: string;
  transcriptDir: string;
  workRoot: string;
  maxSteps?: number;
  onEvent?: (e: RunnerEvent) => void;
}

export type RunnerEvent =
  | { type: 'start'; total: number; skipped: number; placeboDeltaPct: number }
  | { type: 'unit-start'; unit: RunUnit; index: number; total: number }
  | { type: 'unit-done'; unit: RunUnit; pass: number | null; failure: FailureKind | null; wallMs: number }
  | { type: 'warn'; message: string }
  | { type: 'stop'; reason: string };

export interface RunnerResult {
  taskset: LoadedTaskset;
  skillCommit: string;
  treatmentSkills: InstalledSkill[];
  placeboSkills: InstalledSkill[];
  placeboValidation: ReturnType<typeof validatePlacebo>;
  rows: RunRow[];
  tier1: Tier1Block;
  costUsd: number;
  stopped: boolean;
  stopReason?: string;
}

const GUIDANCE_NOTES = 'run';

export async function runBenchmark(cfg: RunnerConfig): Promise<RunnerResult> {
  const taskset = await loadTaskset(cfg.tasksetRef, cfg.cwd);
  const allTaskIds = projectsTaskIds(taskset);
  const taskIds = cfg.taskIds?.length ? allTaskIds.filter((id) => cfg.taskIds!.includes(id)) : allTaskIds;
  if (taskIds.length === 0) {
    throw new UpliftError('任务集里没有可跑的任务', `任务集：${taskset.ref}`, '检查 --tasks 过滤是否写错');
  }

  const skills = await loadSkillsForPackage(cfg.skillPath);
  const treatmentSkills = await buildTreatmentSkills(skills.pkg);

  const plans = planPlaceboSkills(treatmentSkills.map((s) => ({ name: s.name, tokens: s.tokens })), cfg.skillPath);
  const treatmentTokens = treatmentSkills.reduce((s, k) => s + k.tokens, 0);
  const placeboValidation = validatePlacebo(treatmentTokens, plans);
  if (!placeboValidation.ok) {
    for (const m of placeboValidation.messages) cfg.onEvent?.({ type: 'warn', message: m });
  }
  // 安慰剂也要落盘：materializeSkills 需要 body
  const placeboSkills = placeboInstalledSkills(plans);
  const placeboWithFiles = await Promise.all(
    plans.map(async (p) => {
      const base = placeboSkills.find((s) => s.name === p.name)!;
      return base;
    })
  );

  const db = openStore(cfg.dbPath);
  const skillCommit = skills.commit;

  const schedule = buildSchedule(taskIds, cfg.repeats, cfg.seed, cfg.arms);
  const done = cfg.resume
    ? completedUnits(db, {
        skill_repo: cfg.skillLabel,
        skill_commit: skillCommit,
        taskset: taskset.ref,
        model: cfg.model
      })
    : new Set<string>();
  const pending = schedule.filter((u) => !done.has(unitKey(u)));

  cfg.onEvent?.({
    type: 'start',
    total: schedule.length,
    skipped: schedule.length - pending.length,
    placeboDeltaPct: placeboValidation.deltaPct
  });

  const transcriptDir = path.resolve(cfg.cwd, cfg.transcriptDir);
  await ensureDir(transcriptDir);

  let spent = 0;
  let stopped = false;
  let stopReason: string | undefined;
  let nextIndex = 0;
  const total = pending.length;

  const taskRepoCache = new Map<string, Promise<string>>();

  const runUnit = async (workerId: number, unit: RunUnit): Promise<void> => {
    const taskRepo = await getTaskRepo(unit.taskId);
    const wtBase = path.join(path.resolve(cfg.cwd, cfg.workRoot), `w${workerId}`);
    const wt = path.join(wtBase, `${unit.arm}-${unit.taskId}-r${unit.repeatIdx}`);
    await createWorktree(taskRepo, wt);

    const startedAt = nowIso();
    let pass: number | null = null;
    let failure: FailureKind | null = null;
    let tokensIn = 0;
    let tokensOut = 0;
    let toolCalls = 0;
    let wallMs = 0;
    let cost = 0;
    let transcriptPath: string | null = null;
    let detail: string | undefined;
    let activated: string[] = [];

    try {
      const armSkills =
        unit.arm === 'baseline'
          ? []
          : unit.arm === 'treatment'
            ? treatmentSkills
            : placeboWithFiles;
      await materializeSkills(wt, armSkills);

      const prompt = await loadTaskPrompt(taskset, unit.taskId);
      const run = await cfg.harness.run(
        { cwd: wt, skills: armSkills, model: cfg.model },
        {
          prompt,
          timeoutMs: cfg.timeoutSec * 1000,
          temperature: cfg.temperature,
          seed: cfg.seed + unit.repeatIdx,
          maxSteps: cfg.maxSteps
        }
      );
      tokensIn = run.usage.prompt_tokens;
      tokensOut = run.usage.completion_tokens;
      toolCalls = run.toolCalls;
      wallMs = run.wallMs;
      cost = run.usage.cost_usd;
      activated = run.activated;
      spent += cost;

      const grader = pickGrader(taskset.json);
      const outcome = await grader.grade(
        {
          taskId: unit.taskId,
          workspace: wt,
          tasksetDir: taskset.dir,
          taskset: taskset.json,
          finalText: run.finalText
        },
        taskVerifyPath(taskset, unit.taskId)
      );
      pass = outcome.pass === null ? null : outcome.pass ? 1 : 0;
      detail = outcome.detail;

      if (outcome.graderError) {
        failure = 'grader_error';
      } else if (run.timedOut) {
        failure = 'timeout';
      } else if (run.error) {
        failure = 'tool_error';
      } else if (pass === 0) {
        failure = classifyFailure(run.finalText, detail);
      }

      transcriptPath = path
        .join(transcriptDir, unit.taskId, unit.arm, `r${unit.repeatIdx}.jsonl`)
        .split(path.sep)
        .join('/');
      await ensureDir(path.dirname(path.resolve(cfg.cwd, transcriptPath)));
      await writeTextFile(
        path.resolve(cfg.cwd, transcriptPath),
        run.events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );
    } catch (e) {
      failure = 'grader_error';
      detail = e instanceof Error ? e.message : String(e);
      cfg.onEvent?.({ type: 'warn', message: `unit ${unit.taskId}/${unit.arm} 崩了：${detail}` });
    } finally {
      await removeWorktree(taskRepo, wt).catch(() => undefined);
    }

    const row: RunRow = {
      id: stableId(cfg.skillLabel, skillCommit, taskset.ref, unit.arm, unit.taskId, String(unit.repeatIdx), cfg.model),
      skill_repo: cfg.skillLabel,
      skill_commit: skillCommit,
      taskset: taskset.ref,
      arm: unit.arm,
      task_id: unit.taskId,
      repeat_idx: unit.repeatIdx,
      model: cfg.model,
      harness: cfg.harness.name,
      temperature: cfg.temperature,
      seed: cfg.seed,
      started_at: startedAt,
      ended_at: nowIso(),
      pass,
      failure_kind: failure,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      tool_calls: toolCalls,
      wall_ms: wallMs,
      cost_usd: cost,
      transcript_path: transcriptPath,
      meta_json: JSON.stringify({ detail, activated })
    };
    insertRun(db, row);
    cfg.onEvent?.({
      type: 'unit-done',
      unit,
      pass,
      failure,
      wallMs
    });
  };

  /**
   * 同一个任务的仓库只初始化一次：三个 worker 会同时碰到同一个 taskId，
   * 并发 `git init` + `git commit` 会撞上 `cannot lock ref 'HEAD'`。
   * 所以这里缓存的是 Promise，不是结果。
   */
  function getTaskRepo(taskId: string): Promise<string> {
    const cached = taskRepoCache.get(taskId);
    if (cached) return cached;
    const p = (async () => {
      const fixture = taskFixtureDir(taskset, taskId);
      const dest = path.join(path.resolve(cfg.cwd, cfg.workRoot), 'repos', taskId);
      return prepareTaskRepo(fixture, dest);
    })();
    taskRepoCache.set(taskId, p);
    return p;
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.max(1, Math.min(cfg.jobs, pending.length || 1));
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          if (stopped) return;
          const idx = nextIndex++;
          if (idx >= pending.length) return;
          const unit = pending[idx];
          if (cfg.maxCostUsd > 0 && spent >= cfg.maxCostUsd) {
            stopped = true;
            stopReason = `成本上限 ${cfg.maxCostUsd} USD 已触达（已花 ${spent.toFixed(4)}）`;
            cfg.onEvent?.({ type: 'stop', reason: stopReason });
            return;
          }
          cfg.onEvent?.({ type: 'unit-start', unit, index: idx, total });
          await runUnit(w, unit);
        }
      })()
    );
  }
  await Promise.all(workers);

  const rows = queryRuns(db, {
    skill_repo: cfg.skillLabel,
    skill_commit: skillCommit,
    taskset: taskset.ref,
    model: cfg.model
  });
  const tier1 = computeTier1(rows, {
    taskset: taskset.ref,
    graderTier: taskset.json.grader.tier,
    repeats: cfg.repeats,
    seed: cfg.seed,
    protocolNotes: [
      `harness=${cfg.harness.name}`,
      `model=${cfg.model}`,
      `temperature=${cfg.temperature}`,
      `seed=${cfg.seed}`,
      `repeats=${cfg.repeats}`,
      `placebo_delta_pct=${(placeboValidation.deltaPct * 100).toFixed(2)}`,
      'uplift_pp = treatment − placebo（协议/1.0.0 §1.1）'
    ]
  });
  db.close();

  return {
    taskset,
    skillCommit,
    treatmentSkills,
    placeboSkills: placeboWithFiles,
    placeboValidation,
    rows,
    tier1,
    costUsd: spent,
    stopped,
    stopReason
  };
}

function projectsTaskIds(taskset: LoadedTaskset): string[] {
  return taskset.json.tasks.map((t) => t.id);
}

function classifyFailure(finalText: string, detail?: string): FailureKind {
  const t = (finalText ?? '').toLowerCase();
  if (/cannot complete|i (?:cannot|can't|am unable)|give up|unable to|抱歉|没法完成/.test(t)) return 'gave_up';
  if (/(?:timeout|timed out)/.test((detail ?? '').toLowerCase())) return 'timeout';
  return 'wrong_answer';
}
