import path from 'node:path';
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
