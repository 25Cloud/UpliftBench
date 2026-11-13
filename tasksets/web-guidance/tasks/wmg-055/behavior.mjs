import path from 'node:path';
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
