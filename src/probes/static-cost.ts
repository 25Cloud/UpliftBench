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
  /** 会进上下文（md/json/yaml/txt）还是只是随包脚本 */
  context: boolean;
}

/** 会真正注入模型上下文的扩展名；其余按「随包脚本」计 */
const CONTEXT_EXTENSIONS = new Set(['.md', '.markdown', '.json', '.yaml', '.yml', '.txt']);

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
        context_tokens: 0,
        tokenizer: TOKENIZER_ID,
        file_count: 0,
        skill_count: 0,
        per_file: [],
        budget: {
          limit: budget,
          basis: 'package',
          subject_tokens: 0,
          over_by: 0,
          over_pct: 0,
          package_over_by: 0,
          largest_skill_tokens: 0
        },
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
    const rel = relPath(root, abs);
    entries.push({
      path: rel,
      tokens: countTokens(text),
      bytes: Buffer.byteLength(text, 'utf8'),
      hash: contentHash(text),
      text,
      context: CONTEXT_EXTENSIONS.has(path.extname(rel).toLowerCase())
    });
  }

  const totalTokens = entries.reduce((s, f) => s + f.tokens, 0);
  const contextTokens = entries.filter((f) => f.context).reduce((s, f) => s + f.tokens, 0);

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

  const overBy = Math.max(0, contextTokens - budget);
  const wasted = duplicates.reduce((s, d) => s + d.wasted_tokens, 0);

  /**
   * 预算口径：10,000 token 是「一次技能注入」的预算，不是「整包」的预算。
   * 25 个技能的包总共 100k token 很正常——agent 一次只激活一两个。
   * 所以多技能包的判定基准取**最大的单个技能**（最坏情况激活成本）。
   */
  const largestSkill = pkg.skills.reduce((m, s) => Math.max(m, s.tokens), 0);
  const budgetBasis: 'package' | 'largest_skill' = pkg.skills.length > 1 ? 'largest_skill' : 'package';
  const budgetSubject = budgetBasis === 'largest_skill' ? largestSkill : contextTokens;
  const budgetOverBy = Math.max(0, budgetSubject - budget);

  if (budgetOverBy > 0) {
    warnings.push(
      budgetBasis === 'largest_skill'
        ? `最大的单个技能 ${largestSkill} token，超出注入预算 ${budget}（+${budgetOverBy}）`
        : `注入上下文 ${contextTokens} token，超出预算 ${budget}（+${budgetOverBy}）`
    );
  }
  if (totalTokens > contextTokens) {
    const scriptTokens = totalTokens - contextTokens;
    if (scriptTokens / Math.max(1, totalTokens) > 0.3) {
      warnings.push(
        `包内脚本占 ${scriptTokens} token（${((scriptTokens / totalTokens) * 100).toFixed(0)}%），它们不进上下文`
      );
    }
  }
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
    context_tokens: contextTokens,
    tokenizer: TOKENIZER_ID,
    file_count: entries.length,
    skill_count: pkg.skills.length,
    per_file: entries
      .map((e) => ({ path: e.path, tokens: e.tokens, bytes: e.bytes }))
      .sort((a, b) => b.tokens - a.tokens),
    budget: {
      limit: budget,
      basis: budgetBasis,
      /** 判定用的那个数（整包上下文 或 最大单技能） */
      subject_tokens: budgetSubject,
      over_by: budgetOverBy,
      over_pct: budget > 0 ? Number(((budgetOverBy / budget) * 100).toFixed(1)) : 0,
      package_over_by: overBy,
      largest_skill_tokens: largestSkill
    },
    duplicates,
    structure,
    warnings
  };
}
