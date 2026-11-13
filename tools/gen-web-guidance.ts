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
 * 只有在 tasksets/<domain> 已经提交且工作区干净时才能填——否则填进去的 sha 是假的。
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
}

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
- 改完直接用标准 API，不要引入第三方依赖。
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
    await fsp.writeFile(path.join(dir, 'verify.mjs'), VERIFY_TEMPLATE, 'utf8');
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
    version: '1.0.0',
    title: 'Modern Web Guidance 合规任务集',
    description:
      '30 个小型 fixture，每个含一处（或数处）已废弃的 Web API 用法。评分器是 A 级 tests：可执行规则检查，零主观判断。',
    maintainer: 'upliftbench',
    official: true,
    grader: {
      kind: 'tests',
      tier: 'A',
      entry: 'tasks/wmg-001/verify.mjs',
      version: '1.0.0',
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
  console.log(`web-guidance@1.0 生成完成：${tasks.length} 个任务 -> ${path.relative(root, outDir)}`);
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
