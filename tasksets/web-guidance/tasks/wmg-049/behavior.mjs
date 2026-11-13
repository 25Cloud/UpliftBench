import http from 'node:http';
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
