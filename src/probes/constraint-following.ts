import path from 'node:path';
import type { Harness, InstalledSkill } from '../harness/types.js';
import type { ConstraintFollowingProbe } from '../types.js';
import { withTempWorkspace } from './util.js';

export interface ExtractedConstraint {
  id: string;
  text: string;
  kind: 'forbid' | 'require';
  testable: boolean;
  pattern?: string;
}

const IMPERATIVE = /(?:^|\n)[ \t]*(?:[-*+]|\d+\.)?[ \t]*(never|always|must|do not|don'?t|avoid|prefer|use|禁止|必须|不要|务必|切勿)([^\n]{3,180})/gi;

/**
 * 约束抽取（docs/11 Q7 默认值：规则优先）。
 *
 * 只抽「祈使句 + 绝对化词」，再从同一句里挖一个可机检的 pattern
 * （反引号代码 > 引号短语 > 带点/下划线/驼峰的标识符 > 全大写常量）。
 * 挖不到 pattern 的就标 testable: false —— 这类占比过高本身就是技能包的缺陷。
 */
export function extractConstraints(bodies: string[], sourceName: string): ExtractedConstraint[] {
  const out: ExtractedConstraint[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const body of bodies) {
    for (const m of body.matchAll(IMPERATIVE)) {
      const word = m[1].toLowerCase();
      const rest = m[2].trim();
      const text = `${m[1]} ${rest}`.replace(/\s+/g, ' ').slice(0, 200);
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const kind: 'forbid' | 'require' =
        /^(never|do not|don'?t|avoid|禁止|不要|切勿)$/.test(word) ? 'forbid' : 'require';
      const pattern = extractPattern(rest);
      idx += 1;
      out.push({
        id: `${sourceName}-c${idx}`,
        text,
        kind,
        testable: Boolean(pattern && pattern.length >= 2),
        pattern
      });
    }
  }
  return out;
}

function extractPattern(text: string): string | undefined {
  const backtick = text.match(/`([^`]{2,60})`/);
  if (backtick) return backtick[1].trim();
  const quoted = text.match(/["“]([^"”]{2,60})["”]/);
  if (quoted) return quoted[1].trim();
  const dotted = text.match(/\b([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){1,4})\b/);
  if (dotted) return dotted[1];
  const call = text.match(/\b([a-zA-Z_][\w]*)\(\)/);
  if (call) return call[1];
  const constant = text.match(/\b([A-Z][A-Z0-9_]{3,})\b/);
  if (constant) return constant[1];
  return undefined;
}

export interface ConstraintFollowingOptions {
  skills: InstalledSkill[];
  harness: Harness;
  /** 用来跑验证的任务：prompt + 预置文件 */
  tasks: Array<{ id: string; prompt: string; files: Record<string, string> }>;
  maxConstraints?: number;
  timeoutMs?: number;
}

export async function runConstraintFollowing(opts: ConstraintFollowingOptions): Promise<ConstraintFollowingProbe> {
  const constraints = extractConstraints(opts.skills.map((s) => s.body), opts.skills[0]?.name ?? 'skill');
  if (constraints.length === 0) {
    return {
      probe: 'constraint-following',
      supported: false,
      reason: 'SKILL.md 里没抽到任何 never/always/must/禁止/必须 形态的祈使约束',
      constraints: [],
      violations: [],
      violation_rate: null,
      n_checked: 0
    };
  }
  if (!opts.harness.supportsActivationEvents) {
    return {
      probe: 'constraint-following',
      supported: false,
      reason: `${opts.harness.name} 不暴露技能激活事件，无法确认技能真的生效`,
      constraints,
      violations: [],
      violation_rate: null,
      n_checked: 0
    };
  }
  const testable = constraints.filter((c) => c.testable).slice(0, opts.maxConstraints ?? 40);
  if (testable.length === 0) {
    return {
      probe: 'constraint-following',
      supported: false,
      reason: `${constraints.length} 条约束全部不可机检（testable=false）`,
      constraints,
      violations: [],
      violation_rate: null,
      n_checked: 0
    };
  }

  const violations: Array<{ constraint_id: string; task: string; evidence: string }> = [];
  let checked = 0;

  for (const task of opts.tasks) {
    const corpus = await withTempWorkspace(task.files, async (dir) => {
      const before = await snapshot(dir);
      let runText = '';
      try {
        const run = await opts.harness.run(
          { cwd: dir, skills: opts.skills, model: '' },
          { prompt: task.prompt, maxSteps: 8, timeoutMs: opts.timeoutMs ?? 150_000 }
        );
        runText = `${run.finalText}\n${run.events.map((e) => JSON.stringify(e)).join('\n')}`;
      } catch {
        runText = '';
      }
      const after = await snapshot(dir);
      const changed: string[] = [];
      for (const [rel, content] of after) {
        if (before.get(rel) !== content) changed.push(`${rel}\n${content}`);
      }
      return `${runText}\n${changed.join('\n')}`;
    });

    for (const c of testable) {
      if (!c.pattern) continue;
      checked += 1;
      const hit = corpus.includes(c.pattern);
      if (c.kind === 'forbid' && hit) {
        violations.push({ constraint_id: c.id, task: task.id, evidence: `出现被禁止的 "${c.pattern}"` });
      }
      if (c.kind === 'require' && !hit) {
        violations.push({ constraint_id: c.id, task: task.id, evidence: `没有出现要求的 "${c.pattern}"` });
      }
    }
  }

  return {
    probe: 'constraint-following',
    supported: true,
    constraints,
    violations: violations.slice(0, 100),
    violation_rate: checked === 0 ? null : Math.round((violations.length / checked) * 1000) / 1000,
    n_checked: checked
  };
}

async function snapshot(dir: string): Promise<Map<string, string>> {
  const { walkFiles } = await import('../util/fsx.js');
  const { readTextFile } = await import('../util/fsx.js');
  const map = new Map<string, string>();
  const files = await walkFiles(dir, { skipDirs: ['.git', 'node_modules'] });
  for (const f of files) {
    const rel = path.relative(dir, f).split(path.sep).join('/');
    try {
      map.set(rel, await readTextFile(f));
    } catch {
      /* 二进制跳过 */
    }
  }
  return map;
}
