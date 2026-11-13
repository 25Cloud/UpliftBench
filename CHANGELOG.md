# 变更记录

格式：`协议版本` / `软件版本` 分开记。破坏性变更必须标 **BREAKING**。

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
