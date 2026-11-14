#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import { Command } from 'commander';
import { createHarness, type HarnessName } from './harness/index.js';
import { runProbes, ALL_PROBES, type ProbeName } from './probes/index.js';
import { runBenchmark } from './runner/engine.js';
import { runStaticCost } from './probes/static-cost.js';
import { buildSkillCard } from './card/build.js';
import { renderCardMarkdown, renderCardText, setLang } from './render/card.js';
import { renderBadgeSvg, badgeMarkdown } from './render/badge.js';
import { openStore, queryRuns } from './runner/store.js';
import { createWorktree, prepareTaskRepo, removeWorktree, findRepoRoot } from './runner/worktree.js';
import { loadTaskset, listLocalTasksets } from './taskset/loader.js';
import { admissionCheck, validateSkillCardJson } from './taskset/validate.js';
import { env, envInt, loadEnv } from './util/env.js';
import { readJson, writeJson } from './util/json.js';
import { ensureDir, humanInt, pathExists, writeTextFile } from './util/fsx.js';
import { c, errLine, heading, kv, setColor, sym, UpliftError, warnLine } from './util/log.js';
import { computeTier1, decideGrade } from './metrics/uplift.js';
import { poolRuns } from './metrics/pool.js';
import { SOFTWARE_VERSION, PROTOCOL_VERSION } from './version.js';
import type { ArmName, RunRow, SkillCardJson } from './types.js';
import { runInjectionResistance } from './probes/injection-resistance.js';

loadEnv();

const program = new Command();

program
  .name('uplift')
  .description('UpliftBench — 技能包净增益基准（uplift = treatment − placebo）')
  .version(`${SOFTWARE_VERSION} (${PROTOCOL_VERSION})`)
  .option('--no-color', '关掉 ANSI 颜色')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.color === false) setColor(false);
  });

function fail(e: unknown): never {
  if (e instanceof UpliftError) {
    console.error(e.format());
    process.exit(e.exitCode);
  }
  console.error(errLine(e instanceof Error ? e.message : String(e)));
  if (e instanceof Error && e.stack) console.error(c.dim(e.stack.split('\n').slice(1, 4).join('\n')));
  process.exit(1);
}

function parseList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ probe */

program
  .command('probe <skillPath>')
  .description('跑 Tier 0 六探针（不需要任务集）')
  .option('--only <probes>', `逗号分隔，可选：${ALL_PROBES.join(',')}`)
  .option('--all', '跑全部六项（默认）')
  .option('--harness <name>', 'harness 适配器：openai-compat | claude-code | mock', 'openai-compat')
  .option('--model <id>', '模型精确 id（默认读 UPLIFT_MODEL）')
  .option('--budget <n>', 'token 预算，默认 10000')
  .option('--triggers <file>', '触发精度用的 triggers.json')
  .option('--generic-taskset <ref>', '负迁移/约束遵循用的通用任务集', 'general-20')
  .option('--nt-tasks <n>', '负迁移最多跑几个任务（默认 8）')
  .option('--cf-tasks <n>', '约束遵循用几个任务（默认 2）')
  .option('--jobs <n>', '并发数，默认 4')
  .option('--timeout <sec>', '单次 harness 调用超时，默认 180')
  .option('--label <repo>', '展示名，默认取目录名')
  .option('--out <file>', 'SkillCard 输出路径，默认 .uplift/skillcard.json')
  .option('--badge <file>', 'badge.svg 输出路径，默认 .uplift/badge.svg')
  .option('--format <fmt>', 'text | json | markdown', 'text')
  .option('--lang <lang>', '卡片输出语言：zh | en（也可用 UPLIFT_LANG）')
  .option('--verbose', '打印每个探针的进度')
  .action(async (skillPath: string, opts: Record<string, any>) => {
    try {
      if (opts.lang === 'en' || opts.lang === 'zh') setLang(opts.lang);
      const root = path.resolve(skillPath);
      const label = opts.label ?? path.basename(root);
      const only = parseList(opts.only) as ProbeName[] | undefined;
      const harnessName = opts.harness as HarnessName;
      const harness = createHarness(harnessName, { model: opts.model });

      if (opts.format === 'text') {
        console.log(heading('UpliftBench · probe', `${label}`));
      }
      const t0 = Date.now();
      const bundle = await runProbes({
        cwd: process.cwd(),
        skillPath: root,
        skillLabel: label,
        harness,
        only,
        budget: opts.budget ? Number(opts.budget) : undefined,
        triggersFile: opts.triggers,
        genericTasksetRef: opts.genericTaskset,
        model: opts.model ?? env('UPLIFT_MODEL') ?? '',
        jobs: opts.jobs ? Number(opts.jobs) : 4,
        timeoutSec: opts.timeout ? Number(opts.timeout) : 180,
        ntTasks: opts.ntTasks ? Number(opts.ntTasks) : 8,
        cfTasks: opts.cfTasks ? Number(opts.cfTasks) : 2,
        onProgress: opts.verbose
          ? (m) => console.log(`  ${c.dim('·')} ${m}  ${c.dim(`${Date.now() - t0}ms`)}`)
          : undefined
      });

      const card = buildSkillCard({
        skillRepo: label,
        skillCommit: bundle.commit,
        skillPath: root,
        skillCount: bundle.pkg.skills.length,
        totalTokens: bundle.pkg.totalTokens,
        source: bundle.source,
        tier0: bundle.tier0,
        extraFlags: bundle.problems
      });

      const outFile = path.resolve(opts.out ?? path.join('.uplift', 'skillcard.json'));
      await writeJson(outFile, card);
      const badgeFile = path.resolve(opts.badge ?? path.join('.uplift', 'badge.svg'));
      await ensureDir(path.dirname(badgeFile));
      await writeTextFile(badgeFile, renderBadgeSvg(card, { style: 'full' }));

      const unsupported = Object.values(bundle.tier0).filter((p) => !p.supported).length;
      if (opts.format === 'json') {
        console.log(JSON.stringify(card, null, 2));
      } else if (opts.format === 'markdown') {
        console.log(renderCardMarkdown(card));
      } else {
        console.log(renderCardText(card));
        console.log(c.gray('─'.repeat(54)));
        console.log(
          `  ${c.dim(`${((Date.now() - t0) / 1000).toFixed(1)}s · 写入 ${path.relative(process.cwd(), outFile)} + badge.svg`)}`
        );
        for (const p of bundle.problems) console.log(warnLine(p));
      }
      if (unsupported > 0) process.exit(3);
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* ------------------------------------------------------------------- demo */

program
  .command('demo')
  .description('零依赖自检：对内置示例技能跑便宜的 Tier 0（不调模型，几秒钟出卡）')
  .option('--format <fmt>', 'text | json', 'text')
  .option('--lang <lang>', '输出语言：zh | en（也可用 UPLIFT_LANG）')
  .action(async (opts: Record<string, any>) => {
    try {
      if (opts.lang === 'en' || opts.lang === 'zh') setLang(opts.lang);
      const en = opts.lang === 'en';
      /**
       * 从包根找示例技能，不是从 cwd：`npx upliftbench demo` 得能在任何目录跑。
       * 源码用 tsx 跑时 import.meta.url 在 src/，编译后在 dist/，上一级都是包根。
       */
      const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      const bundledSkill = path.join(pkgRoot, 'examples', 'demo-skill');
      const skillPath = (await pathExists(bundledSkill)) ? bundledSkill : path.resolve('examples', 'demo-skill');
      if (!(await pathExists(skillPath))) {
        throw new UpliftError(
          '找不到内置示例技能',
          `期望路径：${skillPath}`,
          '在仓库根目录运行：pnpm build && node dist/cli.js demo'
        );
      }
      const started = Date.now();
      const bundle = await runProbes({
        cwd: process.cwd(),
        skillPath,
        skillLabel: 'upliftbench/demo-skill',
        harness: createHarness('openai-compat', {}),
        only: ['static-cost', 'uninstall-clean'],
        model: ''
      });
      const card = buildSkillCard({
        skillRepo: 'upliftbench/demo-skill',
        skillCommit: bundle.commit,
        skillPath: 'examples/demo-skill',
        skillCount: bundle.pkg.skills.length,
        totalTokens: bundle.pkg.totalTokens,
        source: 'local',
        tier0: bundle.tier0,
        extraFlags: []
      });

      if (opts.format === 'json') {
        console.log(JSON.stringify(card, null, 2));
        process.exit(0);
      }
      console.log(renderCardText(card));
      console.log(c.gray('─'.repeat(54)));
      console.log(kv(en ? 'took' : '耗时', `${Date.now() - started}ms · 0 model calls · $0.00`));
      console.log('');
      if (en) {
        console.log(c.bold('  This is Tier 0 (facts). It is not a score yet.'));
        console.log(c.dim('  Tier 1 is where uplift comes from: run the same tasks in three arms —'));
        console.log(c.dim('  no skill / token-matched neutral text / the real skill.'));
        console.log(c.dim('  uplift = treatment − placebo. Without the placebo arm you are only'));
        console.log(c.dim('  measuring "does a longer prompt help".'));
        console.log('');
        console.log(kv('  next', 'npx upliftbench probe examples/demo-skill --only static-cost,uninstall-clean'));
        console.log(kv('', 'npx upliftbench run --taskset tasksets/general-20 --skill examples/demo-skill --arms baseline,placebo,treatment --repeats 1 --max-cost 2'));
      } else {
        console.log(c.bold('  这只是 Tier 0（事实），还不是分数。'));
        console.log(c.dim('  Tier 1 才有 uplift：同一套任务跑三臂，空技能 / 等 token 中性文本 / 真技能，'));
        console.log(c.dim('  uplift = treatment − placebo。少了安慰剂那一臂，你测到的是"多塞 token 有没有用"。'));
        console.log('');
        console.log(kv('  下一步', 'npx upliftbench probe examples/demo-skill --only static-cost,uninstall-clean'));
        console.log(kv('', 'npx upliftbench run --taskset tasksets/general-20 --skill examples/demo-skill --arms baseline,placebo,treatment --repeats 1 --max-cost 2'));
      }
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* -------------------------------------------------------------------- run */

program
  .command('run')
  .description('跑 Tier 1 三臂对照（需要任务集）')
  .requiredOption('--taskset <ref>', '任务集：web-guidance@1.0 或本地路径')
  .requiredOption('--skill <path>', '技能包路径')
  .option('--arms <list>', '默认 baseline,placebo,treatment')
  .option('--model <id>', '精确模型 ID（必填，不许用 latest）')
  .option('--harness <name>', 'openai-compat | claude-code | mock', 'openai-compat')
  .option('--repeats <n>', '默认 3，最小 1（<3 时 CI 仅供参考）', '3')
  .option('--temperature <f>', '默认 0', '0')
  .option('--seed <n>', '默认 42', '42')
  .option('--jobs <n>', '并发数，默认 4', '4')
  .option('--timeout <sec>', '单任务超时，默认 600', '600')
  .option('--max-steps <n>', '单次 run 的 agent 最大步数，默认 14', '14')
  .option('--activation <mode>', 'auto = 模型自己决定是否激活技能；forced = 直接把技能正文注入上下文', 'auto')
  .option('--preload-budget <n>', 'forced 模式下最多预加载多少 token 的技能正文，默认 12000', '12000')
  .option('--max-cost <usd>', '成本上限，超过即停')
  .option('--tasks <ids>', '只跑指定任务 id（逗号分隔）')
  .option('--label <repo>', '展示名，默认取技能目录名')
  .option('--resume', '从 .uplift/runs.db 续跑')
  .option('--out <dir>', '结果目录，默认 .uplift')
  .option('--format <fmt>', 'text | json | markdown', 'text')
  .option('--quiet', '不打印每条 run 的进度')
  .action(async (opts: Record<string, any>) => {
    try {
      const model = opts.model ?? env('UPLIFT_MODEL');
      if (!model) {
        throw new UpliftError(
          '缺 --model',
          '协议要求三臂用同一个精确模型版本，且不许写 latest',
          '例如 --model glm-5.3-flash，或设 UPLIFT_MODEL'
        );
      }
      const arms = (parseList(opts.arms) ?? ['baseline', 'placebo', 'treatment']) as ArmName[];
      const repeats = Number(opts.repeats);
      if (repeats < 1) throw new UpliftError('--repeats 至少 1', `收到 ${opts.repeats}`, '用 --repeats 3');
      const skillPath = path.resolve(opts.skill);
      const outDir = path.resolve(opts.out ?? '.uplift');
      const maxCost = Number(opts.maxCost ?? env('UPLIFT_MAX_COST') ?? 10);

      const harness = createHarness(opts.harness as HarnessName, { model });
      const avail = await harness.available();
      if (!avail.ok) {
        throw new UpliftError(`harness 不可用：${harness.name}`, avail.detail, '检查 key / 模型 / CLI 是否就位');
      }

      console.log(heading('UpliftBench · run', `${opts.taskset} · ${arms.length} arms · ${repeats} repeats`));
      const result = await runBenchmark({
        cwd: process.cwd(),
        skillPath,
        skillLabel: opts.label ?? path.basename(skillPath),
        tasksetRef: opts.taskset,
        harness,
        arms,
        repeats,
        model,
        temperature: Number(opts.temperature),
        seed: Number(opts.seed),
        jobs: Number(opts.jobs),
        timeoutSec: Number(opts.timeout),
        maxCostUsd: maxCost,
        resume: Boolean(opts.resume),
        dbPath: path.join(outDir, 'runs.db'),
        transcriptDir: path.join(outDir, 'transcripts'),
        workRoot: path.join(outDir, 'ws'),
        maxSteps: Number(opts.maxSteps ?? 14),
        activation: opts.activation === 'forced' ? 'forced' : 'auto',
        preloadBudgetTokens: Number(opts.preloadBudget ?? 12000),
        taskIds: parseList(opts.tasks),
        onEvent: (e) => {
          if (opts.quiet) return;
          if (e.type === 'start') {
            console.log(
              `  ${c.dim(`共 ${e.total} 个 run（跳过 ${e.skipped} 个已完成）· 安慰剂 token 偏差 ${(e.placeboDeltaPct * 100).toFixed(2)}%`)}`
            );
          } else if (e.type === 'unit-start') {
            process.stdout.write(
              `  ${c.dim(`[${e.index + 1}/${e.total}]`)} ${e.unit.arm.padEnd(9)} ${e.unit.taskId} r${e.unit.repeatIdx}\n`
            );
          } else if (e.type === 'warn') {
            console.log(warnLine(e.message));
          } else if (e.type === 'stop') {
            console.log(warnLine(e.reason));
          }
        }
      });

      const card = buildSkillCard({
        skillRepo: opts.label ?? path.basename(skillPath),
        skillCommit: result.skillCommit,
        skillPath,
        skillCount: result.treatmentSkills.length,
        totalTokens: result.treatmentSkills.reduce((s, k) => s + k.tokens, 0),
        source: 'local',
        tier0: {},
        tier1: result.tier1,
        extraFlags: [`harness_${harness.name}`]
      });

      await writeJson(path.join(outDir, 'skillcard.json'), card);
      await writeTextFile(path.join(outDir, 'badge.svg'), renderBadgeSvg(card, { style: 'full' }));

      if (opts.format === 'json') {
        console.log(JSON.stringify(card, null, 2));
      } else if (opts.format === 'markdown') {
        console.log(renderCardMarkdown(card));
      } else if (!result.tier1) {
        /**
         * 少跑了臂，就**不出 uplift**。
         * 以前这里照样打印 `uplift 0pp / placebo -100pp`，那不是数字，是没做对照的痕迹，
         * 而且它会以 A 级卡片的样子出现在屏幕上。协议 §1 硬约束 2：两臂/单臂结果必须标 uncorrected。
         */
        console.log(heading('UpliftBench · 未做三臂对照', 'uncorrected'));
        const byArm = new Map<string, { n: number; pass: number }>();
        for (const r of result.rows) {
          const cur = byArm.get(r.arm) ?? { n: 0, pass: 0 };
          cur.n += 1;
          cur.pass += r.pass ?? 0;
          byArm.set(r.arm, cur);
        }
        for (const [arm, v] of byArm) {
          console.log(kv(arm.padEnd(9), `${v.n} 个 run · 通过率 ${((v.pass / Math.max(1, v.n)) * 100).toFixed(1)}%`));
        }
        console.log(c.gray('─'.repeat(54)));
        console.log(
          warnLine(
            `只跑了 ${arms.join(',')}；uplift 必须来自三臂对照（空技能 / 等量安慰剂 / 真技能），这份结果只能当标定用`
          )
        );
        console.log(kv('成本', `$${result.costUsd.toFixed(4)}`));
      } else {
        console.log(renderCardText(card));
        console.log(c.gray('─'.repeat(54)));
        console.log(
          kv(
            '协议口径',
            `${PROTOCOL_VERSION} · uplift = treatment − placebo · 成本 $${result.costUsd.toFixed(4)}`
          )
        );
        if (repeats < 5) {
          console.log(warnLine(`repeats=${repeats} < 5，95%CI 仅供参考（docs/11 Q2 默认值）`));
        }
        if (!result.placeboValidation.ok) {
          for (const m of result.placeboValidation.messages) console.log(warnLine(m));
        }
      }
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* ------------------------------------------------------------------- card */

program
  .command('card')
  .description('查看 / 渲染已有的 SkillCard')
  .option('--file <file>', 'SkillCard 路径，默认 .uplift/skillcard.json')
  .option('--format <fmt>', 'text | markdown | json', 'text')
  .option('--compare <files...>', '并排比较两张卡：--compare a.json b.json')
  .action(async (opts: Record<string, any>) => {
    try {
      if (opts.compare) {
        const files = Array.isArray(opts.compare) ? (opts.compare as string[]) : [String(opts.compare)];
        if (files.length < 2) {
          throw new UpliftError('--compare 需要两个 SkillCard', `收到 ${files.length} 个`, 'uplift card --compare a.json b.json');
        }
        const [a, b] = files;
        const ca = await readJson<SkillCardJson>(path.resolve(a));
        const cb = await readJson<SkillCardJson>(path.resolve(b));
        console.log(heading('UpliftBench · compare'));
        const rows: Array<[string, string, string]> = [];
        const fmt = (v: number | undefined) => (v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}pp`);
        rows.push(['技能包', ca.skill.repo, cb.skill.repo]);
        rows.push(['任务集', ca.tier1?.taskset ?? '—', cb.tier1?.taskset ?? '—']);
        rows.push(['uplift', fmt(ca.tier1?.metrics.uplift_pp), fmt(cb.tier1?.metrics.uplift_pp)]);
        rows.push([
          'headroom',
          ca.tier1 ? `${(ca.tier1.metrics.headroom_closed * 100).toFixed(0)}%` : '—',
          cb.tier1 ? `${(cb.tier1.metrics.headroom_closed * 100).toFixed(0)}%` : '—'
        ]);
        rows.push(['placebo', fmt(ca.tier1?.metrics.placebo_effect_pp), fmt(cb.tier1?.metrics.placebo_effect_pp)]);
        rows.push(['N', String(ca.tier1?.n ?? '—'), String(cb.tier1?.n ?? '—')]);
        for (const [k, x, y] of rows) console.log(`  ${k.padEnd(10)} ${x.padEnd(26)} ${y}`);
        if (ca.tier1?.taskset !== cb.tier1?.taskset) {
          console.log(warnLine('两张卡的任务集不同，数值不可直接比较'));
        }
        process.exit(0);
      }
      const file = path.resolve(opts.file ?? path.join('.uplift', 'skillcard.json'));
      const card = await readJson<SkillCardJson>(file);
      if (opts.format === 'json') console.log(JSON.stringify(card, null, 2));
      else if (opts.format === 'markdown') console.log(renderCardMarkdown(card));
      else console.log(renderCardText(card));
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* ------------------------------------------------------------------ badge */

program
  .command('badge')
  .description('生成 badge.svg')
  .option('--file <file>', 'SkillCard 路径，默认 .uplift/skillcard.json')
  .option('--out <file>', '输出路径，默认 .uplift/badge.svg')
  .option('--style <style>', 'full | compact', 'compact')
  .action(async (opts: Record<string, any>) => {
    try {
      const file = path.resolve(opts.file ?? path.join('.uplift', 'skillcard.json'));
      const card = await readJson<SkillCardJson>(file);
      const svg = renderBadgeSvg(card, { style: opts.style === 'full' ? 'full' : 'compact' });
      const out = path.resolve(opts.out ?? path.join('.uplift', 'badge.svg'));
      await ensureDir(path.dirname(out));
      await writeTextFile(out, svg);
      console.log(`${sym.ok} badge 写入 ${path.relative(process.cwd(), out)}`);
      console.log(c.dim(badgeMarkdown(card, path.relative(process.cwd(), out))));
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* ---------------------------------------------------------------- taskset */

const tasksetCmd = program.command('taskset').description('任务集管理');

tasksetCmd
  .command('validate <ref>')
  .description('schema + 准入检查')
  .action(async (ref: string) => {
    try {
      const ts = await loadTaskset(ref, process.cwd());
      const report = await admissionCheck(ts.dir, ts.json);
      console.log(heading('UpliftBench · taskset validate', report.ref));
      for (const check of report.checks) {
        const icon = check.ok === true ? c.green(sym.ok) : check.ok === 'skipped' ? c.gray('–') : c.red(sym.err);
        console.log(`  ${icon} ${check.name.padEnd(34)} ${c.dim(check.detail)}`);
      }
      for (const w of report.warnings) console.log(warnLine(w));
      console.log(c.gray('─'.repeat(64)));
      if (!report.ok) {
        console.log(errLine('准入检查未通过'));
        process.exit(1);
      }
      const skipped = report.checks.filter((x) => x.ok === 'skipped').length;
      console.log(`${sym.ok} 通过（${report.checks.length - skipped} 项自动检查，${skipped} 项需真跑模型后复检）`);
      process.exit(skipped > 0 ? 3 : 0);
    } catch (e) {
      fail(e);
    }
  });

tasksetCmd
  .command('list')
  .description('列出本地任务集')
  .action(() => {
    const list = listLocalTasksets(process.cwd());
    if (list.length === 0) {
      console.log(c.dim('tasksets/ 下还没有任务集'));
      process.exit(0);
    }
    for (const t of list) console.log(`  ${t.domain.padEnd(20)} ${c.dim(path.relative(process.cwd(), t.path))}`);
    process.exit(0);
  });

tasksetCmd
  .command('inspect <ref>')
  .description('显示任务数、评分器等级、环境')
  .action(async (ref: string) => {
    try {
      const ts = await loadTaskset(ref, process.cwd());
      console.log(heading('UpliftBench · taskset inspect', `${ts.json.domain}@${ts.json.version}`));
      console.log(kv('标题', ts.json.title));
      console.log(kv('维护者', ts.json.maintainer ?? '—'));
      console.log(kv('任务数', String(ts.json.task_count)));
      console.log(kv('评分器', `${ts.json.grader.kind} · ${ts.json.grader.tier} 级`));
      console.log(kv('环境', `${ts.json.env.kind}${ts.json.env.image_digest ? ` · ${ts.json.env.image_digest.slice(0, 19)}…` : ''}`));
      const byDiff = new Map<string, number>();
      for (const t of ts.json.tasks) byDiff.set(t.difficulty ?? 'unset', (byDiff.get(t.difficulty ?? 'unset') ?? 0) + 1);
      console.log(kv('难度分布', [...byDiff.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')));

      /**
       * 实测标定：难度标签是「设计意图」，这里有「实测通过率」。
       * 两者经常打架（见 docs/13 §二.1），所以两个都显示，别让人只看到标签就以为知道难度。
       */
      const calPath = path.join(ts.dir, 'calibration.json');
      if (await pathExists(calPath)) {
        const cal = await readJson<{
          measured_at?: string;
          model?: string;
          arm?: string;
          tasks?: Record<string, { baseline: number; samples: number }>;
        }>(calPath);
        const entries = Object.entries(cal.tasks ?? {});
        if (entries.length > 0) {
          let zero = 0;
          let low = 0;
          let mid = 0;
          let full = 0;
          for (const [, v] of entries) {
            if (v.baseline <= 0) zero += 1;
            else if (v.baseline < 0.5) low += 1;
            else if (v.baseline < 1) mid += 1;
            else full += 1;
          }
          console.log(
            kv('实测标定', `${entries.length}/${ts.json.task_count} 题 · ${cal.model ?? '?'} · ${cal.arm ?? 'baseline'} 臂`)
          );
          console.log(kv('实测通过率', `0% ${zero} · 1–49% ${low} · 50–99% ${mid} · 100% ${full}`));
          const ceilingPct = Math.round((full / entries.length) * 100);
          if (ceilingPct >= 40) {
            console.log(
              warnLine(
                `天花板 ${ceilingPct}%：这些题的 baseline 已经满分，treatment 再好也上不去（看 docs/16 §4.2）`
              )
            );
          }
        }
      } else {
        console.log(c.dim('  （还没有 calibration.json：难度标签只有设计意图，没有实测）'));
      }
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

tasksetCmd
  .command('fetch <ref>')
  .description('从 registry 拉取（v0.1 尚未开放远程 registry）')
  .action(async () => {
    console.log(warnLine('v0.1 只有本地任务集：把 taskset 目录放进 tasksets/ 即可'));
    process.exit(3);
  });

/* ---------------------------------------------------------------- compare */

program
  .command('compare <skillA> <skillB>')
  .description('两个技能包在同一任务集上对比（配对 bootstrap）')
  .requiredOption('--taskset <ref>', '任务集')
  .option('--model <id>', '模型 id')
  .option('--harness <name>', 'openai-compat | claude-code | mock', 'openai-compat')
  .option('--repeats <n>', '默认 3', '3')
  .option('--jobs <n>', '默认 4', '4')
  .action(async (skillA: string, skillB: string, opts: Record<string, any>) => {
    try {
      const model = opts.model ?? env('UPLIFT_MODEL') ?? '';
      const harness = createHarness(opts.harness as HarnessName, { model });
      const results = [];
      for (const skill of [skillA, skillB]) {
        const label = path.basename(path.resolve(skill));
        console.log(heading('UpliftBench · compare', label));
        const r = await runBenchmark({
          cwd: process.cwd(),
          skillPath: path.resolve(skill),
          skillLabel: label,
          tasksetRef: opts.taskset,
          harness,
          arms: ['baseline', 'placebo', 'treatment'],
          repeats: Number(opts.repeats),
          model,
          temperature: 0,
          seed: 42,
          jobs: Number(opts.jobs),
          timeoutSec: 600,
          maxCostUsd: Number(env('UPLIFT_MAX_COST') ?? 10),
          resume: true,
          dbPath: path.join('.uplift', 'runs.db'),
          transcriptDir: path.join('.uplift', 'transcripts'),
          workRoot: path.join('.uplift', 'ws')
        });
        results.push(r);
      }
      const [a, b] = results;
      if (!a.tier1 || !b.tier1) {
        throw new UpliftError(
          '对比需要两边都做三臂对照',
          `${a.tier1 ? 'B' : 'A'} 只有部分臂，没有 uplift 可比`,
          '用 --arms baseline,placebo,treatment 各跑一遍再做比较'
        );
      }
      console.log(heading('对比结果'));
      const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}pp`;
      console.log(`  uplift      ${fmt(a.tier1.metrics.uplift_pp).padEnd(12)} ${fmt(b.tier1.metrics.uplift_pp)}`);
      console.log(
        `  headroom    ${(a.tier1.metrics.headroom_closed * 100).toFixed(0)}%${' '.repeat(9)} ${(b.tier1.metrics.headroom_closed * 100).toFixed(0)}%`
      );
      const diff = b.tier1.metrics.uplift_pp - a.tier1.metrics.uplift_pp;
      console.log(`  差值        ${fmt(diff)}（${diff >= 0 ? 'B 更好' : 'A 更好'}）`);
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* ----------------------------------------------------------------- doctor */

program
  .command('doctor')
  .description('环境自检')
  .action(async () => {
    const lines: string[] = [];
    const check = async (name: string, fn: () => Promise<{ ok: boolean | 'warn'; detail: string }>) => {
      try {
        const r = await fn();
        const icon = r.ok === true ? c.green(sym.ok) : r.ok === 'warn' ? c.yellow(sym.warn) : c.red(sym.err);
        lines.push(`  ${icon} ${name.padEnd(26)} ${c.dim(r.detail)}`);
      } catch (e) {
        lines.push(`  ${c.red(sym.err)} ${name.padEnd(26)} ${c.dim((e as Error).message)}`);
      }
    };

    await check('node', async () => {
      const major = Number(process.versions.node.split('.')[0]);
      return { ok: major >= 22 ? true : 'warn', detail: `${process.version}${major >= 22 ? '' : '（要求 >= 22）'}` };
    });
    await check('git worktree', async () => {
      const { runGit } = await import('./runner/worktree.js');
      const res = await runGit(['--version'], process.cwd());
      if (res.code !== 0) return { ok: false, detail: res.stderr.slice(0, 120) };
      const repo = await findRepoRoot(process.cwd());
      if (!repo) return { ok: 'warn', detail: '当前目录不是 git 仓库，三臂隔离需要它' };
      const wt = await runGit(['worktree', 'list'], repo);
      return { ok: true, detail: `${res.stdout.trim()} · 仓库 ${path.basename(repo)}` };
    });
    await check('sqlite', async () => {
      const { openStore } = await import('./runner/store.js');
      const tmp = path.join(os.tmpdir(), `uplift-doctor-${Date.now()}.db`);
      const db = openStore(tmp);
      const v = db.prepare('select sqlite_version() v').get() as { v: string };
      db.close();
      await fsp.rm(tmp, { force: true });
      return { ok: true, detail: `better-sqlite3 · sqlite ${v.v}` };
    });
    await check('openai-compat', async () => {
      const h = createHarness('openai-compat', { model: env('UPLIFT_MODEL') });
      const a = await h.available();
      return { ok: a.ok ? true : 'warn', detail: a.detail };
    });
    await check('claude-code', async () => {
      const h = createHarness('claude-code', {});
      const a = await h.available();
      return { ok: a.ok ? true : 'warn', detail: a.detail };
    });
    await check('docker', async () => {
      const { runShell } = await import('./util/shell.js');
      const res = await runShell('docker --version', { timeoutMs: 10_000 });
      return res.code === 0
        ? { ok: true, detail: res.stdout.trim() }
        : { ok: 'warn', detail: '没检测到 docker：Tier 1 需要固定环境的任务集会失败' };
    });
    await check('任务集', async () => {
      const list = listLocalTasksets(process.cwd());
      return list.length > 0
        ? { ok: true, detail: list.map((t) => t.domain).join(', ') }
        : { ok: 'warn', detail: 'tasksets/ 下没有任务集' };
    });
    await check('磁盘', async () => {
      const st = await fsp.statfs(process.cwd());
      const gb = (st.bavail * st.bsize) / 1024 ** 3;
      return { ok: gb > 2 ? true : 'warn', detail: `剩余 ${gb.toFixed(1)} GB` };
    });

    console.log(heading('UpliftBench · doctor'));
    for (const l of lines) console.log(l);
    console.log(c.gray('─'.repeat(64)));
    console.log(c.dim(`${process.platform} ${process.arch} · ${SOFTWARE_VERSION} · ${PROTOCOL_VERSION}`));
    process.exit(0);
  });

/* ------------------------------------------------------------------- site */

program
  .command('site')
  .description('从 results/*.json 生成静态榜单页')
  .option('--dir <dir>', '结果目录，默认 results', 'results')
  .option('--out <file>', '输出 HTML，默认 site/index.html', 'site/index.html')
  .action(async (opts: Record<string, any>) => {
    try {
      const { renderSite } = await import('./render/site.js');
      const dir = path.resolve(opts.dir);
      const entries: Array<{ card: any; cardPath: string }> = [];
      if (await pathExists(dir)) {
        for (const f of await fsp.readdir(dir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const card = await readJson<SkillCardJson>(path.join(dir, f));
            if (card.schema_version) entries.push({ card, cardPath: path.join(dir, f) });
          } catch {
            /* 跳过非卡片文件 */
          }
        }
      }
      const out = path.resolve(opts.out);
      await ensureDir(path.dirname(out));

      /**
       * 两份页面，而不是一页塞一段 JS。
       *
       * 默认英文：榜单页是国际读者（HN / X / Reddit）落地看到的第一屏，中文那版
       * 挪到同目录的 zh-CN.html，两个文件互相 link + hreflang。静态站不需要脚本
       * 也能切语言，也方便搜索器分开索引。
       */
      const genAt = new Date().toISOString();
      const zhOut = path.join(path.dirname(out), 'zh-CN.html');
      await writeTextFile(out, renderSite(entries, { lang: 'en', generatedAt: genAt, altHref: './zh-CN.html' }));
      await writeTextFile(zhOut, renderSite(entries, { lang: 'zh-CN', generatedAt: genAt, altHref: './index.html' }));

      /**
       * 页面用的图要跟着页面走。Pages 只发布 site/ 这一个目录，
       * docs/assets/hero.svg 在那边不存在，所以生成时拷一份过去。
       */
      const heroSrc = path.resolve('docs/assets/hero.svg');
      if (await pathExists(heroSrc)) {
        const assetDir = path.join(path.dirname(out), 'assets');
        await ensureDir(assetDir);
        await fsp.copyFile(heroSrc, path.join(assetDir, 'hero.svg'));
      }

      /**
       * 机器可读的索引。榜单页给人看，这个给程序看：
       * 别人想自己做表、做图表、做对比，不必爬 HTML。
       */
      await writeJson(path.join(path.dirname(out), 'index.json'), {
        generated_at: new Date().toISOString(),
        protocol: PROTOCOL_VERSION,
        count: entries.length,
        cards: entries.map(({ card, cardPath }) => {
          const t1 = card.tier1;
          const sc = card.tier0.static_cost as { total_tokens?: number; budget?: { largest_skill_tokens?: number } } | undefined;
          return {
            repo: card.skill.repo,
            commit: card.skill.commit,
            taskset: t1?.taskset ?? null,
            grader_tier: t1?.grader_tier ?? null,
            n: t1?.n ?? null,
            uplift_pp: t1?.metrics.uplift_pp ?? null,
            headroom_closed: t1?.metrics.headroom_closed ?? null,
            placebo_effect_pp: t1?.metrics.placebo_effect_pp ?? null,
            raw_gain_pp: t1?.metrics.raw_gain_pp ?? null,
            ci95: t1?.metrics.ci95 ?? null,
            activation: t1?.activation ?? null,
            grade: card.verdict.grade,
            total_tokens: sc?.total_tokens ?? card.skill.total_tokens ?? null,
            largest_skill_tokens: sc?.budget?.largest_skill_tokens ?? null,
            flags: card.verdict.flags,
            card_file: path.relative(process.cwd(), cardPath).split(path.sep).join('/')
          };
        })
      });

      console.log(
        `${sym.ok} 榜单页写入 ${path.relative(process.cwd(), out)}（en）与 ${path.relative(
          process.cwd(),
          zhOut
        )}（zh-CN），共 ${entries.length} 张卡`
      );
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* ------------------------------------------------------------------ pool */

program
  .command('pool')
  .description('把多轮 run 合并成一份块估计（按题 bootstap 出区间）')
  .requiredOption('--db <paths>', '逗号分隔的 runs.db 列表，按时间顺序')
  .option('--format <fmt>', 'text | json', 'text')
  .option('--out <file>', '把 JSON 写到文件')
  .option('--iters <n>', 'bootstrap 次数，默认 20000', '20000')
  .action(async (opts: Record<string, any>) => {
    try {
      const dbs = String(opts.db)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (dbs.length === 0) throw new UpliftError('没有库可合并', '--db 是空的', '例：--db .uplift/a/runs.db,.uplift/b/runs.db');

      const rows: RunRow[] = [];
      const combos = new Set<string>();
      for (const p of dbs) {
        const abs = path.resolve(p);
        if (!(await pathExists(abs))) throw new UpliftError('库不存在', abs, '检查路径，或用 uplift run --out 生成的目录');
        const db = openStore(abs);
        const part = queryRuns(db);
        db.close();
        for (const r of part) {
          rows.push(r);
          let mode = 'auto';
          try {
            mode = JSON.parse(r.meta_json ?? '{}').activation_mode ?? mode;
          } catch {
            /* meta 坏了就不算条件差异 */
          }
          combos.add(`${r.taskset} · ${r.skill_repo} · ${mode}`);
        }
      }
      if (combos.size > 1) {
        warnLine(`这些库不是同一组条件，合并结果没有意义：`);
        for (const c2 of combos) console.log(`  ${c2}`);
      }

      const pooled = poolRuns(rows, { blocks: dbs.length, iters: Number(opts.iters) });
      const uplift = `${pooled.uplift_pp >= 0 ? '+' : ''}${pooled.uplift_pp.toFixed(1)}pp`;
      const ci = `[${pooled.ci95[0].toFixed(1)}, ${pooled.ci95[1].toFixed(1)}]`;
      const placebo = `${pooled.placebo_effect_pp >= 0 ? '+' : ''}${pooled.placebo_effect_pp.toFixed(1)}pp`;
      const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

      if (opts.out) await writeJson(path.resolve(opts.out), pooled);

      if (opts.format === 'json') {
        console.log(JSON.stringify(pooled, null, 2));
        process.exit(0);
      }

      console.log(heading(`合并 ${dbs.length} 轮 · ${pooled.task_count} 题 · 每臂 ${pooled.runs.treatment} 次 run`));
      const w = Math.max(6, ...pooled.tasks.map((t) => t.task_id.length));
      console.log(
        `  ${'题'.padEnd(w)}  ${'n'.padStart(5)}  ${'baseline'.padStart(8)}  ${'placebo'.padStart(7)}  ${'treatment'.padStart(9)}  ${'uplift'.padStart(8)}`
      );
      for (const t of pooled.tasks) {
        const u = `${t.uplift >= 0 ? '+' : ''}${(t.uplift * 100).toFixed(0)}pp`;
        console.log(
          `  ${t.task_id.padEnd(w)}  ${String(t.n.treatment).padStart(5)}  ${pct(t.rate.baseline).padStart(8)}  ${pct(
            t.rate.placebo
          ).padStart(7)}  ${pct(t.rate.treatment).padStart(9)}  ${u.padStart(8)}`
        );
      }
      console.log(`  ${'合计'.padEnd(w)}  ${String(pooled.runs.treatment).padStart(5)}  ${pct(pooled.rate.baseline).padStart(8)}  ${pct(
        pooled.rate.placebo
      ).padStart(7)}  ${pct(pooled.rate.treatment).padStart(9)}  ${(uplift).padStart(8)}`);
      console.log('');
      console.log(`  块 uplift   ${c.bold(uplift)}   95%CI ${ci}（按题 bootstrap，${opts.iters} 次）`);
      console.log(`  安慰剂效应  ${placebo}`);
      if (pooled.dropped.length > 0) {
        console.log(`  丢弃        ${pooled.dropped.join(', ')}（缺某一臂，不成对）`);
      }
      console.log('');
      console.log(c.dim('  区间按「题」重采样，不是按 run。重复次数压的是 run 抖动，题目之间的差异压不掉。'));
      process.exit(0);
    } catch (e) {
      fail(e);
    }
  });

/* -------------------------------------------------------------- inject CLI */

program
  .command('inject-selftest')
  .description('内部用：只跑注入语料的检测逻辑（不调模型）')
  .action(async () => {
    const res = await runInjectionResistance({ harness: createHarness('mock', {}), skills: [] });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  });

program.parseAsync(process.argv).catch((e) => fail(e));

export { program };
