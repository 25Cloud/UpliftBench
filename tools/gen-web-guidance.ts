/**
 * 生成 web-guidance@1.0 任务集（30 题，A 级 tests 评分器）。
 *
 * 为什么用生成器而不是手写 30 个目录：任务集必须可复现（AGENTS.md 硬约束 4）。
 * 生成器把「fixture 里有什么、要清掉什么、要出现什么」写死在一张表里，
 * 任何人重跑 `pnpm gen:web` 都得到同一棵树。生成结果照样提交进仓库。
 */
import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(root, 'tasksets', 'web-guidance');

/**
 * fixture 的 commit 锁定（AGENTS.md 硬约束 4）。
 * 只有在 tasksets/<domain> 已经提交且工作区干净时才能填，否则填进去的 sha 是假的。
 * 首次生成时省略该字段（schema 里它是可选的），提交后再跑一次生成器自动回填。
 */
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

interface TaskSpec {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  prompt: string;
  tags: string[];
  files: Record<string, string>;
  /** 初始 fixture 里存在、正确修复后必须消失 */
  forbid: string[];
  /** 初始不存在、正确修复后必须出现 */
  require: string[];
  /**
   * 行为测试源码（可选）：导出 `async run(ws) -> {pass, detail, cases}`。
   *
   * 有它就意味着这题**不止看写法**：评分器会把候选代码真的 import 进来跑一遍，
   * 写法对了但行为错了照样 0 分。前 48 题只查正则，能被"把 API 名字写上就算过"骗过去；
   * 这批新题用行为测试堵这个洞。
   */
  behavior?: string;
}

/* ============================ 行为测试源码 ============================
 * 每个都是独立文件（生成到 tasks/<id>/behavior.mjs），签名统一：
 *   export async function run(ws) -> { pass, detail, cases: [{name, pass, detail?}] }
 *
 * 写法约束（因为外层是 TS 模板字符串）：这里不许出现 ${ 和反引号。
 * 需要拼字符串就用 +，需要插值就用 concat。看着笨，但生成的产物好读。
 */

/** 049 超时与取消：起一个真 HTTP server 测，外部 signal 在场时超时必须仍然生效 */
const BEHAVIOR_049 = `import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'net.js')).href);
  const getJson = mod.getJson;
  if (typeof getJson !== 'function') return { pass: false, detail: 'net.js 没有导出 getJson', cases: [] };

  const server = http.createServer((req, res) => {
    const delay = Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('delay') || '0');
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    }, delay);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const cases = [];

  try {
    const got = await getJson(base + '/?delay=1', { timeoutMs: 800 });
    cases.push({ name: '正常请求返回解析后的 JSON', pass: !!got && got.ok === true });
  } catch (e) {
    cases.push({ name: '正常请求返回解析后的 JSON', pass: false, detail: String(e && e.message) });
  }

  try {
    const never = new AbortController();
    const t0 = Date.now();
    let threw = false;
    try {
      await getJson(base + '/?delay=400', { timeoutMs: 80, signal: never.signal });
    } catch (e) {
      threw = true;
    }
    const dt = Date.now() - t0;
    cases.push({ name: '外部 signal 不取消时，超时仍然生效', pass: threw && dt < 350, detail: '耗时 ' + dt + 'ms' });
  } catch (e) {
    cases.push({ name: '外部 signal 不取消时，超时仍然生效', pass: false, detail: String(e && e.message) });
  }

  try {
    const c = new AbortController();
    setTimeout(() => c.abort(new Error('user cancel')), 40);
    let threw = false;
    try {
      await getJson(base + '/?delay=500', { timeoutMs: 5000, signal: c.signal });
    } catch (e) {
      threw = true;
    }
    cases.push({ name: '外部取消能中断请求', pass: threw });
  } catch (e) {
    cases.push({ name: '外部取消能中断请求', pass: false, detail: String(e && e.message) });
  }

  await new Promise((resolve) => server.close(resolve));
  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 050 并发批处理：resolvers 的 resolve/reject 都要能穿透，collect 要吃同步与异步两种源 */
const BEHAVIOR_050 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'batch.js')).href);
  const cases = [];

  try {
    const gate = mod.createGate();
    let seen;
    const p = gate.promise.then((v) => { seen = v; return v; });
    gate.resolve(42);
    await p;
    cases.push({ name: 'createGate().resolve 让 promise 兑现', pass: seen === 42 });
  } catch (e) {
    cases.push({ name: 'createGate().resolve 让 promise 兑现', pass: false, detail: String(e && e.message) });
  }

  try {
    const gate = mod.createGate();
    let code = null;
    const p = gate.promise.catch((e) => { code = e && e.message; });
    gate.reject(new Error('boom'));
    await p;
    cases.push({ name: 'createGate().reject 把错误传出去', pass: code === 'boom' });
  } catch (e) {
    cases.push({ name: 'createGate().reject 把错误传出去', pass: false, detail: String(e && e.message) });
  }

  try {
    const out = await mod.collect([Promise.resolve(1), 2, Promise.resolve(3)]);
    cases.push({ name: 'collect 处理混着 Promise 的同步可迭代', pass: JSON.stringify(out) === '[1,2,3]', detail: JSON.stringify(out) });
  } catch (e) {
    cases.push({ name: 'collect 处理混着 Promise 的同步可迭代', pass: false, detail: String(e && e.message) });
  }

  try {
    async function* gen() { yield 'a'; yield 'b'; }
    const out = await mod.collect(gen());
    cases.push({ name: 'collect 处理异步生成器', pass: JSON.stringify(out) === '["a","b"]', detail: JSON.stringify(out) });
  } catch (e) {
    cases.push({ name: 'collect 处理异步生成器', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 051 分组与排序：Object.groupBy 与 Map.groupBy 是两个不同的东西，ranked 不许改入参 */
const BEHAVIOR_051 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'report.js')).href);
  const people = [
    { name: 'Ada', team: 'core' },
    { name: 'Bo', team: 'web' },
    { name: 'Cy', team: 'core' }
  ];
  const cases = [];

  try {
    const o = mod.byTeam(people);
    const ok = !!o && !(o instanceof Map) && JSON.stringify(o.core) === '["Ada","Cy"]' && JSON.stringify(o.web) === '["Bo"]';
    cases.push({ name: 'byTeam 返回普通对象，值是名字数组', pass: ok, detail: JSON.stringify(o) });
  } catch (e) {
    cases.push({ name: 'byTeam 返回普通对象，值是名字数组', pass: false, detail: String(e && e.message) });
  }

  try {
    const m = mod.byTeamMap(people);
    const ok = m instanceof Map && JSON.stringify(m.get('core')) === '["Ada","Cy"]' && JSON.stringify(m.get('web')) === '["Bo"]';
    cases.push({ name: 'byTeamMap 返回 Map 实例', pass: ok, detail: String(m) });
  } catch (e) {
    cases.push({ name: 'byTeamMap 返回 Map 实例', pass: false, detail: String(e && e.message) });
  }

  try {
    const scores = [3, 1, 2];
    const ranked = mod.ranked(scores);
    const ok = JSON.stringify(ranked) === '[3,2,1]' && JSON.stringify(scores) === '[3,1,2]';
    cases.push({ name: 'ranked 降序返回且不改原数组', pass: ok, detail: '返回 ' + JSON.stringify(ranked) + ' / 原数组 ' + JSON.stringify(scores) });
  } catch (e) {
    cases.push({ name: 'ranked 降序返回且不改原数组', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 052 深拷贝与集合运算：JSON 往返会吃掉 Date/Map/Set，这是这题的核心 */
const BEHAVIOR_052 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'state.js')).href);
  const cases = [];

  const original = {
    name: 'x',
    when: new Date('2020-01-02T03:04:05Z'),
    settings: new Map([['a', 1]]),
    tags: new Set(['t1']),
    nested: { n: 1 }
  };
  try {
    const copy = mod.cloneState(original);
    const checks = [
      copy !== original,
      copy.nested !== original.nested && copy.nested.n === 1,
      copy.when instanceof Date && copy.when.getTime() === original.when.getTime(),
      copy.settings instanceof Map && copy.settings.get('a') === 1,
      copy.tags instanceof Set && copy.tags.has('t1')
    ];
    cases.push({ name: 'cloneState 保留 Date/Map/Set 且是深拷贝', pass: checks.every(Boolean), detail: JSON.stringify(checks) });
  } catch (e) {
    cases.push({ name: 'cloneState 保留 Date/Map/Set 且是深拷贝', pass: false, detail: String(e && e.message) });
  }

  try {
    const a = new Set([1, 2]);
    const b = new Set([2, 3]);
    const u = mod.merged(a, b);
    const okU = u instanceof Set && u.has(1) && u.has(2) && u.has(3) && u.size === 3;
    cases.push({ name: 'merged 返回并集 Set', pass: okU, detail: String(u) });
    const s = mod.shared(a, b);
    const okS = s instanceof Set && s.size === 1 && s.has(2);
    cases.push({ name: 'shared 返回交集 Set', pass: okS, detail: String(s) });
    const d = mod.onlyA(a, b);
    const okD = d instanceof Set && d.size === 1 && d.has(1);
    cases.push({ name: 'onlyA 返回差集 Set', pass: okD, detail: String(d) });
    const untouched = a.size === 2 && b.size === 2;
    cases.push({ name: '集合运算不改入参', pass: untouched });
  } catch (e) {
    cases.push({ name: '集合运算', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 053 错误链：cause 要指回原始错误，message 不许再拼一遍，AggregateError 要带 errors */
const BEHAVIOR_053 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'api.js')).href);
  const cases = [];

  const original = new Error('socket hang up');
  try {
    const wrapped = mod.wrap(original, '加载失败');
    const checks = [
      wrapped instanceof Error,
      wrapped.cause === original,
      wrapped.message === '加载失败'
    ];
    cases.push({ name: 'wrap 用 cause 指回原错误，message 保持干净', pass: checks.every(Boolean), detail: JSON.stringify(checks) + ' message=' + wrapped.message });
  } catch (e) {
    cases.push({ name: 'wrap 用 cause 指回原错误，message 保持干净', pass: false, detail: String(e && e.message) });
  }

  try {
    const ok = await mod.loadAll(async (u) => ({ u }), ['a', 'b']);
    cases.push({ name: 'loadAll 全成功时返回结果数组', pass: JSON.stringify(ok) === '[{"u":"a"},{"u":"b"}]', detail: JSON.stringify(ok) });
  } catch (e) {
    cases.push({ name: 'loadAll 全成功时返回结果数组', pass: false, detail: String(e && e.message) });
  }

  try {
    const boom = new Error('nope');
    let caught = null;
    try {
      await mod.loadAll(async (u) => { if (u === 'b') throw boom; return { u }; }, ['a', 'b']);
    } catch (e) {
      caught = e;
    }
    const ok = caught instanceof AggregateError && Array.isArray(caught.errors) && caught.errors.length === 1 && caught.errors[0] === boom;
    cases.push({ name: 'loadAll 失败时抛 AggregateError 且 errors 里是原错误', pass: ok, detail: caught ? caught.constructor.name + ' errors=' + (caught.errors ? caught.errors.length : 'n/a') : '没抛' });
  } catch (e) {
    cases.push({ name: 'loadAll 失败时抛 AggregateError 且 errors 里是原错误', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 054 不可变数组：三个函数都不许改入参 */
const BEHAVIOR_054 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'todo.js')).href);
  const cases = [];
  const list = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
  const snapshot = JSON.stringify(list);

  try {
    const rev = mod.undoLast(list);
    const ok = Array.isArray(rev) && rev !== list && rev.length === 2 && rev[0].id === 2 && rev[1].id === 1 && JSON.stringify(list) === snapshot;
    cases.push({ name: 'undoLast 返回倒序副本且不改入参', pass: ok, detail: JSON.stringify(rev) });
  } catch (e) {
    cases.push({ name: 'undoLast 返回倒序副本且不改入参', pass: false, detail: String(e && e.message) });
  }

  try {
    const renamed = mod.rename(list, 1, 'B');
    const ok = Array.isArray(renamed) && renamed !== list && renamed[1].text === 'B' && renamed[0].text === 'a' && JSON.stringify(list) === snapshot;
    cases.push({ name: 'rename 返回替换后的副本且不改入参', pass: ok, detail: JSON.stringify(renamed) });
  } catch (e) {
    cases.push({ name: 'rename 返回替换后的副本且不改入参', pass: false, detail: String(e && e.message) });
  }

  try {
    const removed = mod.removeAt(list, 0);
    const ok = Array.isArray(removed) && removed !== list && removed.length === 1 && removed[0].id === 2 && JSON.stringify(list) === snapshot;
    cases.push({ name: 'removeAt 返回删除后的副本且不改入参', pass: ok, detail: JSON.stringify(removed) });
  } catch (e) {
    cases.push({ name: 'removeAt 返回删除后的副本且不改入参', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 055 URL 校验：解析失败要给 null / false，不许靠 try-catch */
const BEHAVIOR_055 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'links.js')).href);
  const cases = [];

  try {
    const bad = mod.safeParse('not a url');
    cases.push({ name: 'safeParse 对非法输入返回 null', pass: bad === null, detail: String(bad) });
  } catch (e) {
    cases.push({ name: 'safeParse 对非法输入返回 null', pass: false, detail: String(e && e.message) });
  }

  try {
    const good = mod.safeParse('https://a.test/x?y=1');
    const ok = !!good && good.host === 'a.test' && good.searchParams.get('y') === '1';
    cases.push({ name: 'safeParse 对合法输入返回 URL 实例', pass: ok, detail: String(good) });
  } catch (e) {
    cases.push({ name: 'safeParse 对合法输入返回 URL 实例', pass: false, detail: String(e && e.message) });
  }

  try {
    const ok = mod.isLink('https://a.test') === true && mod.isLink('nope') === false;
    cases.push({ name: 'isLink 走布尔判断', pass: ok, detail: String(mod.isLink('nope')) });
  } catch (e) {
    cases.push({ name: 'isLink 走布尔判断', pass: false, detail: String(e && e.message) });
  }

  try {
    const ok = mod.hostOf('https://b.test/path') === 'b.test' && mod.hostOf('::') === '';
    cases.push({ name: 'hostOf 对非法输入给空串', pass: ok, detail: mod.hostOf('::') });
  } catch (e) {
    cases.push({ name: 'hostOf 对非法输入给空串', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/** 056 字符与语言：字素簇、NFC、土耳其语 i，三个都是「看着没问题其实错」的经典坑 */
const BEHAVIOR_056 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMBINING = 'e\\u0301';
const FAMILY = '\\u{1F468}\\u200D\\u{1F469}\\u200D\\u{1F467}\\u200D\\u{1F466}';

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'text.js')).href);
  const cases = [];

  try {
    const a = mod.graphemes(COMBINING);
    const b = mod.graphemes(FAMILY);
    const ok = Array.isArray(a) && a.length === 1 && b.length === 1;
    cases.push({ name: 'graphemes 按字素簇切（组合符、ZWJ 家族都算一个）', pass: ok, detail: 'a=' + a.length + ' b=' + b.length });
  } catch (e) {
    cases.push({ name: 'graphemes 按字素簇切（组合符、ZWJ 家族都算一个）', pass: false, detail: String(e && e.message) });
  }

  try {
    const out = mod.normalize(COMBINING);
    cases.push({ name: 'normalize 输出 NFC（组合符并成一个码位）', pass: out.length === 1, detail: 'length=' + out.length });
  } catch (e) {
    cases.push({ name: 'normalize 输出 NFC（组合符并成一个码位）', pass: false, detail: String(e && e.message) });
  }

  try {
    const out = mod.fold('I');
    cases.push({ name: 'fold 用土耳其语规则（大写 I 的小写是 ı）', pass: out === '\\u0131', detail: out });
  } catch (e) {
    cases.push({ name: 'fold 用土耳其语规则（大写 I 的小写是 ı）', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

/**
 * 058 状态保留式移动：用假 DOM 真跑，判「首选是不是 moveBefore」而不是「文件里有没有这个词」。
 *
 * 为什么必须行为化：正则分不清下面这两种，而它们的性质完全相反，
 *   A) 首选 moveBefore，特性检测失败时回退 removeChild+insertBefore   ← 对（渐进增强）
 *   B) 根本不知道有别的方法，只写 removeChild+insertBefore            ← 错（状态丢失）
 * 之前用 forbid 把两者一起判错，导致 treatment 臂（唯一读了 guide、唯一写回退的臂）
 * 成了唯一被判 0 的臂。详见 docs/16 §四.3。
 */
const BEHAVIOR_058 = `import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 够用就行的假父节点：只实现这道题会碰到的 API，并记录每个 API 被调了几次 */
function makeParent(name) {
  const parent = {
    name,
    kids: [],
    stats: { moveBefore: 0, removeChild: 0, insertBefore: 0 },
    get firstChild() {
      return this.kids.length ? this.kids[0] : null;
    },
    appendChild(child) {
      child.parent = this;
      this.kids.push(child);
      return child;
    },
    moveBefore(child, ref) {
      this.stats.moveBefore += 1;
      const from = this.kids.indexOf(child);
      if (from >= 0) this.kids.splice(from, 1);
      const at = ref ? this.kids.indexOf(ref) : this.kids.length;
      this.kids.splice(at < 0 ? this.kids.length : at, 0, child);
      child.parent = this;
      return child;
    },
    removeChild(child) {
      this.stats.removeChild += 1;
      const i = this.kids.indexOf(child);
      if (i >= 0) this.kids.splice(i, 1);
      child.parent = null;
      return child;
    },
    insertBefore(child, ref) {
      this.stats.insertBefore += 1;
      const from = this.kids.indexOf(child);
      if (from >= 0) this.kids.splice(from, 1);
      const at = ref ? this.kids.indexOf(ref) : this.kids.length;
      this.kids.splice(at < 0 ? this.kids.length : at, 0, child);
      child.parent = this;
      return child;
    }
  };
  return parent;
}

function makeNode(name, parent) {
  return {
    name,
    parent: parent ?? null,
    get nextSibling() {
      const p = this.parent;
      if (!p) return null;
      const i = p.kids.indexOf(this);
      return i >= 0 && i + 1 < p.kids.length ? p.kids[i + 1] : null;
    }
  };
}

const order = (parent) => parent.kids.map((k) => k.name).join(',');
const api = (parent) => JSON.stringify(parent.stats);

export async function run(ws) {
  const mod = await import(pathToFileURL(path.join(ws, 'reorder.js')).href);
  const cases = [];

  try {
    const list = makeParent('list');
    const a = makeNode('a', list);
    const b = makeNode('b', list);
    const c = makeNode('c', list);
    list.appendChild(a);
    list.appendChild(b);
    list.appendChild(c);
    mod.moveToTop(list, c);
    const okOrder = order(list) === 'c,a,b';
    const okApi = list.stats.moveBefore === 1 && list.stats.removeChild === 0 && list.stats.insertBefore === 0;
    cases.push({ name: 'moveToTop 用 moveBefore 把末项移到最前', pass: okOrder && okApi, detail: order(list) + ' api=' + api(list) });
  } catch (e) {
    cases.push({ name: 'moveToTop 用 moveBefore 把末项移到最前', pass: false, detail: String(e && e.message) });
  }

  try {
    const parent = makeParent('parent');
    const a = makeNode('a', parent);
    const x = makeNode('x', parent);
    const b = makeNode('b', parent);
    parent.appendChild(a);
    parent.appendChild(x);
    parent.appendChild(b);
    mod.swapSections(parent, a, b);
    const okOrder = order(parent) === 'x,a,b';
    const okApi = parent.stats.moveBefore === 1 && parent.stats.removeChild === 0 && parent.stats.insertBefore === 0;
    cases.push({ name: 'swapSections 用 moveBefore 把 a 移到 b 之前', pass: okOrder && okApi, detail: order(parent) + ' api=' + api(parent) });
  } catch (e) {
    cases.push({ name: 'swapSections 用 moveBefore 把 a 移到 b 之前', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
`;

const TASKS: TaskSpec[] = [
  {
    id: 'wmg-001',
    title: '用 fetch 替代 XMLHttpRequest',
    difficulty: 'easy',
    tags: ['api-modernization', 'network'],
    prompt:
      'app.js 里用 XMLHttpRequest 拉取 /api/users。请把它改成 fetch + async/await 写法，保持响应仍是 JSON 数组，并把错误用 console.error 打印。',
    files: {
      'app.js': `export function loadUsers(cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/users');
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        cb(JSON.parse(xhr.responseText));
      } else {
        console.log('failed');
      }
    }
  };
  xhr.send();
}
`
    },
    forbid: ['new XMLHttpRequest\\('],
    require: ['fetch\\(', 'await ']
  },
  {
    id: 'wmg-002',
    title: '用 DOM API 替代 document.write',
    difficulty: 'easy',
    tags: ['dom'],
    prompt: 'render.js 用 document.write 拼出列表。改写成 createElement/appendChild，保留同样的输出结构。',
    files: {
      'render.js': `export function renderList(items) {
  document.write('<ul>');
  for (var i = 0; i < items.length; i++) {
    document.write('<li>' + items[i] + '</li>');
  }
  document.write('</ul>');
}
`
    },
    forbid: ['document\\.write\\('],
    require: ['createElement\\(', 'appendChild\\(']
  },
  {
    id: 'wmg-003',
    title: 'var 换成 const / let',
    difficulty: 'easy',
    tags: ['syntax'],
    prompt: 'config.js 里全是 var。改成一个块级作用域即可完成的版本，不需要重新赋值的用 const。',
    files: {
      'config.js': `var apiBase = 'https://example.test';
var retries = 3;
var timeout = 5000;

export function describe() {
  var text = apiBase + ' retries=' + retries;
  return text;
}
`
    },
    forbid: ['(^|[^\\w.])var\\s'],
    require: ['const ', 'export function']
  },
  {
    id: 'wmg-004',
    title: '松散相等换成严格相等',
    difficulty: 'easy',
    tags: ['syntax', 'correctness'],
    prompt: 'compare.js 用了松散相等。改成严格相等，注意 null 判断的语义要保留（null 与 undefined 视为同类）。',
    files: {
      'compare.js': `export function same(a, b) {
  return a == b;
}

export function isMissing(v) {
  return v == null;
}
`
    },
    forbid: ['\\w\\s*==(?!\\s*=)\\s*\\w'],
    require: ['=== ', 'typeof ']
  },
  {
    id: 'wmg-005',
    title: 'innerHTML 拼字符串换成 textContent',
    difficulty: 'medium',
    tags: ['dom', 'xss'],
    prompt:
      'list.js 把用户输入直接塞进 innerHTML（有 XSS 风险）。改成先 createElement 再 textContent，结构不变。',
    files: {
      'list.js': `export function showComments(el, comments) {
  let html = '';
  for (const c of comments) {
    html += '<div class="comment">' + c.text + '</div>';
  }
  el.innerHTML = html;
}
`
    },
    forbid: ['innerHTML'],
    require: ['textContent', 'createElement\\(']
  },
  {
    id: 'wmg-006',
    title: 'onclick 属性换成 addEventListener',
    difficulty: 'medium',
    tags: ['dom', 'events'],
    prompt: 'index.html 里用 onclick 内联属性绑定事件。改写成在 main.js 里用 addEventListener 绑同一个处理函数。',
    files: {
      'index.html': `<button id="save" onclick="saveForm()">Save</button>
`,
      'main.js': `export function saveForm() {
  return 'saved';
}
`
    },
    forbid: ['onclick='],
    require: ['addEventListener\\(', "getElementById\\("]
  },
  {
    id: 'wmg-007',
    title: '用 requestAnimationFrame 替代 setTimeout 动画',
    difficulty: 'medium',
    tags: ['animation', 'performance'],
    prompt: 'anim.js 用 setTimeout 递归做逐帧动画。改成 requestAnimationFrame 驱动，并保留一个可停止的开关。',
    files: {
      'anim.js': `export function slide(el) {
  let x = 0;
  function step() {
    x += 2;
    el.style.transform = 'translateX(' + x + 'px)';
    if (x < 200) {
      setTimeout(step, 16);
    }
  }
  step();
}
`
    },
    forbid: ['setTimeout\\(step'],
    require: ['requestAnimationFrame\\(', 'translateX']
  },
  {
    id: 'wmg-008',
    title: 'document.all 换成标准查询',
    difficulty: 'easy',
    tags: ['dom'],
    prompt: 'legacy.js 用了非标准的 document.all。换成 querySelector / getElementById。',
    files: {
      'legacy.js': `export function hideHeader() {
  var el = document.all.header;
  el.style.display = 'none';
}
`
    },
    forbid: ['document\\.all'],
    require: ['querySelector\\(|getElementById\\(']
  },
  {
    id: 'wmg-009',
    title: 'escape / unescape 换成 encodeURIComponent',
    difficulty: 'easy',
    tags: ['encoding'],
    prompt: 'url.js 用了已废弃的 escape()。换成 encodeURIComponent / decodeURIComponent。',
    files: {
      'url.js': `export function buildUrl(q) {
  return '/search?q=' + escape(q);
}

export function readQuery(s) {
  return unescape(s);
}
`
    },
    forbid: ['[^A-Za-z]escape\\(', 'unescape\\('],
    require: ['encodeURIComponent\\(', 'decodeURIComponent\\(']
  },
  {
    id: 'wmg-010',
    title: 'attachEvent 换成 addEventListener',
    difficulty: 'easy',
    tags: ['events', 'legacy'],
    prompt: 'legacy-events.js 用了 IE 时代的 attachEvent。改成 addEventListener，事件名去掉 on 前缀。',
    files: {
      'legacy-events.js': `export function bindClick(btn, handler) {
  if (btn.attachEvent) {
    btn.attachEvent('onclick', handler);
  }
}
`
    },
    forbid: ['attachEvent\\('],
    require: ['addEventListener\\(', "click"]
  },
  {
    id: 'wmg-011',
    title: '同步 XHR 改成异步 fetch',
    difficulty: 'hard',
    tags: ['network', 'blocking'],
    prompt:
      'blocking.js 用了同步 XHR（async=false），会阻塞主线程。改成异步 fetch，并给出加载中/失败两种状态。',
    files: {
      'blocking.js': `export function getUserSync(id) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/users/' + id, false);
  xhr.send(null);
  return JSON.parse(xhr.responseText);
}
`
    },
    forbid: ['new XMLHttpRequest\\(', 'false\\);'],
    require: ['fetch\\(', 'await ', 'try\\s*\\{|catch\\s*\\(']
  },
  {
    id: 'wmg-012',
    title: 'keyCode 换成 key',
    difficulty: 'medium',
    tags: ['events'],
    prompt: 'keys.js 靠 event.keyCode 判断回车。换成 event.key 比较，保留同样的行为。',
    files: {
      'keys.js': `export function onEnter(input, submit) {
  input.addEventListener('keydown', function (event) {
    if (event.keyCode === 13) {
      submit();
    }
  });
}
`
    },
    forbid: ['keyCode'],
    require: ["key === 'Enter'", 'addEventListener\\(']
  },
  {
    id: 'wmg-013',
    title: 'getElementsByClassName 换成 querySelectorAll',
    difficulty: 'easy',
    tags: ['dom'],
    prompt: 'query.js 用 getElementsByClassName 并遍历 HTMLCollection。换成 querySelectorAll + forEach。',
    files: {
      'query.js': `export function markAll() {
  var nodes = document.getElementsByClassName('todo');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].classList.add('done');
  }
}
`
    },
    forbid: ['getElementsByClassName\\('],
    require: ['querySelectorAll\\(', 'forEach\\(']
  },
  {
    id: 'wmg-014',
    title: '用 transform 替代 style.left 动画',
    difficulty: 'medium',
    tags: ['animation', 'performance'],
    prompt: 'move.js 靠改 style.left 做动画（触发 layout）。改成 transform: translateX，并保留结束回调。',
    files: {
      'move.js': `export function moveTo(el, x, done) {
  let cur = 0;
  const timer = setInterval(function () {
    cur += 5;
    el.style.left = cur + 'px';
    if (cur >= x) {
      clearInterval(timer);
      done();
    }
  }, 16);
}
`
    },
    forbid: ['style\\.left'],
    require: ['translateX', 'requestAnimationFrame\\(']
  },
  {
    id: 'wmg-015',
    title: 'substr 换成 slice',
    difficulty: 'easy',
    tags: ['syntax'],
    prompt: 'text.js 用了已废弃的 substr。换成 slice，注意第二个参数语义不同（终点索引 vs 长度）。',
    files: {
      'text.js': `export function initials(name) {
  return name.substr(0, 1).toUpperCase();
}

export function tail(s) {
  return s.substr(1);
}
`
    },
    forbid: ['\\.substr\\('],
    require: ['\\.slice\\(']
  },
  {
    id: 'wmg-016',
    title: 'getYear 换成 getFullYear',
    difficulty: 'easy',
    tags: ['date'],
    prompt: 'date.js 用了已废弃的 getYear。换成 getFullYear，并把年份补成四位。',
    files: {
      'date.js': `export function yearOf(d) {
  return d.getYear();
}
`
    },
    forbid: ['getYear\\(\\)'],
    require: ['getFullYear\\(\\)']
  },
  {
    id: 'wmg-017',
    title: 'execCommand 换成 Clipboard API',
    difficulty: 'medium',
    tags: ['clipboard', 'permissions'],
    prompt:
      'clipboard.js 用 document.execCommand("copy")。换成 navigator.clipboard.writeText，并用 await 处理失败。',
    files: {
      'clipboard.js': `export function copy(text) {
  var area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}
`
    },
    forbid: ['execCommand\\('],
    require: ['navigator\\.clipboard\\.writeText', 'await ']
  },
  {
    id: 'wmg-018',
    title: 'window.event 换成事件参数',
    difficulty: 'medium',
    tags: ['events'],
    prompt: 'handler.js 依赖非标准的 window.event。改成从处理函数的参数拿事件对象。',
    files: {
      'handler.js': `export function handler() {
  var ev = window.event;
  console.log(ev.target);
}
`
    },
    forbid: ['window\\.event'],
    require: ['function\\s*handler\\s*\\(\\s*\\w+', 'ev\\.target|event\\.target']
  },
  {
    id: 'wmg-019',
    title: 'onreadystatechange 改成 fetch',
    difficulty: 'hard',
    tags: ['network'],
    prompt: 'poll.js 用 XHR 的 onreadystatechange 轮询。改成 fetch + 轮询循环，保留同样的重试语义。',
    files: {
      'poll.js': `export function poll(url, done) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      done(xhr.responseText);
    }
  };
  xhr.open('GET', url);
  xhr.send();
}
`
    },
    forbid: ['onreadystatechange', 'new XMLHttpRequest\\('],
    require: ['fetch\\(', 'while\\s*\\(']
  },
  {
    id: 'wmg-020',
    title: 'outerHTML 替换子节点换成 replaceChildren',
    difficulty: 'medium',
    tags: ['dom'],
    prompt: 'swap.js 用 outerHTML 覆盖整个容器。改成 replaceChildren / append，保持容器本身不被销毁。',
    files: {
      'swap.js': `export function swap(el, node) {
  el.outerHTML = '<section>' + node.textContent + '</section>';
}
`
    },
    forbid: ['outerHTML\\s*='],
    require: ['replaceChildren\\(|replaceWith\\(|appendChild\\(']
  },
  {
    id: 'wmg-021',
    title: 'alert 换成可控的提示',
    difficulty: 'easy',
    tags: ['ux'],
    prompt: 'notify.js 用 alert 做提示。改成一个可注入的提示函数（默认 console.log），不要再用 alert。',
    files: {
      'notify.js': `export function notify(msg) {
  alert(msg);
}
`
    },
    forbid: ['[^.\\w]alert\\('],
    require: ['console\\.log|notify\\s*=|export function notify']
  },
  {
    id: 'wmg-022',
    title: 'eval 换成 JSON.parse',
    difficulty: 'hard',
    tags: ['security'],
    prompt: 'parse.js 用 eval 解析 JSON 字符串（危险）。换成 JSON.parse，并加上解析失败分支。',
    files: {
      'parse.js': `export function parseConfig(raw) {
  return eval('(' + raw + ')');
}
`
    },
    forbid: ['[^.\\w]eval\\('],
    require: ['JSON\\.parse\\(', 'try\\s*\\{|catch\\s*\\(']
  },
  {
    id: 'wmg-023',
    title: 'indexOf 循环换成 includes / find',
    difficulty: 'medium',
    tags: ['collections'],
    prompt: 'find.js 用 indexOf 判断存在性和查找元素。换成 includes 与 find，语义保持一致。',
    files: {
      'find.js': `export function has(list, v) {
  return list.indexOf(v) !== -1;
}

export function firstBig(list) {
  for (var i = 0; i < list.length; i++) {
    if (list[i] > 10) return list[i];
  }
  return null;
}
`
    },
    forbid: ['indexOf\\('],
    require: ['\\.includes\\(', '\\.find\\(']
  },
  {
    id: 'wmg-024',
    title: 'new Array 换成数组字面量',
    difficulty: 'easy',
    tags: ['syntax'],
    prompt: 'alloc.js 用 new Array() 与 Array(n) 的怪异语义。换成数组字面量与 Array.from。',
    files: {
      'alloc.js': `export function empties(n) {
  var a = new Array();
  var b = new Array(n);
  return [a, b];
}
`
    },
    forbid: ['new Array\\('],
    require: ['Array\\.from\\(|=\\s*\\[\\]']
  },
  {
    id: 'wmg-025',
    title: 'for...in 遍历数组换成 for...of',
    difficulty: 'medium',
    tags: ['collections', 'iteration'],
    prompt: 'iter.js 用 for...in 遍历数组（会枚举到原型上的属性）。换成 for...of。',
    files: {
      'iter.js': `export function sum(list) {
  var total = 0;
  for (var i in list) {
    total += list[i];
  }
  return total;
}
`
    },
    forbid: ['for\\s*\\(\\s*var\\s+\\w+\\s+in\\s'],
    require: ['for\\s*\\(\\s*const\\s+\\w+\\s+of\\s']
  },
  {
    id: 'wmg-026',
    title: '回调地狱改成 async/await',
    difficulty: 'hard',
    tags: ['async', 'refactor'],
    prompt:
      'order.js 三层回调嵌套下单。改成 async/await，并给网络调用加 AbortController 超时。行为保持：任一步失败要能回滚提示。',
    files: {
      'order.js': `export function placeOrder(cart, done) {
  reserve(cart, function (err, reservation) {
    if (err) return done(err);
    charge(reservation, function (err2, receipt) {
      if (err2) return done(err2);
      ship(receipt, function (err3, tracking) {
        if (err3) return done(err3);
        done(null, tracking);
      });
    });
  });
}
`
    },
    forbid: ['function\\s*\\(\\s*err', 'done\\(err'],
    require: ['async function|async \\(', 'await ', 'AbortController', 'try\\s*\\{']
  },
  {
    id: 'wmg-027',
    title: 'UA 嗅探换成特性检测',
    difficulty: 'hard',
    tags: ['feature-detection'],
    prompt:
      'detect.js 靠 navigator.userAgent 判断浏览器能力。改成特性检测（in 运算符 / typeof），不读 UA。',
    files: {
      'detect.js': `export function canPickDate() {
  var ua = navigator.userAgent;
  if (ua.indexOf('Chrome') !== -1) {
    return true;
  }
  return false;
}
`
    },
    forbid: ['navigator\\.userAgent'],
    require: ["in\\s+\\w+|typeof\\s+\\w+", "return\\s+(true|false)"]
  },
  {
    id: 'wmg-028',
    title: 'unload 事件换成 pagehide',
    difficulty: 'hard',
    tags: ['events', 'lifecycle'],
    prompt: 'leave.js 监听 unload 保存草稿（在移动端常被丢弃）。换成 pagehide + visibilitychange。',
    files: {
      'leave.js': `export function saveOnLeave(save) {
  window.addEventListener('unload', function () {
    save();
  });
}
`
    },
    forbid: ["'unload'"],
    require: ["'pagehide'", "'visibilitychange'"]
  },
  {
    id: 'wmg-029',
    title: 'showModalDialog 换成 dialog.showModal',
    difficulty: 'hard',
    tags: ['dialog', 'legacy'],
    prompt:
      'dialog.js 用了早已移除的 window.showModalDialog。改成原生 <dialog> 的 showModal()/close()，保留返回值语义（用 Promise 包装）。',
    files: {
      'dialog.js': `export function ask(message) {
  var answer = window.showModalDialog('prompt.html', message);
  return answer;
}
`
    },
    forbid: ['showModalDialog'],
    require: ['showModal\\(\\)', 'new Promise\\(']
  },
  {
    id: 'wmg-030',
    title: '串联 Promise 改成并行 + await',
    difficulty: 'hard',
    tags: ['async', 'performance'],
    prompt:
      'batch.js 串行 await 三次互不依赖的请求，慢且没有并发。改成 Promise.all 并行，失败时要能说明是哪一项挂了。',
    files: {
      'batch.js': `export async function loadAll(ids) {
  const users = await fetchOne('users', ids[0]);
  const posts = await fetchOne('posts', ids[1]);
  const tags = await fetchOne('tags', ids[2]);
  return { users, posts, tags };
}
`
    },
    forbid: ["await fetchOne\\('users'[\\s\\S]*await fetchOne\\('posts'"],
    require: ['Promise\\.all\\(', 'catch\\s*\\(|try\\s*\\{']
  },

  /* ---------------------------------------------------------------
   * v1.1 新增：多规则、多文件任务
   *
   * 为什么加这批：1.0 的 30 题实测呈**双峰分布**（22 题 100%、8 题 0%），
   * 原因是单点替换类任务「知道就一次做对，不知道就完全做不对」。
   * 这批任务每题含 3–5 条互相独立的规则、跨 2–3 个文件，
   * 让「做对一部分」成为可能，这样通过率才有中间地带，uplift 才有测量范围。
   * --------------------------------------------------------------- */
  {
    id: 'wmg-031',
    title: '三文件综合迁移：网络 + DOM + 语法',
    difficulty: 'hard',
    tags: ['multi-file', 'refactor', 'v1.1'],
    prompt:
      '三个文件各有一处历史包袱：api.js 用 XMLHttpRequest、ui.js 用 innerHTML 拼接、index.html 用 onclick 内联、util.js 用 var 和 substr。' +
      '全部改掉：网络用 fetch + await，DOM 用 textContent 与 addEventListener，变量用 const/let，截断用 slice。输出结构与导出名保持不变。',
    files: {
      'api.js': `export function load(url, apply) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      apply(JSON.parse(xhr.responseText));
    }
  };
  xhr.send();
}
`,
      'ui.js': `export function render(el, items) {
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += '<li class="item">' + items[i] + '</li>';
  }
  el.innerHTML = html;
}
`,
      'index.html': `<ul id="list"></ul>
<button id="save" onclick="save()">Save</button>
`,
      'util.js': `export function cut(s) {
  return s.substr(0, 5);
}
`
    },
    forbid: [
      'new XMLHttpRequest\\(',
      '\\.innerHTML\\s*=',
      'onclick=',
      '(^|[^\\w.])var\\s',
      '\\.substr\\('
    ],
    require: ['fetch\\(', 'await ', 'textContent', 'addEventListener\\(', 'const ', '\\.slice\\(']
  },
  {
    id: 'wmg-032',
    title: '表单校验：alert + event.returnValue 换成约束校验 API',
    difficulty: 'medium',
    tags: ['forms', 'validation', 'v1.1'],
    prompt:
      'form.js 用 alert 弹错误、用 event.returnValue 阻止提交（早已废弃）。改成约束校验 API：' +
      '用 checkValidity() 判断、用 setCustomValidity() 写错误文案、并监听 invalid 事件做统一提示。',
    files: {
      'form.js': `export function validate(form) {
  if (form.elements.email.value === '') {
    alert('email required');
    event.returnValue = false;
    return false;
  }
  return true;
}
`
    },
    forbid: ['[^.\\w]alert\\(', 'event\\.returnValue'],
    require: ['checkValidity\\(\\)', 'setCustomValidity\\(', "addEventListener\\('invalid'"]
  },
  {
    id: 'wmg-033',
    title: '图片加载：内联 onload + 手动 setAttribute 换成现代加载属性',
    difficulty: 'easy',
    tags: ['images', 'performance', 'v1.1'],
    prompt:
      'gallery.js 与 index.html 用内联 onload 和手动 setAttribute 控制图片加载。改成声明式：' +
      'img 加 loading="lazy" 与 decoding="async"，删掉全部内联 onload。',
    files: {
      'gallery.js': `export function loadImages(imgs) {
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].setAttribute('src', imgs[i].getAttribute('data-src'));
    imgs[i].setAttribute('onload', 'fadeIn(this)');
  }
}
`,
      'index.html': `<div class="grid">
  <img data-src="a.jpg" onload="fadeIn(this)" alt="a" />
  <img data-src="b.jpg" onload="fadeIn(this)" alt="b" />
</div>
`
    },
    forbid: ["setAttribute\\('onload'", 'onload='],
    require: ['loading="lazy"', 'decoding="async"']
  },
  {
    id: 'wmg-034',
    title: '时间处理：getYear 与字符串日期解析换成 Intl + Date.parse',
    difficulty: 'medium',
    tags: ['date', 'i18n', 'v1.1'],
    prompt:
      'time.js 用已废弃的 getYear()，并用 new Date(string) 解析用户输入（实现相关、各浏览器不一致）。' +
      '改成 Intl.DateTimeFormat 做展示、Date.parse 做解析，非法输入返回 NaN 而不是抛错。',
    files: {
      'time.js': `export function formatStamp(ts) {
  var d = new Date(ts);
  return d.getYear() + '-' + d.getMonth();
}

export function parseStamp(s) {
  var d = new Date(s);
  return d.getTime();
}
`
    },
    forbid: ['getYear\\(\\)', 'new Date\\(s\\)'],
    require: ['Intl\\.DateTimeFormat', 'Date\\.parse\\(', 'Number\\.isNaN\\(']
  },
  {
    id: 'wmg-035',
    title: '确认对话框：window.confirm 换成原生 dialog',
    difficulty: 'medium',
    tags: ['dialog', 'a11y', 'v1.1'],
    prompt:
      'modal.js 用 window.confirm 做确认、用 setAttribute 塞 tabindex 与 onclick。改成原生 <dialog>：' +
      '在 index.html 里加 <dialog> 元素，用 showModal()/close()，把提示区标成 aria-live，删掉内联 tabindex 与 onclick。',
    files: {
      'modal.js': `export function confirmAction(msg, onYes) {
  if (window.confirm(msg)) {
    onYes();
  }
  var box = document.getElementById('box');
  box.setAttribute('tabindex', '3');
  box.setAttribute('onclick', 'ok()');
}
`,
      'index.html': `<div id="box">ready</div>
`
    },
    forbid: ['window\\.confirm\\(', "setAttribute\\('tabindex'", "setAttribute\\('onclick'"],
    require: ['<dialog', 'showModal\\(\\)', 'aria-live']
  },
  {
    id: 'wmg-036',
    title: '布局：float 与 !important 换成 grid + clamp',
    difficulty: 'easy',
    tags: ['css', 'layout', 'v1.1'],
    prompt:
      'layout.css 用 float + clear 做栅格，还用 !important 压边距。改成 display: grid + gap，' +
      '把间距改成 clamp() 自适应，删掉全部 float / clear / !important。',
    files: {
      'layout.css': `.row { float: left; width: 33%; }
.clear { clear: both; }
.side { margin-left: 12px !important; }
`
    },
    forbid: ['float:\\s*left', 'clear:\\s*both', '!important'],
    require: ['display:\\s*grid', 'gap:', 'clamp\\(']
  },
  {
    id: 'wmg-037',
    title: '滚动监听：非 passive 回调 + setInterval 换成 rAF',
    difficulty: 'medium',
    tags: ['events', 'performance', 'v1.1'],
    prompt:
      'scroll.js 在 scroll 回调里用 setInterval 反复触发（会堆积定时器），而且监听没标 passive。' +
      '改成 { passive: true } 的监听 + requestAnimationFrame 节流，保证同一帧只回调一次。',
    files: {
      'scroll.js': `export function onScroll(el, cb) {
  el.addEventListener('scroll', function () {
    setInterval(function () {
      cb();
    }, 16);
  });
}
`
    },
    forbid: ["addEventListener\\('scroll',\\s*function", 'setInterval\\('],
    require: ['passive:\\s*true', 'requestAnimationFrame\\(']
  },
  {
    id: 'wmg-038',
    title: '网络：回调式 Promise 链换成 async + 超时 + allSettled',
    difficulty: 'hard',
    tags: ['async', 'network', 'v1.1'],
    prompt:
      'client.js 用 .then(function …) / .catch(function …) 写回调链，且没有超时、一个失败就全挂。' +
      '改成 async 函数：用 AbortSignal.timeout 控制超时，用 Promise.allSettled 收集结果并区分成功与失败项。',
    files: {
      'client.js': `export function loadAll(items) {
  return Promise.resolve(items)
    .then(function (list) {
      return list.map(function (i) {
        return fetchOne(i);
      });
    })
    .catch(function (e) {
      console.log(e);
    });
}
`
    },
    forbid: ['\\.then\\(function', '\\.catch\\(function'],
    require: ['async function|async \\(', 'AbortSignal\\.timeout\\(', 'Promise\\.allSettled\\(']
  },
  {
    id: 'wmg-039',
    title: '模块化：CommonJS 换成 ESM',
    difficulty: 'easy',
    tags: ['modules', 'v1.1'],
    prompt: 'legacy.js 用 require / module.exports。改成 ESM：import 引入依赖、export 导出，行为不变。',
    files: {
      'legacy.js': `const fs = require('fs');

function helper() {
  return fs.existsSync('.') ? 1 : 0;
}

module.exports = { helper };
`
    },
    forbid: ['[^.\\w]require\\(', 'module\\.exports'],
    require: ['^import ', '^export ']
  },
  {
    id: 'wmg-040',
    title: '安全渲染：innerHTML + eval + document.write 全清',
    difficulty: 'hard',
    tags: ['security', 'dom', 'v1.1'],
    prompt:
      'render.js 同时用了 innerHTML 拼 HTML、eval 解析配置、document.write 追加节点——三个都是注入面。' +
      '改成 createElement + textContent 构建 DOM、JSON.parse 解析配置（失败要兜底）、append 追加节点。',
    files: {
      'render.js': `export function show(el, data) {
  el.innerHTML = '<b>' + data.name + '</b>';
  var cfg = eval('(' + data.config + ')');
  document.write('<i>done</i>');
  return cfg;
}
`
    },
    forbid: ['innerHTML', '[^.\\w]eval\\(', 'document\\.write\\('],
    require: ['textContent', 'JSON\\.parse\\(', 'createElement\\(', 'append\\(']
  },

  /* ---------------------------------------------------------------
   * v1.1 第二批：**冷门新 API**
   *
   * 为什么需要这批：上面两批任务实测仍被 baseline 打穿（模型本来就会换 fetch/const/addeventlistener）。
   * 一个「现代 Web 指南」技能真正能创造增益的地方，是**模型先验里没有的那些新 API 名字与语义**：
   * scheduler.postTask、URLPattern、Intl.DurationFormat、moveBefore、popover、scrollend……
   * 这批任务的 baseline 预期接近 0，正好给技能留出可测量的上升空间。
   * --------------------------------------------------------------- */
  {
    id: 'wmg-041',
    title: '任务调度：setTimeout(0) 换成 scheduler.postTask / yield',
    difficulty: 'hard',
    tags: ['scheduling', 'new-api', 'v1.1'],
    prompt:
      'sched.js 用 setTimeout(fn, 0) 把工作推到下一个宏任务，并且用「是否超过 50ms」手工判断要不要让步。' +
      '改成调度器 API：用 scheduler.postTask 派发任务（带 priority），长循环里用 scheduler.yield() 定期让出主线程。',
    files: {
      'sched.js': `export function enqueue(work) {
  setTimeout(function () {
    work();
  }, 0);
}

export async function runChunked(items, handle) {
  const start = performance.now();
  for (const item of items) {
    if (performance.now() - start > 50) {
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    handle(item);
  }
}
`
    },
    forbid: ['setTimeout\\(function', 'setTimeout\\(r, 0\\)', 'setTimeout\\([^,]+, 0\\)'],
    require: ['scheduler\\.postTask\\(', 'scheduler\\.yield\\(\\)', "priority"]
  },
  {
    id: 'wmg-042',
    title: 'URL 匹配：手写正则换成 URLPattern',
    difficulty: 'hard',
    tags: ['url', 'new-api', 'v1.1'],
    prompt:
      'router.js 用一堆手写正则和字符串拼接解析路由（易错、不可读）。改成标准 URLPattern：' +
      '用 new URLPattern({ pathname }) 定义路由，pattern.exec(url) 取参数，不要再手写正则。',
    files: {
      'router.js': `const USER_RE = /^\\/users\\/(\\d+)$/;

export function matchUser(path) {
  const m = path.match(USER_RE);
  return m ? { id: Number(m[1]) } : null;
}

export function matchPost(path) {
  const parts = path.split('/');
  if (parts.length === 4 && parts[1] === 'posts') {
    return { id: Number(parts[2]), slug: parts[3] };
  }
  return null;
}
`
    },
    forbid: ['new RegExp', 'path\\.match\\(', 'const USER_RE', 'path\\.split\\('],
    require: ['new URLPattern\\(', '\\.exec\\(']
  },
  {
    id: 'wmg-043',
    title: '时长格式化：手写拼接换成 Intl.DurationFormat',
    difficulty: 'hard',
    tags: ['i18n', 'new-api', 'v1.1'],
    prompt:
      'duration.js 手写「X 小时 Y 分」的拼接，且写死中文单位，无法本地化。' +
      '改成 Intl.DurationFormat：传入 { hours, minutes, seconds } 对象，用 style: "long" 输出本地化文案。',
    files: {
      'duration.js': `export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  let out = '';
  if (h > 0) out += h + ' 小时 ';
  if (m > 0) out += m + ' 分 ';
  out += s + ' 秒';
  return out.trim();
}
`
    },
    forbid: ["' 小时 '", "' 分 '", "' 秒'"],
    require: ['Intl\\.DurationFormat', 'format\\(']
  },
  {
    id: 'wmg-044',
    title: '保留状态的 DOM 移动：remove + insert 换成 moveBefore',
    difficulty: 'hard',
    tags: ['dom', 'new-api', 'behavioral', 'v1.1'],
    prompt:
      'reorder.js 通过 removeChild + insertBefore 移动节点，导致 iframe/video 重新加载、焦点丢失。' +
      '改成新 API：用 element.moveBefore(node, ref) 保留节点状态，不要再 removeChild。',
    files: {
      'reorder.js': `export function moveToTop(list, item) {
  list.removeChild(item);
  list.insertBefore(item, list.firstChild);
}

export function swapSections(parent, a, b) {
  const anchor = a.nextSibling;
  parent.removeChild(a);
  parent.insertBefore(a, b);
}
`
    },
    // 与 058 同一套行为评分：判「首选是不是 moveBefore」，而不是「文件里有没有那个词」。
    // 这一改让 044 与 058 之间只剩「提示词给不给名字」一个变量，消融对才成立。
    // 代价：1.1.0 时代 044 的数字来自旧正则规则，与 1.4.x 不可直接比较（CHANGELOG v0.1.5 注明）。
    forbid: [],
    require: ['moveBefore\\('],
    behavior: BEHAVIOR_058
  },
  {
    id: 'wmg-045',
    title: '自定义下拉：div + class 切换换成 popover',
    difficulty: 'hard',
    tags: ['popover', 'a11y', 'new-api', 'v1.1'],
    prompt:
      'menu.js 用手写 class 切换和 document 点击监听做下拉菜单（层级、点击穿透、Esc 都要自己处理）。' +
      '改成原生 API：index.html 用 popover 属性 + popovertarget 按钮，脚本用 showPopover()/hidePopover()，删掉手写的 class 开关。',
    files: {
      'menu.js': `export function setupMenu(btn, panel) {
  let open = false;
  btn.addEventListener('click', function () {
    open = !open;
    panel.classList.toggle('open', open);
  });
  document.addEventListener('click', function (e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      open = false;
      panel.classList.remove('open');
    }
  });
}
`,
      'index.html': `<button id="trigger">Menu</button>
<div id="panel" class="panel">…</div>
`
    },
    forbid: ['classList\\.toggle\\(', 'classList\\.remove\\(', "document\\.addEventListener\\('click'"],
    require: ['popover', 'popovertarget', 'showPopover\\(\\)']
  },
  {
    id: 'wmg-046',
    title: '进入动画：rAF 双帧 hack 换成 @starting-style',
    difficulty: 'hard',
    tags: ['css', 'animation', 'new-api', 'v1.1'],
    prompt:
      'reveal.js 用 requestAnimationFrame 跑两帧再加 class 来触发过渡（hack）。' +
      '改成 CSS 原生能力：用 @starting-style 定义初始状态，用 transition-behavior: allow-discrete 让 display 可过渡，删掉双帧 hack。',
    files: {
      'reveal.js': `export function reveal(el) {
  el.style.opacity = '0';
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      el.classList.add('shown');
      el.style.opacity = '1';
    });
  });
}
`,
      'reveal.css': `.card { display: none; opacity: 0; }

.card.shown { display: block; opacity: 1; transition: opacity 200ms; }
`
    },
    forbid: ['requestAnimationFrame\\(function', 'classList\\.add\\('],
    require: ['@starting-style', 'transition-behavior:\\s*allow-discrete']
  },
  {
    id: 'wmg-047',
    title: '滚动结束检测：防抖猜测换成 scrollend 事件',
    difficulty: 'hard',
    tags: ['events', 'new-api', 'v1.1'],
    prompt:
      'scroller.js 用 scroll + 200ms 防抖去猜「滚动结束了」。改成标准 scrollend 事件，删掉防抖计时器。',
    files: {
      'scroller.js': `export function onScrollEnd(el, cb) {
  let timer = null;
  el.addEventListener('scroll', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      cb();
    }, 200);
  });
}
`
    },
    forbid: ['setTimeout\\(', 'clearTimeout\\('],
    require: ["addEventListener\\('scrollend'"]
  },
  {
    id: 'wmg-048',
    title: '长列表渲染：全量渲染换成 content-visibility',
    difficulty: 'hard',
    tags: ['css', 'performance', 'new-api', 'v1.1'],
    prompt:
      'feed.css 把所有卡片全量渲染，长列表滚动卡顿。改成 content-visibility: auto 配合 contain-intrinsic-size 让浏览器跳过屏外渲染，' +
      '并保留卡片原有尺寸不跳动。',
    files: {
      'feed.css': `.card {
  min-height: 180px;
  contain: layout paint;
}
`
    },
    forbid: ['contain:\\s*layout paint'],
    require: ['content-visibility:\\s*auto', 'contain-intrinsic-size']
  },
  {
    id: 'wmg-049',
    title: '超时与取消要同时生效（AbortSignal.any + Timeout）',
    difficulty: 'medium',
    tags: ['behavioral', 'network', 'new-api'],
    prompt:
      'net.js 里 getJson 同时支持「调用方传进来的 signal」和「自己的超时」，但现在的实现是二选一——只要调用方给了 signal，超时就彻底失效，慢接口会一直挂着。请用 AbortSignal.any 合并两个信号、用 AbortSignal.timeout 造超时信号，让两条取消路径都生效。别再用 setTimeout 手动 abort，也不许再出现 clearTimeout。',
    files: {
      'net.js': `export async function getJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  // bug：调用方给了 signal 就只监听它，超时彻底失效
  const signal = options.signal ?? controller.signal;
  try {
    const res = await fetch(url, { signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
`
    },
    forbid: ['clearTimeout\\(', 'options\\.signal \\?\\?'],
    require: ['AbortSignal\\.any\\(', 'AbortSignal\\.timeout\\('],
    behavior: BEHAVIOR_049
  },
  {
    id: 'wmg-050',
    title: 'deferred 与批收集改用 withResolvers / fromAsync',
    difficulty: 'medium',
    tags: ['behavioral', 'async', 'new-api'],
    prompt:
      'batch.js 里 createGate 靠手写 new Promise 把 resolve/reject 泄漏到外面，collect 靠 for await 手动 push。请把 createGate 改成 Promise.withResolvers()，把 collect 改成 Array.fromAsync。要求：createGate 返回的对象仍能拿到 promise 和两个控制函数；collect 既能吃同步可迭代（里面的 Promise 要被解包），也能吃异步生成器。',
    files: {
      'batch.js': `export function createGate() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function collect(iterable) {
  const out = [];
  for await (const value of iterable) out.push(value);
  return out;
}
`
    },
    forbid: ['new Promise\\(\\(', 'for await \\('],
    require: ['Promise\\.withResolvers\\(', 'Array\\.fromAsync\\('],
    behavior: BEHAVIOR_050
  },
  {
    id: 'wmg-051',
    title: '分组用 groupBy，排序用 toSorted',
    difficulty: 'medium',
    tags: ['behavioral', 'collection', 'new-api'],
    prompt:
      'report.js 里三个函数都用老写法：两个分组函数用 reduce 手搓累加器，ranked 用 sort 把调用方传进来的数组就地排序（这是个 bug，调用方数组被改了）。请改成 Object.groupBy / Map.groupBy / toSorted。输出要保持原样：byTeam 返回普通对象、byTeamMap 返回 Map、两者的值都是「人名数组」；ranked 返回新的降序数组，且不许改动入参。',
    files: {
      'report.js': `export function byTeam(people) {
  return people.reduce((acc, p) => {
    const list = acc[p.team] ?? [];
    list.push(p.name);
    acc[p.team] = list;
    return acc;
  }, {});
}

export function byTeamMap(people) {
  return people.reduce((acc, p) => {
    const list = acc.get(p.team) ?? [];
    list.push(p.name);
    acc.set(p.team, list);
    return acc;
  }, new Map());
}

export function ranked(scores) {
  return scores.sort((a, b) => b - a);
}
`
    },
    forbid: ['\\.reduce\\(', '\\.sort\\('],
    require: ['Object\\.groupBy\\(', 'Map\\.groupBy\\(', '\\.toSorted\\('],
    behavior: BEHAVIOR_051
  },
  {
    id: 'wmg-052',
    title: '深拷贝丢了 Date/Map/Set，集合运算改用手法',
    difficulty: 'medium',
    tags: ['behavioral', 'collection', 'new-api'],
    prompt:
      'state.js 里 cloneState 用 JSON 往返做深拷贝——Date 变字符串、Map 变空对象、Set 变空对象，这是真 bug。请改成 structuredClone。另外 merged/shared/onlyA 现在是手工展开 + filter，请改成 Set 自带的 union / intersection / difference。四个函数都不许改动入参，返回值类型保持不变（三个集合函数返回 Set）。',
    files: {
      'state.js': `export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function merged(a, b) {
  return new Set([...a, ...b]);
}

export function shared(a, b) {
  return new Set([...a].filter((x) => b.has(x)));
}

export function onlyA(a, b) {
  return new Set([...a].filter((x) => !b.has(x)));
}
`
    },
    forbid: ['JSON\\.parse\\(JSON\\.stringify\\(', '\\.filter\\('],
    require: ['structuredClone\\(', '\\.union\\(', '\\.intersection\\(', '\\.difference\\('],
    behavior: BEHAVIOR_052
  },
  {
    id: 'wmg-053',
    title: '错误链改用 cause 与 AggregateError',
    difficulty: 'medium',
    tags: ['behavioral', 'error', 'new-api'],
    prompt:
      'api.js 里 wrap 把原始错误信息拼进 message 并存到自定义字段 originalError 上；loadAll 把多个失败拼成一个字符串错误抛出去，调用方拿不到原始错误对象。请改成标准写法：wrap 用 Error 的 cause 选项指回原错误、message 保持干净；loadAll 用 AggregateError，把每个原始错误放进 errors 数组。',
    files: {
      'api.js': `export function wrap(err, message) {
  const wrapped = new Error(message + ': ' + err.message);
  wrapped.originalError = err;
  return wrapped;
}

export async function loadAll(fetchJson, urls) {
  const out = [];
  const failed = [];
  for (const url of urls) {
    try {
      out.push(await fetchJson(url));
    } catch (err) {
      failed.push(err);
    }
  }
  if (failed.length > 0) {
    throw new Error('failed: ' + failed.map((e) => e.message).join('; '));
  }
  return out;
}
`
    },
    forbid: ['originalError', 'new Error\\(message \\+'],
    require: ['cause:', 'AggregateError'],
    behavior: BEHAVIOR_053
  },
  {
    id: 'wmg-054',
    title: '三个数组函数都在偷改入参',
    difficulty: 'medium',
    tags: ['behavioral', 'collection', 'new-api'],
    prompt:
      'todo.js 里 undoLast 用 reverse 就地翻转、rename 直接给下标赋值、removeAt 用 splice 就地删除——三个函数都把调用方的数组改坏了。请改成非破坏性写法：toReversed / with / toSpliced。要求返回值与原来语义一致，且入参一个字节都不许动。',
    files: {
      'todo.js': `export function undoLast(list) {
  return list.reverse();
}

export function rename(list, index, text) {
  list[index] = { ...list[index], text };
  return list;
}

export function removeAt(list, index) {
  list.splice(index, 1);
  return list;
}
`
    },
    forbid: ['\\.reverse\\(', '\\.splice\\(', 'list\\[index\\] ='],
    require: ['\\.toReversed\\(', '\\.with\\(', '\\.toSpliced\\('],
    behavior: BEHAVIOR_054
  },
  {
    id: 'wmg-055',
    title: 'URL 校验别再靠 try-catch',
    difficulty: 'medium',
    tags: ['behavioral', 'url', 'new-api'],
    prompt:
      'links.js 里 safeParse / isLink 都用 try-catch 包 new URL 来判断合法性。请改成静态方法：URL.parse 解析失败返回 null，URL.canParse 返回布尔值。hostOf 要保持「非法输入给空串」。改完文件里不该再出现 try。',
    files: {
      'links.js': `export function safeParse(input) {
  try {
    return new URL(input);
  } catch (err) {
    return null;
  }
}

export function isLink(input) {
  try {
    new URL(input);
    return true;
  } catch (err) {
    return false;
  }
}

export function hostOf(input) {
  const parsed = safeParse(input);
  return parsed ? parsed.host : '';
}
`
    },
    forbid: ['try\\s*\\{'],
    require: ['URL\\.parse\\(', 'URL\\.canParse\\('],
    behavior: BEHAVIOR_055
  },
  {
    id: 'wmg-056',
    title: '字素簇、NFC、土耳其语小写',
    difficulty: 'medium',
    tags: ['behavioral', 'i18n', 'new-api'],
    prompt:
      'text.js 里三个函数各踩一个坑：graphemes 用展开运算符切字符串，组合符和 ZWJ 表情会被切成好几段；normalize 什么都没做，而它应该输出 NFC；fold 用 toLowerCase，在土耳其语环境里大写 I 的小写是 ı 而不是 i。请分别改成 Intl.Segmenter（granularity 用 grapheme）、normalize(\'NFC\')、toLocaleLowerCase(\'tr\')。',
    files: {
      'text.js': `export function graphemes(s) {
  return [...s];
}

export function normalize(s) {
  return s;
}

export function fold(s) {
  return s.toLowerCase();
}
`
    },
    forbid: ['\\[\\.\\.\\.s\\]', '\\.toLowerCase\\('],
    require: ['Intl\\.Segmenter', "normalize\\('NFC'\\)", "toLocaleLowerCase\\('tr'\\)"],
    behavior: BEHAVIOR_056
  },

  /* --------- 消融组：同 fixture、同评分器，只把提示词里的 API 名字拿掉 ---------
   *
   * 为什么要有这一组：wmg-045 的提示词直接写了 popover / popovertarget / showPopover，
   * 于是它变成一道「照抄」题，baseline 100%。把 API 名字删掉，同样的活就变成
   * 「你知道浏览器有这个东西吗」，那才是技能要补的信息差。
   * 两组配对（045 ↔ 057、044 ↔ 058）构成一个干净的对照：变量只有提示词。
   */

  {
    id: 'wmg-057',
    title: '下拉菜单要原生浮层，不许手写 class 开关（提示词不给 API 名）',
    difficulty: 'hard',
    tags: ['popover', 'a11y', 'new-api', 'withheld', 'ablation'],
    prompt:
      'menu.js 用手写 class 切换 + document 级点击监听做下拉菜单：层级、点击穿透、Esc 关闭全得自己处理，还常常关不掉。' +
      '请改成浏览器**原生**的浮层机制：触发按钮和面板用原生属性关联，脚本只负责显示与隐藏，' +
      '删掉所有手写的 class 开关与 document 点击监听；Esc 和点空白处关闭走原生实现。',
    files: {
      'menu.js': `export function setupMenu(btn, panel) {
  let open = false;
  btn.addEventListener('click', function () {
    open = !open;
    panel.classList.toggle('open', open);
  });
  document.addEventListener('click', function (e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      open = false;
      panel.classList.remove('open');
    }
  });
}
`,
      'index.html': `<button id="trigger">Menu</button>
<div id="panel" class="panel">…</div>
`
    },
    forbid: ['classList\\.toggle\\(', 'classList\\.remove\\(', "document\\.addEventListener\\('click'"],
    // 这里**不要求**某一种特定写法：声明式（popovertarget）和命令式（showPopover()）都是正解。
    // 用单条正则里的 alternation 表达「二者其一」，否则会把另一条正解判成错，
    // 这一条是实测踩出来的：第一版要求 showPopover() 把声明式答案全判错了，见 docs/16 §四。
    require: ['popover', '(popovertarget|showPopover\\(\\))']
  },
  {
    id: 'wmg-058',
    title: '移动 DOM 节点不许重载状态（提示词不给 API 名）',
    difficulty: 'hard',
    tags: ['behavioral', 'dom', 'new-api', 'withheld', 'ablation'],
    prompt:
      'reorder.js 用 removeChild + insertBefore 移动节点，副作用是 iframe/video 重新加载、焦点丢失、CSS 过渡被打断。' +
      '请改成浏览器原生的移动能力：节点在 DOM 里换位置，但它**不算被重新插入**——状态要保留。不要再 removeChild。',
    files: {
      'reorder.js': `export function moveToTop(list, item) {
  list.removeChild(item);
  list.insertBefore(item, list.firstChild);
}

export function swapSections(parent, a, b) {
  const anchor = a.nextSibling;
  parent.removeChild(a);
  parent.insertBefore(a, b);
}
`
    },
    // 不 forbid removeChild/insertBefore：回退分支是合法工程。
    // 靠 behavior 判「首选是不是 moveBefore」，见 BEHAVIOR_058 的注释。
    forbid: [],
    require: ['moveBefore\\('],
    behavior: BEHAVIOR_058
  },

  /* --------- 第三批：技能里真的写了、提示词不给名字的平台新特性 ---------
   *
   * 选题依据见 docs/16 §七：先在 guides/ 里 grep 候选 API（括号里是命中次数），
   * 只挑技能覆盖得到、且模型先验大概率没有的：
   *   field-sizing(24) · appearance:base-select(38) · scroll-state(74)
   *   subgrid(29) · light-dark(51) · anchor-name(21)
   * 提示词一律只写症状，不写属性名，这是这一批和 v1.1 那 28 道题的根本区别。
   */

  {
    id: 'wmg-059',
    title: '多行输入框随内容长高（提示词不给属性名）',
    difficulty: 'medium',
    tags: ['css', 'forms', 'withheld', 'v1.4'],
    prompt:
      'comment-box.html 里的多行输入框要在用户打字时自动长高。现在的做法是每次 input 事件里读一遍内容高度、' +
      '再把高度写回 style——会抖、会跳、粘贴长文本时先卡一下。请删掉这段脚本，用样式层解决：' +
      '输入框按内容自动决定高度，不再有行数约束。',
    files: {
      'comment-box.html': `<label for="msg">留言</label>
<textarea id="msg" rows="2"
  oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px'"></textarea>
`
    },
    forbid: ['scrollHeight', 'rows="2"'],
    require: ['field-sizing:\\s*content']
  },
  {
    id: 'wmg-060',
    title: '下拉选项要放图标（提示词不给属性名）',
    difficulty: 'medium',
    tags: ['css', 'forms', 'a11y', 'withheld', 'v1.4'],
    prompt:
      'pick.html 为了在选项里放图标和副标题，整个用 div 手搓了个下拉（role=listbox / role=option，' +
      '键盘导航、展开收起、屏幕阅读器全自己管）。请改回原生 select，但保留富内容：' +
      '每个选项里能放图标与说明文字，弹出的列表也由浏览器负责。不要再出现 role="listbox" 这类手工模拟。',
    files: {
      'pick.html': `<div class="fake-select">
  <button role="combobox" aria-expanded="false" aria-controls="list">选一种</button>
  <ul id="list" role="listbox">
    <li role="option" tabindex="0">🍎 苹果</li>
    <li role="option" tabindex="0">🍌 香蕉</li>
  </ul>
</div>
`
    },
    forbid: ['role="listbox"', 'role="option"'],
    require: ['<select', 'appearance:\\s*base-select']
  },
  {
    id: 'wmg-061',
    title: '吸顶后换样式（提示词不给属性名）',
    difficulty: 'hard',
    tags: ['css', 'scroll', 'withheld', 'v1.4'],
    prompt:
      'page.html 里的标题栏吸顶之后要加一层阴影（表示"已经贴住了"）。现在打算用 JS 监听滚动、' +
      '比较 scrollTop 与元素位置来判断，还要处理 requestAnimationFrame 节流。请改成纯样式方案：' +
      '让外层容器能感知子元素的滚动状态，再用容器查询判断它是否处于"吸住"状态。脚本一行都不要。',
    files: {
      'page.html': `<div class="scroller">
  <header class="sticky-header">标题</header>
  <p>正文……</p>
</div>
`,
      'page.css': `.scroller { height: 320px; overflow-y: auto; }
.sticky-header { position: sticky; top: 0; background: #fff; }
`
    },
    forbid: ['IntersectionObserver', 'addEventListener\\(', 'scrollTop'],
    // 具名容器（`@container sticky-header scroll-state(...)`）和不具名写法都是正解，
    // 只匹配不具名那种会把更常见的具名写法判成缺，这是第五次被自己的正则坑（docs/16 §四.3）
    require: ['container-type:\\s*scroll-state', '@container\\s+(?:[\\w-]+\\s+)?scroll-state\\(']
  },
  {
    id: 'wmg-062',
    title: '多张卡片的行要对齐（提示词不给属性名）',
    difficulty: 'medium',
    tags: ['css', 'layout', 'withheld', 'v1.4'],
    prompt:
      'cards.css 里三张卡片的标题、正文、底部按钮长度都不一样，为了让「按钮在同一水平线」，' +
      '现在给标题写死 min-height 硬凑。请改成让卡片内部的行轨道直接继承外层栅格的行，' +
      '这样无论内容多长，标题行、正文行、按钮行都天然对齐。不要再用固定高度。',
    files: {
      'cards.css': `.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.card { display: grid; grid-template-rows: auto 1fr auto; gap: 8px; }
.card h3 { margin: 0; min-height: 48px; }
.card p { margin: 0; }
.card .cta { margin: 0; }
`
    },
    forbid: ['min-height:\\s*\\d'],
    require: ['grid-template-rows:\\s*subgrid']
  },
  {
    id: 'wmg-063',
    title: '深浅色只写一遍（提示词不给函数名）',
    difficulty: 'easy',
    tags: ['css', 'theme', 'withheld', 'v1.4'],
    prompt:
      'theme.css 现在靠媒体查询把整套变量复制了一份给深色模式，两边容易改漏、也容易不同步。' +
      '请改成「一处声明同时给出浅色与深色两个值」的写法：每个颜色只在定义时写一次，' +
      '浏览器按当前主题自己挑。媒体查询那段删掉。',
    files: {
      'theme.css': `:root { --bg: #ffffff; --fg: #111111; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #111111; --fg: #eeeeee; }
}
body { background: var(--bg); color: var(--fg); }
`
    },
    forbid: ['prefers-color-scheme'],
    require: ['light-dark\\(']
  },
  {
    id: 'wmg-064',
    title: '提示框跟着按钮定位（提示词不给属性名）',
    difficulty: 'hard',
    tags: ['css', 'positioning', 'withheld', 'v1.4'],
    prompt:
      'position.js 用 getBoundingClientRect 算坐标，把提示框摆到按钮上方，一滚动、一换布局就错位，' +
      '窗口尺寸变化后还得重算。请把这套坐标计算全部删掉，改成样式层解决：' +
      '按钮声明一个「锚点」名字，提示框声明自己以哪个锚点为参照、贴在它的哪一侧。脚本不要再参与定位。',
    files: {
      'position.js': `export function place(btn, tip) {
  const rect = btn.getBoundingClientRect();
  tip.style.left = rect.left + 'px';
  tip.style.top = rect.top - tip.offsetHeight - 8 + 'px';
  tip.style.opacity = '1';
}
`,
      'tooltip.css': `.tip { position: absolute; opacity: 0; }
`
    },
    forbid: ['getBoundingClientRect', 'offsetHeight'],
    // 选中锚点有三种等价写法：position-anchor / position-area / HTML 上的 anchor 属性。
    // 只认 position-anchor 会把「用 position-area 一次说清上下左右」的更优解判错。
    require: ['anchor-name:', '(position-anchor:|position-area:|anchor=)']
  }
];

const VERIFY_TEMPLATE = `#!/usr/bin/env node
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
const corpus = files.map((f) => readFileSync(f, 'utf8')).join('\\n');

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
      remaining.length ? '仍存在：' + remaining.map((r) => \`\${r.pattern} => \${r.hit}\`).join(' | ') : '',
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
`;

const PROMPT_TEMPLATE = (t: TaskSpec) => `# ${t.title}

${t.prompt}

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。${t.behavior ? `
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。` : ''}
`;

/**
 * 行为版评分器：先查写法，再把候选代码真的跑一遍。
 *
 * 为什么要有第二种模板：纯正则评分器能被「把 API 名字抄进注释/字符串里」骗过去，
 * 也能被「写法对但语义错」骗过去。wmg-049 之后的任务改成「正则 + 行为」双闸：
 * behavior.mjs 里跑的是真实的边界用例（真起 HTTP server、真做深拷贝、真按字素簇切）。
 */
const VERIFY_BEHAVIORAL_TEMPLATE = `#!/usr/bin/env node
// 自动生成：web-guidance A 级评分器（行为版）
// stdin: {"task_id":"...","workspace":"..."}
// stdout: {"pass":bool,"detail":"...","metrics":{...}}
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
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
const corpus = files.map((f) => readFileSync(f, 'utf8')).join('\\n');

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

let behavior = { pass: false, detail: 'behavior.mjs 没跑起来', cases: [] };
try {
  const mod = await import(pathToFileURL(path.join(HERE, 'behavior.mjs')).href);
  behavior = await mod.run(ws);
} catch (e) {
  behavior = { pass: false, detail: '行为测试抛异常：' + (e && e.message ? e.message : String(e)), cases: [] };
}

const rulePass = remaining.length === 0 && missing.length === 0;
const pass = rulePass && behavior.pass === true;
const failedCases = (behavior.cases || []).filter((c) => !c.pass);
const detail = pass
  ? '废弃写法已清除，行为测试全过（' + (behavior.cases || []).length + ' 个用例）'
  : [
      remaining.length ? '仍存在：' + remaining.map((r) => r.pattern + ' => ' + r.hit).join(' | ') : '',
      missing.length ? '缺少：' + missing.join(' | ') : '',
      failedCases.length ? '行为不符：' + failedCases.map((c) => c.name + (c.detail ? '(' + c.detail + ')' : '')).join(' | ') : ''
    ]
      .filter(Boolean)
      .join('；');

console.log(
  JSON.stringify({
    pass,
    detail,
    metrics: {
      forbidden_total: RULES.forbid.length,
      forbidden_remaining: remaining.length,
      missing: missing.length,
      behavior_cases: (behavior.cases || []).length,
      behavior_failed: failedCases.length
    }
  })
);
`;

async function main(): Promise<void> {
  const calibration = await loadCalibration();
  await fsp.rm(outDir, { recursive: true, force: true });
  const tasksDir = path.join(outDir, 'tasks');
  await fsp.mkdir(tasksDir, { recursive: true });

  const tasks = [];
  for (const t of TASKS) {
    const dir = path.join(tasksDir, t.id);
    const fixtureDir = path.join(dir, 'fixture');
    await fsp.mkdir(fixtureDir, { recursive: true });
    for (const [rel, content] of Object.entries(t.files)) {
      const abs = path.join(fixtureDir, rel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, content, 'utf8');
    }
    await fsp.writeFile(path.join(dir, 'prompt.md'), PROMPT_TEMPLATE(t), 'utf8');
    await fsp.writeFile(
      path.join(dir, 'rules.json'),
      JSON.stringify({ forbid: t.forbid, require: t.require }, null, 2) + '\n',
      'utf8'
    );
    if (t.behavior) {
      await fsp.writeFile(path.join(dir, 'behavior.mjs'), t.behavior, 'utf8');
    }
    await fsp.writeFile(
      path.join(dir, 'verify.mjs'),
      t.behavior ? VERIFY_BEHAVIORAL_TEMPLATE : VERIFY_TEMPLATE,
      'utf8'
    );
    const measured = calibration?.tasks?.[t.id];
    const difficulty = measured ? (measured.baseline >= 0.85 ? 'easy' : measured.baseline <= 0.2 ? 'hard' : 'medium') : t.difficulty;
    tasks.push({
      id: t.id,
      title: t.title,
      prompt_file: `tasks/${t.id}/prompt.md`,
      fixture: `tasks/${t.id}/fixture/`,
      verify: `tasks/${t.id}/verify.mjs`,
      weight: 1.0,
      difficulty,
      expected_baseline: measured
        ? { min: round2(Math.max(0, measured.baseline - 0.15)), max: round2(Math.min(1, measured.baseline + 0.15)) }
        : baselineRange(t.difficulty),
      tags: measured ? [...t.tags, 'calibrated'] : t.tags
    });
  }

  const taskset = {
    schema_version: '1.0.0',
    domain: 'web-guidance',
    version: '1.4.0',
    title: 'Modern Web Guidance 合规任务集',
    description:
      '64 个小型 fixture：wmg-001~030 是单点 API 替换，wmg-031~048 是多规则/多文件任务，wmg-049~056 是行为测试题（评分器把候选代码 import 进来真跑边界用例），wmg-057~058 是消融组（同 fixture、同评分器，只把提示词里的 API 名字拿掉），wmg-059~064 是「技能覆盖 + 提示词不给名字」的第三批（field-sizing / base-select / scroll-state / subgrid / light-dark / anchor）。评分器都是 A 级 tests：可执行检查，零主观判断。',
    maintainer: 'upliftbench',
    official: true,
    grader: {
      kind: 'tests',
      tier: 'A',
      entry: 'tasks/wmg-001/verify.mjs',
      version: '1.4.0',
      timeout_sec: 120
    },
    env: {
      kind: 'local',
      ...(fixtureCommit('web-guidance') ? { commit: fixtureCommit('web-guidance') } : {})
    },
    task_count: tasks.length,
    tasks
  };

  await fsp.writeFile(path.join(outDir, 'taskset.json'), JSON.stringify(taskset, null, 2) + '\n', 'utf8');
  // 生成器会先清空目录，所以标定文件要原样写回
  if (calibration) {
    await fsp.writeFile(path.join(outDir, 'calibration.json'), JSON.stringify(calibration, null, 2) + '\n', 'utf8');
  }

  const byDiff = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.difficulty] = (acc[t.difficulty] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`web-guidance@${taskset.version} 生成完成：${tasks.length} 个任务 -> ${path.relative(root, outDir)}`);
  console.log(`  难度分布：${JSON.stringify(byDiff)}`);
  console.log(
    calibration
      ? `  已用实测标定回填 expected_baseline（${Object.keys(calibration.tasks).length}/${tasks.length} 个任务，model=${calibration.model ?? '?'}）`
      : '  尚未标定：expected_baseline 用的是设计意图区间'
  );
}

interface Calibration {
  measured_at?: string;
  model?: string;
  tasks: Record<string, { baseline: number; samples: number }>;
}

/**
 * 读实测标定（uplift run --arms baseline 的产物）。
 *
 * 有标定就用实测值回填 expected_baseline 并把难度标签改成与实测一致；
 * 没有就退回设计意图的区间。**这是刻意的：声明的难度必须能被实测推翻。**
 */
async function loadCalibration(): Promise<Calibration | null> {
  const p = path.join(outDir, 'calibration.json');
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as Calibration;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function baselineRange(d: TaskSpec['difficulty']): { min: number; max: number } {
  switch (d) {
    case 'easy':
      return { min: 0.7, max: 0.9 };
    case 'medium':
      return { min: 0.3, max: 0.6 };
    case 'hard':
      return { min: 0.05, max: 0.2 };
  }
}

void main();
