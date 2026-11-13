---
name: demo-skill
description: 一个最小的示例技能包，用于 CI 与文档演示。不含任何领域知识。
---

# Demo Skill

这个技能只用来演示 UpliftBench 的 Tier 0 探针能读到什么，不解决任何真实问题。

## 约束

- Never use deprecated APIs in examples.
- Always keep this file under 5000 tokens.
- 必须保持 `SKILL.md` 与 `references/` 的目录结构不变。

## 用法

把技能目录传给 `uplift probe` 即可：

```bash
uplift probe ./examples/demo-skill --only static-cost
```
