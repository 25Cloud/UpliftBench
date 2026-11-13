# UpliftBench

**技能包净增益基准 · 命令行 `uplift` · 中文名「增益基准」**

> 一句话：**我们不改题，我们定义「怎么算分」。**

![uplift](results/agent-skills.badge.svg)

**首轮实测（270 次 run，$27.09）**：`addyosmani/agent-skills` 在 30 题 Web 合规任务集上
**uplift +2.2pp，95%CI [−2.2, +6.7]，不显著**；同一批数据用两臂口径算出来是 **−2.2pp**——
安慰剂效应 −4.4pp 比技能本身的效应还大，**足以把符号搞反**。详见 [docs/14](docs/14-首轮实测.md)。

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
pnpm test                     # 70 个单测

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
**符号被安慰剂效应翻转了。** 完整分析见 [docs/14-首轮实测.md](docs/14-首轮实测.md)。

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
| `web-guidance@1.0` | 30 | A（tests） | 现代 Web API 合规；实测 baseline 73%，见 [docs/13](docs/13-任务集标定.md) |
| `general-20@1.0` | 20 | A（tests） | 通用算法小任务，供负迁移 / 卸载探针使用 |

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
| [docs/13-任务集标定.md](docs/13-任务集标定.md) | 30 题实测标定 + 双峰分布发现 |

---

## 状态

- 版本：**v0.1.0**（`protocol/1.0.0`）
- Tier 0：六探针全部可用
- Tier 1：三臂 runner 可用，官方任务集 30 题 + 20 题
- 真实技能包：5 个，结果在 [`results/`](results/)
- 榜单页：`uplift site` → `site/index.html`

## 许可

Apache-2.0。协议文档建议 CC-BY-4.0。

与 Criteo 的营销增益模型（uplift modeling）同名，本项目测的是 AI Agent Skills。
