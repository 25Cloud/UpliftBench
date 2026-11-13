# 变更记录

格式：`协议版本` / `软件版本` 分开记。破坏性变更必须标 **BREAKING**。

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
