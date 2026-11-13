import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBenchmark } from '../src/runner/engine.js';
import { openStore, queryRuns, armSummaries } from '../src/runner/store.js';
import { MockHarness, MOCK_FLAG } from '../src/harness/mock.js';

/**
 * 端到端管线测试（AGENTS.md T4 验收：三臂 + worktree + SQLite + resume）。
 * 用 mock harness：不调模型，只验证编排、隔离、落库、聚合是否自洽。
 */
let tmp: string;
let skillDir: string;

beforeAll(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'uplift-runner-'));
  skillDir = path.join(tmp, 'demo-skill');
  await fsp.mkdir(path.join(skillDir, 'references'), { recursive: true });
  await fsp.writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo\ndescription: demo skill for pipeline test\n---\n\n# Demo\n\nAlways write tests first.\n'
  );
  await fsp.writeFile(path.join(skillDir, 'references', 'notes.md'), 'Reference material. '.repeat(30));
});

afterAll(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

describe('三臂 runner 端到端（mock harness）', () => {
  it('跑通 3 题 × 3 臂，结果可查，resume 会跳过', async () => {
    const cwd = process.cwd();
    const cfg = {
      cwd,
      skillPath: skillDir,
      skillLabel: 'demo/skill',
      tasksetRef: 'general-20@1.0',
      harness: new MockHarness({ seed: 7 }),
      arms: ['baseline', 'placebo', 'treatment'] as const,
      repeats: 1,
      model: 'mock-model',
      temperature: 0,
      seed: 42,
      jobs: 2,
      timeoutSec: 60,
      maxCostUsd: 0,
      resume: false,
      taskIds: ['gen-001', 'gen-002', 'gen-003'],
      dbPath: path.join(tmp, 'runs.db'),
      transcriptDir: path.join(tmp, 'transcripts'),
      workRoot: path.join(tmp, 'ws')
    };

    const first = await runBenchmark({ ...cfg, arms: [...cfg.arms] });
    expect(first.rows.length).toBe(9);
    expect(first.tier1.n).toBe(3);
    expect(first.placeboValidation.deltaPct).toBeLessThanOrEqual(0.02);
    expect(first.treatmentSkills.length).toBe(1);
    // 三臂都在
    expect(new Set(first.rows.map((r) => r.arm))).toEqual(new Set(['baseline', 'placebo', 'treatment']));
    // 每行都有轨迹路径
    expect(first.rows.every((r) => r.transcript_path !== null)).toBe(true);
    // 理论数字自洽
    const { uplift_pp, raw_gain_pp, placebo_effect_pp } = first.tier1.metrics;
    expect(uplift_pp).toBeCloseTo(raw_gain_pp - placebo_effect_pp, 6);

    // resume：第二轮应该全部跳过
    const second = await runBenchmark({ ...cfg, arms: [...cfg.arms], resume: true });
    expect(second.rows.length).toBe(9);

    const db = openStore(cfg.dbPath);
    const stored = queryRuns(db, { skill_repo: 'demo/skill' });
    expect(stored.length).toBe(9);
    const summaries = armSummaries(db, { skill_repo: 'demo/skill' });
    expect(summaries.length).toBe(3);
    expect(summaries.every((s) => s.n_runs === 3)).toBe(true);
    db.close();
  }, 120_000);

  it('mock 结果必须带 synthetic_data 标记（不许被当成真数字发榜）', async () => {
    expect(MOCK_FLAG).toBe('synthetic_data');
  });

  it('产物目录结构符合 docs/05 §6', async () => {
    const files = await fsp.readdir(path.join(tmp, 'transcripts'));
    expect(files.length).toBeGreaterThan(0);
  });
});
