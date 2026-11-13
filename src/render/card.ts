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
  StaticCostProbe,
  TriggerPrecisionProbe,
  UninstallCleanProbe
} from '../types.js';

const pad = (label: string) => label.padEnd(8);

/** 两种激活条件的人话名字。auto 是协议默认（模型自己决定触发），forced 是审计用的强制注入。 */
export function activationModeLabel(mode: 'auto' | 'forced'): string {
  return mode === 'forced' ? '强制注入' : '自动激活';
}

/** 激活率的简短说明，卡片正文与榜单页共用 */
export function activationSummary(a: ActivationStats): string {
  const parts = [`${activationModeLabel(a.mode)} ${(a.rate * 100).toFixed(0)}%`];
  if (a.preloaded_tokens_p50) parts.push(`中位注入 ${humanInt(a.preloaded_tokens_p50)} tok`);
  return parts.join(' · ');
}

function flag(v: boolean, text: string): string {
  return v ? `${c.yellow(sym.warn)} ${text}` : text;
}

export function renderStaticCostText(p: StaticCostProbe): string[] {
  const out: string[] = [];
  const budgetOver = p.budget.over_by > 0;
  const ctx = p.context_tokens ?? p.total_tokens;
  const basisNote =
    p.budget.basis === 'largest_skill'
      ? `按最大单技能判定（${humanInt(p.budget.largest_skill_tokens)} tok；整包 ${humanInt(ctx)}）`
      : `注入上下文 ${humanInt(ctx)} tok`;
  out.push(
    `  ${pad('静态开销')} ${c.bold(humanInt(p.total_tokens))} tok ${c.dim('包内合计')}   ${
      budgetOver ? c.yellow(`${sym.warn} 超预算 ${p.budget.over_pct}%`) : c.green('在预算内')
    }`
  );
  out.push(`  ${pad('')} ${c.dim(`└ ${basisNote}，预算 ${humanInt(p.budget.limit)}`)}`);
  const dupWaste = p.duplicates.reduce((s, d) => s + d.wasted_tokens, 0);
  if (p.total_tokens > 0) {
    out.push(
      `  ${pad('')} ${c.dim(`└ 重复内容 ${humanInt(dupWaste)} tok (${((dupWaste / p.total_tokens) * 100).toFixed(1)}%)`)}`
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
      `  ${pad('')} ${c.dim('└')} ${c.dim(`(另外 ${rest} 个文件)`.padEnd(30))} ${humanInt(restTokens).padStart(7)}`
    );
  }
  out.push(`  ${pad('')} ${c.dim(`tokenizer ${p.tokenizer}（近似，非精确分词）`)}`);
  return out;
}

export function renderTriggerText(p: TriggerPrecisionProbe): string[] {
  if (!p.supported) return [`  ${pad('触发精度')} ${c.dim(`unsupported · ${p.reason ?? 'harness 不暴露技能激活事件'}`)}`];
  const f = (v: number | null) => (v === null ? 'n/a' : v.toFixed(2));
  return [
    `  ${pad('触发精度')} P ${f(p.precision)} / R ${f(p.recall)} / F1 ${f(p.f1)}   ${c.dim(`n+ ${p.n_positive} / n- ${p.n_negative}`)}`
  ];
}

export function renderConstraintText(p: ConstraintFollowingProbe): string[] {
  if (!p.supported) return [`  ${pad('约束遵循')} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const tested = p.constraints.filter((x) => x.testable).length;
  const rate = p.violation_rate === null ? 'n/a' : `${(p.violation_rate * 100).toFixed(1)}%`;
  return [
    `  ${pad('约束遵循')} 抽出 ${p.constraints.length} 条（可测 ${tested}），违规率 ${rate}   ${c.dim(`n_checked ${p.n_checked}`)}`
  ];
}

export function renderInjectionText(p: InjectionResistanceProbe): string[] {
  if (!p.supported) return [`  ${pad('注入抗性')} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const tail = p.delta > 0 ? c.yellow(`${sym.warn} 技能增加了注入风险`) : c.green('与 baseline 持平');
  return [
    `  ${pad('注入抗性')} ${p.total} 例，被劫持 ${p.hijacked} 例（baseline ${p.baseline_hijacked}）   ${tail}`
  ];
}

export function renderNegativeTransferText(p: NegativeTransferProbe): string[] {
  if (!p.supported) return [`  ${pad('负迁移')} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const sign = p.delta_pp >= 0 ? '+' : '';
  const ci = `CI [${p.ci95[0].toFixed(1)}, ${p.ci95[1].toFixed(1)}]`;
  return [`  ${pad('负迁移')} ${sign}${p.delta_pp.toFixed(1)}pp  ${c.dim(`${ci}  n=${p.n}`)}`];
}

export function renderUninstallText(p: UninstallCleanProbe): string[] {
  if (!p.supported) return [`  ${pad('可卸载')} ${c.dim(`unsupported · ${p.reason ?? ''}`)}`];
  const head = p.clean ? c.green('干净') : c.yellow(`${sym.warn} 有残留`);
  const lines = [`  ${pad('可卸载')} ${head}`];
  for (const leak of p.leaked_paths.slice(0, 5)) lines.push(`  ${pad('')} ${c.dim('└ 残留')} ${leak}`);
  if (p.leaked_paths.length > 5) lines.push(`  ${pad('')} ${c.dim(`└ 另有 ${p.leaked_paths.length - 5} 处`)}`);
  return lines;
}

export function renderProbeText(p: ProbeResult): string[] {
  switch (p.probe) {
    case 'static-cost':
      return renderStaticCostText(p as StaticCostProbe);
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
  const lines: string[] = [];
  const rule = '─'.repeat(54);
  lines.push(`SkillCard  ${c.bold(card.skill.repo)}   ${c.dim(card.tier1 ? '' : '[Tier 0]')}`.trimEnd());
  lines.push(c.gray(rule));
  const order = [
    'static_cost',
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
      `  ${pad('Tier 1')} uplift ${signed1(m.uplift_pp)}pp / headroom ${trim1(m.headroom_closed * 100)}%   ${c.dim(`95%CI ${ci} · N=${card.tier1.n} · placebo ${signed1(m.placebo_effect_pp)}pp`)}`
    );
    if (card.tier1.activation) {
      const a = card.tier1.activation;
      const perArm =
        a.by_arm && (a.by_arm.treatment !== undefined || a.by_arm.placebo !== undefined)
          ? `（treatment ${((a.by_arm.treatment ?? 0) * 100).toFixed(0)}% / placebo ${((a.by_arm.placebo ?? 0) * 100).toFixed(0)}%）`
          : '';
      lines.push(`  ${pad('激活')} ${c.bold(activationSummary(a))}${c.dim(perArm)}`);
      if (a.mode === 'auto' && a.rate < 0.5) {
        lines.push(`  ${pad('')} ${c.yellow(`${sym.warn} 大半 run 没触发技能，这个 uplift 主要反映「肯不肯调工具」`)}`);
      }
    }
  } else {
    lines.push(`  ${pad('Tier 1')} ${c.dim('未测（需任务集）')}`);
  }
  if (card.verdict.flags.length > 0) {
    lines.push(`  ${pad('标记')} ${card.verdict.flags.map((f) => c.yellow(f)).join('  ')}`);
  }
  return lines.join('\n');
}

/** markdown 版：能直接贴进 GitHub PR / README */
export function renderCardMarkdown(card: SkillCardJson): string {
  const out: string[] = [];
  out.push(`## SkillCard · \`${card.skill.repo}\``);
  out.push('');
  out.push('| 项 | 结果 |');
  out.push('|---|---|');
  const sc = card.tier0.static_cost as StaticCostProbe | undefined;
  if (sc?.supported) {
    out.push(
      `| 静态开销 | ${humanInt(sc.total_tokens)} tok 包内合计 · 预算口径 ${
        sc.budget.basis === 'largest_skill' ? `最大单技能 ${humanInt(sc.budget.largest_skill_tokens)}` : `整包 ${humanInt(sc.context_tokens ?? sc.total_tokens)}`
      } ${sc.budget.over_by > 0 ? `⚠️ 超预算 ${sc.budget.over_pct}%` : '✅'} |`
    );
  }
  const tp = card.tier0.trigger_precision as TriggerPrecisionProbe | undefined;
  if (tp) out.push(`| 触发精度 | ${tp.supported ? `P ${tp.precision?.toFixed(2)} / R ${tp.recall?.toFixed(2)} / F1 ${tp.f1?.toFixed(2)}` : 'unsupported'} |`);
  const cf = card.tier0.constraint_following as ConstraintFollowingProbe | undefined;
  if (cf)
    out.push(
      `| 约束遵循 | ${cf.supported ? `${cf.constraints.length} 条规则，违规 ${(cf.violations ?? []).length} 条` : 'unsupported'} |`
    );
  const ir = card.tier0.injection_resistance as InjectionResistanceProbe | undefined;
  if (ir) out.push(`| 注入抗性 | ${ir.supported ? `${ir.total} 例，被劫持 ${ir.hijacked}（baseline ${ir.baseline_hijacked}）` : 'unsupported'} |`);
  const nt = card.tier0.negative_transfer as NegativeTransferProbe | undefined;
  if (nt)
    out.push(
      `| 负迁移 | ${nt.supported ? `${nt.delta_pp >= 0 ? '+' : ''}${nt.delta_pp.toFixed(1)}pp CI [${nt.ci95[0].toFixed(1)}, ${nt.ci95[1].toFixed(1)}] n=${nt.n}` : 'unsupported'} |`
    );
  const uc = card.tier0.uninstall_clean as UninstallCleanProbe | undefined;
  if (uc) out.push(`| 可卸载 | ${uc.supported ? (uc.clean ? '干净' : `残留 ${uc.leaked_paths.length} 处`) : 'unsupported'} |`);
  if (card.tier1) {
    const m = card.tier1.metrics;
    out.push(
      `| Tier 1 | uplift ${signed1(m.uplift_pp)}pp · headroom ${trim1(m.headroom_closed * 100)}% · N=${card.tier1.n} · 95%CI [${trim1(m.ci95[0])}, ${trim1(m.ci95[1])}] · ${card.tier1.grader_tier} 级 · placebo ${signed1(m.placebo_effect_pp)}pp |`
    );
    if (card.tier1.activation) {
      out.push(`| 技能激活 | ${activationSummary(card.tier1.activation)} |`);
    }
  } else {
    out.push('| Tier 1 | 未测（需任务集） |');
  }
  out.push('');
  out.push(`> ${card.verdict.headline} · ${card.protocol_version} · 生成于 ${card.generated_at}`);
  return out.join('\n');
}

export function renderBytes(n: number): string {
  return humanBytes(n);
}

export function basenameNoExt(p: string): string {
  return p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? p;
}
