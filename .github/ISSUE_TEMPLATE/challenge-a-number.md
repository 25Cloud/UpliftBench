---
name: Challenge a published number
about: A card, badge or table in this repo looks wrong to you
title: 'number: '
labels: ['number-challenge']
---

<!-- This is the most useful issue you can open. We have published five corrections of our own
     graders; being wrong is normal here, staying wrong is not. -->

**Which number**
<!-- Repo + card file, or the README table, or a docs/14|15|16 section. -->

**What you expected to see, and why**
<!-- Point at the protocol clause (docs/02-protocol.en.md) or at the task's prompt / rules. -->

**How to reproduce**

```
# the exact command(s) you ran, including the exact model id
```

**Do you have a run database?**
<!-- .uplift/*/runs.db or a link. Without it we can only re-derive the number from scratch. -->

**Which part looks wrong (best guess)**
- [ ] the task (prompt unclear / fixture broken / unsatisfiable)
- [ ] the grader (rejects a correct answer, or accepts a wrong one)
- [ ] the metric (definition or aggregation)
- [ ] the reporting (missing N / CI / placebo_effect)
- [ ] the skill package itself (upstream problem, not ours)
