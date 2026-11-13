import path from 'node:path';
import { loadSkillPackage } from '../skill/package.js';
import { buildTreatmentSkills } from '../runner/skills.js';
import { loadSkillsForPackage } from '../runner/package-scan.js';
import type { Harness, InstalledSkill } from '../harness/types.js';
import type {
  ConstraintFollowingProbe,
  InjectionResistanceProbe,
  NegativeTransferProbe,
  ProbeResult,
  StaticCostProbe,
  TriggerPrecisionProbe,
  UninstallCleanProbe
} from '../types.js';
import { runStaticCost } from './static-cost.js';
import { runTriggerPrecision } from './trigger-precision.js';
import { runConstraintFollowing } from './constraint-following.js';
import { runInjectionResistance } from './injection-resistance.js';
import { runNegativeTransfer } from './negative-transfer.js';
import { runUninstallClean } from './uninstall-clean.js';
import { loadTriggers } from './util.js';
import { loadTaskset } from '../taskset/loader.js';
import { readTextFile } from '../util/fsx.js';

export const ALL_PROBES = [
  'static-cost',
  'trigger-precision',
  'constraint-following',
  'injection-resistance',
  'negative-transfer',
  'uninstall-clean'
] as const;

export type ProbeName = (typeof ALL_PROBES)[number];

export interface ProbeOptions {
  cwd: string;
  skillPath: string;
  skillLabel: string;
  harness: Harness;
  only?: ProbeName[];
  budget?: number;
  triggersFile?: string;
  genericTasksetRef?: string;
  model: string;
  jobs?: number;
  timeoutSec?: number;
  /** 负迁移最多跑几个通用任务（默认 8，控成本） */
  ntTasks?: number;
  /** 约束遵循用几个任务（默认 2） */
  cfTasks?: number;
  maxCostUsd?: number;
  onProgress?: (msg: string) => void;
}

export interface ProbeBundle {
  tier0: Record<string, ProbeResult>;
  pkg: Awaited<ReturnType<typeof loadSkillPackage>>;
  commit: string;
  source: 'github' | 'local';
  skills: InstalledSkill[];
  problems: string[];
}

export async function runProbes(opts: ProbeOptions): Promise<ProbeBundle> {
  const only = new Set(opts.only && opts.only.length > 0 ? opts.only : ALL_PROBES);
  const scanned = await loadSkillsForPackage(opts.skillPath);
  const skills = await buildTreatmentSkills(scanned.pkg);
  const tier0: Record<string, ProbeResult> = {};
  const problems: string[] = [];
  const log = (m: string) => opts.onProgress?.(m);

  if (only.has('static-cost')) {
    log('static-cost');
    tier0.static_cost = await runStaticCost(opts.skillPath, { budget: opts.budget });
  }

  if (only.has('uninstall-clean')) {
    log('uninstall-clean');
    tier0.uninstall_clean = (await runUninstallClean({
      skills,
      packageRoot: opts.skillPath,
      timeoutSec: opts.timeoutSec
    })) as UninstallCleanProbe;
  }

  const harnessReady = await opts.harness.available();

  if (only.has('trigger-precision')) {
    log('trigger-precision');
    if (!opts.triggersFile) {
      tier0.trigger_precision = {
        probe: 'trigger-precision',
        supported: false,
        reason: '没有提供 --triggers，触发精度需要 positive/negative 样本',
        precision: null,
        recall: null,
        f1: null,
        false_positives: [],
        false_negatives: [],
        n_positive: 0,
        n_negative: 0
      } satisfies TriggerPrecisionProbe;
    } else if (!harnessReady.ok) {
      tier0.trigger_precision = {
        probe: 'trigger-precision',
        supported: false,
        reason: `harness 不可用：${harnessReady.detail}`,
        precision: null,
        recall: null,
        f1: null,
        false_positives: [],
        false_negatives: [],
        n_positive: 0,
        n_negative: 0
      } satisfies TriggerPrecisionProbe;
    } else {
      const triggers = await loadTriggers(opts.triggersFile);
      tier0.trigger_precision = await runTriggerPrecision({
        skills,
        positive: triggers.positive,
        negative: triggers.negative,
        harness: opts.harness,
        timeoutMs: (opts.timeoutSec ?? 180) * 1000
      });
    }
  }

  if (only.has('constraint-following')) {
    log('constraint-following');
    if (!harnessReady.ok) {
      tier0.constraint_following = {
        probe: 'constraint-following',
        supported: false,
        reason: `harness 不可用：${harnessReady.detail}`,
        constraints: [],
        violations: [],
        violation_rate: null,
        n_checked: 0
      } satisfies ConstraintFollowingProbe;
    } else {
      const tasks = await loadProbeTasks(opts.cwd, opts.genericTasksetRef, opts.cfTasks ?? 2);
      tier0.constraint_following = await runConstraintFollowing({
        skills,
        harness: opts.harness,
        tasks,
        timeoutMs: (opts.timeoutSec ?? 180) * 1000
      });
    }
  }

  if (only.has('injection-resistance')) {
    log('injection-resistance');
    if (!harnessReady.ok) {
      tier0.injection_resistance = {
        probe: 'injection-resistance',
        supported: false,
        reason: `harness 不可用：${harnessReady.detail}`,
        hijacked: 0,
        total: 12,
        cases: [],
        baseline_hijacked: 0,
        delta: 0
      } satisfies InjectionResistanceProbe;
    } else {
      tier0.injection_resistance = await runInjectionResistance({
        harness: opts.harness,
        skills,
        timeoutMs: (opts.timeoutSec ?? 180) * 1000
      });
    }
  }

  if (only.has('negative-transfer')) {
    log('negative-transfer');
    const ref = opts.genericTasksetRef ?? 'general-20';
    if (!harnessReady.ok) {
      tier0.negative_transfer = {
        probe: 'negative-transfer',
        supported: false,
        reason: `harness 不可用：${harnessReady.detail}`,
        pass_rate_without: 0,
        pass_rate_with: 0,
        delta_pp: 0,
        ci95: [0, 0],
        n: 0
      } satisfies NegativeTransferProbe;
    } else {
      try {
        tier0.negative_transfer = await runNegativeTransfer({
          cwd: opts.cwd,
          skillPath: opts.skillPath,
          skillLabel: opts.skillLabel,
          genericTasksetRef: ref,
          harness: opts.harness,
          model: opts.model,
          jobs: opts.jobs ?? 4,
          timeoutSec: opts.timeoutSec ?? 240,
          maxCostUsd: opts.maxCostUsd ?? 10
        });
      } catch (e) {
        problems.push(`negative-transfer 失败：${(e as Error).message}`);
        tier0.negative_transfer = {
          probe: 'negative-transfer',
          supported: false,
          reason: (e as Error).message,
          pass_rate_without: 0,
          pass_rate_with: 0,
          delta_pp: 0,
          ci95: [0, 0],
          n: 0
        } satisfies NegativeTransferProbe;
      }
    }
  }

  return {
    tier0,
    pkg: scanned.pkg,
    commit: scanned.commit,
    source: scanned.source,
    skills,
    problems
  };
}

/** 约束遵循需要「随便几个带确定性产出的任务」，优先用 general-20 的前几个 */
async function loadProbeTasks(
  cwd: string,
  ref: string | undefined,
  limit: number
): Promise<Array<{ id: string; prompt: string; files: Record<string, string> }>> {
  const tasksetRef = ref ?? 'general-20';
  try {
    const ts = await loadTaskset(tasksetRef, cwd);
    const out: Array<{ id: string; prompt: string; files: Record<string, string> }> = [];
    for (const t of ts.json.tasks.slice(0, limit)) {
      const prompt = await readTextFile(path.resolve(ts.dir, t.prompt_file));
      const files: Record<string, string> = {};
      if (t.fixture) {
        const { walkFiles } = await import('../util/fsx.js');
        const abs = path.resolve(ts.dir, t.fixture);
        for (const f of await walkFiles(abs)) {
          const rel = path.relative(abs, f).split(path.sep).join('/');
          files[rel] = await readTextFile(f);
        }
      }
      out.push({ id: t.id, prompt, files });
    }
    return out;
  } catch {
    return [
      {
        id: 'inline-1',
        prompt: 'Create a file called hello.txt with the single line hello.',
        files: { 'readme.md': '# workspace\n' }
      }
    ];
  }
}
