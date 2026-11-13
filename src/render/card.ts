import { humanInt, humanBytes } from '../util/fsx.js';
import { c, sym } from '../util/log.js';
import { signed1, trim1 } from '../util/num.js';
import type {
  ActivationStats,
  ConstraintFollowingProbe,
  InjectionResistanceProbe,
  NegativeTransferProbe,
  ProbeResult,
  SkillCardJson,
  SkillShapeProbe,
  StaticCostProbe,
  TriggerPrecisionProbe,
  UninstallCleanProbe
} from '../types.js';

/** 标签列宽：中文 8 显示宽度够用，英文要宽一些（否则 "static cost" 会顶到数值上） */
const pad = (label: string) => label.padEnd(LANG === 'en' ? 12 : 8);

/* ---------------------------------------------------------------- 双语输出 --
 *
 * 为什么有这一层：这个基准的读者一半在中文社区、一半在英文社区。
 * 文档可以是中文（docs/ 全是），但**终端输出**必须两边都能读——不然英文 README 里
 * 贴一张中文卡，看起来就像半成品。
 *
 * 默认中文（保持与历史文档里引用的输出一致），`UPLIFT_LANG=en` 或 `--lang en` 切英文。
 * 注意：只翻译「人读的标签」，JSON 字段名一律不动（那是数据契约）。
 */
export type Lang = 'zh' | 'en';

let LANG: Lang = /^en/i.test(process.env.UPLIFT_LANG ?? '') ? 'en' : 'zh';

export function setLang(lang: Lang): void {
  LANG = lang;
}

export function getLang(): Lang {
  return LANG;
}

const zh = {
  cost: '静态开销',
  packageTotal: '包内合计',
  overBudget: (pct: number) => `超预算 ${pct}%`,
  inBudget: '在预算内',
  basisLargest: (largest: string, whole: string) => `按最大单技能判定（${largest} tok；整包 ${whole}）`,
  basisContext: (ctx: string) => `注入上下文 ${ctx} tok`,
  budgetLine: (basis: string, limit: string) => `${basis}，预算 ${limit}`,
  dupLine: (tok: string, pct: string) => `重复内容 ${tok} tok (${pct}%)`,
  moreFiles: (n: number) => `(另外 ${n} 个文件)`,
  tokenizer: (id: string) => `tokenizer ${id}（近似，非精确分词）`,
  trigger: '触发精度',
  triggerUnsupported: 'harness 不暴露技能激活事件',
  shape: '技能形状',
  shapeLine: (n: number, fm: number, desc: number, defer: number) =>
    `${n} 个技能 · frontmatter ${fm}% · 有 description ${desc}% · 按需加载 ${defer}%`,
  shapeDetail: (body: string, desc: string) => `正文中位 ${body} tok · description 中位 ${desc} tok`,
  constraint: '约束遵循',
  constraintLine: (total: number, testable: number, rate: string) => `抽出 ${total} 条（可测 ${testable}），违规率 ${rate}`,
  injection: '注入抗性',
  injectionLine: (total: number, hijacked: number, baseline: number) => `${total} 例，被劫持 ${hijacked} 例（baseline ${baseline}）`,
  injectionWorse: '技能增加了注入风险',
  injectionSame: '与 baseline 持平',
  negative: '负迁移',
  uninstall: '可卸载',
  clean: '干净',
  dirty: '有残留',
  leaked: '残留',
  moreLeaks: (n: number) => `另有 ${n} 处`,
  tier1: 'Tier 1',
  untested: '未测（需任务集）',
  activation: '激活',
  auto: '自动激活',
  forced: '强制注入',
  medianInjected: (tok: string) => `中位注入 ${tok} tok`,
  lowActivation: '大半 run 没触发技能，这个 uplift 主要反映「肯不肯调工具」',
  flags: '标记',
  mdHeader: ['项', '结果'],
  mdCost: '静态开销',
  mdBasis: (x: string) => x,
  mdSkillBasisLargest: (tok: string) => `最大单技能 ${tok}`,
  mdSkillBasisWhole: (tok: string) => `整包 ${tok}`,
  mdTrigger: '触发精度',
  mdConstraint: '约束遵循',
  mdConstraintLine: (n: number, v: number) => `${n} 条规则，违规 ${v} 条`,
  mdInjection: '注入抗性',
  mdInjectionLine: (total: number, hijacked: number, baseline: number) => `${total} 例，被劫持 ${hijacked}（baseline ${baseline}）`,
  mdNegative: '负迁移',
  mdUninstall: '可卸载',
  mdResidue: (n: number) => `残留 ${n} 处`,
  mdActivation: '技能激活',
  mdGenerated: (at: string) => `生成于 ${at}`
};

const en = {
  cost: 'static cost',
  packageTotal: 'package total',
  overBudget: (pct: number) => `over budget by ${pct}%`,
  inBudget: 'within budget',
  basisLargest: (largest: string, whole: string) => `judged on the largest single skill (${largest} tok; ${whole} whole package)`,
  basisContext: (ctx: string) => `context injection ${ctx} tok`,
  budgetLine: (basis: string, limit: string) => `${basis}, budget ${limit}`,
  dupLine: (tok: string, pct: string) => `duplicated content ${tok} tok (${pct}%)`,
  moreFiles: (n: number) => `(+${n} more files)`,
  tokenizer: (id: string) => `tokenizer ${id} (approximation, not an exact tokenizer)`,
  trigger: 'trigger precision',
  triggerUnsupported: 'harness does not expose skill activation events',
  shape: 'skill shape',
  shapeLine: (n: number, fm: number, desc: number, defer: number) =>
    `${n} skills · frontmatter ${fm}% · has description ${desc}% · defer-loaded ${defer}%`,
  shapeDetail: (body: string, desc: string) => `body p50 ${body} tok · description p50 ${desc} tok`,
  constraint: 'constraint following',
  constraintLine: (total: number, testable: number, rate: string) =>
    `${total} constraints (${testable} testable), violation rate ${rate}`,
  injection: 'injection resistance',
  injectionLine: (total: number, hijacked: number, baseline: number) =>
    `${total} probes, ${hijacked} hijacked (baseline ${baseline})`,
  injectionWorse: 'skill increases injection risk',
  injectionSame: 'same as baseline',
  negative: 'negative transfer',
  uninstall: 'uninstall',
  clean: 'clean',
  dirty: 'residue left behind',
  leaked: 'leaked',
  moreLeaks: (n: number) => `+${n} more`,
  tier1: 'Tier 1',
  untested: 'not measured (needs a task set)',
  activation: 'activation',
  auto: 'auto',
  forced: 'forced',
  medianInjected: (tok: string) => `median injected ${tok} tok`,
  lowActivation: 'most runs never loaded the skill — this uplift mostly measures willingness to use a tool',
  flags: 'flags',
  mdHeader: ['field', 'result'],
  mdCost: 'static cost',
  mdBasis: (x: string) => x,
  mdSkillBasisLargest: (tok: string) => `largest single skill ${tok}`,
  mdSkillBasisWhole: (tok: string) => `whole package ${tok}`,
  mdTrigger: 'trigger precision',
  mdConstraint: 'constraint following',
  mdConstraintLine: (n: number, v: number) => `${n} constraints, ${v} violated`,
  mdInjection: 'injection resistance',
  mdInjectionLine: (total: number, hijacked: number, baseline: number) =>
    `${total} probes, ${hijacked} hijacked (baseline ${baseline})`,
  mdNegative: 'negative transfer',
  mdUninstall: 'uninstall',
  mdResidue: (n: number) => `${n} paths left behind`,
  mdActivation: 'skill activation',
  mdGenerated: (at: string) => `generated ${at}`
};

const T = () => (LANG === 'en' ? en : zh);

/** 两种激活条件的人话名字。auto 是协议默认（模型自己决定触发），forced 是审计用的强制注入。 */
export function activationModeLabel(mode: 'auto' | 'forced'): string {
  const t = T();
  return mode === 'forced' ? t.forced : t.auto;
}

/** 激活率的简短说明，卡片正文与榜单页共用 */
export function activationSummary(a: ActivationStats): string {
  const parts = [`${activationModeLabel(a.mode)} ${(a.rate * 100).toFixed(0)}%`];
  if (a.preloaded_tokens_p50) parts.push(T().medianInjected(humanInt(a.preloaded_tokens_p50)));
  return parts.join(' · ');
}

function flag(v: boolean, text: string): string {
  return v ? `${c.yellow(sym.warn)} ${text}` : text;
}

export function renderStaticCostText(p: StaticCostProbe): string[] {
  const t = T();
  const out: string[] = [];
  const budgetOver = p.budget.over_by > 0;
  const ctx = p.context_tokens ?? p.total_tokens;
  const basisNote =
    p.budget.basis === 'largest_skill'
      ? t.basisLargest(humanInt(p.budget.largest_skill_tokens), humanInt(ctx))
      : t.basisContext(humanInt(ctx));
  out.push(
    `  ${pad(t.cost)} ${c.bold(humanInt(p.total_tokens))} tok ${c.dim(t.packageTotal)}   ${
      budgetOver ? c.yellow(`${sym.warn} ${t.overBudget(p.budget.over_pct)}`) : c.green(t.inBudget)
    }`
  );
  out.push(`  ${pad('')} ${c.dim(`└ ${t.budgetLine(basisNote, humanInt(p.budget.limit))}`)}`);
  const dupWaste = p.duplicates.reduce((s, d) => s + d.wasted_tokens, 0);
  if (p.total_tokens > 0) {
    out.push(
      `  ${pad('')} ${c.dim(`└ ${t.dupLine(humanInt(dupWaste), ((dupWaste / p.total_tokens) * 100).toFixed(1))}`)}`
    );
  }
  const top = p.per_file.slice(0, 3);
  for (const f of top) {
    const big = f.tokens > 5000 ? `  ${c.yellow(`${sym.warn} >5000`)}` : '';
    out.push(`  ${pad('')} ${c.dim('├')} ${f.path.padEnd(34)} ${humanInt(f.tokens).padStart(7)}${big}`);
  }
  const rest = p.per_file.length - top.length;
  if (rest > 0) {
    const restTokens = p.per_file.slice(top.length).reduce((s, f) => s + f.tokens, 0);
    out.push(
      `  ${pad('')} ${c.dim('└')} ${c.dim(t.moreFiles(rest).padEnd(30))} ${humanInt(restTokens).padStart(7)}`
    );
  }
  out.push(`  ${pad('')} ${c.dim(t.tokenizer(p.tokenizer))}`);
  return out;
}

export function renderTriggerText(p: TriggerPrecisionProbe): string[] {
  const t = T();
  if (!p.supported) return [`  ${pad(t.trigger)} ${c.dim(`unsupported · ${p.reason ?? t.triggerUnsupported}`)}`];
  const f = (v: number | null) => (v === null ? 'n/a' : v.toFixed(2));
  return [
    `  ${pad(t.trigger)} P ${f(p.precision)} / R ${f(p.recall)} / F1 ${f(p.f1)}   ${c.dim(`n+ ${p.n_positive} / n- ${p.n_negative}`)}`
  ];
}

export function renderSkillShapeText(p: SkillShapeProbe): string[] {
  const t = T();
  if (!p.supported) {
    return [`  ${pad(t.shape)} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  }
  const pct = (v: number) => Math.round(v * 100);
  const out = [
    `  ${pad(t.shape)} ${t.shapeLine(p.skill_count, pct(p.frontmatter_rate), pct(p.described_rate), pct(p.deferred_share))}`
  ];
  out.push(`  ${pad('')} ${c.dim(`└ ${t.shapeDetail(humanInt(p.body_tokens_p50), humanInt(p.description_tokens_p50))}`)}`);
  for (const w of p.warnings.slice(0, 3)) {
    out.push(`  ${pad('')} ${c.yellow(`${sym.warn} ${w}`)}`);
  }
  return out;
}

export function renderConstraintText(p: ConstraintFollowingProbe): string[] {
  const t = T();
  if (!p.supported) return [`  ${pad(t.constraint)} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const tested = p.constraints.filter((x) => x.testable).length;
  const rate = p.violation_rate === null ? 'n/a' : `${(p.violation_rate * 100).toFixed(1)}%`;
  return [
    `  ${pad(t.constraint)} ${t.constraintLine(p.constraints.length, tested, rate)}   ${c.dim(`n_checked ${p.n_checked}`)}`
  ];
}

export function renderInjectionText(p: InjectionResistanceProbe): string[] {
  const t = T();
  if (!p.supported) return [`  ${pad(t.injection)} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const tail = p.delta > 0 ? c.yellow(`${sym.warn} ${t.injectionWorse}`) : c.green(t.injectionSame);
  return [
    `  ${pad(t.injection)} ${t.injectionLine(p.total, p.hijacked, p.baseline_hijacked)}   ${tail}`
  ];
}

export function renderNegativeTransferText(p: NegativeTransferProbe): string[] {
  const t = T();
  if (!p.supported) return [`  ${pad(t.negative)} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const sign = p.delta_pp >= 0 ? '+' : '';
  const ci = `CI [${p.ci95[0].toFixed(1)}, ${p.ci95[1].toFixed(1)}]`;
  return [`  ${pad(t.negative)} ${sign}${p.delta_pp.toFixed(1)}pp  ${c.dim(`${ci}  n=${p.n}`)}`];
}

export function renderUninstallText(p: UninstallCleanProbe): string[] {
  const t = T();
  if (!p.supported) return [`  ${pad(t.uninstall)} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const head = p.clean ? c.green(t.clean) : c.yellow(`${sym.warn} ${t.dirty}`);
  const lines = [`  ${pad(t.uninstall)} ${head}`];
  for (const leak of p.leaked_paths.slice(0, 5)) lines.push(`  ${pad('')} ${c.dim(`└ ${t.leaked}`)} ${leak}`);
  if (p.leaked_paths.length > 5) {
    lines.push(`  ${pad('')} ${c.dim(`└ ${t.moreLeaks(p.leaked_paths.length - 5)}`)}`);
  }
  return lines;
}

export function renderProbeText(p: ProbeResult): string[] {
  switch (p.probe) {
    case 'static-cost':
      return renderStaticCostText(p as StaticCostProbe);
    case 'skill-shape':
      return renderSkillShapeText(p as SkillShapeProbe);
    case 'trigger-precision':
      return renderTriggerText(p as TriggerPrecisionProbe);
    case 'constraint-following':
      return renderConstraintText(p as ConstraintFollowingProbe);
    case 'injection-resistance':
      return renderInjectionText(p as InjectionResistanceProbe);
    case 'negative-transfer':
      return renderNegativeTransferText(p as NegativeTransferProbe);
    case 'uninstall-clean':
      return renderUninstallText(p as UninstallCleanProbe);
    default:
      return [`  ${pad('?')} ${c.dim(JSON.stringify(p))}`];
  }
}

/** 完整 SkillCard 的终端渲染（docs/03 §Tier 0 产出格式） */
export function renderCardText(card: SkillCardJson): string {
  const t = T();
  const lines: string[] = [];
  const rule = '─'.repeat(54);
  lines.push(`SkillCard  ${c.bold(card.skill.repo)}   ${c.dim(card.tier1 ? '' : '[Tier 0]')}`.trimEnd());
  lines.push(c.gray(rule));
  const order = [
    'static_cost',
    'skill_shape',
    'trigger_precision',
    'constraint_following',
    'injection_resistance',
    'negative_transfer',
    'uninstall_clean'
  ] as const;
  for (const key of order) {
    const probe = card.tier0[key];
    if (!probe) continue;
    lines.push(...renderProbeText(probe));
  }
  lines.push(c.gray(rule));
  if (card.tier1) {
    const m = card.tier1.metrics;
    const ci = `[${trim1(m.ci95[0])}, ${trim1(m.ci95[1])}]`;
    lines.push(
      `  ${pad(t.tier1)} uplift ${signed1(m.uplift_pp)}pp / headroom ${trim1(m.headroom_closed * 100)}%   ${c.dim(`95%CI ${ci} · N=${card.tier1.n} · placebo ${signed1(m.placebo_effect_pp)}pp`)}`
    );
    if (card.tier1.activation) {
      const a = card.tier1.activation;
      const trPct = ((a.by_arm?.treatment ?? 0) * 100).toFixed(0);
      const plPct = ((a.by_arm?.placebo ?? 0) * 100).toFixed(0);
      const hasArms = a.by_arm && (a.by_arm.treatment !== undefined || a.by_arm.placebo !== undefined);
      const perArm = hasArms
        ? LANG === 'en'
          ? ` (treatment ${trPct}% / placebo ${plPct}%)`
          : `（treatment ${trPct}% / placebo ${plPct}%）`
        : '';
      lines.push(`  ${pad(t.activation)} ${c.bold(activationSummary(a))}${c.dim(perArm)}`);
      if (a.mode === 'auto' && a.rate < 0.5) {
        lines.push(`  ${pad('')} ${c.yellow(`${sym.warn} ${t.lowActivation}`)}`);
      }
    }
  } else {
    lines.push(`  ${pad(t.tier1)} ${c.dim(t.untested)}`);
  }
  if (card.verdict.flags.length > 0) {
    lines.push(`  ${pad(t.flags)} ${card.verdict.flags.map((f) => c.yellow(f)).join('  ')}`);
  }
  return lines.join('\n');
}

/** markdown 版：能直接贴进 GitHub PR / README */
export function renderCardMarkdown(card: SkillCardJson): string {
  const t = T();
  const out: string[] = [];
  out.push(`## SkillCard · \`${card.skill.repo}\``);
  out.push('');
  out.push(`| ${t.mdHeader[0]} | ${t.mdHeader[1]} |`);
  out.push('|---|---|');
  const sc = card.tier0.static_cost as StaticCostProbe | undefined;
  if (sc?.supported) {
    // 只有「按最大单技能判定」时才需要解释口径；整包口径下 total 就是上下文，说了是重复
    const basis =
      sc.budget.basis === 'largest_skill' ? ` · ${t.mdSkillBasisLargest(humanInt(sc.budget.largest_skill_tokens))}` : '';
    out.push(
      `| ${t.mdCost} | ${humanInt(sc.total_tokens)} tok ${t.packageTotal}${basis} ${
        sc.budget.over_by > 0 ? `⚠️ ${t.overBudget(sc.budget.over_pct)}` : '✅'
      } |`
    );
  }
  // 形状：说法层面的两行，放在成本之后、模型相关探针之前（它也是零模型调用的事实）
  const ss = card.tier0.skill_shape as SkillShapeProbe | undefined;
  if (ss?.supported) {
    const pct = (v: number) => Math.round(v * 100);
    out.push(
      `| ${t.shape} | ${t.shapeLine(ss.skill_count, pct(ss.frontmatter_rate), pct(ss.described_rate), pct(ss.deferred_share))} · ${t.shapeDetail(humanInt(ss.body_tokens_p50), humanInt(ss.description_tokens_p50))} |`
    );
  }
  const tp = card.tier0.trigger_precision as TriggerPrecisionProbe | undefined;
  if (tp) {
    out.push(
      `| ${t.mdTrigger} | ${tp.supported ? `P ${tp.precision?.toFixed(2)} / R ${tp.recall?.toFixed(2)} / F1 ${tp.f1?.toFixed(2)}` : 'unsupported'} |`
    );
  }
  const cf = card.tier0.constraint_following as ConstraintFollowingProbe | undefined;
  if (cf) {
    out.push(
      `| ${t.mdConstraint} | ${cf.supported ? t.mdConstraintLine(cf.constraints.length, (cf.violations ?? []).length) : 'unsupported'} |`
    );
  }
  const ir = card.tier0.injection_resistance as InjectionResistanceProbe | undefined;
  if (ir) {
    out.push(
      `| ${t.mdInjection} | ${ir.supported ? t.mdInjectionLine(ir.total, ir.hijacked, ir.baseline_hijacked) : 'unsupported'} |`
    );
  }
  const nt = card.tier0.negative_transfer as NegativeTransferProbe | undefined;
  if (nt) {
    out.push(
      `| ${t.mdNegative} | ${nt.supported ? `${nt.delta_pp >= 0 ? '+' : ''}${nt.delta_pp.toFixed(1)}pp CI [${nt.ci95[0].toFixed(1)}, ${nt.ci95[1].toFixed(1)}] n=${nt.n}` : 'unsupported'} |`
    );
  }
  const uc = card.tier0.uninstall_clean as UninstallCleanProbe | undefined;
  if (uc) {
    out.push(`| ${t.mdUninstall} | ${uc.supported ? (uc.clean ? t.clean : t.mdResidue(uc.leaked_paths.length)) : 'unsupported'} |`);
  }
  if (card.tier1) {
    const m = card.tier1.metrics;
    const grade = LANG === 'en' ? `grade ${card.tier1.grader_tier}` : `${card.tier1.grader_tier} 级`;
    out.push(
      `| ${t.tier1} | uplift ${signed1(m.uplift_pp)}pp · headroom ${trim1(m.headroom_closed * 100)}% · N=${card.tier1.n} · 95%CI [${trim1(m.ci95[0])}, ${trim1(m.ci95[1])}] · ${grade} · placebo ${signed1(m.placebo_effect_pp)}pp |`
    );
    if (card.tier1.activation) {
      out.push(`| ${t.mdActivation} | ${activationSummary(card.tier1.activation)} |`);
    }
  } else {
    out.push(`| ${t.tier1} | ${t.untested} |`);
  }
  out.push('');
  out.push(`> ${card.verdict.headline} · ${card.protocol_version} · ${t.mdGenerated(card.generated_at)}`);
  return out.join('\n');
}

export function renderBytes(n: number): string {
  return humanBytes(n);
}

export function basenameNoExt(p: string): string {
  return p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? p;
}
