/**
 * 生成 GitHub Social preview 图（1280×640）。GitHub 推荐就是这个尺寸，
 * 分享到 X / HN / Slack 时显示的那张卡。
 *
 * 用法：node tools/gen-social.mjs
 * 位图：npx --yes sharp-cli -i docs/assets/social-preview.svg -o docs/assets/social-preview.png
 *
 * 图上的数字与 README、docs/15、docs/16 一致，改数字请一起改。
 */
import fs from 'node:fs';
import path from 'node:path';

const NUMBERS = [
  { value: '−2.50pp', label: 'agent decides when to load it', tone: '#f85149' },
  { value: '+5.56pp', label: 'skill forced into context', tone: '#3fb950' },
  { value: '+36pp', label: 'prompt withholds the API name', tone: '#3fb950' }
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cols = NUMBERS.map((n, i) => {
  const x = 96 + i * 400;
  return `<text x="${x}" y="424" font-size="64" font-weight="700" fill="${n.tone}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(n.value)}</text>
  <text x="${x}" y="458" font-size="20" fill="#8b949e" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${esc(n.label)}</text>`;
}).join('\n  ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-label="UpliftBench: a placebo-corrected benchmark for Agent Skills">
  <rect width="1280" height="640" fill="#0d1117"/>
  <rect x="0" y="0" width="1280" height="6" fill="#2ea44f"/>
  <text x="96" y="150" font-size="30" fill="#8b949e" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">UpliftBench</text>
  <text x="96" y="232" font-size="52" font-weight="700" fill="#e6edf3" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Every skill claims it helps.</text>
  <text x="96" y="300" font-size="52" font-weight="700" fill="#e6edf3" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">We run the placebo arm.</text>
  <text x="96" y="340" font-size="22" fill="#8b949e" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">uplift = treatment − placebo</text>
  ${cols}
  <line x1="96" y1="506" x2="1184" y2="506" stroke="#30363d"/>
  <text x="96" y="546" font-size="20" fill="#8b949e" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">1,829 runs · 12 skill packages · every number with N and a 95% CI</text>
  <text x="96" y="592" font-size="20" fill="#58a6ff" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">github.com/25Cloud/UpliftBench</text>
</svg>
`;

const out = path.join('docs', 'assets', 'social-preview.svg');
fs.writeFileSync(out, svg, 'utf8');
console.log(`写出 ${out}（${svg.length} 字节）`);
