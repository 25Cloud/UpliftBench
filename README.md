# UpliftBench

**技能包净增益基准 · 命令行 `uplift` · 中文名「增益基准」**

> 一句话：**我们不改题，我们定义「怎么算分」。**

---

## 这是什么

UpliftBench 是一个测量 **Agent Skills（技能包）** 真实效果的基准与工具链。

它不生产技能，也不拥有题库。它提供三样东西：

1. **一套协议** —— 三臂对照（无技能 / 安慰剂 / 真技能），剥离「多塞 token 本身就有效」的混淆
2. **六个通用探针（Tier 0）** —— 与领域无关，任意技能包秒级可测
3. **一个联邦题库格式（Tier 1）** —— 谁都能交题，我们不垄断任务集

输出物是一张 **SkillCard**（雷达卡 + 一个 headline 数字），不是一个孤零零的分数。

---

## 为什么需要它

2026 年 10–11 月，GitHub Trending 上出现了一个从未有过的现象：**技能包（SKILL.md）成了最大的单一品类**。

30 天窗口内抓到的 135 个上榜仓库里，约 19% 是技能包，而且 Anthropic、Google、Cloudflare、NVIDIA、Meta、AWS、Chrome 全部在 30 天内发了自己的技能包。

但整个生态有一个荒谬的空白：

- `addyosmani/agent-skills` —— **116,785 星，一个效果数字都没有**
- `cloudflare/security-audit-skill` —— 卖点是「independently verified」，但没人验证它
- `GoogleChrome/modern-web-guidance-src` —— 全生态**唯一**公开 uplift 数字（+27~36pp），就靠这张表登顶 Trending

**数字就是信任货币。而整个生态在裸奔。**

---

## 和 SkillsBench 的关系（必读）

`SkillsBench`（[arXiv 2602.12670](https://arxiv.org/abs/2602.12670)，[benchflow-ai/skillsbench](https://github.com/benchflow-ai/skillsbench)）已经证明了配对评测这条路是对的，并且给出了第一组硬数字（33.9% → 50.5%，+16.6pp）。

**我们不重复它，我们补它缺的三刀：**

| 维度 | SkillsBench | UpliftBench |
|---|---|---|
| 对照臂 | 两臂（无技能 / 有技能） | **三臂**（+ 安慰剂臂） |
| 覆盖范围 | 87 个手写任务 / 8 领域 | **Tier 0 六探针覆盖任意技能包** |
| 题库所有权 | 固定封闭清单 | **联邦：`taskset.json` 开放提交** |
| 输出 | 排行榜分数 | **SkillCard（卡 + 分级 + 置信区间）** |
| 测量对象 | 研究者自建的 curated Skills | **真实发布的技能包** |

**核心差异一句话：SkillsBench 回答「技能有没有用」，UpliftBench 回答「这个技能到底贡献了多少、它安全吗、它值不值得装」。**

---

## 30 秒上手（目标形态）

```bash
# Tier 0：任何技能包，秒级，不调模型
uplift probe ./agent-skills

# Tier 1：三臂对照，需要任务集
uplift run \
  --taskset web-guidance@1.0 \
  --skill ./modern-web-guidance \
  --agent claude-code \
  --arms baseline,placebo,treatment \
  --repeats 3
```

产出：

```
SkillCard  addyosmani/agent-skills
────────────────────────────────────────────
静态开销      12,400 tok   ⚠️ 超预算 24%
触发精度      P 0.91 / R 0.78
约束遵循      违规 2/40
注入抗性      被劫持 1/12   ⚠️
负迁移        −3.2pp（无关任务）
可卸载        干净
────────────────────────────────────────────
Tier 1        uplift +18pp / headroom 41%   [A 级评分器]
```

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | **给下一个 Agent 的操作手册，先读这个** |
| [docs/00-WHY.md](docs/00-WHY.md) | 为什么做这个项目（完整论证） |
| [docs/01-竞争格局.md](docs/01-竞争格局.md) | SkillsBench 深度拆解 + 我们的差异化 |
| [docs/02-协议规范.md](docs/02-协议规范.md) | 三臂对照、指标定义、归一化公式 |
| [docs/03-Tier0-六探针.md](docs/03-Tier0-六探针.md) | 六个通用探针的完整规格 |
| [docs/04-Tier1-任务集与评分器.md](docs/04-Tier1-任务集与评分器.md) | taskset 协议、评分器分级 |
| [docs/05-数据模型.md](docs/05-数据模型.md) | SkillCard / TaskSet JSON schema |
| [docs/06-CLI设计.md](docs/06-CLI设计.md) | 命令行界面规格 |
| [docs/07-路线图.md](docs/07-路线图.md) | 一周 MVP 排期 + 后续阶段 |
| [docs/08-风险与对策.md](docs/08-风险与对策.md) | 已知风险与对冲 |
| [docs/09-命名与品牌.md](docs/09-命名与品牌.md) | 名字来由、badge 设计、重名核查结果 |
| [docs/10-背景调研.md](docs/10-背景调研.md) | GitHub Trending 30 天调研原始结论 |
| [docs/11-开放问题.md](docs/11-开放问题.md) | 尚未决定的事，别当已定 |

---

## 状态

- 阶段：**开题（pre-code）**
- 代码：尚未开始
- 命名：`UpliftBench` 已核查可用（npm/PyPI/域名全空，GitHub 仅 2 个无关僵尸仓库）

---

## 许可

待定（建议 Apache-2.0，与生态主流一致；协议文档建议 CC-BY-4.0）
