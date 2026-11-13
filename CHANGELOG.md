# 变更记录

格式：`协议版本` / `软件版本` 分开记。破坏性变更必须标 **BREAKING**。

---

## 2026-11-13 · v0.2.3（跨领域对照实验）

审稿第一问：换任何技能是不是都能测出增益。这一版补了对照。

拿 `multica-ai/andrej-karpathy-skills`（644 token 的通用编码准则，和 Web API 无关）测 27 道
**有空间**的题（标定 baseline < 100% 的那批，不挑不拣），3 臂 × 3 重复 = 243 次 run，$22.92，auto 激活：

| 臂 | 通过率 |
|---|---|
| baseline | 48.1% |
| placebo | 42.0% |
| treatment | 46.9% |

uplift +4.9pp，95%CI [−3.7, +14.8]，安慰剂效应 −6.2pp，激活率 57%（treatment 臂 81/81 全加载）。

三个结论：
- **能不能加载由 description 的宽窄决定**，不由领域相关性决定。它的 description 写「写代码时用」，于是每道题都命中；
- 通用准则对coding任务不是零效果（+4.9pp），但 27 题分辨不出这 4.9 个点是真的还是抖的；
- 安慰剂臂又掉 6.2pp，和第二轮 forced 的 −7.6pp 同一量级。**灌 token 就掉分，跟灌什么无关。**

`results/karpathy-skills.json` 从 Tier 0 卡升级成带 Tier 1 的卡，榜单多一行。
docs/16 加第八节记录这件事；README 加一段说明。

---

## 2026-11-13 · v0.2.2（榜单页升级 · 机器可读索引 · 英文读法与社交卡）

### 榜单页

- 顶部放英雄图、一句话说明，底部加 footer：怎么复现、怎么挑战数字、往哪读。
  页面仍然零 JS、零外链资源（图在生成时从 `docs/assets/` 拷进 `site/assets/`，因为 Pages 只发布 `site/`）。
- 窄屏隐藏英雄图，省得手机上一屏全是图。

### `site/index.json`

`uplift site` 现在同时写一份机器可读索引：每张卡的 repo / commit / taskset / n / uplift / CI /
placebo_effect / 激活率 / 级 / token / largest skill / flags。榜单页给人看，这份给程序看，
想自己做表做图的人不用爬 HTML。

### 文档

- `docs/19-how-to-read.md`（英文）：一列一列讲清楚怎么读卡，以及让数字失效的四种情况
  （激活率、提示词给答案、评分器等价类、天花板）。这是给外站争论时直接甩链接的那一页。
- `docs/README.md`：二十篇文档的索引，按「先看什么」排，不按编号。

### 素材

- `docs/assets/social-preview.svg|png`（1280×640，GitHub 推荐尺寸）与生成脚本 `tools/gen-social.mjs`、
  `pnpm gen:social`。GitHub 的 Social preview 只能手动上传，图先备好。

---

## 2026-11-13 · v0.2.1（第 7 个探针 skill-shape + 12 个真实包横评）

### 措辞

全仓库过了一遍文风。删掉长破折号（「——」在中文里几乎只在翻译腔和模型腔里出现）、
「不是 A，而是 B」这种对举、段首的加粗标签，以及为了整齐凑出来的三段式标题。
改的是字，不是数：任务集提示词一个字没动，重新生成后与提交零差异；所有数字、N、CI 原样保留。

### 新增探针：`skill-shape`

评 12 个真实技能包时发现，「内容对不对」之前还有一道门：写法能不能被用起来。
而这道门不需要模型就能测。于是补了 Tier 0 的第 7 个探针（规格写进 `docs/03` 探针 7）：

- `frontmatter_rate` / `described_rate`：没有 description 的技能在目录里等于不存在
- `description_tokens_p50`：<20 tok 说不清什么时候该用，>200 tok 是在目录里塞正文
- `defer_ratio` / `deferred_share`：正文 vs 按需资源。「短正文 + references/」是好形状
- `monolith_share`：正文 ≥6000 tok 且没有任何按需资源 = 巨石单文件

### 新增：`docs/17-横向评测.md`

12 个包（合计 ~190 万 GitHub star）的零模型横评，`tools/review-table.mjs` 一键出表。几条硬数字：

- `multica-ai/andrej-karpathy-skills`（232.7k★）整个包 **644 token**，目录成本 55 token
- `affaan-m/ECC`（302.2k★）47 个技能，**光目录就 2,375 token**，按需加载只有 6%
- `anthropics/skills` 的 `claude-api` 单技能 **526,405 token**，是预算的 52 倍
- `Nutlope/hallmark` 409,006 token，其中 `scripts/photos.json` 一个文件 113,128

结论落在三条可执行的写法上：正文 ≤2k、description 写触发条件、
大知识放 references/ 并按需读。以及一条容易混的口径：**看 largest skill，不看 pkg tokens**
（检索型技能如 `modern-web-guidance` 磁盘 1.27M、最大单技能只有 2,444）。

### 软件

- `probe --only skill-shape`；卡片与 markdown 卡增加「技能形状」行（中英双语）
- **12 个包全部出卡**（`benchmarks/manifest.json` 从 5 条扩到 12 条），榜单页的 Tier 0 行
  现在同时给 `largest skill` / 技能数 / 按需加载比例，并标出 `retrieval-style package` 与
  `monolithic skill`，因为只报包内总量会让人误判「1.2M 的检索库」和「1.2M 的单技能巨石」是一回事
- markdown 卡新增 flags 行（终端卡一直有，md 卡漏了）
- `tools/review-table.mjs`：把一批 `--format json` 的卡摊成横评表（`--md` 出 markdown）
- 新增两个派生标记：`retrieval_style_package`（包内 token > 最大单技能 20 倍）、
  `monolith_skill`（最大单技能 > 预算 5 倍）、以及形状类 `missing_skill_description` /
  `monolith_skills` / `thin_descriptions` / `fat_descriptions`
- 单测 114 个（+5：frontmatter 解析、空包、按需/巨石判别、description 过短过长）

### 修正：一个技能包的两个表面被统一了

`modern-web-guidance-src` 之前在卡片上探 `Tier 0` 用的是仓库里的 `.agents/skills`（13 个开发用技能），
而 `Tier 1` 三臂测的是 `guides/`（真正的检索型知识库）。**同一张卡混了两个产物。**
现在 `manifest.path` 改成 `guides`，Tier 0 与 Tier 1 描述同一个东西；
卡片因此显示 1,265,943 token / 超预算 5504%，同时带上 `retrieval_style_package` 标记。
这个百分比是「把知识库当上下文」的结果，不是它的问题（详见 `docs/17 §五`）。

### 新增：`docs/18-发布材料.md`

Show HN 正文、X 六条串、首评（自我纠错三条）、评论区预案六问、发布前 checklist。
原则一句话：**每一句都能被仓库里的某个命令复现**，复现不了的不写。

### 已知问题

- 12 个包里只有 5 个有 Tier 1（三臂）数字；其余只有 Tier 0 事实，榜单上单列「不进主榜」
- star 数是 2026-11-13 的快照，会漂；表里已注明

---

## 2026-11-13 · v0.2.0（英文 README · `uplift demo` · 复合 Action · 中英双语输出）

目标是把仓库从「研究笔记 + 工具」推到「别人能立刻上手、能贴进自己 README」的状态。
这一版**没有改任何指标定义**（protocol 仍是 1.0.0），改的全是门面与可用性。

### 新增

- **`docs/02-protocol.en.md`**：协议规范英文版。中文版仍是规范性文本，英文版顶部写明
  「若两份不一致，以中文为准」，并在两边互相链接。国际读者第一次能读到指标定义，
  这是这一轮最该做的一件事，因为协议才是这个项目的产品。
- **`README.md` 重写为英文**（面向国际读者的精简版：三臂设计 → 60 秒 demo → 三组结果 →
  我们错过的三件事 → 不主张什么 → 自己的技能怎么用）。原中文 README 保留为 `README.zh-CN.md`，
  两边互相链接。
- **`docs/assets/hero.svg`**：由 `tools/gen-hero.mjs` 生成的三臂对照图。数字写在脚本里
  （带出处注释），改数字要回 `docs/15`/`docs/16` 核对，不留一张看着专业的旧图。
- **`uplift demo`**：零依赖、零模型调用、113ms 出卡的自检命令。新读者 clone 完就跑得动，
  不用 key、不用任务集。会把"这只是 Tier 0，还不是分数"讲清楚。
- **中英双语终端输出**：`--lang en` 或 `UPLIFT_LANG=en`。默认仍是中文（保持历史文档里引用的输出不变）。
  翻译只覆盖人读的标签，JSON 字段名一律不动，那是数据契约。
- **`action.yml`（复合 GitHub Action）**：PR 里跑 Tier 0，把卡片写进 job summary，
  卡 JSON 作为 artifact 上传。输出 `total_tokens` 与 `card` 两个 output。
- **`CONTRIBUTING.md`**：六条不让步的规矩、怎么交任务集（含标定与准入）、怎么加 harness 适配器，
  以及两条最容易犯的错：**评分器必须接受等价正解**、**提示词不许给答案**。
- **`CITATION.cff`**：引用时必须带上 protocol 与软件版本。没有版本的数字不可复现。
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

**安慰剂效应 −2pp。** 同样的注入量，中性文本几乎不值钱，真技能值 +36pp。
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

- 天花板 58%（37/64），其中大部分是「模型本来就会」，不是提示词泄题
- `wmg-044` 仍用旧规则（它是 720 次 run 那批数据的一部分，改了就前后不可比），
  看到它的 treatment=0% 必须记得这条
- 单题 n=3 的抖动极大（`wmg-064` 的 baseline 两批分别是 0/3 与 2/3），单题结论不进对外材料

---

## 2026-11-13 · v0.1.3（消融实验 · 行为型评分器 · 58 题）

### 任务集 web-guidance@1.3.0（48 → 58 题）

- **+8 行为测试题**（`wmg-049~056`）：`AbortSignal.any`、`Promise.withResolvers`、
  `Object/Map.groupBy`、`structuredClone`、`Error cause`、`toReversed/with/toSpliced`、
  `URL.parse/canParse`、`Intl.Segmenter`。评分器不再只看正则，它把候选代码 **import 进来真跑**，
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

- 天花板比例仍有 60%（35/58 题 baseline 100%），加题不是解法，提示词才是；
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
  查 `by_arm` 后发现第一轮 placebo 臂激活率是 **0.0%**，一次都没激活。那 −4.4pp 是噪声，
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
