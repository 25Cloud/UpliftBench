import path from 'node:path';
import { contentHash, readTextFile, relPath } from '../util/fsx.js';
import { countTokens, TOKENIZER_ID } from '../tokenize.js';
import { loadSkillPackage, type SkillPackage } from '../skill/package.js';
import { UpliftError } from '../util/log.js';
import type { StaticCostProbe } from '../types.js';
import { DEFAULT_BUDGET_TOKENS } from '../version.js';

export interface StaticCostOptions {
  budget?: number;
  singleFileWarn?: number;
  duplicateWarnPct?: number;
}

interface FileEntry {
  path: string;
  tokens: number;
  bytes: number;
  hash: string;
  text: string;
}

/** 探针 1：静态开销（docs/03 §探针 1） */
export async function runStaticCost(root: string, opts: StaticCostOptions = {}): Promise<StaticCostProbe> {
  const budget = opts.budget ?? DEFAULT_BUDGET_TOKENS;
  const singleFileWarn = opts.singleFileWarn ?? 5_000;
  const duplicateWarnPct = opts.duplicateWarnPct ?? 10;

  let pkg: SkillPackage;
  try {
    pkg = await loadSkillPackage(root);
  } catch (e) {
    if (e instanceof UpliftError) {
      return {
        probe: 'static-cost',
        supported: false,
        reason: e.what,
        total_tokens: 0,
        tokenizer: TOKENIZER_ID,
        file_count: 0,
        skill_count: 0,
        per_file: [],
        budget: { limit: budget, over_by: 0, over_pct: 0 },
        duplicates: [],
        structure: { headings: 0, lists: 0, code_blocks: 0 },
        warnings: [e.what]
      };
    }
    throw e;
  }

  const entries: FileEntry[] = [];
  for (const abs of pkg.files) {
    const text = await readTextFile(abs);
    entries.push({
      path: relPath(root, abs),
      tokens: countTokens(text),
      bytes: Buffer.byteLength(text, 'utf8'),
      hash: contentHash(text),
      text
    });
  }

  const totalTokens = entries.reduce((s, f) => s + f.tokens, 0);

  // 重复内容：同哈希归组，wasted = 组内除第一份外的全部 token
  const byHash = new Map<string, FileEntry[]>();
  for (const e of entries) {
    const list = byHash.get(e.hash) ?? [];
    list.push(e);
    byHash.set(e.hash, list);
  }
  const duplicates: StaticCostProbe['duplicates'] = [];
  for (const [hash, group] of byHash) {
    if (group.length < 2) continue;
    const wasted = group.slice(1).reduce((s, g) => s + g.tokens, 0);
    if (wasted <= 0) continue;
    duplicates.push({ hash: hash.slice(0, 6), files: group.map((g) => g.path), wasted_tokens: wasted });
  }
  duplicates.sort((a, b) => b.wasted_tokens - a.wasted_tokens);

  const structure = { headings: 0, lists: 0, code_blocks: 0 };
  for (const e of entries) {
    if (!e.path.endsWith('.md') && !e.path.endsWith('.markdown')) continue;
    structure.headings += (e.text.match(/^#{1,6}\s+\S/gm) ?? []).length;
    structure.lists += (e.text.match(/^\s*(?:[-*+]|\d+\.)\s+\S/gm) ?? []).length;
    structure.code_blocks += Math.floor((e.text.match(/^\s*```/gm) ?? []).length / 2);
  }

  const warnings: string[] = [];
  const bigFiles = entries.filter((e) => e.tokens > singleFileWarn);
  for (const f of bigFiles.sort((a, b) => b.tokens - a.tokens).slice(0, 5)) {
    warnings.push(`${f.path} 超过 ${singleFileWarn} token（${f.tokens}），多数 harness 会截断`);
  }
  if (bigFiles.length > 5) warnings.push(`另有 ${bigFiles.length - 5} 个文件超单文件预算`);

  const overBy = Math.max(0, totalTokens - budget);
  const wasted = duplicates.reduce((s, d) => s + d.wasted_tokens, 0);
  if (overBy > 0) warnings.push(`总开销 ${totalTokens} 超出预算 ${budget}（+${overBy}）`);
  if (totalTokens > 0 && (wasted / totalTokens) * 100 > duplicateWarnPct) {
    warnings.push(`重复内容 ${wasted} token，占 ${((wasted / totalTokens) * 100).toFixed(1)}%（阈值 ${duplicateWarnPct}%）`);
  }
  if (pkg.skills.length > 3) {
    warnings.push(`${pkg.skills.length} 个技能模块，SkillsBench 结论是 ≤3 个模块更优`);
  }

  return {
    probe: 'static-cost',
    supported: true,
    total_tokens: totalTokens,
    tokenizer: TOKENIZER_ID,
    file_count: entries.length,
    skill_count: pkg.skills.length,
    per_file: entries
      .map((e) => ({ path: e.path, tokens: e.tokens, bytes: e.bytes }))
      .sort((a, b) => b.tokens - a.tokens),
    budget: {
      limit: budget,
      over_by: overBy,
      over_pct: budget > 0 ? Number(((overBy / budget) * 100).toFixed(1)) : 0
    },
    duplicates,
    structure,
    warnings
  };
}
