# 变更记录

格式：`协议版本` / `软件版本` 分开记。破坏性变更必须标 **BREAKING**。

---

## 2026-11-13 · v0.2.0（英文 README · `uplift demo` · 复合 Action · 中英双语输出）

目标是把仓库从「研究笔记 + 工具」推到「别人能立刻上手、能贴进自己 README」的状态。
这一版**没有改任何指标定义**（protocol 仍是 1.0.0），改的全是门面与可用性。

### 新增

- **`docs/02-protocol.en.md`**：协议规范英文版。中文版仍是规范性文本，英文版顶部写明
  「若两份不一致，以中文为准」，并在两边互相链接。**国际读者第一次能读到指标定义了**——
  这是这一轮最该做的一件事，因为协议才是这个项目的产品。
- **`README.md` 重写为英文**（面向国际读者的精简版：三臂设计 → 60 秒 demo → 三组结果 →
  我们错过的三件事 → 不主张什么 → 自己的技能怎么用）。原中文 README 保留为 `README.zh-CN.md`，
  两边互相链接。
- **`docs/assets/hero.svg`**：由 `tools/gen-hero.mjs` 生成的三臂对照图。数字写在脚本里
  （带出处注释），改数字要回 `docs/15`/`docs/16` 核对——不留一张"看着专业"的旧图。
- **`uplift demo`**：零依赖、零模型调用、113ms 出卡的自检命令。新读者 clone 完就跑得动，
  不用 key、不用任务集。会把"这只是 Tier 0，还不是分数"讲清楚。
- **中英双语终端输出**：`--lang en` 或 `UPLIFT_LANG=en`。默认仍是中文（保持历史文档里引用的输出不变）。
  翻译只覆盖人读的标签，JSON 字段名一律不动——那是数据契约。
- **`action.yml`（复合 GitHub Action）**：PR 里跑 Tier 0，把卡片写进 job summary，
  卡 JSON 作为 artifact 上传。输出 `total_tokens` 与 `card` 两个 output。
- **`CONTRIBUTING.md`**：六条不让步的规矩、怎么交任务集（含标定与准入）、怎么加 harness 适配器，
  以及两条最容易犯的错：**评分器必须接受等价正解**、**提示词不许给答案**。
- **`CITATION.cff`**：引用时必须带上 protocol 与软件版本——没有版本的数字不可复现。
- **issue 模板两枚**：「挑战一个已发布的数字」（带 run database 要求）与普通 bug。
  前者是这类项目最该有的入口，因为我们已经公开纠正过自己五次。
- `pnpm demo` / `pnpm gen:hero` / `pnpm check:links` 三个脚本。

### 顺手修掉

- Tier 0 卡的 markdown 行有冗余（整包口径下会重复写一遍「整包 N」），现在只在
  「按最大单技能判定」时才解释口径。
- `card.verdict.headline` 的 Tier 0 文案跟着输出语言走（以前英文卡下面会挂一行中文）。

### 不变量（这一版特意确认过）

- `protocol/1.0.0` 一个字没改；`uplift = treatment − placebo`
- 中文终端输出与 v0.1.5 逐字节一致（`demo`、`card --format markdown` 都对照过）
- 109 个单测全过；6 张卡仍过 schema；任务集仍 `validate` 通过

---

## 2026-11-13 · v0.1.5（n=10 定稿 · 五题全正 · +36pp）

### 实测（150 次 run，$29.79）

5 道关键题各 10 次重复 × 3 臂，`--activation forced`：

| 题 | baseline | placebo | treatment | uplift |
|---|---|---|---|---|
| `wmg-044` 给名 moveBefore | 6/10 | 6/10 | **8/10** | +20pp |
| `wmg-058` 不给名 | 1/10 | 0/10 | **4/10** | +40pp |
| `wmg-060` base-select | 0/10 | 0/10 | **6/10** | +60pp |
| `wmg-061` scroll-state | 6/10 | 7/10 | **9/10** | +20pp |
| `wmg-064` 锚点定位 | 4/10 | 3/10 | **7/10** | +40pp |
| **合计** | **34%** | **32%** | **68%** | **+36pp**，CI [+24, +48] |

**安慰剂效应 −2pp。** 同样的注入量，中性文本几乎不值钱，真技能值 +36pp——
这是三臂设计第一次在干净条件下把「长度」和「知识」分开。

**并推翻了自己上一轮的三次负结论**：`044` 的 −40pp、`061` 的 −67pp、`064` 的 −33pp
全部来自评分器误判 + 小样本抖动。`044` 换成行为评分后从 0/5 变 8/10。

### 软件 v0.1.5

- `wmg-044` 从正则评分改为**行为评分**（与 `058` 共用同一套假 DOM 断言），
  于是消融对（044 ↔ 058）之间只剩「提示词给不给名字」一个变量
- `uplift taskset inspect` 现在读 `calibration.json`，显示**实测通过率分布**与天花板占比；
  以前只有「设计意图」的难度标签，两者经常打架（`docs/13 §二.1`）
- 评分器自检扩到 21 条（`044` 的 fixture + 带回退参考解各一条）

### 注意：`wmg-044` 的数字不可跨版本比较

1.1.0 时代 `044` 的数字来自旧正则规则（会误判「首选 + 回退」）。要引用 `044`
请用 1.4.x / v0.1.5 之后的数据，并在引用时注明评分器版本。

---

## 2026-11-13 · v0.1.4（第三批任务 · 五次评分器误判 · 第一个干净的正结果）

### 任务集 web-guidance@1.4.0（58 → 64 题）

- **+6 道「提示词不给名字」的新题**（`wmg-059~064`），选题按 `docs/16 §七` 的判据：
  先在 `guides/` 里 grep，只留技能覆盖得到的特性，提示词只写症状。
  `field-sizing`(24) · `appearance: base-select`(38) · `scroll-state`(74) · `subgrid`(29) ·
  `light-dark()`(51) · 锚点定位(21)。括号里是技能语料里的命中次数。
- `wmg-058` 从正则改为**行为测试**：造一个假 DOM，断言「顺序对」且「首选走 moveBefore」。
  于是「首选 + 特性检测回退」这种正确工程从判错变成判过。
- 64 题全量重新标定（多库合并，每任务 3–13 次采样）。

### 软件 v0.1.4

- `tests/taskset.test.ts` 新增守卫：**withheld 组的提示词里不许出现它要考的那个名字**。
  这是这批题存在的全部理由，写回去就等于把答案抄进题干，必须由测试拦。
- 评分器自检扩到 19 条（`wmg-058` 的 fixture 与「带回退参考解」各一条）

### 实测（追加）

- 消融对重测 n=5（60 次 run）：`058` baseline 0/5 → treatment 2/5；`044` treatment 0/5（旧规则，会误判回退）
- 第三批三臂（每格 n=9）：baseline 44% → treatment 89%，**uplift +45pp**
- **`wmg-060`（`appearance: base-select`）是这个项目目前最干净的正结果：baseline 0/3、placebo 0/3、treatment 3/3**

### 修正：五次评分器误判，同一个根因

| # | 题 | 误判 | 正解被判错的原因 |
|---|---|---|---|
| 1 | `057` | 要求 `showPopover()` | 声明式 `popovertarget` 更现代，但没调用该方法 |
| 2 | `057` | 要求 `popovertarget` | 命令式 `showPopover()` 同样正确 |
| 3 | `058` | forbid `removeChild`/`insertBefore` | 「首选 + 回退」的分支里出现了旧写法 |
| 4 | `061` | `@container scroll-state(` 只配不具名 | 具名容器查询写作 `@container foo scroll-state(...)` |
| 5 | `064` | 要求 `position-anchor:` | 用 `position-area:` 一次说清上下左右，更省事 |

**每一次都让 treatment 臂看起来更差**，其中三次把「技能有益」翻成「技能有害」。
教训写进 `docs/16 §4.3` 与 §七 第 6 条：**规则定稿前必须先跑 baseline，把模型实际写出的等价形式收齐。**

### 已知问题

- 天花板 58%（37/64）——其中大部分是「模型本来就会」，不是提示词泄题
- `wmg-044` 仍用旧规则（它是 720 次 run 那批数据的一部分，改了就前后不可比），
  看到它的 treatment=0% 必须记得这条
- 单题 n=3 的抖动极大（`wmg-064` 的 baseline 两批分别是 0/3 与 2/3），单题结论不进对外材料

---

## 2026-11-13 · v0.1.3（消融实验 · 行为型评分器 · 58 题）

### 任务集 web-guidance@1.3.0（48 → 58 题）

- **+8 行为测试题**（`wmg-049~056`）：`AbortSignal.any`、`Promise.withResolvers`、
  `Object/Map.groupBy`、`structuredClone`、`Error cause`、`toReversed/with/toSpliced`、
  `URL.parse/canParse`、`Intl.Segmenter`。评分器不再只看正则——它把候选代码 **import 进来真跑**，
  真起 HTTP server、真做深拷贝、真按字素簇切。
- **+2 消融题**（`wmg-057/058`）：与 `wmg-045/044` **共用同一份 fixture 与评分器**，
  只把提示词里的 API 名字拿掉。用来测量「提示词给不给答案」这件事值多少分。
- 全部 58 题重新标定（5/8/3/6 次采样），`expected_baseline` 与难度标签按实测回填。

### 软件 v0.1.3

**新增**

- 行为型评分器模板 `VERIFY_BEHAVIORAL_TEMPLATE`：正则 + `behavior.mjs` 双闸
- `tests/graders-behavioral.test.ts`：对每道行为题断言「原始 fixture 判不过 / 参考解判通过」
  （参考解放在 `tests/fixtures/grader-solutions/`，不进任务集）
- `tools/calibration-report.mjs`、`tools/baseline-from-db.mjs`、`tools/arm-matrix.mjs`、
  `tools/inspect-task.mjs`：标定分布、逐题基线、逐题×逐臂矩阵、单题失败归因

**修复**

- `calibrate-web-guidance.mjs` 两个埋着的 bug：不筛 arm（会把 treatment 当 baseline 写进标定）、
  `samples` 恒为 1。现在按 arm 过滤、按任务聚合，并支持 `--db=a,b,c` 多库合并
- **单臂/两臂跑的输出是垃圾**：`--arms baseline` 会打印 `uplift 0pp / placebo -100pp` 并给出 A 级卡。
  现在 `tier1` 只在三臂齐备时生成，否则打 `未做三臂对照（uncorrected）` + 各臂通过率。
  这是协议 §1 硬约束 2 的直接执行
- `wmg-057` 评分器把「声明式 popover」和「命令式 showPopover」两种正解各判错一次
  （详见 `docs/16 §四.3`），现在用 alternation 表达「二者其一」

**测试**：104 个（+19：行为评分器自检 17 条、任务集结构 2 条）

**已知问题**

- 天花板比例仍有 60%（35/58 题 baseline 100%）——加题不是解法，提示词才是；
  判据写在 `docs/16 §七`
- `wmg-044/058` 的正则判不了「首选 + 特性检测回退」，会把照技能做事的 treatment 判错；
  下一轮用行为断言替代

---

## 2026-11-13 · v0.1.2（激活率进卡片，榜单按条件分表）

### 协议 protocol/1.0.0

- 无破坏性变更：`tier1.activation` 是**可选**字段（MINOR），旧卡片照旧通过校验。
- 但语义上这是本项目第一次承认：**不公开激活率的 uplift 是不可读的**（见 `docs/12 §3.5`）。

### 软件 v0.1.2

**新增**

- `tier1.activation`：`{mode, rate, by_arm, preloaded_tokens_p50}`，由 `computeActivation()`
  从 `meta_json` 聚合；`baseline` 臂不计入（它不装技能）；一行都没有 `activated` 字段时返回
  `undefined`，卡片显示 `—` 而不是 `0%`
- 卡片正文与 markdown 增加「激活」行；auto 模式且激活率 <50% 时直接打警告：
  「大半 run 没触发技能，这个 uplift 主要反映『肯不肯调工具』」
- `uplift site` 分组键改为 `任务集 · 等级 · 激活条件`，auto 与 forced 各一张表（auto 在前），
  新增「激活率」列；表头补一行条件说明
- `tools/make-cards.ts`：`--only=id,id`（只重出指定包）、`--suffix=forced`
  （输出 `results/<id>.forced.*`，与默认条件互不覆盖）；`protocol_notes` 记 `activation=auto|forced`
- runner 在 `meta_json` 写 `preloaded_tokens`（forced 模式下每臂实际注入的 token 数）

**修正**

- 榜单/卡片数字从四舍五入到整数改成保留一位小数（`−2.5pp` 不再被显示成 `−3pp`；那是在改结论）
- **`docs/15 §六` 的一段错误归因被数据推翻并改写**：原文说第一轮 placebo 臂「时不时激活到 4k 级中性文档」，
  查 `by_arm` 后发现第一轮 placebo 臂激活率是 **0.0%**——一次都没激活。那 −4.4pp 是噪声，
  不是注入造成的。结论改成：只有在注入量可控（forced）时安慰剂效应才估得出来。

**测试**

- 85 个单测（+7）：`computeActivation` 的 4 条（不知道≠0%、baseline 不计入、forced 中位数、坏 meta_json），
  榜单页的 2 条（auto/forced 分表且 auto 在前、激活未知显示 `—`），
  headline 的 1 条（−2.5pp 不许写成 −3pp）

**已知问题**（继承 + 新增）

- 难度仍偏高（baseline 约 3/4），headroom 有限；见 `docs/15-第二轮实测.md`
- 第二轮 forced 的 432 个 run 早于 `preloaded_tokens` 字段，卡片里 `preloaded_tokens_p50` 是 `null`；
  那批注入量来自启动时的安慰剂校准输出，记录在 `docs/15 §五`。不为填字段改历史数据。

---

## 2026-11-13 · v0.1.1（第二轮实测）

### 任务集 web-guidance@1.1.0

- **新增 18 题**（30 → 48）：
  - `wmg-031~040`：多规则 / 多文件任务，用来打破 v1.0 实测出的**双峰难度分布**（22 题 100%、8 题 0%）
  - `wmg-041~048`：冷门新 API（`scheduler.postTask`、`URLPattern`、`Intl.DurationFormat`、`moveBefore`、`popover`、`@starting-style`、`scrollend`、`content-visibility`），
    因为实测发现模型对常见现代 API 的先验已经很强，只有新 API 才有上升空间
- `expected_baseline` 与难度标签由**实测标定**回填（v1.0 的 30 题保留原标定，新增 18 题用第二轮 baseline 数据回填）

### 软件 v0.1.1

- 第二组三臂实测：`GoogleChrome/modern-web-guidance-src`（`guides/`，真身技能，会调 `npx modern-web-guidance search/retrieve`）× `web-guidance@1.1.0` × 5 次重复
- 分类修正：`uninstall-clean` 现在按扩展名选解释器（`.mjs/.js` 用 node），不再把 `install.mjs` 丢给 sh
- 77 个单测

**已知问题**（继承）
- 难度仍偏高（baseline 约 3/4），headroom 有限；见 `docs/15-第二轮实测.md`

---

## 2026-11-13 · v0.1.0 实现

### 协议 protocol/1.0.0

- 无破坏性变更。指标定义一个字没改：`uplift_pp = treatment − placebo`。
- 新增可选字段 `grader.version`（MINOR）：`AGENTS.md §1` 要求锁「评分器版本」，schema 原先没有槽位。

### 软件 v0.1.0

**新增**

- CLI 七个命令：`probe` / `run` / `card` / `badge` / `taskset` / `compare` / `doctor`（外加 `site` 生成榜单页）
- Tier 0 六探针全部实现
- 三套 harness：`openai-compat`（自建 agent loop，activation 是显式工具事件）、`claude-code`（外挂 + hook 日志）、`mock`（合成数据，只验证管线）
- 三臂 runner：git worktree 隔离（每任务一个极小仓库 → N 个 worker 树）、SQLite 落库、`--resume`、成本上限、交错调度
- metrics：uplift / headroom / raw_gain / placebo_effect / 配对 bootstrap CI / flaky / determinism_gain
- 评分器：`tests`（A） / `exact`（A） / `rubric`（B，固定 judge） / `visual-diff`（B，可选依赖）
- 任务集：`web-guidance@1.0`（30 题，A 级）、`general-20@1.0`（20 题，A 级）
- SkillCard 三种输出（text / markdown / json）、badge SVG（自包含、带 `<title>` 悬停信息）、静态榜单页
- 54 个单元测试；GitHub Actions CI（build / test / taskset validate / Tier 0 smoke）

**实现中做的判断**

- token 系数按 `docs/11 Q5`（英文 chars/4 + 中文 chars/1.7 加权），输出固定标 `tokenizer: "approx:weighted"`
- `env.kind=local` 跳过 digest 检查，打 `env_unpinned` 标记
- 安慰剂**逐技能**生成（而不是整包一大坨），避免激活成本与真实臂不对等
- 静态开销拆成 `total_tokens`（含随包脚本）与 `context_tokens`（真正进上下文），预算按后者判定
- 成本优先用端点返回的 `usage.credit`；拿不到就标 `unpriced` 并把 `cost_usd` 记 0，不猜数字

**已知问题**

- 任务集实测呈双峰分布（100% 或 0%），没有中间难度；详见 `docs/13-任务集标定.md`
- `visual-diff` 需要手动安装 `pngjs` + `pixelmatch`，没装时报 `grader_error`
- `taskset fetch` 未实现（远程 registry 在阶段 3），调用返回退出码 3
- 卸载探针只做文件级残留检测，行为指纹需要整轮三臂，暂报 `null`

---

## 2026-11-13 · 开题

### 新增
- 项目立项，命名 `UpliftBench`（CLI `uplift`），中文名「增益基准」
- 命名核查：npm / PyPI / 5 个域名全部未占用；GitHub 仅 2 个无关僵尸仓库
- 竞争情报：`SkillsBench`（arXiv 2602.12670，benchflow-ai/skillsbench，1,917★）已存在，确认三个差异化楔子
- `protocol/1.0.0`：三臂对照、指标定义、归一化、评分器分级
- Tier 0 六探针规格
- `taskset.json` / `skillcard.json` schema
- CLI 规格、一周路线图、风险表、开放问题

### 待办
- 代码尚未开始（阶段 1 未启动）

---

## 模板（后续使用）

```
## YYYY-MM-DD · <阶段>

### 协议 protocol/X.Y.Z
- BREAKING: ...
- 新增: ...

### 软件 vX.Y.Z
- 新增: ...
- 修复: ...
- 已知问题: ...
```
