# 19 · How to read these numbers

A SkillCard has one number people look at and six columns they skip. This page is about the six,
because that is where a skill's number usually goes wrong.

If you only read one thing: an uplift of +2pp with an activation rate of 23% means the skill was
loaded in about a quarter of runs. The other three quarters measured nothing. Compare that to a
skill at +2pp with 100% activation and you are looking at two different instruments.

## The metric, in one line

```
uplift = treatment − placebo
```

`treatment` is the run with the skill installed. `placebo` is the run with neutral text, matched to
the skill's token count within 2%. Subtract `baseline` instead and you are scoring "the context got
longer" as skill value. We publish that quantity too, under the name `raw_gain_pp`, and it never
enters the leaderboard.

Three numbers come out of the same three arms:

| name | formula | what it is worth |
|---|---|---|
| `uplift_pp` | treatment − placebo | the skill's contribution |
| `placebo_effect_pp` | placebo − baseline | what length alone buys you, published so you can subtract it yourself |
| `headroom_closed` | uplift / (1 − placebo) | share of the remaining room you filled |

## The four things that make a number meaningless

**Activation rate.** In auto mode the agent decides whether to load the skill. We measured 23% on a
skill whose own description says `MANDATORY: Execute FIRST`. When it is not loaded, treatment is
baseline with extra files in a directory. A card without an activation rate is a fraction with the
denominator cancelled out, which is why `tier1.activation` is a field rather than a footnote.

**The prompt naming the answer.** If the task text names the API you want, the model transcribes and
scores 100%. We built both variants of the same task. Prompt with the name: baseline 100%. Same
fixture, name removed: baseline 0%. One word, one hundred points.

**The grader's equivalence class.** A regex grader recognises one valid syntax. Declarative and
imperative `popover` are both correct; `position-anchor` and `position-area` are both correct; a
feature-detection fallback is correct engineering. We got this wrong five times in a day, and every
one of those errors made the skill look worse. Eight tasks now grade by running the candidate code.

**The ceiling.** If baseline already passes every time, no skill can improve it. 58% of our 64-task
set is in that state. Those tasks are not evidence of anything except that the task was too easy or
the model already knew the answer.

## Reading a card

```
Tier 1   uplift +5.6pp / headroom 15.4%   95%CI [-2.8, 13.2] · N=48 · placebo -7.6pp
激活      强制注入 100%（treatment 100% / placebo 100%）
标记      static_cost_over_budget  ci_crosses_zero  flaky_tasks
```

Read it in this order:

1. `N` and `ci95`. If the interval crosses zero, the sign is not established. We still print the
   number, because hiding it would be worse.
2. `placebo_effect_pp`. Large negative means the act of injecting anything costs points; the skill
   may be earning some of that back and still finishing below baseline.
3. activation rate. Low means most runs did not test the skill.
4. flags. `static_cost_over_budget` means the payload is bigger than the 10k injection budget.
   `retrieval_style_package` means the package is a knowledge base read on demand, so package size is
   a disk cost and the column to look at is the largest single skill.
5. `headroom_closed`. +36pp on a task set that starts at 34% is a different achievement from +36pp on
   one that starts at 90%.

## What a number here cannot tell you

One task set, one model, one harness. A card is a measurement of a three-way interaction, and it does
not transfer across those three. It is not a verdict on a skill's writing quality either; that is
[docs/17](17-横向评测.md), which measures structure and cost without any model at all.

It also cannot tell you whether the skill will help *your* agent. It can tell you what happened under
conditions we can reproduce, with the run database in the repository.

## Challenging a number

The most useful thing you can send us. Open
[an issue](https://github.com/25Cloud/UpliftBench/issues/new?template=challenge-a-number.md) with the
card, the reproduction command and the run database if you have it. We have already published five
corrections of our own graders; being wrong here is normal, staying wrong is not.

The Chinese write-up of the same material, with the run-level detail, is
[docs/16](16-消融实验.md).
