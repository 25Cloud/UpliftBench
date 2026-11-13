# 02 · Protocol Spec

> **This document is the project's constitution. Code obeys it, never the other way around.**
> Version: `protocol/1.0.0` — any breaking change bumps the major and is recorded in `CHANGELOG.md`.
>
> *English translation of [`02-协议规范.md`](02-协议规范.md). The Chinese text is normative;
> if the two disagree, the Chinese wins. Synced at `protocol/1.0.0`.*

---

## 1. Three-Arm Design

Every `uplift` number must come from three arms. None is optional.

| Arm | Name | Condition | Purpose |
|---|---|---|---|
| control | `baseline` | no skill installed | what the model already does |
| placebo | `placebo` | **token-matched** neutral text installed | removes the confound "more tokens helps by itself" |
| treatment | `treatment` | the real skill package installed | the observed level |

### 1.1 Definition of net effect

```
uplift_pp       = pass_rate(treatment) − pass_rate(placebo)
headroom_closed = (pass_rate(treatment) − pass_rate(placebo)) / (1 − pass_rate(placebo))
```

**Subtract `placebo`, not `baseline`.**

Quantities measured against `baseline` must be reported separately and marked as uncorrected:

```
raw_gain_pp      = pass_rate(treatment) − pass_rate(baseline)  # uncorrected, may not enter a leaderboard alone
placebo_effect_pp = pass_rate(placebo) − pass_rate(baseline)   # the placebo effect itself, informative on its own
```

`placebo_effect_pp` is not noise — **it is a metric in its own right**: it measures what the skill's
*length* is worth. A package with a large `placebo_effect_pp` is telling you that its score may mostly
come from "the context got longer".

### 1.2 Construction rules for the placebo (hard constraints)

The placebo text must satisfy:

1. **Equal token count**: `|tokens(placebo) − tokens(treatment)| / tokens(treatment) ≤ 2%`
2. **Semantically neutral**: no instruction, terminology, or formatting requirement related to the task domain
3. **Structurally similar**: same heading levels, same presence of lists (avoid "structured vs unstructured")
4. **Deterministic**: the same skill package always yields the same placebo (seed from a content hash)

**Recommended**: take the package's token count N, slice a fixed neutral corpus (e.g. flat prose about
general software-engineering practice) to N tokens, then re-lay it out following the package's heading structure.

**Forbidden**:
- Short filler like "you are a helpful assistant" (length mismatch is enormous)
- Skill packs from another domain (imports a domain confound)
- Random words (destroys naturalness; model behaviour becomes anomalous)

---

## 2. Execution Constraints (non-negotiable)

| Constraint | Requirement | Why |
|---|---|---|
| Model version | all three arms on the **same exact version** (never `latest`) | cross-version numbers are not comparable |
| Temperature | fixed and recorded | affects variance |
| Seed | fixed and recorded; harnesses without seed support must say so | reproducibility |
| Repeats | `N ≥ 3`, 5 recommended | variance reporting needs it |
| Environment | same docker image digest / same commit | rules out environment drift |
| Order | arms run **interleaved** (b,a,c,a,b,c…), not arm-by-arm | rules out time drift (rate limits, degraded service) |
| Task order | randomized **within each arm**, fixed seed | rules out order effects |

**The interleaving rule is the one people skip, and it is the cheapest variance control available.**

---

## 3. Metric Definitions (complete list)

### 3.1 Effect metrics

| Field | Definition | Unit |
|---|---|---|
| `pass_rate` | tasks passed / total tasks | 0–1 |
| `uplift_pp` | `pass_rate(treatment) − pass_rate(placebo)` | percentage points |
| `headroom_closed` | `uplift_pp / (1 − pass_rate(placebo))` | 0–1 |
| `raw_gain_pp` | `pass_rate(treatment) − pass_rate(baseline)` | percentage points (uncorrected) |
| `placebo_effect_pp` | `pass_rate(placebo) − pass_rate(baseline)` | percentage points |
| `ci95` | 95% confidence interval of the three-arm difference | percentage points |

### 3.2 Cost metrics

| Field | Definition |
|---|---|
| `tokens_in_total` / `tokens_out_total` | input/output tokens summed over all tasks |
| `token_overhead_pct` | `(tokens_in(treatment) − tokens_in(baseline)) / tokens_in(baseline)` |
| `wall_time_p50` / `wall_time_p95` | per-task wall time, median / 95th percentile |
| `tool_calls_mean` | mean tool calls per task |
| `cost_usd_total` | total cost, converted using published prices |

### 3.3 Stability metrics

| Field | Definition |
|---|---|
| `pass_rate_std` | standard deviation across repeats |
| `flaky_tasks` | tasks whose result differs across repeats within one arm |
| `determinism_gain` | `std(baseline) − std(treatment)` — does the skill make behaviour more stable (positive = more stable) |

### 3.4 Failure taxonomy

Every failed task falls into exactly one class:

| Code | Meaning |
|---|---|
| `wrong_answer` | produced an answer, and it is wrong |
| `gave_up` | explicitly gave up / claimed the task is impossible |
| `hallucinated` | invented a fact, API, or file that does not exist |
| `constraint_violated` | violated a hard constraint from the task or the skill |
| `broke_something` | damaged the environment (broke files, deleted data, infinite loop) |
| `timeout` | exceeded the time limit |
| `tool_error` | a tool call failed and was not recovered |
| `grader_error` | the grader itself failed (excluded from `pass_rate`, reported separately) |

**`grader_error` must be reported separately. Counting it as a failure is the most common way to cheat a benchmark.**

---

## 4. Grader Tiers (the only source of credibility)

| Tier | Definition | Strength | May enter a leaderboard |
|---|---|---|---|
| **A** | executable verification: tests pass, exact match, exploit confirmed, build succeeds | hard | ✅ main table |
| **B** | rubric + **pinned-version** LLM judge (judge model and prompt published) | medium | ✅ secondary table, grouped separately from A |
| **C** | human spot-check / crowdsourced | soft | ❌ appendix only |

**Iron rule: A and B numbers are never ranked side by side, only displayed in groups. C never enters a leaderboard.**

Reason: mixing A ("the tests pass") with B ("an LLM liked it") is ranking heights measured with two different rulers.

### 4.1 Extra requirements for a B grader

- exact judge model version recorded in `taskset.json`
- full judge prompt published
- agreement with humans reported (≥ 30 samples, Cohen's κ)
- a B grader with κ < 0.6 **is demoted to C**

---

## 5. Normalization and Comparability

### 5.1 Why normalize

| Domain | baseline | guided | uplift_pp | headroom_closed |
|---|---|---|---|---|
| security audit | 20% | 60% | +40 | **50%** |
| design skill | 40 | 70 | +30 | **50%** |

The same 50% is comparable across domains.

### 5.2 Where normalization distorts (must be flagged)

| Condition | Problem | Handling |
|---|---|---|
| `baseline > 0.95` | headroom ≤ 5%, tiny absolute changes get amplified | report `uplift_pp` alongside, add a `low headroom` flag |
| `baseline < 0.05` | denominator near 1, normalization ≈ absolute value | fine, but label "near-full headroom" |
| `N < 30` tasks | confidence interval too wide | label `n<30`, keep out of the main table |

---

## 6. Report Format (mandatory fields)

Any uplift number published externally must ship with all of:

```
uplift +18pp  |  headroom 41%  |  N=30  |  95%CI [9, 27]  |  A-grade  |  placebo_effect +6pp
```

Miss any one of them and the number does not qualify.

**`placebo_effect` must be public** — it is what distinguishes this project from every other benchmark. Do not hide it.

---

## 7. Protocol Versioning and Compatibility

- The protocol version is independent of the software version; format `protocol/MAJOR.MINOR.PATCH`
- New optional fields → MINOR
- Changing a metric definition or the three-arm semantics → **MAJOR** (historical data is marked incomparable)
- Every SkillCard records the protocol version it was generated under

---

## 8. Anticipated Objections

| Objection | Response |
|---|---|
| "The placebo arm costs 1.5×" | You are paying for credibility. Tier 0 needs no placebo arm anyway (it produces static + behavioural facts, not a score) |
| "Task sets are expensive" | The default is a 30-task set; the full set is a paid/self-hosted option |
| "Different domains cannot be compared" | We do not compare absolute scores, we compare `headroom_closed`, and we force the absolute numbers to be reported too |
| "Skill quality is subjective" | That is exactly why A/B/C tiers exist. We do not pretend A can measure aesthetics; we only measure what can be measured |

---

## 9. Proposed Amendments (draft, not in effect)

> Nothing in this section is part of `protocol/1.0.0`. It exists so the next maintainer knows why the
> measured data does not line up with the current spec. Approval path is §7: optional field = MINOR,
> semantic change = MAJOR. All evidence comes from [`15-第二轮实测.md`](15-第二轮实测.md)
> and [`16-消融实验.md`](16-消融实验.md).

### P1 (proposes MAJOR) · Activation mode must be a declared measurement condition

Measured: same package, same task set, same model — `--activation auto` gives **−2.5pp**, `forced` gives **+5.6pp**.
Both are true, because they answer two different questions. The current protocol has **no slot to declare
which one was measured**, so two cards' `uplift` values can be put side by side — which is wrong.

Proposal: add a conditional field `activation.mode` to `tier1`; `auto` and `forced` results for the same
skill **may not appear in the same leaderboard table** (the implementation already does this; the spec does not say it).

### P2 (proposes MINOR) · Match the placebo on *per-run injected tokens*

§2 currently says the placebo is "token-matched" to the skill, judged on whole-package totals. The data
shows that what drives `placebo_effect` is **how much actually gets injected per run**: in auto mode both
arms often inject nothing → 0.0pp; in forced mode every run injects 9.8k → −7.6pp. In the same dataset,
round 1's placebo arm injected nothing and `placebo_effect` was still −4.4pp (noise).

Proposal: match on per-run injected tokens; and give the placebo descriptions the **same length and the
same imperative tone** as the real skill (this round measured activation 29.2% vs 17.5% — the asymmetry
comes from how attractive the description looks).

### P3 (proposes MINOR) · Add a sixth mandatory report field

§6 currently mandates five fields plus `placebo_effect`. Proposal: add **activation rate** — it is the
denominator of `uplift`, and omitting it is reporting a fraction with the denominator cancelled out.

```
uplift +18pp  |  headroom 41%  |  N=30  |  95%CI [9, 27]  |  A-grade  |  placebo_effect +6pp  |  activation 23% (auto)
```
