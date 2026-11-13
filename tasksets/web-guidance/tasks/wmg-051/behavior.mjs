import path from 'node:path';
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
