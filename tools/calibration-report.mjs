/**
 * 标定报告：把 tasksets/<domain>/calibration.json 摊开看难度分布。
 *
 * 为什么需要它：`docs/13` 里那张难度表是手抄的，抄一次就过期一次。
 * 这个脚本直接从标定文件算，顺便回答一个关键问题，**有多少题的 baseline 已经 100%**，
 * 那些题在 uplift 里只贡献噪声（天花板效应）。
 *
 * 用法：
 *   node tools/calibration-report.mjs [tasksetDir]
 *   默认 tasksets/web-guidance
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const dir = positional[0] ?? 'tasksets/web-guidance';
const calPath = path.join(dir, 'calibration.json');
if (!fs.existsSync(calPath)) {
  console.error(`找不到 ${calPath}`);
  process.exit(1);
}
const cal = JSON.parse(fs.readFileSync(calPath, 'utf8'));
const taskset = JSON.parse(fs.readFileSync(path.join(dir, 'taskset.json'), 'utf8'));

const ids = Object.keys(cal.tasks ?? {}).sort();
const titleOf = new Map((taskset.tasks ?? []).map((t) => [t.id, t.title ?? '']));
const tagsOf = new Map((taskset.tasks ?? []).map((t) => [t.id, t.tags ?? []]));

const buckets = { '0%': [], '1–49%': [], '50–99%': [], '100%': [] };
for (const id of ids) {
  const b = cal.tasks[id].baseline;
  if (b <= 0) buckets['0%'].push(id);
  else if (b < 0.5) buckets['1–49%'].push(id);
  else if (b < 1) buckets['50–99%'].push(id);
  else buckets['100%'].push(id);
}

console.log(`标定文件 ${calPath}`);
console.log(`  measured_at ${cal.measured_at ?? '?'} · model ${cal.model ?? '?'} · harness ${cal.harness ?? '?'} · repeats ${cal.repeats ?? '?'}`);
const inTaskset = (taskset.tasks ?? []).length;
console.log(`  标定题目 ${ids.length} / 任务集 ${inTaskset}${ids.length < inTaskset ? '  ⚠️ 有题没标定' : ''}`);

console.log('\n难度分布');
for (const [k, list] of Object.entries(buckets)) {
  const pct = ids.length === 0 ? 0 : (list.length / ids.length) * 100;
  console.log(`  ${k.padEnd(7)} ${String(list.length).padStart(3)} 题 (${pct.toFixed(0)}%)`);
}

const saturated = buckets['100%'];
if (saturated.length > 0) {
  const share = (saturated.length / Math.max(1, ids.length)) * 100;
  console.log(`\n⚠️ 天花板：${saturated.length} 题 baseline=100%，占 ${share.toFixed(0)}%。`);
  console.log('   这些题在 uplift 里只贡献噪声，treatment 再好也上不去。');
}

const missing = (taskset.tasks ?? []).map((t) => t.id).filter((id) => !cal.tasks?.[id]);
if (missing.length > 0) {
  console.log(`\n未标定：${missing.join(', ')}`);
}

if (flags.has('--list')) {
  console.log('\n逐题');
  for (const id of ids) {
    const b = cal.tasks[id].baseline;
    const tags = tagsOf.get(id) ?? [];
    console.log(`  ${id}  ${(b * 100).toFixed(0).padStart(4)}%  ${titleOf.get(id) ?? ''}${tags.length ? '  #' + tags.join(' #') : ''}`);
  }
}
