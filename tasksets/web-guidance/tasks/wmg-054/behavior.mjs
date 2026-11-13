import path from 'node:path';
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
