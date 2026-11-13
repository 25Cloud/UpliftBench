/**
 * 用 schema/skillcard.schema.json 校验 results/ 下的所有卡。
 * CI 里应当有这一步：卡片是唯一的对外产物，它必须先合法再谈好看。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillCardJson } from '../src/taskset/validate.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, process.argv[2] ?? 'results');

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
let failed = 0;
for (const f of files) {
  const card = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const res = await validateSkillCardJson(card);
  if (res.ok) {
    console.log(`✓ ${f}`);
  } else {
    failed += 1;
    console.log(`✗ ${f}\n  ${res.errors.slice(0, 6).join('\n  ')}`);
  }
}
console.log(failed === 0 ? `\n全部 ${files.length} 张卡通过 schema 校验` : `\n${failed} 张卡不合法`);
process.exit(failed === 0 ? 0 : 1);
