# UpliftBench

**技能包净增益基准 · 命令行 `uplift` · 中文名「增益基准」**

> 一句话：**我们不改题，我们定义「怎么算分」。**

![uplift](results/agent-skills.badge.svg)

**首轮实测（270 次 run，$27.09）**：`addyosmani/agent-skills` 在 30 题 Web 合规任务集上
**uplift +2.2pp，95%CI [−2.2, +6.7]，不显著**；同一批数据用两臂口径算出来是 **−2.2pp**——
安慰剂臂的抖动就足以把符号搞反。详见 [docs/14-首轮实测.md](docs/14-首轮实测.md)。

**第二轮实测（1,152 次 run，$132.62）**：`GoogleChrome/modern-web-guidance-src` 在 48 题上，
自动激活模式 **−2.5pp**、强制注入模式 **+5.6pp**——两种条件里技能真正进上下文的比例是 **23%** 与 **100%**。
**一个技能包有没有用，先取决于它有没有被加载进上下文。** 详见 [docs/15-第二轮实测.md](docs/15-第二轮实测.md)。

---

## 这是什么

UpliftBench 测量 **Agent Skills（技能包）** 的真实效果。

它不生产技能，也不拥有题库。它提供三样东西：

1. **一套协议** —— 三臂对照（无技能 / 安慰剂 / 真技能），剥离「多塞 token 本身就有效」的混淆
2. **六个通用探针（Tier 0）** —— 与领域无关，任意技能包秒级可测
3. **一个联邦题库格式（Tier 1）** —— 谁都能交题，我们不垄断任务集

输出物是一张 **SkillCard**（一张卡 + 一个 headline 数字 + 一个能贴进 README 的 badge）。

---

## 为什么需要它

技能包是纯 Markdown，改动零成本，所以数量会爆炸；但**没人知道哪个真有用**。

| 事实 | 数据 |
|---|---|
| 星数最高的技能包拿不出任何效果数字 | `addyosmani/agent-skills` 116k★，README 里 0 个 uplift 数值 |
| 唯一公开数字的技能包，靠这个数字登顶 Trending | `GoogleChrome/modern-web-guidance-src`，+27~36pp |
| 卖「可独立验证」的技能包，自己没被验证 | `cloudflare/security-audit-skill` |

**数字就是信任货币。而整个生态在裸奔。**

---

## 核心：为什么是「三臂」而不是「两臂」

只做「无技能 vs 有技能」，测到的是：

```
观测差异 = 技能真实效果 + 「多塞了 token」的效果 + 噪声
```

往上下文里多塞 12,000 token，本身就会改变模型行为。所以第三臂装**等 token 量的中性文本**：

```
uplift_pp       = pass_rate(treatment) − pass_rate(placebo)      # 净增益
placebo_effect  = pass_rate(placebo)  − pass_rate(baseline)      # 「长度值多少分」，本身也是指标
raw_gain_pp     = pass_rate(treatment) − pass_rate(baseline)     # 未校正，不得单独进榜
headroom_closed = uplift_pp / (1 − pass_rate(placebo))           # 填掉了多少剩余空间
```

`placebo_effect` 必须公开。一个 `placebo +20pp` 而 `uplift +2pp` 的技能包，
等于什么都没做，只是把上下文撑长了——这个信息必须一眼可见。

详见 [docs/02-协议规范.md](docs/02-协议规范.md)。

---

## 快速上手

```bash
git clone <this repo> && cd UpliftBench
pnpm install
pnpm build
pnpm test                     # 85 个单测

# Tier 0：任何技能包，秒级，不调模型
node dist/cli.js probe ./examples/demo-skill --only static-cost

# Tier 1：三臂对照（需要任务集 + 模型）
export UPLIFT_BASE_URL=https://api.openai.com/v1
export UPLIFT_API_KEY=sk-...
export UPLIFT_MODEL=gpt-4o-mini

node dist/cli.js run \
  --taskset web-guidance@1.0 \
  --skill ./benchmarks/skills/agent-skills/skills \
  --repeats 3 --jobs 6
```

产出：

```
SkillCard  addyosmani/agent-skills
──────────────────────────────────────────────────────
  静态开销     102,303 tok 包内合计   ⚠️ 超预算 2.5%
           └ 按最大单技能判定（10,255 tok；整包 101,735），预算 10,000
           └ 重复内容 0 tok (0.0%)
           ├ constraint-driven-development/SKILL.md   5,541  ⚠️ >5000
           ├ code-review-and-quality/SKILL.md     5,297  ⚠️ >5000
           └ (另外 31 个文件)                     86,419
  可卸载      干净
──────────────────────────────────────────────────────
  Tier 1   uplift +2pp / headroom 9%   95%CI [-2, 7] · N=30 · placebo -4pp
  标记       static_cost_over_budget  ci_crosses_zero  flaky_tasks
```

这是**真实跑出来的卡**（`results/agent-skills.json`），不是示意。

---

## 首轮实测：5 个真实技能包

| 技能包 | 技能 | 包内 token | 最大单技能 | 预算 | 触发精度 | 可卸载 |
|---|---|---|---|---|---|---|
| `addyosmani/agent-skills` | 25 | 102,303 | 10,255 | 超 2.5% | P 0.80 / R 1.00 | 干净 |
| `GoogleChrome/modern-web-guidance-src` | 13 | 71,238 | 24,393 | 超 143.9% | — | 干净 |
| `cloudflare/security-audit-skill` | 1 | 79,967 | 49,910 | 超 399.1% | P 1.00 / R 1.00 | 干净 |
| `Nutlope/hallmark` | 1 | 409,006 | 292,316 | 超 2823.2% | — | 干净 |
| `obra/superpowers` | 15 | 100,774 | 25,738 | 超 157.4% | — | 干净 |

**五个包全部超注入预算。** 最夸张的 `hallmark` 把 113k token 的 `photos.json` 直接放在技能目录里。

**1 个技能 vs 25 个技能的触发精度差**：单技能包 P=1.00（零误触发）；
25 技能包 P=0.80，三条误触发里包含「帮我写一首关于秋天的诗」。
按负样本档位拆，「同领域但不同任务」那一档的精确率只有 **0.50**。
这就是「装得越多越容易乱触发」的第一组实测证据。

三臂对照（30 题 × 3 臂 × 3 重复 = 270 run，$27.09，0 个 grader_error）：

| 臂 | 通过率 |
|---|---|
| baseline | 78.89% |
| placebo | 74.44% |
| treatment | 76.67% |

```
uplift +2.22pp   headroom 8.7%   raw_gain −2.22pp   placebo_effect −4.44pp
95%CI [−2.22, +6.69]   N=30   A级   → 不显著
```

同一批 run 换成两臂口径（treatment − baseline）= **−2.22pp**，会得出「技能有害」的结论。
**符号被安慰剂臂的抖动翻转了**——那 −4.4pp 事后查明是噪声（第一轮 placebo 臂一次都没被激活，
见 [docs/15 §六](docs/15-第二轮实测.md)），不是「多塞 token」造成的。
完整分析见 [docs/14-首轮实测.md](docs/14-首轮实测.md)。

---

## 第二轮实测：语义对口的技能包（`modern-web-guidance`）

第一轮的两个 P0 都修了：任务集扩到 **48 题**（多规则/多文件 10 题 + 冷门新 API 8 题），
技能包换成**语义对口**的 `GoogleChrome/modern-web-guidance-src`（真身技能，会调 `npx modern-web-guidance search/retrieve`），
`repeats` 提到 **5**。

**auto 模式（模型自己决定要不要激活）**，48 题 × 3 臂 × 5 重复 = 720 run，$60.93：

| 臂 | 通过率 |
|---|---|
| baseline | 73.75% |
| placebo | 73.75% |
| treatment | 71.25% |

```
uplift −2.50pp   headroom −10.0%   raw_gain −2.50pp   placebo_effect +0.00pp
95%CI [−7.92, +2.50]   N=48   A级   → 不显著
激活率 23%（写了 MANDATORY，模型照样四次里只激活一次）
```

**forced 模式（技能正文强制注入）**，48 题 × 3 臂 × 3 重复 = 432 run，$71.69：

| 臂 | 通过率 |
|---|---|
| baseline | 71.53% |
| placebo | 63.89% |
| treatment | 69.44% |

```
uplift +5.56pp   headroom 15.3%   raw_gain −2.08pp   placebo_effect −7.64pp
95%CI [−2.78, +13.19]   N=48   A级   → 不显著
```

### 这一轮真正学到的东西

1. **安慰剂效应只有在注入量可控时才估得出来**：forced 模式每次注入 9.8k → placebo_effect **−7.64pp**；
   auto 模式下注不注入由模型决定，两轮的 placebo_effect（−4.4pp / 0.0pp）都在噪声里。
   查数据还纠正了一个早先写错的解释：第一轮 placebo 臂**一次都没被激活**，那 −4.4pp 不是注入造成的。
2. **同一个技能，两种激活策略符号相反**（−2.50pp vs +5.56pp）。
   auto 回答「丢给 agent 它会不会自己用」，forced 回答「内容本身值多少分」——两个问题都得报。
3. **技能只救「本来做不出」的题**：forced 下有空间的 17 题 uplift **+13.7pp**，天花板组 31 题只有 +1.1pp。
   这就是 uplift modeling 里 *persuadables* 的实测版本。
4. 一个对外宣称 +27~36pp 的技能包，在另一套任务 + 另一个 harness 上是 **−2.5pp**。
   这不是「它错了」，而是**技能的效果不是技能包的属性，是「技能包 × harness × 任务分布」的属性**。

完整分析见 [docs/15-第二轮实测.md](docs/15-第二轮实测.md)。

**卡片与榜单现在都带激活率**，因为不公开它，`uplift` 的分母就是黑的：

```
Tier 1   uplift −2.5pp / headroom −9.5%   95%CI [−7.9, 2.5] · N=48 · placebo +0pp
激活      自动激活 23%（treatment 29% / placebo 18%）
         ⚠️ 大半 run 没触发技能，这个 uplift 主要反映「肯不肯调工具」
```

榜单页把 `auto` 与 `forced` 拆成两张表——同一个包两种条件各一行，不许只挂好看的那个：

```bash
npx tsx tools/make-cards.ts --runs-db=.uplift/v11/runs.db                     # 默认条件
npx tsx tools/make-cards.ts --only=modern-web-guidance-src --suffix=forced \
  --runs-db=.uplift/v11-forced/runs.db                                        # 强制注入那套
node dist/cli.js site
```

badge 生成：

```bash
node dist/cli.js badge --file results/agent-skills.json --style full
```

---

## 六个 Tier 0 探针

Tier 0 不需要题库，也不需要领域知识。它产出**事实**，不产出分数——所以它不需要安慰剂臂。

| # | 探针 | 测什么 |
|---|---|---|
| 1 | `static-cost` | token 开销、重复内容、结构；脚本与上下文分账 |
| 2 | `trigger-precision` | 该触发时触发了吗、不该触发时误触发了吗 |
| 3 | `constraint-following` | 技能里写的「never / must」agent 真遵守了吗 |
| 4 | `injection-resistance` | 装了技能之后是否**更容易**被工具输出里的注入劫持 |
| 5 | `negative-transfer` | 装了技能之后**无关任务**是否变差 |
| 6 | `uninstall-clean` | 卸载后环境是否完全恢复（全局目录、hooks） |

第 5、6 两条是现有基准完全不测的维度：**一个领域内 +20pp、领域外 −10pp 的技能，净值可能是负的。**

---

## 任务集：联邦，不垄断

`taskset.json` 是开放格式（[schema](schema/taskset.schema.json)）。官方只维护两个示范任务集：

| 任务集 | 题数 | 评分器 | 说明 |
|---|---|---|---|
| `web-guidance@1.4.0` | **64** | A（tests，含 **9 道行为测试**） | 现代 Web API 合规；天花板仍有 58%，见 [docs/13](docs/13-任务集标定.md) |
| `web-guidance@1.0` | 30 | A（tests） | 第一轮实测用的版本（baseline 73.75%，见 [docs/14](docs/14-首轮实测.md)） |
| `general-20@1.0` | 20 | A（tests） | 通用算法小任务，供负迁移 / 卸载探针使用 |

1.4.0 比 1.0 多出来的 34 题分四批，每一批都有明确的「为什么」：

- `031~048`：多规则 / 多文件 / 冷门新 API —— 为了打破 1.0 实测出的**双峰难度**（见 [docs/13](docs/13-任务集标定.md) §二.2）；
- `049~056`：**行为测试题** —— 评分器不看写法，把候选代码 import 进来真跑一遍边界用例
  （真起 HTTP server 测超时、真做深拷贝看 Date/Map/Set 有没有被 JSON 吃掉、真按字素簇切表情）；
- `057~058`：**消融组** —— 与 `045/044` 共用同一份 fixture 与评分器，只把提示词里的 API 名字删掉。
  测出来的差距（0% ↔ 100%）写在 [docs/16-消融实验.md](docs/16-消融实验.md)；
- `059~064`：按新判据出的第三批 —— 只挑技能里真写了的特性，提示词只写症状。
  其中 `appearance: base-select` 拿到这个项目目前最干净的正结果：**baseline 0/3 → treatment 3/3**。

`tests/taskset.test.ts` 里有一条测试在守「withheld 组的提示词里不许出现它要考的那个名字」——
这批题的全部意义就在这，名字一旦被写回去，测试立刻红。

评分器分级是公信力的唯一来源：

| 等级 | 定义 | 能否进榜 |
|---|---|---|
| **A** | 可执行验证（测试通过、精确匹配） | ✅ 主榜 |
| **B** | rubric + 固定版本 judge（prompt 与模型公开） | ✅ 副榜，与 A 分组显示 |
| **C** | 人工抽检 | ❌ 只做附录 |

**A 和 B 不并排排名。** 把「测试通过」和「LLM 觉得不错」混排，等于用不同尺子量身高再排名。

---

## 仓库结构

```
src/
├─ cli.ts                 # 七个命令
├─ probes/                # Tier 0 六探针
├─ runner/                # 三臂编排 / worktree 隔离 / SQLite
├─ harness/               # openai-compat | claude-code | mock
├─ graders/               # tests | exact | rubric | visual-diff
├─ metrics/               # uplift / headroom / bootstrap CI
├─ placebo/               # 中性语料 + 等量构造
├─ render/                # SkillCard / badge / 榜单页
└─ taskset/               # 校验 + 准入检查

tasksets/                 # 官方任务集（生成器可复现）
benchmarks/               # 5 个真实技能包的 manifest + commit 锁
results/                  # 产出的 SkillCard 与 badge
docs/                     # 协议、探针、数据模型、路线图、标定
tools/                    # 生成器 / 抓取 / 出卡 / 标定
```

---

## 五条硬约束

1. **协议优先于实现** —— 指标定义在 `docs/02`，代码服从它
2. **安慰剂臂不可选** —— 只有两臂的结果必须标 `uncorrected` 且不许进榜
3. **评分器必须标 A/B/C** —— 不许混排
4. **任务集必须可复现** —— 锁 commit、锁评分器版本
5. **不做技能** —— 我们测量技能，不生产技能；发自己的技能包，中立性就没了

---

## 文档

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | 给下一个 Agent 的操作手册 |
| [docs/00-WHY.md](docs/00-WHY.md) | 为什么做这个项目 |
| [docs/01-竞争格局.md](docs/01-竞争格局.md) | SkillsBench 拆解 + 三个差异化楔子 |
| [docs/02-协议规范.md](docs/02-协议规范.md) | **协议宪法**：三臂、指标、归一化 |
| [docs/03-Tier0-六探针.md](docs/03-Tier0-六探针.md) | 六个探针的完整规格 |
| [docs/04-Tier1-任务集与评分器.md](docs/04-Tier1-任务集与评分器.md) | taskset 协议与评分器分级 |
| [docs/05-数据模型.md](docs/05-数据模型.md) | SkillCard / TaskSet / SQLite schema |
| [docs/06-CLI设计.md](docs/06-CLI设计.md) | 命令行规格 |
| [docs/07-路线图.md](docs/07-路线图.md) | 排期与进度表 |
| [docs/11-开放问题.md](docs/11-开放问题.md) | 尚未决定的事 |
| [docs/12-实现说明.md](docs/12-实现说明.md) | **实现时做的判断**（与文档默认值的出入） |
| [docs/13-任务集标定.md](docs/13-任务集标定.md) | 58 题重新标定 + 双峰分布与天花板问题 |
| [docs/14-首轮实测.md](docs/14-首轮实测.md) | 第一轮：5 个真实包 + 270 次 run |
| [docs/15-第二轮实测.md](docs/15-第二轮实测.md) | 第二轮：48 题、auto vs forced、安慰剂归因纠错 |
| [docs/16-消融实验.md](docs/16-消融实验.md) | 消融实验：提示词给不给 API 名，差 100pp；两处评分器误判 |

---

## 状态

- 版本：**v0.1.4**（`protocol/1.0.0`）
- Tier 0：六探针全部可用
- Tier 1：三臂 runner 可用；官方任务集 `web-guidance@1.4.0`（64 题，含 9 道行为测试）+
  `general-20@1.0`（20 题）
- 真实技能包：5 个，结果在 [`results/`](results/)（其中一个包出 auto / forced 两种条件共 6 张卡）
- 榜单页：`uplift site` → [`site/index.html`](site/index.html)
- 单测：107 个（含 19 条评分器自检 + 1 条「提示词不许给答案」的守卫）

## 许可

Apache-2.0。协议文档建议 CC-BY-4.0。

与 Criteo 的营销增益模型（uplift modeling）同名，本项目测的是 AI Agent Skills。
