import path from 'node:path';
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
