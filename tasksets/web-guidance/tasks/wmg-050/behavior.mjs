import path from 'node:path';
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
