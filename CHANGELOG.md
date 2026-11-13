# 变更记录

格式：`协议版本` / `软件版本` 分开记。破坏性变更必须标 **BREAKING**。

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
