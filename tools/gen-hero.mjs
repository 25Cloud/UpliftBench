/**
 * 生成 docs/assets/hero.svg —— README 顶部那张图。
 *
 * 为什么用脚本而不是手画：这张图上的每个数字都来自实测，改数字时必须能一起改，
 * 而不是留一张"看起来专业"的旧图。数字与出处写在 NUMBERS 里，改的时候去 docs/16 对照。
 *
 * 用法：node tools/gen-hero.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * 数字来源（改这里之前先去核对）：
 *   A 组 = docs/15 §二（48 题 ITT，auto 激活，720 次 run）
 *   B 组 = docs/16 §九（5 题 × 3 臂 × 10 重复 = 150 次 run，forced 激活）
 *   累计 = 所有 .uplift/*.db 汇总
 */
const NUMBERS = {
  a: {
    label: 'Experiment A · 48 tasks · agent decides whether to load the skill',
    baseline: 73.75,
    placebo: 73.75,
    treatment: 71.25,
    uplift: '−2.5pp',
    note: 'uplift −2.5pp · placebo ±0',
    tone: '#d73a49'
  },
  b: {
    label: 'Experiment B · 5 tasks · skill forced into context',
    baseline: 34,
    placebo: 32,
    treatment: 68,
    uplift: '+36pp',
    note: 'uplift +36pp · placebo −2pp',
    tone: '#1a7f37'
  },
  footer: '1,829 runs · 64 tasks · 5 real skill packages · 1 model · protocol/1.0.0'
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function panel(x, y, w, d) {
  const barW = w - 210;
  const rows = [
    ['baseline', d.baseline, '#8c959f'],
    ['placebo', d.placebo, '#bf8700'],
    ['treatment', d.treatment, '#2ea44f']
  ];
  const out = [];
  out.push(`<text x="${x}" y="${y}" font-size="13" fill="#57606a" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(d.label)}</text>`);
  rows.forEach(([name, value, color], i) => {
    const ry = y + 30 + i * 34;
    const len = Math.max(2, Math.round((value / 100) * barW));
    const isTreat = name === 'treatment';
    out.push(`<text x="${x}" y="${ry + 14}" font-size="13" fill="#1f2328" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${name}</text>`);
    out.push(`<rect x="${x + 92}" y="${ry}" width="${len}" height="19" rx="3" fill="${color}" opacity="${isTreat ? 1 : 0.55}"/>`);
    out.push(`<text x="${x + 92 + len + 8}" y="${ry + 14}" font-size="13" font-weight="600" fill="#1f2328" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${value}%</text>`);
  });
  const ay = y + 30 + 3 * 34 + 4;
  out.push(`<text x="${x}" y="${ay + 12}" font-size="15" font-weight="700" fill="${d.tone}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(d.note)}</text>`);
  return out.join('\n');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="356" viewBox="0 0 1200 356" role="img" aria-label="UpliftBench three-arm results. Experiment A: baseline 73.75, placebo 73.75, treatment 71.25, uplift -2.5pp. Experiment B: baseline 34, placebo 32, treatment 68, uplift +36pp with a -2pp placebo.">
  <title>UpliftBench · three arm results</title>
  <rect x="0.5" y="0.5" width="1199" height="355" rx="12" fill="#ffffff" stroke="#d0d7de"/>
  <text x="36" y="46" font-size="21" font-weight="700" fill="#1f2328" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Same skill. Same model. The only difference is whether it gets loaded.</text>
  <text x="36" y="72" font-size="13" fill="#57606a" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">A length-matched placebo arm separates "more context helps" from "this skill's knowledge helps".</text>
  <line x1="36" y1="90" x2="1164" y2="90" stroke="#d8dee4"/>
${panel(36, 122, 540, NUMBERS.a)}
<line x1="600" y1="112" x2="600" y2="272" stroke="#d8dee4"/>
${panel(636, 122, 540, NUMBERS.b)}
  <line x1="36" y1="296" x2="1164" y2="296" stroke="#d8dee4"/>
  <text x="36" y="322" font-size="12" fill="#57606a" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(NUMBERS.footer)}</text>
  <text x="1164" y="322" text-anchor="end" font-size="12" fill="#8c959f" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">upliftbench</text>
</svg>
`;

const outDir = path.join('docs', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'hero.svg');
fs.writeFileSync(outFile, svg, 'utf8');
console.log(`写出 ${outFile}（${svg.length} 字节）`);
