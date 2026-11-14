# UpliftBench

**同一个技能，三臂，三个答案：−2.5pp、+5.6pp、+35pp。**

同一个包（`GoogleChrome/modern-web-guidance-src`）、同一个模型、同一套 harness。数字变了，是因为臂变了、题变了，不是因为技能变了。

技能包的净增益基准，命令行叫 `uplift`。英文版在 [README.md](README.md)。

![uplift](results/agent-skills.badge.svg)

```bash
npx upliftbench demo     # Tier 0 出卡，约 2 秒，不要 key，不花钱
```

---

## 先看这四个区间，再信任何 uplift 数字

12 个技能包有卡，其中 4 行有三臂和区间。**这 4 行没有一行能和等 token 安慰剂区分开：**

| 技能包 | uplift | 95% CI | N | 结论 |
|---|---|---|---|---|
| `addyosmani/agent-skills` | +2.2pp | [−2.2, +6.7] | 30 | 跨 0 |
| `multica-ai/andrej-karpathy-skills` | +4.9pp | [−3.7, +14.8] | 27 | 跨 0 |
| `modern-web-guidance-src`（强制注入） | +5.6pp | [−2.8, +13.2] | 48 | 跨 0 |
| `modern-web-guidance-src`（自动激活） | −2.5pp | [−7.9, +2.5] | 48 | 跨 0 |

整个仓库里唯一不跨 0 的区间，是那七道题上的 **+35pp [+16, +59]**——而那七道题是我们自己写的，写在最初 48 道题跑出 −2.5pp 之后。两件事都是产品的一部分：只发后面那个，就是这套生态 +27pp 问题的来源。

---

## 这是什么

技能包是塞进模型上下文里的 markdown。所以它有两种起作用的办法：一是让上下文变长，二是补上模型原本没有的知识。两臂对照（装 / 不装）把两件事加在一起算，于是有了满地的「+27pp」，别人复现不出来。

我们补的是被跳过的那一臂：等 token 量的中性文本。

| 臂 | 模型拿到什么 |
|---|---|
| baseline | 什么都不装 |
| placebo | 中性文本，token 数与真技能差 2% 以内 |
| treatment | 真技能 |

```
uplift_pp       = treatment − placebo     ← 进榜单的是这个
placebo_effect  = placebo − baseline      ← 光是「变长」值多少分
headroom_closed = uplift / (1 − placebo)  ← 剩余空间填掉了多少
```

一个技能对着 baseline 很好看、对着 placebo 一文不值，这种情况很常见。分辨这两种，就是这个项目的全部工作。

## 三十秒跑起来

不需要 key，不调模型，不花钱。

```bash
npx upliftbench demo
```

```
SkillCard  upliftbench/demo-skill   [Tier 0]
──────────────────────────────────────────────────────
  静态开销     228 tok 包内合计   在预算内
           └ 注入上下文 228 tok，预算 10,000
           └ 重复内容 53 tok (23.2%)
  可卸载      干净
──────────────────────────────────────────────────────
  Tier 1   未测（需任务集）
```

换成你自己的包，一样能跑：

```bash
npx upliftbench probe path/to/your-skill --only static-cost,uninstall-clean --format markdown
```

要分数就得有任务集和模型，也要花钱：

```bash
export UPLIFT_API_KEY=... UPLIFT_MODEL=<精确模型 id>
npx upliftbench run --taskset tasksets/web-guidance \
  --skill path/to/your-skill --arms baseline,placebo,treatment --repeats 5
```

Tier 0 只要有 Node 22；Tier 1 要写 SQLite，所以要 `better-sqlite3`，它挂在 optionalDependencies 里——你机器上原生编译挂了，`demo` 和 `probe` 照跑，`run` 会告诉你补装什么。

`--activation auto` 让模型自己决定要不要加载技能；`forced` 把正文直接写进 system prompt，安慰剂也等量注入。这是两个实验，工具会分开报。

## 跑过什么

到目前 2,945 次真实 run，69 道题，12 个真实技能包，两个模型，花了约 $600。

第一轮拿 `addyosmani/agent-skills` 试水，30 题 270 次 run（$27.09）：baseline 78.89%，placebo 74.44%，treatment 76.67%，uplift +2.22pp，95%CI [−2.22, +6.69]。安慰剂效应 −4.44pp，比技能本身的效应还大，符号能被它翻过去。详见 [docs/14](docs/14-首轮实测.md)。

第二轮换了语义对口的 `GoogleChrome/modern-web-guidance-src`，48 题，模型自己决定要不要加载（720 次 run，$60.93）：

| 臂 | 通过率 |
|---|---|
| baseline | 73.75% |
| placebo | 73.75% |
| treatment | 71.25% |

```
uplift −2.50pp   95%CI [−7.92, +2.50]   N=48   A 级   → 不显著
placebo_effect 0.00pp   激活率 23%
```

它自己的描述写着 `MANDATORY: Execute FIRST for all HTML/CSS tasks`，模型只在 23% 的运行里真去加载了。剩下那 77% 里，「装技能」和「不装」其实是同一件事，只是目录里多躺了几个文件。

把正文强行塞进上下文，同一个技能换了符号（432 次 run，$71.69）：baseline 71.53%，placebo 63.89%，treatment 69.44%，uplift +5.56pp，95%CI [−2.78, +13.19]，安慰剂效应 −7.64pp。9.4k 中性文本值 −7.6 分，真技能内容把它挣回 5.6 分。两个数都对，问的不是一个问题。

### 什么时候技能真的有用

上面那 48 题里有一半已经饱和，还有一批题其实在考「抄不抄得下来」，因为提示词把 API 名字写进去了。于是重做了一批题：只写症状，不给 API 名，而且考的 API 必须是技能里真写了的。5 道题，三臂，各 10 次（150 次 run，$29.79）：

| 题 | 考什么 | baseline | placebo | treatment | uplift |
|---|---|---|---|---|---|
| `wmg-060` | `<select>` 里放富内容 | 0/10 | 0/10 | 6/10 | +60pp |
| `wmg-058` | 状态保留式 DOM 移动 | 1/10 | 0/10 | 4/10 | +40pp |
| `wmg-064` | 锚点定位 | 4/10 | 3/10 | 7/10 | +40pp |
| `wmg-061` | scroll-state 容器查询 | 6/10 | 7/10 | 9/10 | +20pp |
| `wmg-044` | 同上但给了 API 名 | 6/10 | 6/10 | 8/10 | +20pp |
| 合计 | | 34% | 32% | 68% | +36pp，CI [+24, +48] |

这个数不是榜单数字，别当榜单数字引用。5 道题、强制激活、一个模型、一个技能。隔天复测得 +30pp（安慰剂臂从 −2pp 变成 +8pp），扩到 7 题得 +27pp，再跑 20 次重复得 +39pp；七题、每臂 30 次合并之后是 +35.2pp，CI [+15.7, +59.0]。所以对外只说这个合并值。它说明的是：题目出对了，工具能把「知识」和「长度」分开。安慰剂只值 −2pp，技能值 +36pp。

### 顺手量了 12 个真实包

第七个 Tier 0 探针回答的是一个更靠前的问题：这东西写得能不能被加载起来。12 个包的数据在 [榜单页](https://25cloud.github.io/UpliftBench/)，快照 2026-11-13。

| 包 | ★ | 技能数 | 包内 token | 最大单技能 | 目录成本 | 超预算 |
|---|---|---|---|---|---|---|
| `anthropics/skills` | 193.9k | 19 | 849,607 | 526,405 | 1,595 | 5164% |
| `Nutlope/hallmark` | — | 1 | 409,006 | 409,006 | 63 | 2823% |
| `cloudflare/security-audit-skill` | — | 1 | 79,967 | 79,967 | 90 | 399% |
| `obra/superpowers` | 317.0k | 15 | 100,774 | 25,738 | 586 | 157% |
| `KKKKhazix/khazix-skills` | 22.2k | 6 | 75,483 | 17,578 | 200 | 76% |
| `affaan-m/ECC` | 302.2k | 47 | 109,921 | 12,192 | 2,375 | 22% |
| `mattpocock/skills` | 323.4k | 39 | 80,583 | 10,808 | 1,390 | 8% |
| `obsidianmd/obsidian-skills` | 52.2k | 7 | 16,902 | 6,350 | 446 | 0% |
| `op7418/Humanizer-zh` | 22.7k | 1 | 8,042 | 4,204 | 47 | 0% |
| `multica-ai/andrej-karpathy-skills` | 232.7k | 1 | 644 | 644 | 55 | 0% |

「目录成本」是所有 description 加起来，一个技能都不激活也要付。30 万星的包列 47 个技能花掉 2,375 token，23 万星的包只花 55。包大小不是该看的列：1.27M token 的检索库激活时只吃 2,444，40 万 token 的单技能激活时全吃。

写法层面的分析在 [docs/17](docs/17-横向评测.md)。

## 我们改过自己什么

正则评分器只认一种写法，而正确答案有等价类。我们要求过 `showPopover()`，把声明式的 `popovertarget` 判错；禁止过 `insertBefore`，把技能自己推荐的特性检测回退判错。一天里五次，每一次都让技能看起来更差。

还公开过一段被数据打脸的归因。第一轮那个 −4.4pp 我们说过是「注入中性文本」造成的，后来查 `by_arm` 才发现第一轮安慰剂臂一次都没被激活过，那就是噪声。

以及 28 道题其实在考抄写，因为提示词里写了 API 名。同一份代码，把名字删掉，baseline 从 100% 掉到 0%。一个词的差别，100 个百分点。

这三件事都留在 CHANGELOG 和 [docs/16](docs/16-消融实验.md) 里，连同推翻它们的数字。

## 它不能说明什么

不能说明某个技能没用。一个任务集、一个模型、一个 harness，就一个数字。

不是跨包排名。12 个包有卡，只有 5 个有三臂数字。

小样本不稳。`wmg-064` 的 baseline 两批跑出来是 0/3 和 2/3，同一道题、同一个模型、同一份提示词。单题数字不出实验室。

不能替代你自己的评测。这里给的是一套协议和一把尺子，改指标定义要升 major，不是改代码。

## 七个 Tier 0 探针

不用任务集，不调模型，几秒钟。它们出事实，不出分数，所以不需要安慰剂臂。

| # | 探针 | 回答什么 |
|---|---|---|
| 1 | `static-cost` | 多少 token、重复多少、超没超预算 |
| 2 | `skill-shape` | 有没有 frontmatter、description 能不能用、是按需加载还是巨石 |
| 3 | `trigger-precision` | 该触发时触发了吗，不该触发时安静吗 |
| 4 | `constraint-following` | 它写的 never/must，模型真遵守了吗 |
| 5 | `injection-resistance` | 装了它，工具输出里的注入是不是更容易得手 |
| 6 | `negative-transfer` | 无关任务有没有变差 |
| 7 | `uninstall-clean` | 卸掉之后环境是不是真干净 |

后四个是别人不测的。领域内 +20pp、领域外 −10pp 的技能，净值可能是负的；安装时往 `~/.claude` 写东西的技能，是个隐患。

数字当事实看，别当判决。一个大参考库可以是合理设计，探针给的是价签。

## 任务集

`taskset.json` 是开放格式，官方只维护两个：`web-guidance@1.5.0`（69 题，A 级，其中 10 题是行为测试）和 `general-20@1.0`（20 题）。谁都能交题，门槛写在 [CONTRIBUTING.md](CONTRIBUTING.md)；两条最容易踩的是：评分器必须接受等价正解，提示词不许把答案写进去。

## 五条不让步的规矩

1. `uplift = treatment − placebo`，不是减 baseline。
2. 安慰剂臂不可选。只有两臂的结果必须标 `uncorrected`，不许进榜。
3. 评分器分 A/B/C 三级，不许混排。
4. 任务集锁 commit + 评分器版本。
5. 我们测技能，不做技能。

## 仓库结构

```
src/
├─ cli.ts          probe | run | card | badge | taskset | compare | site | demo | doctor
├─ probes/         七个 Tier 0 探针
├─ runner/         三臂调度、worktree 隔离、SQLite
├─ harness/        openai-compat | claude-code | mock
├─ graders/        tests(A) | exact(A) | rubric(B) | visual-diff(B)
├─ metrics/        uplift / headroom / 配对 bootstrap CI
├─ placebo/        中性语料与等量构造
└─ render/         SkillCard、badge、榜单页
tasksets/          69 题 web-guidance@1.5.0 + 20 题 general-20@1.0
results/           12 个包、13 张卡
docs/              20 篇：协议、实现、标定、实测、消融、横评
tests/             126 个单测，其中 21 个是评分器自检
```

## 文档

| | |
|---|---|
| [docs/02-协议规范.md](docs/02-协议规范.md) | 协议（英译 [en](docs/02-protocol.en.md)，中文为准） |
| [docs/03-Tier0-六探针.md](docs/03-Tier0-六探针.md) | 七个探针的规格 |
| [docs/13-任务集标定.md](docs/13-任务集标定.md) | 为什么难度是双峰的，为什么 58% 的题已经满 |
| [docs/14-首轮实测.md](docs/14-首轮实测.md) | 第一轮 270 次 run |
| [docs/15-第二轮实测.md](docs/15-第二轮实测.md) | 1,152 次 run，auto 与 forced |
| [docs/16-消融实验.md](docs/16-消融实验.md) | 什么真的在动分数，五次评分器误判 |
| [docs/17-横向评测.md](docs/17-横向评测.md) | 12 个包的写法差异 |

## 状态

`protocol/1.0.0`，软件 `v0.2.8`，Node ≥ 22，Apache-2.0。没有后端，不用账号，不采集任何东西。

CI 跑 build、测试、任务集校验、卡片 schema、markdown 链接检查和 demo。`results/` 和 `site/` 里的东西都能从提交的 run 数据库重新生成，每次 run 的成本都记着。

最有用的一件事，是告诉我们哪个数字不对。[模板在这里](.github/ISSUE_TEMPLATE/challenge-a-number.md)。

与营销领域的 uplift modeling 同名，测的东西不一样。
