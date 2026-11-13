#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CASES = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const input = JSON.parse(readFileSync(0, 'utf8'));
try {
  const mod = await import(pathToFileURL(path.join(input.workspace, 'solution.js')).href);
  const fn = mod.solve ?? mod.default;
  if (typeof fn !== 'function') {
    console.log(JSON.stringify({ pass: false, detail: 'solution.js 没有导出 solve 函数' }));
    process.exit(0);
  }
  let failed = 0;
  const notes = [];
  for (const c of CASES) {
    let actual;
    try {
      actual = fn(...c.args);
    } catch (e) {
      failed += 1;
      notes.push(`${JSON.stringify(c.args)} 抛错：${e.message}`);
      continue;
    }
    if (JSON.stringify(actual) !== JSON.stringify(c.expected)) {
      failed += 1;
      notes.push(`${JSON.stringify(c.args)} 期望 ${JSON.stringify(c.expected)} 实际 ${JSON.stringify(actual)}`);
    }
  }
  console.log(
    JSON.stringify({
      pass: failed === 0,
      detail: failed === 0 ? `${CASES.length}/${CASES.length} 通过` : notes.slice(0, 3).join('; '),
      metrics: { cases: CASES.length, failed }
    })
  );
} catch (e) {
  console.log(JSON.stringify({ pass: false, detail: '加载 solution.js 失败：' + e.message }));
}
