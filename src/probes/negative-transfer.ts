import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { runBenchmark } from '../runner/engine.js';
import { pairedBootstrapCI } from '../metrics/stats.js';
import type { Harness } from '../harness/types.js';
import type { NegativeTransferProbe, RunRow } from '../types.js';

export interface NegativeTransferOptions {
  cwd: string;
  skillPath: string;
  skillLabel: string;
  /** 与技能领域无关的通用任务集（默认 tasksets/general-20） */
  genericTasksetRef: string;
  harness: Harness;
  model: string;
  jobs?: number;
  timeoutSec?: number;
  seed?: number;
  maxCostUsd?: number;
  taskLimit?: number;
}

/**
 * 探针 5：负迁移（docs/03）。
 *
 * 做法就是一次两臂对照，只不过跑的是「与技能领域无关」的通用任务集：
 *   delta_pp < 0 且 CI 不含 0 → 技能拖累了无关任务，这是任何现有基准都不测的维度。
 */
export async function runNegativeTransfer(opts: NegativeTransferOptions): Promise<NegativeTransferProbe> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-negtransfer-'));
  try {
    const result = await runBenchmark({
      cwd: opts.cwd,
      skillPath: opts.skillPath,
      skillLabel: opts.skillLabel,
      tasksetRef: opts.genericTasksetRef,
      harness: opts.harness,
      arms: ['baseline', 'treatment'],
      repeats: 1,
      model: opts.model,
      temperature: 0,
      seed: opts.seed ?? 42,
      jobs: opts.jobs ?? 4,
      timeoutSec: opts.timeoutSec ?? 240,
      maxCostUsd: opts.maxCostUsd ?? 10,
      resume: false,
      dbPath: path.join(tmpDir, 'runs.db'),
      transcriptDir: path.join(tmpDir, 'transcripts'),
      workRoot: path.join(tmpDir, 'ws'),
      taskIds: opts.taskLimit ? undefined : undefined
    });

    const rows: RunRow[] = result.rows;
    const rate = (arm: string) => {
      const scored = rows.filter((r) => r.arm === arm && r.pass !== null);
      return scored.length === 0 ? 0 : scored.reduce((s, r) => s + (r.pass as number), 0) / scored.length;
    };
    const without = rate('baseline');
    const withSkill = rate('treatment');

    const taskIds = Array.from(new Set(rows.map((r) => r.task_id))).sort();
    const diffs: number[] = [];
    for (const id of taskIds) {
      const t = rows.find((r) => r.task_id === id && r.arm === 'treatment' && r.pass !== null);
      const b = rows.find((r) => r.task_id === id && r.arm === 'baseline' && r.pass !== null);
      if (t && b) diffs.push((t.pass as number) - (b.pass as number));
    }
    const boot = pairedBootstrapCI(diffs, { seed: opts.seed ?? 42 });

    return {
      probe: 'negative-transfer',
      supported: taskIds.length > 0,
      reason: taskIds.length === 0 ? '通用任务集没跑出有效行（检查 harness / 任务集）' : undefined,
      pass_rate_without: round4(without),
      pass_rate_with: round4(withSkill),
      delta_pp: round2((withSkill - without) * 100),
      ci95: [round2(boot.ci95[0] * 100), round2(boot.ci95[1] * 100)],
      n: taskIds.length
    };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
