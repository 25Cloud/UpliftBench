/**
 * 横向评测汇总：把 .uplift/review/*.json 里的探针结果摊成一张表。
 *
 * 为什么单独一个脚本：这类表一周要重生成好几次，手抄必错。
 * 只读事实（tokens / 形状 / 卸载），不碰模型，所以可以随时重跑。
 *
 * 用法：node tools/review-table.mjs [--dir=.uplift/review] [--md]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dirArg = args.find((a) => a.startsWith('--dir='))?.split('=')[1] ?? '.uplift/review';
const asMarkdown = args.includes('--md');

/** 展示名 + star 数（star 是抓这条数据时的快照，写进文档时要注明日期） */
const META = {
  'anthropics-skills': { name: 'anthropics/skills', stars: '193.9k' },
  'mattpocock-skills': { name: 'mattpocock/skills', stars: '323.4k' },
  'ecc': { name: 'affaan-m/ECC', stars: '302.2k' },
  'karpathy-skills': { name: 'multica-ai/andrej-karpathy-skills', stars: '232.7k' },
  'obsidian-skills': { name: 'obsidianmd/obsidian-skills', stars: '52.2k' },
  'humanizer-zh': { name: 'op7418/Humanizer-zh', stars: '22.7k' },
  'khazix-skills': { name: 'KKKKhazix/khazix-skills', stars: '22.2k' },
  'agent-skills': { name: 'addyosmani/agent-skills', stars: '—' },
  'modern-web-guidance': { name: 'GoogleChrome/modern-web-guidance-src', stars: '—' },
  'security-audit-skill': { name: 'cloudflare/security-audit-skill', stars: '—' },
  'hallmark': { name: 'Nutlope/hallmark', stars: '—' },
  'superpowers': { name: 'obra/superpowers', stars: '317.0k' }
};

const files = fs.readdirSync(dirArg).filter((f) => f.endsWith('.json'));
const rows = [];
for (const f of files) {
  const id = f.replace(/\.json$/, '');
  const card = JSON.parse(fs.readFileSync(path.join(dirArg, f), 'utf8'));
  const sc = card.tier0?.static_cost;
  const ss = card.tier0?.skill_shape;
  const uc = card.tier0?.uninstall_clean;
  if (!sc?.supported) continue;
  const meta = META[id] ?? { name: card.skill.repo, stars: '—' };
  rows.push({
    id,
    name: meta.name,
    stars: meta.stars,
    skills: sc.skill_count,
    files: sc.file_count,
    tokens: sc.total_tokens,
    ctx: sc.context_tokens,
    largest: sc.budget.largest_skill_tokens,
    basis: sc.budget.basis,
    over: sc.budget.over_pct,
    dup: sc.total_tokens > 0 ? (sc.duplicates.reduce((s, d) => s + d.wasted_tokens, 0) / sc.total_tokens) * 100 : 0,
    fm: ss?.supported ? ss.frontmatter_rate * 100 : null,
    desc: ss?.supported ? ss.described_rate * 100 : null,
    defer: ss?.supported ? ss.deferred_share * 100 : null,
    bodyP50: ss?.supported ? ss.body_tokens_p50 : null,
    descP50: ss?.supported ? ss.description_tokens_p50 : null,
    // 目录成本：所有技能的 description 加起来，不激活任何技能也要付这笔账
    catalog: ss?.supported ? ss.skills.reduce((s, k) => s + k.description_tokens, 0) : null,
    clean: uc?.supported ? uc.clean : null
  });
}

// 按「最大单技能」排序：这才是「一激活就爆预算」的风险排序
rows.sort((a, b) => b.largest - a.largest);

const pct = (v) => (v === null ? '—' : `${Math.round(v)}%`);

if (asMarkdown) {
  console.log('| package | stars | skills | pkg tokens | ctx tokens | largest skill | catalog | budget basis | over | duplicated | body p50 | defer-loaded | uninstall |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| \`${r.name}\` | ${r.stars} | ${r.skills} | ${r.tokens.toLocaleString('en-US')} | ${r.ctx.toLocaleString('en-US')} | ${r.largest.toLocaleString('en-US')} | ${r.catalog ?? '—'} | ${r.basis === 'package' ? 'package' : 'largest skill'} | ${Math.round(r.over)}% | ${Math.round(r.dup)}% | ${r.bodyP50 ?? '—'} | ${pct(r.defer)} | ${r.clean === null ? '—' : r.clean ? 'clean' : 'residue'} |`
    );
  }
} else {
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(42)} skills=${String(r.skills).padStart(4)}  largest=${String(r.largest).padStart(7)}  over=${String(Math.round(r.over)).padStart(5)}%  defer=${pct(r.defer).padStart(4)}  dup=${Math.round(r.dup)}%`
    );
  }
}
console.log(`\n${rows.length} 个包 · star 数与仓库结构快照于 2026-11-13`);
