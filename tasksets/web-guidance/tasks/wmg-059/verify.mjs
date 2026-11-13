#!/usr/bin/env node
// 自动生成：web-guidance A 级评分器
// stdin: {"task_id":"...","workspace":"..."}
// stdout: {"pass":bool,"detail":"...","metrics":{...}}
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const RULES = JSON.parse(readFileSync(new URL('./rules.json', import.meta.url), 'utf8'));
const input = JSON.parse(readFileSync(0, 'utf8'));
const ws = input.workspace;

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.htm', '.css', '.json', '.md', '.txt']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.uplift-skills') continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (TEXT_EXT.has(path.extname(abs).toLowerCase())) out.push(abs);
  }
  return out;
}

const files = walk(ws);
if (files.length === 0) {
  console.log(JSON.stringify({ pass: false, detail: 'workspace 里没有任何源文件' }));
  process.exit(0);
}
const corpus = files.map((f) => readFileSync(f, 'utf8')).join('\n');

const remaining = [];
for (const pattern of RULES.forbid) {
  const re = new RegExp(pattern, 'm');
  const m = corpus.match(re);
  if (m) remaining.push({ pattern, hit: m[0].trim().slice(0, 60) });
}
const missing = [];
for (const pattern of RULES.require) {
  const re = new RegExp(pattern, 'm');
  if (!corpus.match(re)) missing.push(pattern);
}

const pass = remaining.length === 0 && missing.length === 0;
const detail = pass
  ? '废弃用法已清除，现代写法已就位'
  : [
      remaining.length ? '仍存在：' + remaining.map((r) => `${r.pattern} => ${r.hit}`).join(' | ') : '',
      missing.length ? '缺少：' + missing.join(' | ') : ''
    ]
      .filter(Boolean)
      .join('；');

console.log(
  JSON.stringify({
    pass,
    detail,
    metrics: { forbidden_total: RULES.forbid.length, forbidden_remaining: remaining.length, missing: missing.length }
  })
);
