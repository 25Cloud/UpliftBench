import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Import from 'ajv/dist/2020.js';
import type { TaskSetJson } from '../types.js';
import { pathExists, readTextFile } from '../util/fsx.js';
import { UpliftError } from '../util/log.js';

const schemaDir = fileURLToPath(new URL('../../schema/', import.meta.url));

/** Ajv 2020 的 ESM 导出在 NodeNext 下是 namespace，这里统一收口成一个构造器 */
const Ajv2020 = ((Ajv2020Import as unknown as { default?: unknown }).default ??
  Ajv2020Import) as unknown as new (opts: Record<string, unknown>) => {
  compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: Array<{ instancePath?: string; message?: string }> };
};

export interface CheckResult {
  name: string;
  ok: boolean | 'skipped';
  detail: string;
}

export interface ValidationReport {
  ref: string;
  ok: boolean;
  checks: CheckResult[];
  warnings: string[];
}

function makeValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, logger: false });
  // 不引 ajv-formats（多一个依赖），只补这一个 schema 里真正用到的格式
  (ajv as unknown as { addFormat: (name: string, def: unknown) => void }).addFormat('date-time', {
    type: 'string',
    validate: (s: string) => !Number.isNaN(Date.parse(s))
  });
  return ajv;
}

export async function validateTasksetJson(json: unknown): Promise<{ ok: boolean; errors: string[] }> {
  const schemaPath = path.join(schemaDir, 'taskset.schema.json');
  const schema = JSON.parse(await readTextFile(schemaPath));
  const validator = makeValidator().compile(schema);
  const ok = validator(json);
  const errors = ok
    ? []
    : (validator.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  return { ok, errors };
}

export async function validateSkillCardJson(json: unknown): Promise<{ ok: boolean; errors: string[] }> {
  const schemaPath = path.join(schemaDir, 'skillcard.schema.json');
  const schema = JSON.parse(await readTextFile(schemaPath));
  const validator = makeValidator().compile(schema);
  const ok = validator(json);
  const errors = ok
    ? []
    : (validator.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  return { ok, errors };
}

/**
 * 准入检查（docs/04 §6）。
 *
 * 结构性检查全部自动；行为性检查（第 3、4 条）需要真跑模型，
 * 所以这里老实标 skipped 并说明「需要 uplift run 才能验证」，
 * 假装验过是这类工具最常见的失信方式。
 */
export async function admissionCheck(dir: string, json: TaskSetJson): Promise<ValidationReport> {
  const checks: CheckResult[] = [];
  const warnings: string[] = [];
  const ref = `${json.domain}@${json.version}`;

  const schema = await validateTasksetJson(json);
  checks.push({
    name: 'schema 校验',
    ok: schema.ok,
    detail: schema.ok ? 'taskset.schema.json 通过' : schema.errors.slice(0, 5).join('; ')
  });

  if (json.task_count !== json.tasks.length) {
    checks.push({
      name: 'task_count 一致',
      ok: false,
      detail: `task_count=${json.task_count} 但 tasks 有 ${json.tasks.length} 条`
    });
  } else {
    checks.push({ name: 'task_count 一致', ok: true, detail: `${json.tasks.length} 个任务` });
  }

  const ids = new Set<string>();
  const dupIds: string[] = [];
  for (const t of json.tasks) {
    if (ids.has(t.id)) dupIds.push(t.id);
    ids.add(t.id);
  }
  checks.push({
    name: '任务 id 唯一',
    ok: dupIds.length === 0,
    detail: dupIds.length ? `重复：${dupIds.join(', ')}` : `${ids.size} 个 id 全部唯一`
  });

  const missingPrompt: string[] = [];
  const missingVerify: string[] = [];
  for (const t of json.tasks) {
    if (!(await pathExists(path.resolve(dir, t.prompt_file)))) missingPrompt.push(t.id);
    const verifyRel = t.verify ?? json.grader.entry;
    if (json.grader.tier === 'A') {
      if (!verifyRel) missingVerify.push(t.id);
      else if (!(await pathExists(path.resolve(dir, verifyRel)))) missingVerify.push(t.id);
    }
  }
  checks.push({
    name: 'prompt_file 存在',
    ok: missingPrompt.length === 0,
    detail: missingPrompt.length ? `缺：${missingPrompt.slice(0, 8).join(', ')}` : '全部存在'
  });
  checks.push({
    name: 'verify 脚本就位',
    ok: json.grader.tier === 'A' ? missingVerify.length === 0 : 'skipped',
    detail:
      json.grader.tier === 'A'
        ? missingVerify.length
          ? `缺：${missingVerify.slice(0, 8).join(', ')}`
          : 'A 级评分器的 verify 全部就位'
        : `评分器等级为 ${json.grader.tier}，不需要 verify 脚本`
  });

  if (json.env.kind === 'docker') {
    const digestOk = Boolean(json.env.image_digest && /^sha256:[0-9a-f]{64}$/.test(json.env.image_digest));
    checks.push({
      name: 'env.image_digest 锁定',
      ok: digestOk,
      detail: digestOk ? `${json.env.image_digest!.slice(0, 19)}…` : 'docker 环境必须锁 sha256 digest，不许用 tag'
    });
  } else {
    checks.push({
      name: 'env 固定',
      ok: 'skipped',
      detail: 'kind=local：没有镜像可钉，已打 env_unpinned 标记'
    });
    warnings.push('env_unpinned');
  }

  checks.push({
    name: '空技能对照（baseline vs placebo <5pp）',
    ok: 'skipped',
    detail: '需要真跑模型：`uplift run --arms baseline,placebo --repeats 1` 后才能复检'
  });
  checks.push({
    name: '难度区间自检',
    ok: 'skipped',
    detail: '需要 baseline 实测通过率：先 `uplift run --arms baseline` 再复检'
  });

  const ok = checks.every((c) => c.ok !== false);
  return { ref, ok, checks, warnings };
}

export async function requireValidTaskset(json: TaskSetJson): Promise<void> {
  const schema = await validateTasksetJson(json);
  if (!schema.ok) {
    throw new UpliftError(
      `任务集 schema 校验失败：${json.domain ?? '?'}`,
      schema.errors.slice(0, 6).join('\n  '),
      '对照 schema/taskset.schema.json 修字段；`uplift taskset validate <path>` 会列全部错误'
    );
  }
}
