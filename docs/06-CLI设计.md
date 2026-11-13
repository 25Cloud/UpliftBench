# 06 · CLI 设计

> 命令名 `uplift`。设计原则：**没有配置文件也能跑，所有配置可被 flag 覆盖。**

---

## 一、命令总览

```
uplift <command> [options]

命令：
  probe      跑 Tier 0 七探针（不需要任务集）
  run        跑 Tier 1 三臂对照（需要任务集）
  card       查看/渲染已有的 SkillCard
  badge      生成 badge SVG
  taskset    任务集管理（validate / list / fetch）
  compare    两个技能包对比
  site       从 results/*.json 生成静态榜单页
  doctor     环境自检
```

---

## 二、`uplift probe`

```bash
uplift probe <path> [options]

选项：
  --only <probes>        只跑指定探针，逗号分隔
                         可选：static-cost,trigger-precision,constraint-following,
                               injection-resistance,negative-transfer,uninstall-clean
  --all                  跑全部六项（默认）
  --harness <name>       harness 适配器：claude-code | codex | none
                         默认 claude-code；static-cost 不需要 harness
  --budget <n>           token 预算，默认 10000
  --triggers <file>      触发精度用的 triggers.json
  --injections <file>    注入抗性用的语料库
  --general-tasks <dir>  负迁移用的通用任务目录
  --out <file>           输出 SkillCard JSON，默认 .uplift/skillcard.json
  --format <fmt>         text | json | markdown，默认 text
  --no-color
  --verbose

示例：
  uplift probe ./agent-skills --only static-cost
  uplift probe ./agent-skills --all --format markdown
  uplift probe ./hallmark --only constraint-following --harness claude-code
```

**退出码**：
| 码 | 含义 |
|---|---|
| 0 | 全部探针成功 |
| 1 | 有探针失败（如技能包不合法） |
| 2 | 参数错误 |
| 3 | 有探针 `supported: false`（部分完成） |

---

## 三、`uplift run`

```bash
uplift run --taskset <ref> --skill <path> [options]

必需：
  --taskset <ref>        任务集引用：web-guidance@1.0 或本地路径
  --skill <path>         技能包路径

选项：
  --arms <list>          默认 baseline,placebo,treatment
                         允许只跑 baseline,placebo 做自检
  --model <id>           精确模型 ID（必填，不许用 latest）
  --harness <name>       claude-code | codex，默认 claude-code
  --repeats <n>          默认 3，最小 3
  --temperature <f>      默认 0
  --seed <n>             默认 42
  --placebo <file>       自定义安慰剂文本；不指定则自动生成
  --placebo-max-delta <f> 安慰剂 token 偏差上限，默认 0.02
  --jobs <n>             并发数，默认 4
  --timeout <sec>        单任务超时，默认 600
  --max-steps <n>        agent 单次 run 的最大步数，默认 14
  --activation <mode>    auto（默认，模型自己决定是否激活技能）
                         | forced（把技能正文直接注入上下文，等价于 harness 自动做渐进披露）
  --max-cost <usd>       成本上限，超过即停
  --resume               从 .uplift/runs.db 续跑
  --out <file>
  --format <fmt>

示例：
  uplift run --taskset web-guidance@1.0 \
             --skill ./modern-web-guidance \
             --model claude-opus-4-6-20260201 \
             --repeats 5
```

**安全阀**：`--max-cost` 默认从环境变量 `UPLIFT_MAX_COST` 读取，未设置时默认 `$10`。超过即停并保留已完成数据。

---

## 四、`uplift card`

```bash
uplift card [--file .uplift/skillcard.json] [--format text|markdown|json]
uplift card --compare a.json b.json
```

---

## 五、`uplift badge`

```bash
uplift badge --file .uplift/skillcard.json --out badge.svg [--style full|compact]
```

---

## 六、`uplift taskset`

```bash
uplift taskset validate <path|ref>    # schema + 准入检查
uplift taskset list                   # 已缓存的任务集
uplift taskset fetch <ref>            # 从 registry 拉取
uplift taskset inspect <ref>          # 显示任务数、评分器等级、环境
```

**准入检查**（对应 `docs/04 §6`）会输出：
```
✓ schema 校验通过
✓ 30 个 verify 脚本可执行
✓ 空技能对照：baseline 0.40 / placebo 0.41（差 1pp，通过）
✗ 3 个任务的 baseline 通过率超出声明难度区间
```

---

## 七、`uplift compare`

```bash
uplift compare <skillA> <skillB> --taskset web-guidance@1.0
```

输出并排卡 + 差异显著性检验（配对 bootstrap）。

---

## 八、`uplift doctor`

```bash
uplift doctor
```

检查：
```
✓ node 22.14.0
✓ git worktree 可用
✓ harness: claude-code 已安装 (v2.x)
✗ ANTHROPIC_API_KEY 未设置
✓ SQLite 可写
✓ 磁盘剩余 42GB
⚠ 未检测到 docker（Tier 1 需要固定环境的任务集会失败）
```

**这个命令很重要**：Tier 0 的失败大多是环境问题，`doctor` 能省掉大量 issue。

---

## 九、配置文件（可选）

`uplift.config.json`（项目根目录），所有字段可被 CLI flag 覆盖：

```json
{
  "harness": "claude-code",
  "model": "claude-opus-4-6-20260201",
  "repeats": 3,
  "temperature": 0,
  "seed": 42,
  "budget": { "tokens": 10000 },
  "run": { "maxCostUsd": 10, "jobs": 4, "timeoutSec": 600 },
  "probe": { "skip": [] }
}
```

---

## 十、输出样式（终端）

用 `chalk` 或原生 ANSI，**不要引入重型 TUI 库**。

```
$ uplift probe ./agent-skills --only static-cost

  UpliftBench · probe
  ────────────────────────────────────────────────
  skill    addyosmani/agent-skills  (25 skills)
  probe    static-cost

  静态开销      12,400 tok
    ├ SKILL.md                          3,200
    ├ references/checklist.md           6,100  ⚠️ >5000
    └ (22 more files)                   3,100
    重复内容      1,800 tok (14.5%)  ⚠️
    预算         10,000  →  超 2,400 (24%)  ⚠️

  ────────────────────────────────────────────────
  完成 · 2 个警告 · 0.8s
```

**进度条**（`uplift run`）：
```
  run  web-guidance@1.0 · 3 arms · 5 repeats · 30 tasks = 450 runs

  ████████████░░░░░░░░  248/450  [treatment]  wmg-013  ·  cost $1.84
```

---

## 十一、`uplift site`

```bash
uplift site [options]

选项：
  --dir <dir>            结果目录，默认 results
  --out <file>           输出 HTML，默认 site/index.html
```

读 `--dir` 下所有 `*.json` 的 SkillCard，按 **`任务集 · 评分器等级 · 激活条件`** 三段分组，
每组一张表。纯 HTML、零 JS、零后端，直接丢静态托管就能看。

分组键为什么要带激活条件（`auto` / `forced`）：同一道题、同一个模型，`--activation auto`
与 `forced` 会给出符号相反的 uplift（见 `docs/15 §五`）。把两种条件混进一张表排大小，
等于把两个实验的数字放在一起比名次。表格里也带 **激活率** 列——激活率决定了
`treatment` 臂里有多少 run 其实还是 `baseline`，不公开它，uplift 的分母就是黑的。

卡片不带 `tier1.activation` 时（早期数据），激活率显示 `—`，不显示 `0%`：不知道不等于零。

---

## 十二、错误信息规范
**所有错误必须包含：发生了什么、为什么、怎么修。**

```
✗ 技能包不合法：找不到 SKILL.md
  路径：./agent-skills
  原因：UpliftBench 要求技能包根目录（或其 skills/*/ 子目录）含 SKILL.md
  修复：用 --path 指定具体技能目录，或确认这是技能包仓库
```

禁止只输出 `Error: invalid skill`。
