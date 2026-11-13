import path from 'node:path';
import fsp from 'node:fs/promises';
import type { SkillCardJson, SkillShapeProbe, StaticCostProbe } from '../types.js';
import { ensureDir } from '../util/fsx.js';
import { signed1, trim1 } from '../util/num.js';
import { upliftColor } from './badge.js';
import { activationModeLabel } from './card.js';

export interface SiteCardEntry {
  card: SkillCardJson;
  cardPath: string;
  badgePath?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 百分点，一位小数、零不带符号（+0pp 看着像有增益） */
function pct(n: number): string {
  return `${signed1(n)}pp`;
}

function row(card: SkillCardJson): string {
  const t1 = card.tier1;
  if (!t1) {
    /**
     * Tier 0 行：不排名，但要让人一眼看到「贵在哪」。
     * 只报包内总量是不够的，一个 1.2M 的检索型知识库和一个 1.2M 的单技能巨石，
     * 性质完全不同。所以这里同时给 largest skill 与形状。
     */
    const sc = card.tier0.static_cost as StaticCostProbe | undefined;
    const sh = card.tier0.skill_shape as SkillShapeProbe | undefined;
    const largest = sc?.budget?.largest_skill_tokens ?? 0;
    const bits: string[] = [];
    if (largest > 0) bits.push(`largest skill ${largest.toLocaleString('en-US')} tok`);
    if (sh?.supported) {
      bits.push(`${sh.skill_count} skill${sh.skill_count === 1 ? '' : 's'} · defer ${Math.round(sh.deferred_share * 100)}%`);
    }
    if (card.verdict.flags.includes('retrieval_style_package')) bits.push('retrieval-style package');
    if (card.verdict.flags.includes('monolith_skill')) bits.push('monolithic skill');
    return `<tr class="tier0">
      <td class="repo">${esc(card.skill.repo)}</td>
      <td colspan="6" class="muted">Tier 0 only · ${(card.skill.total_tokens ?? 0).toLocaleString('en-US')} tok · ${
        bits.length > 0 ? esc(bits.join(' · ')) + ' · ' : ''
      }不进主榜（无任务集）</td>
      <td class="grade">—</td>
    </tr>`;
  }
  const m = t1.metrics;
  const color = upliftColor(m.uplift_pp);
  const flag = m.placebo_effect_pp > m.uplift_pp ? ' ⚠️' : '';
  const act = t1.activation ? `${(t1.activation.rate * 100).toFixed(0)}%` : '—';
  return `<tr>
      <td class="repo">${esc(card.skill.repo)}<span class="commit">@${esc(card.skill.commit.slice(0, 7))}</span></td>
      <td class="num" style="color:${color};font-weight:600">${pct(m.uplift_pp)}${flag}</td>
      <td class="num">${trim1(m.headroom_closed * 100)}%</td>
      <td class="num">${pct(m.placebo_effect_pp)}</td>
      <td class="num">[${trim1(m.ci95[0])}, ${trim1(m.ci95[1])}]</td>
      <td class="num">${act}</td>
      <td class="num">${t1.n}</td>
      <td class="grade">${card.verdict.grade === 'unrated' ? t1.grader_tier : card.verdict.grade}</td>
    </tr>`;
}

/** 静态榜单页（docs/11 Q12 默认值：纯 HTML，不引后端/构建器） */
export function renderSite(entries: SiteCardEntry[], generatedAt = new Date().toISOString()): string {
  const withTier1 = entries.filter((e) => e.card.tier1);
  const tier0Only = entries.filter((e) => !e.card.tier1);
  withTier1.sort((a, b) => (b.card.tier1!.metrics.uplift_pp ?? 0) - (a.card.tier1!.metrics.uplift_pp ?? 0));

  /**
   * 分组键带上激活条件。
   *
   * 为什么必须带：同一道题、同一个模型，`--activation auto` 与 `forced` 会给出
   * 完全不同的 uplift（−2.5pp vs +5.6pp）。把两种条件混进一张表，等于把
   * 两个实验的数字排在一起比大小，那是错的。分开列，读者才能对上号。
   */
  interface Group {
    taskset: string;
    tier: string;
    mode: 'auto' | 'forced';
    list: SiteCardEntry[];
  }
  const groups = new Map<string, Group>();
  for (const e of withTier1) {
    const t1 = e.card.tier1!;
    const mode = t1.activation?.mode ?? 'auto';
    const key = `${t1.taskset}\u0000${t1.grader_tier}\u0000${mode}`;
    const g = groups.get(key) ?? { taskset: t1.taskset, tier: t1.grader_tier, mode, list: [] };
    g.list.push(e);
    groups.set(key, g);
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (a.taskset !== b.taskset) return a.taskset < b.taskset ? -1 : 1;
    if (a.tier !== b.tier) return a.tier < b.tier ? -1 : 1;
    return a.mode === b.mode ? 0 : a.mode === 'auto' ? -1 : 1;
  });

  const sections: string[] = [];
  for (const g of ordered) {
    const hint =
      g.mode === 'forced'
        ? '技能正文直接注入 system prompt，安慰剂按等 token 对齐'
        : '模型自己决定是否触发技能（协议默认）';
    sections.push(`<h2>${esc(g.taskset)} · ${esc(g.tier)}级 · ${esc(activationModeLabel(g.mode))}<span class="cond">${esc(hint)}</span></h2>
    <table>
      <thead><tr><th>技能包</th><th>uplift</th><th>headroom</th><th>placebo</th><th>95%CI</th><th>激活率</th><th>N</th><th>等级</th></tr></thead>
      <tbody>${g.list.map((e) => row(e.card)).join('\n')}</tbody>
    </table>`);
  }
  if (tier0Only.length > 0) {
    sections.push(`<h2>Tier 0 · 事实查询（不排名）</h2>
    <table>
      <thead><tr><th>技能包</th><th colspan="6">探针结果</th><th>等级</th></tr></thead>
      <tbody>${tier0Only.map((e) => row(e.card)).join('\n')}</tbody>
    </table>`);
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>UpliftBench · 技能包净增益榜</title>
<style>
  :root { color-scheme: light dark; --fg:#1f2328; --muted:#656d76; --line:#d0d7de; --bg:#fff; --accent:#2ea44f; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e6edf3; --muted:#8b949e; --line:#30363d; --bg:#0d1117; } }
  * { box-sizing: border-box; }
  body { margin:0 auto; max-width: 980px; padding: 48px 20px 80px; font: 15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif; color:var(--fg); background:var(--bg); }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -0.02em; }
  .tag { color: var(--muted); margin-bottom: 28px; }
  h2 { font-size: 17px; margin: 36px 0 10px; font-weight: 600; }
  table { width:100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.grade { text-align: center; font-weight: 600; }
  .commit { color: var(--muted); font-size: 12px; margin-left: 6px; }
  .muted { color: var(--muted); }
  .note { margin-top: 40px; padding: 16px 18px; border:1px solid var(--line); border-radius: 8px; color: var(--muted); font-size: 13px; }
  code { background: color-mix(in srgb, var(--line) 45%, transparent); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  .row-accent { color: var(--accent); }
  .cond { display:block; margin-top:4px; font-weight:400; font-size:12px; color:var(--muted); letter-spacing:0; text-transform:none; }
</style>
</head>
<body>
  <h1>UpliftBench</h1>
  <div class="tag">技能包的净增益基准，减去安慰剂之后，你的技能包还剩多少。</div>
  ${sections.join('\n')}
  <div class="note">
    <strong>怎么读这张表</strong><br/>
    <code>uplift</code> = treatment − <em>placebo</em>（不是减 baseline）。<code>headroom</code> 是填掉了多少剩余空间；<code>placebo</code> 列是「上下文变长本身值多少分」。<br/>
    <code>激活率</code> = placebo + treatment 两臂里技能真的进了上下文的 run 占比。<b>低的激活率会让 uplift 天然趋近 0</b>，技能没进上下文，treatment 就是 baseline。<br/>
    <b>自动激活</b>与<b>强制注入</b>是两种实验条件，同一个技能包可能各有一行，不许互相比较，也不许只挑好看的那个。<br/>
    A 级（可执行验证）与 B 级（固定版本 LLM judge）分组显示，不并排排名：用不同尺子量出来的身高不能排在一起。<br/>
    ⚠️ = 安慰剂效应大于净增益，说明分数主要来自长度。<br/>
    生成于 ${esc(generatedAt)} · <code>protocol/1.0.0</code>
  </div>
</body>
</html>`;
}

export async function writeSite(outFile: string, entries: SiteCardEntry[]): Promise<void> {
  await ensureDir(path.dirname(outFile));
  await fsp.writeFile(outFile, renderSite(entries), 'utf8');
}
