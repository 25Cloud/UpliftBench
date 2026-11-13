import path from 'node:path';
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
