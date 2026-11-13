# 04 · Tier 1：任务集与评分器

> Tier 1 是「联邦层」。**我们不拥有题库，我们定义题库格式。**
> 设计目标：任何领域的作者都能在 1 小时内写出一个合法的 `taskset.json`。

---

## 一、联邦原则

1. **协议管格式，不管内容。** 我们规定 `taskset.json` 的结构和必填字段，不规定里面放什么题。
2. **交题即声明。** 作者声称技能解决什么，就得交一套能验证那个声称的题。
3. **交不出题 → 不上榜**，而不是给个假分数。
4. **官方只维护 1–2 个示范任务集**（Web 规范、安全审计），其余由社区提交。
5. **任何人都能 fork 整个榜并重跑** —— 这是公信力的来源。

---

## 二、`taskset.json` 规格

```json
{
  "schema_version": "1.0.0",
  "domain": "web-guidance",
  "version": "1.0.0",
  "title": "Modern Web Guidance 合规任务集",
  "maintainer": "upliftbench",
  "grader": {
    "kind": "tests",
    "tier": "A",
    "entry": "grade.sh",
    "timeout_sec": 120
  },
  "env": {
    "kind": "docker",
    "image": "ghcr.io/upliftbench/web-guidance:1.0.0",
    "image_digest": "sha256:...",
    "commit": "a1b2c3d4"
  },
  "task_count": 30,
  "tasks": [
    {
      "id": "wmg-001",
      "title": "用 fetch 替代 XMLHttpRequest",
      "prompt_file": "tasks/wmg-001/prompt.md",
      "fixture": "tasks/wmg-001/fixture/",
      "verify": "tasks/wmg-001/verify.sh",
      "weight": 1.0,
      "tags": ["api-modernization"]
    }
  ]
}
```

### 必填字段（缺一不可）

| 字段 | 说明 |
|---|---|
| `schema_version` | 必须是 `1.0.0` |
| `domain` | 领域标识，小写短横线 |
| `version` | 任务集语义版本 |
| `grader.kind` | `tests` / `exact` / `rubric` / `visual-diff` / `human` |
| `grader.tier` | `A` / `B` / `C` |
| `env.image_digest` | **必须锁定 digest，不许用 tag** |
| `env.commit` | fixture 的 git commit |
| `tasks[].id` | 全局唯一，格式 `<domain>-<n>` |
| `tasks[].prompt_file` | 相对路径 |
| `tasks[].verify` | 可执行验证脚本（A 级必填） |

### B 级评分器额外必填

```json
"grader": {
  "kind": "rubric",
  "tier": "B",
  "judge_model": "exact-model-id@version",
  "judge_prompt_file": "grade/prompt.md",
  "rubric_file": "grade/rubric.md",
  "kappa": 0.72,
  "kappa_samples": 30
}
```

**`kappa < 0.6` → 强制降级为 C，不得进榜。**

---

## 三、官方示范任务集（只做两个，其余交给社区）

### 3.1 `web-guidance@1.0`（A 级，首选）

| 项 | 内容 |
|---|---|
| 领域 | 现代 Web API 合规 |
| 任务 | 30 个 fixture 仓库，每个含若干已废弃 API 用法 |
| 评分 | `grade.sh` 跑 lint 规则（如已废弃 API 列表），算「废弃用法清除率」 |
| 为什么选它 | 判定完全确定，零主观，最容易做出可信的第一批数字 |
| 对应技能包 | `GoogleChrome/modern-web-guidance-src`（它自己公开了 +27~36pp，正好可以交叉验证我们的方法！） |

**这个交叉验证是巨大的加分项**：如果我们测出的数字和它自己报的接近，公信力立刻建立。

### 3.2 `security-audit@1.0`（A 级）

| 项 | 内容 |
|---|---|
| 领域 | 安全审计 |
| 任务 | 20 个注入了已知漏洞的 fixture 仓库 |
| 评分 | 命中数（recall）+ 误报数（precision）双指标 |
| 对应技能包 | `cloudflare/security-audit-skill`、`openai/codex-security` |

### 3.3 其余领域（社区提交，我们不写）

| 领域 | 评分器 | 谁能交 |
|---|---|---|
| 设计（hallmark / impeccable） | `visual-diff` + rubric（B） | 设计社区 |
| 求职（ai-job-search） | rubric（B） | 招聘社区 |
| 游戏工作室 | `tests`（构建+测试通过，A） | 游戏开发者 |
| 科学计算 | `exact`（A） | 科研社区 |
| 紫微斗数 / 命理 | `exact`（A） | 中文社区 |

---

## 四、评分器实现规格

### 4.1 `tests`（A 级）

```bash
# grade.sh 约定
# stdin:  JSON {"task_id":"...", "workspace":"/path/to/work"}
# stdout: JSON {"pass": true|false, "detail": "...", "metrics": {...}}
# exit:   0 = 成功执行（不代表 pass）；非 0 = 评分器自身错误
```

**`exit != 0` 必须归类为 `grader_error`，不计入 pass_rate。** 这是防止基准作弊的关键。

### 4.2 `exact`（A 级）

输出与期望值精确匹配（允许声明的归一化：trim、去空白、大小写、数值容差）。

```json
"grader": {
  "kind": "exact",
  "tier": "A",
  "normalize": ["trim", "collapse_whitespace", "lowercase"],
  "numeric_tolerance": 1e-6
}
```

### 4.3 `rubric`（B 级）

```json
"grader": {
  "kind": "rubric",
  "tier": "B",
  "judge_model": "claude-opus-4-6-20260201",
  "judge_temperature": 0,
  "judge_prompt_file": "grade/prompt.md",
  "rubric_file": "grade/rubric.md",
  "scores": [
    { "id": "correctness", "max": 40 },
    { "id": "completeness", "max": 30 },
    { "id": "style", "max": 30 }
  ]
}
```

### 4.4 `visual-diff`（B 级）

渲染结果截图 → 与参考图做像素/结构相似度 → 阈值判定。

```json
"grader": {
  "kind": "visual-diff",
  "tier": "B",
  "engine": "pixelmatch",
  "threshold": 0.02,
  "viewport": { "width": 1440, "height": 900 }
}
```

### 4.5 `human`（C 级）

只做附录，不进榜。用于给 B 级评分器算 κ。

---

## 五、任务设计规范

### 5.1 一个任务必须满足

| 要求 | 说明 |
|---|---|
| **单一意图** | 一个任务只测一件事 |
| **可复现** | 同环境同输入必得同结果 |
| **无网络依赖** | fixture 全部本地化 |
| **有确定性验证** | A 级任务必须有 `verify` 脚本 |
| **难度可标** | `difficulty: easy\|medium\|hard`，三档各占 ~1/3 |
| **失败可诊断** | 失败时能指出失败在哪一步 |

### 5.2 难度分档（避免天花板效应）

| 档 | baseline 预期通过率 | 目的 |
|---|---|---|
| easy | 70–90% | 检测负迁移（技能是否拖累简单任务） |
| medium | 30–60% | **主要区分度来源** |
| hard | 5–20% | 检测技能的深度增益 |

**如果全部任务都是 easy，uplift 会趋近 0（没空间）；全是 hard，会趋近 0（都做不出）。medium 占 40–50% 是甜点。**

---

## 六、任务集准入检查（CI 强制）

任何提交的任务集必须通过：

1. `taskset.json` 通过 schema 校验
2. 所有 `verify` 脚本在无技能条件下能跑通（不报 `grader_error`）
3. **空技能对照**：`baseline` 和 `placebo`（同一份空文本）跑出的 pass_rate 差异 < 5pp —— 验证任务集本身没有随机性缺陷
4. 每个任务的 baseline 通过率落在声明的难度区间内（±15pp）
5. `env.image_digest` 非空且格式正确

**第 3 条是最重要的自检**：如果两个等价条件跑出不同结果，任务集本身就是坏的。

---

## 七、榜单条目格式

```
web-guidance@1.0  [A级]  N=30
─────────────────────────────────────────────────────────
技能包                        uplift   headroom   placebo   95%CI
GoogleChrome/modern-web-...   +31pp    52%        +5pp      [22, 40]
addyosmani/agent-skills       +12pp    20%        +7pp      [4, 20]
obra/superpowers              +8pp     13%        +6pp      [1, 15]
─────────────────────────────────────────────────────────
```

**`placebo` 列必须显示。** 一个 `placebo +20pp` 而 `uplift +2pp` 的技能包，等于什么都没做，只是把上下文撑长了——这个信息必须一眼可见。

---

## 八、与 SkillsBench 的互操作

如果 SkillsBench 公开了它的任务格式：

1. **写一个转换器**，把它们的 87 题转成我们的 `taskset.json`
2. 在同一批题上跑三臂，得出「两臂 vs 三臂差多少」
3. **这个对比本身就是最好的论文/博文素材**：证明安慰剂臂改变了排名

如果它们不公开：用我们自己的 30 题做同样的对比（两臂结果 vs 三臂结果），一样有说服力。

**这个实验建议排在第 2–3 周做，是传播的核弹。**
