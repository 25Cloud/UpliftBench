# 22 · 英文发布包（Show HN / X / Reddit）

> 生成于 2026-11-14。目标不是"发一条推文"，是**在一个 2 小时的窗口里让 star 曲线出现尖峰**。
>
> 为什么是尖峰：2026-11-14 实测，GitHub Trending 全球日榜第 1 名 `alibaba/open-code-review`
> 的 24h 增量只有 **+215**，而第 2 名 `GoogleChrome/modern-web-guidance-src` 是 **+1,925** 却排第二。
> 榜单个名次按加权速度排，不是按 24h 总量；榜单底部（第 12 名）24h 只有 **+67** 也能挂上去。
> 所以：**进榜 ≈ 60–100 星/天，榜一 ≈ 200–400 星/天，且必须集中在几小时内。**
>
> 下面是可直接复制的文案。英文部分原样贴出去，中文部分不要贴。

---

## 0 · 发布前 60 分钟 checklist

按顺序，全绿才按发布键。任何一条红着发，等于把流量倒进漏勺。

| # | 检查 | 命令 / 动作 | 期望 |
|---|---|---|---|
| 1 | npm 上真有包 | `npm view upliftbench version` | 输出 `0.2.8` |
| 2 | 干净目录能跑 demo | 新建空目录 `cd` 进去，`npx upliftbench demo` | 2 秒内出 SkillCard，退出码 0 |
| 3 | 榜单页默认英文 | 打开 https://25cloud.github.io/UpliftBench/ | 第一行是英文；右上角有「中文」 |
| 4 | 中文版可达 | 同上，点「中文」 | 落到 `/zh-CN.html`，能切回 |
| 5 | 机读索引可访问 | `curl -s https://25cloud.github.io/UpliftBench/index.json \| head -c 80` | 有 `generated_at` |
| 6 | CI 绿 | `gh run list --limit 3` | 全是 success |
| 7 | README 首屏有那张四行区间表 | 打开仓库首页 | 不滚动就能看到 4 个 `crosses zero` |
| 8 | social preview 图 | Settings → Social preview 上传 1280×640 | HN/X 抓取时有卡图 |
| 9 | 两个"真"issue 已开 | 见下方 §5 | 首访者看到的是活的仓库，不是坟 |
| 10 | 时区对不对 | 见 §4 | 美东 09:00–11:00 |

第 2 条最容易假绿：在仓库目录里 `npx` 会命中本地的 `node_modules`，测不出真实安装路径。必须空目录。

---

## 1 · Show HN

**URL**：`https://github.com/25Cloud/UpliftBench`

**标题**（三选一，A 最稳）：

```
A. Show HN: Measuring agent skills against a length-matched placebo
B. Show HN: A placebo arm for agent-skill benchmarks
C. Show HN: Agent skills are measured against the wrong baseline
```

不选带数字的标题，是因为 HN 标题里的数字会被当成营销，而正文第一段就把数字给足了。

**正文**（正文只讲"我做了什么、为什么"，不列成绩单）：

```
Every agent skill package ships a claim. "MANDATORY: execute FIRST for all HTML/CSS tasks."
"+27 to +36 percentage points." Almost none of them subtract the one thing that inflates
every result: the skill makes the prompt longer, and a longer prompt changes answers on its own.

So we added the arm everyone skips. Neutral text, matched to the skill's token count within 2%.
Three arms: no skill, placebo, real skill. uplift = treatment − placebo.

We ran it on 12 real packages, ~2,900 runs, two models, about $600.

What came out is less flattering than what went in. Of the four rows with enough runs to carry
a confidence interval, none is distinguishable from the placebo: +2.2pp [−2.2, +6.7],
+4.9pp [−3.7, +14.8], +5.6pp [−2.8, +13.2], −2.5pp [−7.9, +2.5].

The one interval that does clear zero is +35pp [+16, +59] — on seven tasks we wrote ourselves,
after the first 48 tasks gave the −2.5pp. Both numbers are in the repo, in the same table.

The tool is a CLI (node 22, no services, no accounts):
  npx upliftbench demo        # Tier 0 card, ~2s, no key, no model calls

There is also a static leaderboard, a machine-readable index.json, a badge, and a GitHub Action
that posts a Tier 0 card on every PR. The protocol is versioned and the placebo arm is mandatory —
a two-arm number is marked "uncorrected" and never enters the leaderboard.

The most useful thing anyone can send us is a number they think is wrong. There's an issue
template for exactly that.
```

**首评**（自己发，1 分钟内跟上；HN 上"作者首评"是主页的一半）：

```
Author here. Three things that are not in the README, in order of how much they changed my mind.

1. The grader is the weakest link, not the model. We found five cases where a correct answer was
   rejected because the regex only accepted one syntax — requiring showPopover() and rejecting the
   declarative popovertarget, banning insertBefore and rejecting a feature-detection fallback the
   skill itself recommends. Every one of those made the skill look worse than it is. Graders now
   carry a tier (A executable / B pinned judge / C human spot-check) and tiers are never mixed in
   one table.

2. Activation rate is an unmeasured denominator in this ecosystem. modern-web-guidance says
   "MANDATORY: execute FIRST" and the model loaded it in 23% of runs. For the other 77%,
   "treatment" was "baseline with extra markdown sitting in a directory". Any uplift number
   without an activation rate is measuring the harness's willingness to call a tool as much as
   the skill's content.

3. We published a block result, re-ran it, and it moved. +36pp [±12] → +30pp → +27pp, then 20
   repeats of the same block gave +39pp. Pooling 30 repeats per task lands at +35pp [+16, +59].
   The lesson isn't that +36 was wrong, it's that five tasks with ten repeats cannot support a
   ±12pp interval, and we published one anyway. docs/16 has the whole sequence including the
   numbers that overturned the earlier claims.

Happy to answer anything about the method, including the parts that are still weak: n=30 per cell,
one harness per number, and a task set we chose ourselves.
```

---

## 2 · X / 推特 thread

一条一条发，配图用 `docs/assets/hero.svg` + 榜单页截图。第一条必须能在不看回复的情况下独立成立。

```
1/
Every agent skill ships a claim.
Almost none of them subtract the placebo.

We measured 12 real skill packages in three arms.
Of the four with error bars, none beats a length-matched placebo.
```

```
2/
The three arms are the whole idea:
  baseline  → nothing
  placebo   → neutral text, same token count (±2%)
  treatment → the actual skill

uplift = treatment − placebo
A skill that looks great against baseline can be worth 0 against placebo.
```

```
3/
The one package everyone quotes: modern-web-guidance, "+27 to +36pp".

Our three runs on it, same model, same harness:
  agent decides when to load it   −2.5pp  [−7.9, +2.5]
  forced into system prompt       +5.6pp  [−2.8, +13.2]
  7 tasks written for its content +35pp   [+16, +59]
```

```
4/
9.4k tokens of neutral text costs 7.6 points.
The skill's content earns back 5.6.

That's not a debunk. It's the decomposition: length vs knowledge.
Two-arm benchmarks report the sum and call it the skill.
```

```
5/
It says "MANDATORY: Execute FIRST for all HTML/CSS tasks".
The model loaded it in 23% of runs.

For the other 77%, the treatment arm was the baseline arm with extra markdown on disk.
Activation rate is the denominator nobody publishes.
```

```
6/
Same seven tasks, second model (deepseek-v4.1-flash): +14.1pp [0.0, +39.5].

And the wins moved. glm gains 93pp on base-select, deepseek gains 89pp on scroll-state queries.
A skill's effect is a property of skill × model × task distribution. Not of the skill.
```

```
7/
Where we were wrong, all of it in the repo:

5 grader bugs that each made the skill look worse.
1 explanation ("placebo noise") the data destroyed.
28 of 48 tasks graded transcription because the prompt named the API.
1 block result we re-ran three times and corrected down, then pooled.
```

```
8/
It's a CLI, not a SaaS.

  npx upliftbench demo        # 2s, no key, no model calls
  npx upliftbench probe ./my-skill

Leaderboard + index.json + badge + a GitHub Action.
Protocol versioned; the placebo arm is mandatory.
If you think a number is wrong, there's a template for that.

https://github.com/25Cloud/UpliftBench
```

---

## 3 · Reddit

**r/LocalLLaMA**（标题党会被删，用陈述句）：

```
Title: We measured 12 agent skill packages against a length-matched placebo. None of the 4 with
       confidence intervals beats it.
Body:  把 Show HN 正文原样贴，末尾加一句 "happy to share the raw run DBs; every card links to one".
```

**r/ClaudeAI**：切口换成"你装的那些 skill 到底值多少"：

```
Title: 12 Claude Code skill packages, three arms each (no skill / token-matched placebo / skill).
       Activation rate is the number nobody publishes.
Body:  用 Show HN 正文，但把第 2 段换成激活率那段（23% 那个），并在结尾问一句
       "what activation rates are you seeing on your own skills?"
```

**r/LLMDevs** / **r/evals**：切口换成方法论，不要发同一份文案：

```
Title: The missing arm in agent evals: token-matched placebo
Body:  只讲 §2 的三臂设计 + 五个评分器误判 + A/B/C 分级，末尾放 repo 链接。
```

同一天最多发 2 个子版，隔 4 小时以上；同一份文案一字不改地贴三个版会被判 spam。

---

## 4 · 时间窗

| 北京 | 美东（EST） | 判断 |
|---|---|---|
| 21:30 | 08:30 | 起来干活：跑 §0 checklist |
| **22:00** | **09:00** | **发 Show HN + 立刻首评** |
| 22:05 | 09:05 | X thread 第 1 条 |
| 22:30 | 09:30 | 回复 HN 上每一条评论（前 2 小时的回复率决定能不能上首页） |
| 23:00 | 10:00 | 发 Reddit 第 1 个版 |
| 00:00+1 | 11:00 | 看斜率：单小时 <20 星就换标题重发（HN 允许，间隔 ≥ 8 小时） |
| 01:00+1 | 12:00 | 发 Reddit 第 2 个版 |
| 次日上午 | — | 中文侧：即刻 / V2EX / 小红书（**不要**在发布当天分流） |

周二、周三最好；周五下午到周日基本是白烧。

---

## 5 · 发布前该开的两个 issue（真实的，不是凑数）

空仓库的 0 issue 会让首访者以为这是死项目。开两条**真问题**，顺便把"我们在自我挑战"这件事做实：

1. `challenge-a-number` 模板开一条：*"+35pp block was written by us — what would falsify it?"*
   正文写清楚：换一批人写的题、盲评、以及 n=30 下多大的效应才看得见。

2. bug-report 模板开一条：*"`wmg-064` baseline is 0/3 in one batch and 2/3 in the next"*
   这是 docs/16 里已经承认的抖动，写进去，并说明单题数字为什么停在 lab 里。

这两条比任何 badge 都更能证明"这项目在自我审计"。

---

## 6 · 评论区弹药（HN 一定会问的六个问题）

**Q: 安慰剂里塞的是乱码吗？那当然更差。**
A: 不是。安慰剂是我们自己写的通用技术散文，等 token（±2%），无指令性内容。而且安慰剂效应经常是**负**的（9.4k token 那组是 −7.64pp），这正是我们要量出来的东西：长度本身在扣分，不是加分。

**Q: +35pp 那七道题是你们自己出的，等于自证。**
A: 是，所以它在表里单独标出来，并且同一块在第二个模型上只有 +14.1pp [0.0, +39.5]，受益的题也换了。我们把"题是我们选的时候能跑出什么"和"题是别人选的时候跑出什么"两件事分开报。

**Q: 每格 n=30 太小。**
A: 我们用的是按题配对的 bootstrap，单题数字不进结论。而且我们公开过一次自我打脸：+36pp ±12 的区间在 30 次重复后是 +35pp [+16, +59]。小样本的教训写在 docs/16 里，不是被藏起来。

**Q: 为什么不直接用现成的 benchmark（SWE-bench、SkillsBench）？**
A: 它们比的是"装 vs 不装"，缺的正好是安慰剂臂。我们也不跟它们抢题：任务集是联邦的，谁都能交，门槛是"评分器接受等价正解 + 提示词不许写出答案"。

**Q: 正则评分器不可靠。**
A: 对，我们已经因此误判过五次，每一次都让技能看起来更差。所以评分器分 A/B/C 三级、不混排，B 级必须锁 judge 版本。

**Q: 那这跟一篇博客有什么区别？**
A: 每张卡都指向仓库里提交的 run 数据库，`uplift site` 能从那些库重算出整页；觉得哪个数不对有专门的 issue 模板。

---

## 7 · 发布当天盯什么

```bash
# 每 10 分钟一次。斜率比总数重要。
while true; do
  printf '%s  stars=%s  on_trending=%s\n' \
    "$(date -u +%H:%M)" \
    "$(gh api repos/25Cloud/UpliftBench --jq .stargazers_count)" \
    "$(curl -s https://github.com/trending?since=daily | grep -c '25Cloud/UpliftBench')"
  sleep 600
done
```

判据：

| 观察到 | 含义 | 动作 |
|---|---|---|
| 首小时 +50 | 稳进日榜 | 继续回复评论，别改仓库 |
| 首小时 +100 | 前 3 | 把 X thread 剩下几条按 20 分钟间隔发完 |
| 首小时 +150 | 榜一在望 | 找 3 个 agent 圈账号转，只发链接不加话术 |
| 首小时 <20 | 标题没打中 | 8 小时后换标题 B 重发，不要在同一条里反复顶 |
| 48 小时 <120 | 这轮没成 | 停手，去写"12 个包的写法层横评"那篇，用内容换第二波 |

---

## 8 · 不要做的事

- 不要买 star、不要互 star 群。Trending 有反作弊，掉榜之后比没上更难看。
- 不要在 HN 标题里写 "+35pp" 或 "benchmark" 以外的形容词。
- 不要在同一天把同一份文案发到 3 个以上 subreddit。
- 不要发布当天改稿大改 README——HN 缓存的是发布那一刻的页面。
- 不要用"我们发现了真相"的口气。你的数据里最强的结论是"我们自己也没测出显著"，把这个当成主打，别人才会信你的 +35。
