import type { SkillShapeProbe, SkillShapeSkill } from '../types.js';
import type { InstalledSkill } from '../harness/types.js';
import { countTokens } from '../tokenize.js';

/**
 * 探针 7：技能形状（skill-shape）
 *
 * 回答的问题：**这个包的「写法」本身是不是在拖自己的后腿。**
 *
 * 为什么需要它：同样的内容，写法不同，效果差一个量级。
 * 一个技能写得再好，如果 SKILL.md 本身 3 万 token，它要么根本进不了上下文（预算），
 * 要么把预算吃光让别的技能挤不进来；如果 description 只有 "帮助处理文件" 这种废话，
 * 模型根本不会想到去激活它。
 *
 * 三个结构指标（全部可复现、零模型调用）：
 *
 * 1. **frontmatter 质量**：有没有 YAML frontmatter、有没有 name + description。
 *    没有 description 的技能，在「目录」里等于不存在，模型看不到它就不会激活。
 * 2. **description token 数**：太短（<20 tok）说明没说清什么时候该用；太长（>200 tok）
 *    是在目录里塞正文，会把别的技能的曝光挤掉。
 * 3. **按需加载比例**：正文 tokens 占该技能全部 tokens 的比例。好技能通常是
 *    「短正文 + references/ 按需读」；坏技能是「一个 8k 的大 SKILL.md 全塞进去」。
 */
export interface SkillShapeOptions {
  skills: InstalledSkill[];
  /** 正文多少 token 以上算「巨石单文件」（默认 6000） */
  monolithTokens?: number;
  /** description 低于这个 token 数算「说不清」（默认 20） */
  thinDescriptionTokens?: number;
  /** description 高于这个 token 数算「目录塞正文」（默认 200） */
  fatDescriptionTokens?: number;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** 从 SKILL.md 正文里抽 frontmatter 的字段（只做很浅的解析，够用） */
export function parseFrontmatter(body: string): { has: boolean; fields: Record<string, string> } {
  const m = body.match(FRONTMATTER);
  if (!m) return { has: false, fields: {} };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    fields[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { has: true, fields };
}

/** 正文去掉 frontmatter 之后的部分（「真进上下文的指导内容」） */
function bodyWithoutFrontmatter(body: string): string {
  return body.replace(FRONTMATTER, '');
}

export function runSkillShape(opts: SkillShapeOptions): SkillShapeProbe {
  const monolithLimit = opts.monolithTokens ?? 6_000;
  const thin = opts.thinDescriptionTokens ?? 20;
  const fat = opts.fatDescriptionTokens ?? 200;

  if (opts.skills.length === 0) {
    return {
      probe: 'skill-shape',
      supported: false,
      reason: '包里没有可识别的技能（找不到 SKILL.md）',
      skill_count: 0,
      frontmatter_rate: 0,
      described_rate: 0,
      deferred_share: 0,
      monolith_share: 0,
      body_tokens_p50: 0,
      description_tokens_p50: 0,
      skills: [],
      warnings: []
    };
  }

  const rows: SkillShapeSkill[] = opts.skills.map((s) => {
    const fm = parseFrontmatter(s.body);
    const rawBody = bodyWithoutFrontmatter(s.body);
    const bodyTokens = countTokens(rawBody);
    const description = (fm.fields.description ?? s.description ?? '').trim();
    const descriptionTokens = countTokens(description);
    // 技能总 token = 正文 + 它声明的按需资源（静态开销探针已经算过总量，这里只按正文与文件名估）
    const total = Math.max(bodyTokens, s.tokens);
    return {
      name: s.name,
      body_tokens: bodyTokens,
      description_tokens: descriptionTokens,
      resources: s.resources?.length ?? 0,
      has_frontmatter: fm.has,
      has_name: Boolean(fm.fields.name),
      has_description: description.length > 0,
      defer_ratio: total === 0 ? 0 : Math.round((bodyTokens / total) * 1000) / 1000
    };
  });

  const p50 = (values: number[]): number => {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
  };

  const withFm = rows.filter((r) => r.has_frontmatter).length;
  const withDesc = rows.filter((r) => r.has_description).length;
  // 「按需加载」：正文占比 <= 50% 且确实有 resources
  const deferred = rows.filter((r) => r.defer_ratio <= 0.5 && r.resources > 0).length;
  // 「巨石」：正文超阈值且没有任何按需资源
  const monolith = rows.filter((r) => r.body_tokens >= monolithLimit && r.resources === 0).length;

  const warnings: string[] = [];
  if (withFm < rows.length) warnings.push(`${rows.length - withFm} 个技能缺 YAML frontmatter`);
  if (withDesc < rows.length) warnings.push(`${rows.length - withDesc} 个技能没有 description`);
  const thinCount = rows.filter((r) => r.description_tokens > 0 && r.description_tokens < thin).length;
  if (thinCount > 0) warnings.push(`${thinCount} 个技能的 description 短于 ${thin} tok（说不清什么时候该用）`);
  const fatCount = rows.filter((r) => r.description_tokens > fat).length;
  if (fatCount > 0) warnings.push(`${fatCount} 个技能的 description 超过 ${fat} tok（在目录里塞正文）`);
  if (monolith > 0) warnings.push(`${monolith} 个技能是「巨石单文件」（正文 ≥ ${monolithLimit} tok 且无按需资源）`);

  return {
    probe: 'skill-shape',
    supported: true,
    skill_count: rows.length,
    frontmatter_rate: round3(withFm / rows.length),
    described_rate: round3(withDesc / rows.length),
    deferred_share: round3(deferred / rows.length),
    monolith_share: round3(monolith / rows.length),
    body_tokens_p50: p50(rows.map((r) => r.body_tokens)),
    description_tokens_p50: p50(rows.map((r) => r.description_tokens)),
    skills: rows.sort((a, b) => b.body_tokens - a.body_tokens),
    warnings
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
