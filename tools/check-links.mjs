/**
 * 链接体检：扫仓库里所有 markdown 的相对链接，报出指向不存在文件的那些。
 * 用法：node tools/check-links.mjs [dir...]
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
const targets = roots.length > 0 ? roots : ['.'];

const mdFiles = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.uplift') continue;
    const abs = path.join(dir, name);
    // benchmarks/skills 是第三方面包的克隆（.gitignore 里），它们自己的死链不归我们管
    if (path.normalize(abs) === path.normalize(path.join('benchmarks', 'skills'))) continue;
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs);
    else if (name.endsWith('.md')) mdFiles.push(abs);
  }
}
for (const t of targets) walk(t);

const broken = [];
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
for (const file of mdFiles) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = LINK.exec(text)) !== null) {
    let href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
    const clean = href.split('#')[0];
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(clean));
    if (!fs.existsSync(resolved)) broken.push({ file, href });
  }
}

if (broken.length === 0) {
  console.log(`✓ ${mdFiles.length} 个 markdown 文件，相对链接全部有效`);
  process.exit(0);
}
console.error(`✗ ${broken.length} 个坏链接：`);
for (const b of broken) console.error(`  ${b.file} → ${b.href}`);
process.exit(1);
