# AGENTS.md — 给下一个 Agent 的操作手册

> **状态（2026-11-13）**：v0.1.5 —— T1–T6 全部完成，六探针可用，三臂 runner 跑过 1,800+ 次真实 run，
> 5 个真实技能包出了卡（其中一个出两种激活条件共 6 张），榜单页可生成，任务集 `web-guidance@1.4.0`
> 有 64 题（含 10 道行为测试题、8 道「提示词不给答案」的 withheld 题）。
> 先读 `docs/12`（实现时做的判断）、`docs/13`（实测难度）、`docs/14`/`docs/15`（两轮真数字，
> 后者含一次对自己文档的纠错）、`docs/16`（消融实验：为什么加题治不了天花板、五次评分器误判、
> n=10 定稿的 +36pp），再读下面的规矩。下一步看 `docs/07` 的进度表和 `docs/16 §七` 的选题判据。
>
> **四条最重要的实测结论**：
> 1. 技能写 `MANDATORY` 也只有 23% 的运行会激活它 —— 不看激活率的 uplift，分母是黑的；
> 2. 提示词里写 API 名 = 把答案写进去 → baseline 100%，这类题测不出技能价值；
> 3. 正则评分器只认得出「我预期的那一种写法」，而正确答案有等价类 ——
>    目前已经因此误判过五次，每次都让 treatment 臂看起来更差；
> 4. 在「技能覆盖 ∩ 模型先验缺失 ∩ 提示词不给答案」的 5 道题上，n=10 的块效应是
>    **+36pp（CI [+24, +48]）而 placebo 只有 −2pp** —— 工具本身是可用的，前提是题出对了。

---

## 0. 三十秒上下文

**UpliftBench** 是一个测量 Agent Skills（技能包）真实效果的基准 + CLI（命令名 `uplift`）。

它存在的理由：整个技能包生态没有一个可信的效果数字。116k 星的技能包拿不出一个数，而唯一公开了 uplift 数字的项目（GoogleChrome 的 Web 技能包）就靠那张表上了 Trending 榜首。

**我们和已有的 `SkillsBench` 不冲突**，差异在三点：三臂对照（多一个安慰剂臂）、Tier 0 通用探针（覆盖任意技能包）、联邦题库（不垄断任务集）。详见 `docs/01-竞争格局.md`。

---

## 1. 硬约束（违反即返工）

1. **协议优先于实现。** `docs/02-协议规范.md` 里的指标定义是规格，代码服从它，不许反过来改定义迁就实现。
2. **安慰剂臂不可选。** 任何 `uplift` 数字必须来自三臂对照。只有两臂的结果必须标 `uncorrected`，且不许进榜单。
3. **评分器必须标等级（A/B/C）。** A/B/C 不许混排。这是公信力的唯一来源。
4. **任务集必须可复现。** `taskset.json` 必须锁定 commit + docker 镜像哈希 + 评分器版本。
5. **不做技能。** 我们测量技能，不生产技能。一旦开始发自己的技能包，中立性就没了。

---

## 2. 技术栈（已定，别换）

| 层 | 选择 | 理由 |
|---|---|---|
| 语言 | **TypeScript**（Node 22+） | harness 生态全是 TS/JS，适配层成本最低 |
| CLI 框架 | `commander` 或 `cac` | 轻，够用 |
| 存储 | **SQLite**（`better-sqlite3`） | 单文件，零部署，可整库分发 |
| 隔离 | **git worktree** + 子进程 | 免费、快、无需容器 |
| 容器（Tier 1 可选） | Docker | 只有需要固定环境的任务集才用 |
| 榜单站点 | 静态生成（Astro 或纯 HTML） | 不引后端，方便 fork |
| 测试 | `vitest` | 与生态一致 |

**不要引入：** 任何后端服务、任何数据库服务、任何需要账号的云依赖。第一版必须是 `git clone && pnpm i && pnpm build` 就能跑。

---

## 3. 目录结构（目标）

```
UpliftBench/
├─ AGENTS.md                  ← 你正在读
├─ README.md
├─ docs/                      ← 规格文档，先读后写
├─ schema/
│  ├─ skillcard.schema.json
│  └─ taskset.schema.json
├─ examples/
│  ├─ taskset.example.json
│  └─ skillcard.example.json
├─ src/
│  ├─ cli.ts                  ← 入口，命令注册
│  ├─ probes/                 ← Tier 0 六探针
│  │  ├─ static-cost.ts
│  │  ├─ trigger-precision.ts
│  │  ├─ constraint-following.ts
│  │  ├─ injection-resistance.ts
│  │  ├─ negative-transfer.ts
│  │  └─ uninstall-clean.ts
│  ├─ runner/                 ← Tier 1 执行器
│  │  ├─ arms.ts              ← 三臂编排
│  │  ├─ worktree.ts
│  │  └─ repeat.ts
│  ├─ graders/                ← 评分器
│  │  ├─ tests.ts
│  │  ├─ exact.ts
│  │  ├─ rubric.ts
│  │  └─ visual-diff.ts
│  ├─ harness/                ← harness 适配层
│  │  ├─ claude-code.ts
│  │  ├─ codex.ts
│  │  └─ types.ts
│  ├─ metrics/                ← 指标计算
│  │  ├─ uplift.ts
│  │  └─ stats.ts             ← 置信区间、方差
│  └─ render/                 ← 输出
│     ├─ card.ts              ← SkillCard 文本/markdown
│     └─ badge.ts             ← SVG badge
└─ tests/
```

---

## 4. 第一批任务（按顺序，别跳）

### T1 — `uplift probe --only static-cost`
**目标**：读一个技能包目录，算出 token 开销。
**输入**：`SKILL.md` + 同目录下所有 `*.md` / `*.json` / `*.yaml` / 脚本
**输出**：`{ total_tokens, per_file: [...], duplicates: [...], over_budget: bool }`
**验收**：对 `addyosmani/agent-skills`（25 个 skill）能跑出总 token 和每文件明细。
**注意**：token 计数不要引入 tiktoken 这类重依赖，先用 `gpt-tokenizer` 或字符数×系数近似，但**必须在输出里标明是近似**。

### T2 — `uplift probe --only trigger-precision`
**目标**：测技能该触发时是否触发。
**输入**：一个技能包 + 一份 `triggers.json`（`{positive: [...], negative: [...]}`）
**做法**：把技能装进 harness，逐条投喂 prompt，看 harness 是否激活了该技能（读 harness 的日志/工具调用轨迹）
**输出**：`{ precision, recall, f1, false_positives: [...], false_negatives: [...] }`
**验收**：对至少 2 个技能包跑出非空结果。

### T3 — `uplift probe`（六探针全量，Tier 0 闭环）
**目标**：一条命令出完整 SkillCard（Tier 1 部分留空）。
**验收**：对 5 个真实技能包各出一张卡，markdown 可读。

### T4 — 三臂 runner 骨架
**目标**：`uplift run --arms baseline,placebo,treatment --repeats N`
**做法**：git worktree × 3 份干净树，各跑同一任务集，结果入 SQLite
**验收**：用一个假任务集（3 个任务）跑通，三臂结果可查询。

### T5 — `metrics/uplift.ts`
**目标**：从三臂原始结果算出 uplift / headroom / 置信区间
**验收**：单元测试覆盖 5 个手算样例（含 baseline=0 和 baseline=1 的边界）。

### T6 — SkillCard 渲染 + badge
**目标**：`uplift run` 结束输出 markdown 卡 + `badge.svg`
**验收**：badge 文案格式为 `uplift 41% (base 40 → treat 76, placebo 45) A级`。

---

## 5. 已知坑（别踩）

| 坑 | 说明 |
|---|---|
| **token 计数不准** | 不同模型 tokenizer 不同。第一版用近似，但必须标注；Tier 1 里用 harness 真实回报的 usage |
| **worktree 污染** | 技能包安装可能写进 `~/.claude` 等全局目录，不是 worktree 能隔离的。装/卸必须用 hook 或临时 `HOME` |
| **触发精度测不到** | 不是所有 harness 都暴露「哪个技能被激活」。先做 Claude Code（有 hooks），其余标 `unsupported` 而不是编数字 |
| **安慰剂臂怎么构造** | 必须**等 token 量**的无关文本。不能随手写一句「你是有用的助手」，那长度差太多。做法：取技能包 token 数，用中性填充文本凑到同等长度 |
| **多次重复的成本** | `--repeats 3` × 3 臂 = 9 次全量跑。D1 就用最小任务集（3 题），别一上来跑 87 题 |
| **Windows 路径** | 开发机是 Windows。worktree 路径、子进程 shell、文件锁都要测 Windows |

---

## 6. 写作与命名约定

- 代码、文件名、CLI 命令：**英文**
- 文档、注释、commit message：**中文**
- 指标字段名（JSON）：**英文 snake_case**，与 `docs/05-数据模型.md` 严格一致
- 任何对外数字必须带 **N（样本量）** 和 **置信区间**，没有例外

---

## 7. 判断标准：什么时候算做完第一版

三条同时满足：

1. `uplift probe <skill>` 能对 **5 个真实技能包**（建议：`addyosmani/agent-skills`、`GoogleChrome/modern-web-guidance-src`、`cloudflare/security-audit-skill`、`Nutlope/hallmark`、`obra/superpowers`）跑出完整 SkillCard
2. `uplift run --taskset <一个真实任务集>` 能出**三臂对照**的 uplift 数字，且安慰剂臂生效（placebo 与 baseline 有可观测差异）
3. 生成的 badge 能被贴进任意 README 且渲染正常

---

## 8. 沟通规则

- 遇到 `docs/11-开放问题.md` 里列的问题，**先选一个默认值继续做**，在 PR 里标注「按默认值 X 实现，待确认」。不要卡住等回复。
- 遇到协议层面的矛盾（比如两个指标定义冲突），**停下来记录**，不要自行改定义。
- 每完成一个 T 任务，更新 `docs/07-路线图.md` 的进度表。
