import path from 'node:path';
import fsp from 'node:fs/promises';
import type { SkillCardJson } from '../types.js';
import { ensureDir } from '../util/fsx.js';
import { upliftColor } from './badge.js';

export interface SiteCardEntry {
  card: SkillCardJson;
  cardPath: string;
  badgePath?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(0)}pp`;
}

function row(card: SkillCardJson): string {
  const t1 = card.tier1;
  if (!t1) {
    return `<tr class="tier0">
      <td class="repo">${esc(card.skill.repo)}</td>
      <td colspan="5" class="muted">Tier 0 only · ${(card.skill.total_tokens ?? 0).toLocaleString('en-US')} tok · 不进主榜（无任务集）</td>
      <td class="grade">—</td>
    </tr>`;
  }
  const m = t1.metrics;
  const color = upliftColor(m.uplift_pp);
  const flag = m.placebo_effect_pp > m.uplift_pp ? ' ⚠️' : '';
  return `<tr>
      <td class="repo">${esc(card.skill.repo)}<span class="commit">@${esc(card.skill.commit.slice(0, 7))}</span></td>
      <td class="num" style="color:${color};font-weight:600">${pct(m.uplift_pp)}${flag}</td>
      <td class="num">${(m.headroom_closed * 100).toFixed(0)}%</td>
      <td class="num">${pct(m.placebo_effect_pp)}</td>
      <td class="num">[${m.ci95[0].toFixed(0)}, ${m.ci95[1].toFixed(0)}]</td>
      <td class="num">${t1.n}</td>
      <td class="grade">${card.verdict.grade === 'unrated' ? t1.grader_tier : card.verdict.grade}</td>
    </tr>`;
}

/** 静态榜单页（docs/11 Q12 默认值：纯 HTML，不引后端/构建器） */
export function renderSite(entries: SiteCardEntry[], generatedAt = new Date().toISOString()): string {
  const withTier1 = entries.filter((e) => e.card.tier1);
  const tier0Only = entries.filter((e) => !e.card.tier1);
  withTier1.sort((a, b) => (b.card.tier1!.metrics.uplift_pp ?? 0) - (a.card.tier1!.metrics.uplift_pp ?? 0));

  const byTier = new Map<string, SiteCardEntry[]>();
  for (const e of withTier1) {
    const key = `${e.card.tier1!.taskset} · ${e.card.tier1!.grader_tier}级`;
    const list = byTier.get(key) ?? [];
    list.push(e);
    byTier.set(key, list);
  }

  const sections: string[] = [];
  for (const [key, list] of byTier) {
    sections.push(`<h2>${esc(key)}</h2>
    <table>
      <thead><tr><th>技能包</th><th>uplift</th><th>headroom</th><th>placebo</th><th>95%CI</th><th>N</th><th>等级</th></tr></thead>
      <tbody>${list.map((e) => row(e.card)).join('\n')}</tbody>
    </table>`);
  }
  if (tier0Only.length > 0) {
    sections.push(`<h2>Tier 0 · 事实查询（不排名）</h2>
    <table>
      <thead><tr><th>技能包</th><th colspan="5">探针结果</th><th>等级</th></tr></thead>
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
</style>
</head>
<body>
  <h1>UpliftBench</h1>
  <div class="tag">技能包的净增益基准 —— 减去安慰剂之后，你的技能包还剩多少。</div>
  ${sections.join('\n')}
  <div class="note">
    <strong>怎么读这张表</strong><br/>
    <code>uplift</code> = treatment − <em>placebo</em>（不是减 baseline）。<code>headroom</code> 是填掉了多少剩余空间；<code>placebo</code> 列是「上下文变长本身值多少分」。<br/>
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
