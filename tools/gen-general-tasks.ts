/**
 * 生成 general-20 任务集（10 Python + 10 JS，A 级 tests 评分器）。
 *
 * 用途：探针 5（负迁移）与探针 6（卸载后的行为指纹）需要一批「与任何技能包领域无关」
 * 但**有确定性验证**的任务。所以这里刻意选基础算法题：没有网络、没有领域知识、
 * 答案唯一、跑得飞快。
 *
 * 期望值不是手写的，而是由生成器内置的参考实现**当场跑出来**再写进 verify 脚本，
 * 手写期望值是这类任务集最常见的错误来源。
 */
import path from 'node:path';
import os from 'node:os';
import fsMod from 'node:fs';
import fsp from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(root, 'tasksets', 'general-20');

/** 同 gen-web-guidance：fixture commit 只在已提交且干净时回填 */
function fixtureCommit(domain: string): string | undefined {
  const forced =
    process.argv.find((a) => a.startsWith('--commit='))?.split('=')[1] ?? process.env.UPLIFT_FIXTURE_COMMIT;
  if (forced && /^[0-9a-f]{7,40}$/.test(forced)) return forced;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (head.status !== 0) {
    console.log('  note: 仓库还没有提交，env.commit 先留空');
    return undefined;
  }
  const sha = head.stdout.trim();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return undefined;
  const status = spawnSync('git', ['status', '--porcelain', '--', `tasksets/${domain}`], {
    cwd: root,
    encoding: 'utf8'
  });
  if (status.status !== 0 || status.stdout.trim() !== '') {
    console.log(`  note: tasksets/${domain} 有未提交改动，env.commit 先留空（提交后重跑本命令回填）`);
    return undefined;
  }
  return sha;
}

interface GeneralTask {
  id: string;
  lang: 'py' | 'js';
  title: string;
  prompt: string;
  signature: string;
  /** 参考实现（只在生成期跑，不写进 fixture） */
  ref: string;
  cases: unknown[][];
  tags: string[];
}

const PY_STUB = (t: GeneralTask) => `# ${t.title}
# 实现下面的函数。参数与返回值见题面。
def solve(${t.signature}):
    raise NotImplementedError
`;

const JS_STUB = (t: GeneralTask) => `// ${t.title}
// 实现下面的函数。参数与返回值见题面。
export function solve(${t.signature}) {
  throw new Error('not implemented');
}
`;

const TASKS: GeneralTask[] = [
  {
    id: 'gen-001',
    lang: 'py',
    title: 'FizzBuzz',
    prompt: '实现 solve(n)，返回 1..n 的字符串列表：3 的倍数为 "Fizz"，5 的倍数为 "Buzz"，15 的倍数为 "FizzBuzz"。',
    signature: 'n',
    ref: `def solve(n):
    out = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            out.append("FizzBuzz")
        elif i % 3 == 0:
            out.append("Fizz")
        elif i % 5 == 0:
            out.append("Buzz")
        else:
            out.append(str(i))
    return out`,
    cases: [[5], [15], [1]],
    tags: ['strings']
  },
  {
    id: 'gen-002',
    lang: 'py',
    title: '词频统计',
    prompt: '实现 solve(text)，返回 dict：小写化后按空格切分，统计每个词出现次数（忽略空串）。',
    signature: 'text',
    ref: `def solve(text):
    out = {}
    for w in text.lower().split():
        out[w] = out.get(w, 0) + 1
    return out`,
    cases: [['a b a'], ['Hello hello World'], ['']],
    tags: ['dict']
  },
  {
    id: 'gen-003',
    lang: 'py',
    title: '扁平化嵌套列表',
    prompt: '实现 solve(nested)，把任意深度的嵌套 list 摊平成一维 list，保持原顺序。',
    signature: 'nested',
    ref: `def solve(nested):
    out = []
    for x in nested:
        if isinstance(x, list):
            out.extend(solve(x))
        else:
            out.append(x)
    return out`,
    cases: [[[1, [2, [3, 4]], 5]], [[]], [[[1], [2]]]],
    tags: ['recursion']
  },
  {
    id: 'gen-004',
    lang: 'py',
    title: '保序去重',
    prompt: '实现 solve(items)，去掉重复元素并保持首次出现顺序。',
    signature: 'items',
    ref: `def solve(items):
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out`,
    cases: [[[3, 1, 3, 2, 1]], [[]], [['a', 'a', 'b']]],
    tags: ['dedupe']
  },
  {
    id: 'gen-005',
    lang: 'py',
    title: '中位数',
    prompt: '实现 solve(nums)，返回中位数（偶数个时取中间两个的平均，返回 float）。空列表返回 0.0。',
    signature: 'nums',
    ref: `def solve(nums):
    if not nums:
        return 0.0
    s = sorted(nums)
    n = len(s)
    if n % 2 == 1:
        return float(s[n // 2])
    return (s[n // 2 - 1] + s[n // 2]) / 2.0`,
    cases: [[[3, 1, 2]], [[4, 1, 3, 2]], [[]]],
    tags: ['math']
  },
  {
    id: 'gen-006',
    lang: 'py',
    title: '分块',
    prompt: '实现 solve(items, size)，把列表按 size 切成若干块，最后一块可短。size <= 0 时返回空列表。',
    signature: 'items, size',
    ref: `def solve(items, size):
    if size <= 0:
        return []
    return [items[i:i + size] for i in range(0, len(items), size)]`,
    cases: [[[1, 2, 3, 4, 5], 2], [[1], 3], [[1, 2], 0]],
    tags: ['slice']
  },
  {
    id: 'gen-007',
    lang: 'py',
    title: '罗马数字',
    prompt: '实现 solve(n)，把 1..3999 的整数转成大写罗马数字。',
    signature: 'n',
    ref: `def solve(n):
    vals = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),(50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]
    out = ''
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out`,
    cases: [[4], [1994], [3999]],
    tags: ['greedy']
  },
  {
    id: 'gen-008',
    lang: 'py',
    title: '回文判断',
    prompt: '实现 solve(s)，判断是否回文：只保留字母数字并忽略大小写。',
    signature: 's',
    ref: `def solve(s):
    t = ''.join(ch.lower() for ch in s if ch.isalnum())
    return t == t[::-1]`,
    cases: [['A man, a plan, a canal: Panama'], ['race a car'], ['']],
    tags: ['strings']
  },
  {
    id: 'gen-009',
    lang: 'py',
    title: 'CSV 转字典列表',
    prompt: '实现 solve(text)，首行是表头，其余是数据行，逗号分隔，返回 list[dict]。空输入返回空列表。',
    signature: 'text',
    ref: `def solve(text):
    lines = [l for l in text.strip().splitlines() if l.strip()]
    if not lines:
        return []
    header = [h.strip() for h in lines[0].split(',')]
    out = []
    for line in lines[1:]:
        cells = [c.strip() for c in line.split(',')]
        out.append(dict(zip(header, cells)))
    return out`,
    cases: [['a,b\\n1,2\\n3,4'], [''], ['x\\n9']],
    tags: ['parsing']
  },
  {
    id: 'gen-010',
    lang: 'py',
    title: '凯撒移位',
    prompt: '实现 solve(s, k)，对英文字母做 k 位凯撒位移（保留大小写），其他字符原样保留。k 可为负数。',
    signature: 's, k',
    ref: `def solve(s, k):
    out = []
    for ch in s:
        if 'a' <= ch <= 'z':
            out.append(chr((ord(ch) - 97 + k) % 26 + 97))
        elif 'A' <= ch <= 'Z':
            out.append(chr((ord(ch) - 65 + k) % 26 + 65))
        else:
            out.append(ch)
    return ''.join(out)`,
    cases: [['abc', 1], ['xyz', 3], ['Ab-C', -1]],
    tags: ['cipher']
  },
  {
    id: 'gen-011',
    lang: 'js',
    title: '平方和',
    prompt: '实现 solve(arr)，返回数组元素的平方和。非数组输入返回 0。',
    signature: 'arr',
    ref: `export function solve(arr) { return Array.isArray(arr) ? arr.reduce((s, x) => s + x * x, 0) : 0; }`,
    cases: [[[1, 2, 3]], [[]], [[2, -2]]],
    tags: ['arrays']
  },
  {
    id: 'gen-012',
    lang: 'js',
    title: '按字段分组',
    prompt: '实现 solve(arr, key)，把对象数组按 key 的值分组，返回 {值: 数组}。',
    signature: 'arr, key',
    ref: `export function solve(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = String(item[key]);
    (out[k] ||= []).push(item);
  }
  return out;
}`,
    cases: [
      [[{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }], 't'],
      [[], 'x']
    ],
    tags: ['group']
  },
  {
    id: 'gen-013',
    lang: 'js',
    title: '范围数组',
    prompt: '实现 solve(a, b, step)，返回从 a 到 b（不含 b）的等差数组。step 必须为正。',
    signature: 'a, b, step = 1',
    ref: `export function solve(a, b, step = 1) {
  const out = [];
  for (let i = a; i < b; i += step) out.push(i);
  return out;
}`,
    cases: [[0, 5], [2, 10, 3], [5, 5]],
    tags: ['loops']
  },
  {
    id: 'gen-014',
    lang: 'js',
    title: '标题化',
    prompt: '实现 solve(s)，把每个单词首字母大写、其余小写（按空格切分）。',
    signature: 's',
    ref: `export function solve(s) {
  return s.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
}`,
    cases: [['hello world'], ['HELLO there'], ['']],
    tags: ['strings']
  },
  {
    id: 'gen-015',
    lang: 'js',
    title: '二分查找',
    prompt: '实现 solve(arr, target)，在升序数组中返回下标，找不到返回 -1。',
    signature: 'arr, target',
    ref: `export function solve(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}`,
    cases: [[[1, 3, 5, 7], 5], [[1, 3, 5], 2], [[], 1]],
    tags: ['search']
  },
  {
    id: 'gen-016',
    lang: 'js',
    title: '对象扁平化',
    prompt: '实现 solve(obj)，把嵌套对象摊平成 {"a.b": 值} 形式，空对象返回 {}。',
    signature: 'obj',
    ref: `export function solve(obj) {
  const out = {};
  const walk = (o, prefix) => {
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
      else out[key] = v;
    }
  };
  walk(obj, '');
  return out;
}`,
    cases: [[{ a: { b: 1, c: { d: 2 } }, e: 3 }], [{}]],
    tags: ['objects']
  },
  {
    id: 'gen-017',
    lang: 'js',
    title: '数组分块',
    prompt: '实现 solve(arr, size)，按 size 切块，size <= 0 返回 []，保持原顺序。',
    signature: 'arr, size',
    ref: `export function solve(arr, size) {
  if (size <= 0) return [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}`,
    cases: [[[1, 2, 3, 4, 5], 2], [[1, 2], 0]],
    tags: ['arrays']
  },
  {
    id: 'gen-018',
    lang: 'js',
    title: '按键去重',
    prompt: '实现 solve(arr, key)，按对象某个字段去重，保留首次出现的元素。',
    signature: 'arr, key',
    ref: `export function solve(arr, key) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const v = item[key];
    if (!seen.has(v)) { seen.add(v); out.push(item); }
  }
  return out;
}`,
    cases: [
      [[{ id: 1, n: 'a' }, { id: 1, n: 'b' }, { id: 2, n: 'c' }], 'id'],
      [[], 'id']
    ],
    tags: ['dedupe']
  },
  {
    id: 'gen-019',
    lang: 'js',
    title: 'slug 化',
    prompt: '实现 solve(s)，转小写、非字母数字替换成单个连字符、去首尾连字符。',
    signature: 's',
    ref: `export function solve(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}`,
    cases: [['Hello World!'], ['--a__b--'], ['!!!']],
    tags: ['strings']
  },
  {
    id: 'gen-020',
    lang: 'js',
    title: '深比较',
    prompt: '实现 solve(a, b)，判断两个 JSON 值是否深度相等（数组按顺序，对象忽略键顺序）。',
    signature: 'a, b',
    ref: `export function solve(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => solve(a[k], b[k]));
}`,
    cases: [[{ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }], [[1, 2], [2, 1]], [1, 1]],
    tags: ['equality']
  }
];

const JS_VERIFY = `#!/usr/bin/env node
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
      notes.push(\`\${JSON.stringify(c.args)} 抛错：\${e.message}\`);
      continue;
    }
    if (JSON.stringify(actual) !== JSON.stringify(c.expected)) {
      failed += 1;
      notes.push(\`\${JSON.stringify(c.args)} 期望 \${JSON.stringify(c.expected)} 实际 \${JSON.stringify(actual)}\`);
    }
  }
  console.log(
    JSON.stringify({
      pass: failed === 0,
      detail: failed === 0 ? \`\${CASES.length}/\${CASES.length} 通过\` : notes.slice(0, 3).join('; '),
      metrics: { cases: CASES.length, failed }
    })
  );
} catch (e) {
  console.log(JSON.stringify({ pass: false, detail: '加载 solution.js 失败：' + e.message }));
}
`;

const PY_VERIFY = `#!/usr/bin/env python
import json, os, sys, importlib.util

CASES = json.loads(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cases.json"), "r", encoding="utf-8").read())
data = json.load(sys.stdin)
ws = data["workspace"]
try:
    spec = importlib.util.spec_from_file_location("solution", os.path.join(ws, "solution.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fn = getattr(mod, "solve", None)
    if fn is None:
        print(json.dumps({"pass": False, "detail": "solution.py 没有 solve 函数"}))
        sys.exit(0)
    failed = 0
    notes = []
    for c in CASES:
        try:
            actual = fn(*c["args"])
        except Exception as e:
            failed += 1
            notes.append("%s 抛错: %s" % (json.dumps(c["args"]), e))
            continue
        if actual != c["expected"]:
            failed += 1
            notes.append("%s 期望 %s 实际 %s" % (json.dumps(c["args"]), json.dumps(c["expected"]), json.dumps(actual)))
    print(json.dumps({"pass": failed == 0, "detail": ("%d/%d 通过" % (len(CASES), len(CASES))) if failed == 0 else "; ".join(notes[:3]), "metrics": {"cases": len(CASES), "failed": failed}}))
except Exception as e:
    print(json.dumps({"pass": False, "detail": "加载 solution.py 失败: %s" % e}))
`;

async function computeExpectedJs(ref: string, cases: unknown[][]): Promise<unknown[]> {
  const tmp = path.join(os.tmpdir(), `uplift-ref-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await fsp.writeFile(tmp, ref, 'utf8');
  try {
    const mod = await import(pathToFileURL(tmp).href);
    return cases.map((args) => mod.solve(...args));
  } finally {
    await fsp.rm(tmp, { force: true });
  }
}

function computeExpectedPy(ref: string, cases: unknown[][]): unknown[] {
  const tmp = path.join(os.tmpdir(), `uplift-ref-${Date.now()}-${Math.random().toString(36).slice(2)}.py`);
  const runner = `import json, sys, importlib.util
spec = importlib.util.spec_from_file_location("ref", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
cases = json.loads(sys.argv[2])
print(json.dumps([m.solve(*c) for c in cases]))
`;
  const fsModLocal = fsMod;
  fsModLocal.writeFileSync(tmp, ref, 'utf8');
  const runnerPath = `${tmp}.runner.py`;
  fsModLocal.writeFileSync(runnerPath, runner, 'utf8');
  try {
    const res = spawnSync('python', [runnerPath, tmp, JSON.stringify(cases)], { encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`python 参考实现执行失败：${res.stderr || res.stdout}`);
    }
    return JSON.parse(res.stdout.trim()) as unknown[];
  } finally {
    fsModLocal.rmSync(tmp, { force: true });
    fsModLocal.rmSync(runnerPath, { force: true });
  }
}

async function main(): Promise<void> {
  await fsp.rm(outDir, { recursive: true, force: true });
  const tasksDir = path.join(outDir, 'tasks');
  await fsp.mkdir(tasksDir, { recursive: true });

  const tasks = [];
  for (const t of TASKS) {
    const dir = path.join(tasksDir, t.id);
    const fixtureDir = path.join(dir, 'fixture');
    await fsp.mkdir(fixtureDir, { recursive: true });

    const expected =
      t.lang === 'js' ? await computeExpectedJs(t.ref, t.cases) : computeExpectedPy(t.ref, t.cases);
    const cases = t.cases.map((args, i) => ({ args, expected: expected[i] }));

    const solutionName = t.lang === 'js' ? 'solution.js' : 'solution.py';
    await fsp.writeFile(
      path.join(fixtureDir, solutionName),
      t.lang === 'js' ? JS_STUB(t) : PY_STUB(t),
      'utf8'
    );
    await fsp.writeFile(
      path.join(dir, 'prompt.md'),
      `# ${t.title}\n\n${t.prompt}\n\n在 \`${solutionName}\` 里实现 \`solve\`。不要修改其他文件，不要引入第三方依赖。\n`,
      'utf8'
    );
    await fsp.writeFile(path.join(dir, 'cases.json'), JSON.stringify(cases, null, 2) + '\n', 'utf8');
    await fsp.writeFile(path.join(dir, t.lang === 'js' ? 'verify.mjs' : 'verify.py'), t.lang === 'js' ? JS_VERIFY : PY_VERIFY, 'utf8');

    tasks.push({
      id: t.id,
      title: t.title,
      prompt_file: `tasks/${t.id}/prompt.md`,
      fixture: `tasks/${t.id}/fixture/`,
      verify: `tasks/${t.id}/verify.${t.lang === 'js' ? 'mjs' : 'py'}`,
      weight: 1.0,
      difficulty: 'easy',
      expected_baseline: { min: 0.6, max: 0.95 },
      tags: [t.lang, ...t.tags]
    });
  }

  const taskset = {
    schema_version: '1.0.0',
    domain: 'general-20',
    version: '1.0.0',
    title: '通用小任务集（负迁移 / 行为指纹专用）',
    description:
      '20 个基础算法小任务（10 Python + 10 JavaScript），与任何具体技能包的领域正交，评分器是 A 级可执行测试。用于探针 5（负迁移）与探针 6（卸载后行为指纹）。',
    maintainer: 'upliftbench',
    official: true,
    grader: {
      kind: 'tests',
      tier: 'A',
      entry: 'tasks/gen-001/verify.py',
      version: '1.0.0',
      timeout_sec: 60
    },
    env: { kind: 'local', ...(fixtureCommit('general-20') ? { commit: fixtureCommit('general-20') } : {}) },
    task_count: tasks.length,
    tasks
  };

  await fsp.writeFile(path.join(outDir, 'taskset.json'), JSON.stringify(taskset, null, 2) + '\n', 'utf8');
  console.log(`general-20@1.0 生成完成：${tasks.length} 个任务 -> ${path.relative(root, outDir)}`);
}

void main();
