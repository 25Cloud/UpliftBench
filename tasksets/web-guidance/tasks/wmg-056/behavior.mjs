import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMBINING = 'e\u0301';
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';

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
    cases.push({ name: 'fold 用土耳其语规则（大写 I 的小写是 ı）', pass: out === '\u0131', detail: out });
  } catch (e) {
    cases.push({ name: 'fold 用土耳其语规则（大写 I 的小写是 ı）', pass: false, detail: String(e && e.message) });
  }

  return {
    pass: cases.every((c) => c.pass),
    detail: cases.filter((c) => !c.pass).map((c) => c.name).join(' / ') || '全过',
    cases
  };
}
