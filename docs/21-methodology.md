# 21 · Measuring what an Agent Skill actually adds

A methods paper for the three-arm design, with every number we have and every way we know it is wrong.

Version: protocol/1.0.0, software v0.2.7. Data: 2,945 runs, $599.93, one task set family, two models.
Everything below can be regenerated from the run databases in this repository.

---

## Abstract

A skill package is markdown injected into an agent's context. It has two effects: it makes the context
longer, and it adds information the model may not have. Benchmarks that compare "with skill" against
"without skill" measure the sum of the two, which is why published gains for these packages are not
reproducible by anyone else.

We add the missing arm: neutral text, matched to the skill's token count. Subtracting it isolates the
second effect. On GoogleChrome's `modern-web-guidance`, a 48-task intent-to-treat measurement gives
−2.50pp (95% CI [−7.92, +2.50]); forcing the skill into context gives +5.56pp; and on seven tasks built
so that the answer is in the skill and not in the model, the block effect is **+35.2pp (95% CI
[+15.7, +59.0])** over 630 runs. A second model family shows **+14.1pp (95% CI [0.0, +39.5])** on the
same seven tasks, with the effect concentrated in a different task.

We also publish five grader bugs of our own, two retracted claims, and one interval we withdrew.

## 1. The problem

Skills are cheap to write and impossible to evaluate from the outside. A package author runs their own
tasks, compares with and without, and reports a number. The number is usually larger than the effect,
for three reasons we can measure.

**Context length is not neutral.** Injecting 9.4k tokens of neutral text into the system prompt cost
7.6 percentage points on our 48-task set. If a benchmark compares with-skill to without-skill, the
skill is credited with climbing out of a hole it dug itself.

**The skill may never load.** In auto mode the agent decides whether to read the package. On a skill
whose own description says `MANDATORY: Execute FIRST for all HTML/CSS tasks`, the model loaded it in
**23%** of runs. In the other 77%, "with skill" meant the files sat in a directory. An uplift computed
over all runs then mixes 23% of a treatment with 77% of a baseline.

**The task may already be solved.** 40 of our 69 tasks pass at baseline 100% of the time. No skill can
improve them. A benchmark whose task set is mostly saturated reports approximately zero no matter how
good the skill is, and one built from tasks the author found hard reports something large.

The three-arm design does not fix the third problem; it makes the first two visible and removable.

## 2. Design

### 2.1 Arms

| arm | what the agent gets |
|---|---|
| `baseline` | nothing |
| `placebo` | neutral text, token-matched to the skill (±2%) |
| `treatment` | the skill |

```
uplift_pp       = treatment − placebo
placebo_effect  = placebo − baseline
headroom_closed = uplift / (1 − placebo)
```

`raw_gain_pp` (treatment − baseline) is computed and published, and never enters the leaderboard. It is
the number most benchmarks report; it is also the number that flatters a long skill.

### 2.2 Activation

`--activation auto` lets the agent decide, which is what users experience. `--activation forced` writes
the skill body into the system prompt and gives the placebo arm an equal-token substitute, which
measures what the content is worth when it is actually present.

These are two experiments, not two ways of measuring one thing. The same skill, same tasks, same model,
gives −2.50pp under auto and +5.56pp under forced. A leaderboard that mixes them ranks two different
questions against each other, so our card schema carries `tier1.activation` and the site groups by it.

### 2.3 Matching the placebo

The placebo corpus is neutral expository prose on software topics, sampled per run and cut to the
skill's injected token count within 2%. It is not lorem ipsum, because punctuation and word-length
distributions affect tokenisation, and it is not a second skill, because that would be a different
treatment.

Matching is per run, not per package: a skill that loads different reference files on different tasks
gets a placebo of the same size on each task.

### 2.4 Grading

Every task carries a grader with a declared tier.

| tier | what it is | used for |
|---|---|---|
| A | executable: run tests, or import the candidate code and exercise it | 69/69 tasks here |
| B | fixed-version LLM judge with a rubric | not used in the published numbers |
| C | human review | not used |

Tiers never share a table. A judge-based number and a test-based number are not on the same scale, and
averaging them produces a ranking with no meaning.

Behaviour-graded tasks ship a `behavior.mjs` that exports `run(ws)`; the grader imports the candidate
code into a fake DOM with real counters and asserts call order. Ten of our 69 tasks work this way. The
rest are regex rules with alternations that were widened by looking at what the model actually wrote.

## 3. Tasks

### 3.1 What a task is

A directory with a prompt, a fixture, and a verify script. The verify script receives the workspace and
returns `{pass, detail}`. Nothing about the task lives outside the directory, so a task set is portable
and a third party can re-run it against their own harness.

### 3.2 Selection

The tasks that carry information satisfy three conditions at once:

```
uplift is possible  ⟺  the task needs X  ∩  the skill documents X  ∩  the model does not know X
```

Missing the first makes the task trivial. Missing the second makes it unfair. Missing the third makes
it already solved. We built tasks in three batches, and each batch taught us which condition we had
violated.

**Batch 1 (48 tasks).** Written from the guide's headings. 28 of them named the API in the prompt, so
the model transcribed: baseline 100%. Removing the API name from an identical fixture dropped baseline
from 100% to 0%. One word, 100 points. Those 28 are still in the set and still counted in the
intent-to-treat number, because deleting inconvenient tasks is how benchmarks become marketing.

**Batch 2 (10 tasks).** Behaviour-graded, prompt states a symptom and withholds the name. This is where
the block came from.

**Batch 3 (11 tasks).** Same recipe, five of them written for this paper. Calibration then killed three:
`::details-content` with `transition-behavior: allow-discrete`, `closedby`, and `:user-invalid` all came
back at 100% baseline with no API name in the prompt. Two survived: `position-try-fallbacks` (0%) and
`view-transition-class` (0%). "This feature is recent, the model cannot know it" is not an assumption
you can build on; three baseline runs per task is the only way to find out.

### 3.3 Calibration

Every task is run three times at baseline before admission. The measured rate replaces the declared
difficulty, and a task above 80% baseline is either rewritten or kept as a documented ceiling case.
Current distribution over 69 tasks: 9 at 0%, 40 at 100%, 20 in between. The 40 saturated tasks are
published rather than hidden, because they explain why the 48-task intent-to-treat number is small.

## 4. Results

All numbers below use `glm-5.3-flash` unless stated. Costs are what the relay charged, recorded per run.

### 4.1 Intent to treat, agent decides

48 tasks, 5 repeats, 720 runs, $60.93.

| arm | pass rate |
|---|---|
| baseline | 73.75% |
| placebo | 73.75% |
| treatment | 71.25% |

uplift −2.50pp, 95% CI [−7.92, +2.50]. Activation rate 23%.

This is the honest headline for the package as shipped. It is not evidence the skill is bad; it is
evidence that a skill nobody loads cannot help.

### 4.2 Forced injection

Same 48 tasks, 4 repeats, 432 runs, $71.69.

| arm | pass rate |
|---|---|
| baseline | 71.53% |
| placebo | 63.89% |
| treatment | 69.44% |

uplift +5.56pp, 95% CI [−2.78, +13.19], placebo effect −7.64pp. The content earns back 5.6 points after
9.4k tokens of injected text cost 7.6.

### 4.3 The seven-task block

Seven tasks where the prompt withholds the API name and the skill documents the API. Four runs of the
same block, because we published the first one and then could not reproduce it.

| run | tasks | repeats/arm | baseline | placebo | treatment | uplift |
|---|---|---|---|---|---|---|
| first, 2026-11-12 | 5 | 10 | 34% | 32% | 68% | +36pp, CI [+24, +48] |
| re-run | 5 | 10 | 34% | 42% | 72% | +30pp |
| expanded | 7 | 10 | 36% | 40% | 67% | +27.1pp, CI [+1.4, +55.8] |
| expanded again | 7 | 20 | 47% | 37% | 76% | +39.3pp, CI [+19.3, +61.5] |
| **pooled** | **7** | **30** | **45%** | **40%** | **75%** | **+35.2pp, CI [+15.7, +59.0]** |

630 runs, $143. Per task, pooled over 30 repeats each:

| task | what it asks | baseline | placebo | treatment | uplift |
|---|---|---|---|---|---|
| `wmg-060` | customizable `<select>` content | 0% | 0% | 93% | +93pp |
| `wmg-058` | state-preserving DOM move | 13% | 0% | 60% | +60pp |
| `wmg-068` | view transitions with a class | 40% | 37% | 70% | +33pp |
| `wmg-065` | anchor fallback positioning | 30% | 17% | 47% | +30pp |
| `wmg-061` | scroll-state container query | 70% | 80% | 97% | +17pp |
| `wmg-064` | anchor positioning | 63% | 60% | 73% | +13pp |
| `wmg-044` | DOM move, API named in the prompt | 87% | 73% | 73% | 0pp |

The two extremes are instructive. `wmg-060` starts at zero, so all of it is knowledge transfer.
`wmg-044` names the API, so the skill has nothing to add beyond what the prompt already said, and the
effect is exactly zero. Both behaviours are what the design predicts, which is a weak but real form of
validation.

### 4.4 A second model

The same seven tasks on `deepseek-v4.1-flash`, forced activation, 10 repeats, 210 runs, $195.89.

| arm | pass rate |
|---|---|
| baseline | 12.9% |
| placebo | 7.2% |
| treatment | 21.4% |

uplift **+14.1pp, 95% CI [0.0, +39.5]**, placebo effect −5.6pp.

The block total is smaller, but the composition is the interesting part:

| task | glm uplift | deepseek uplift |
|---|---|---|
| `wmg-061` | +17pp | **+89pp** |
| `wmg-060` | +93pp | +10pp |
| `wmg-058` | +60pp | 0pp |
| `wmg-068` | +33pp | 0pp |
| `wmg-065` | +30pp | 0pp |
| `wmg-064` | +13pp | 0pp |
| `wmg-044` | 0pp | 0pp |

The skill helps where the model is ignorant and the skill is not. Which task that is depends on the
model: glm does not know `base-select` and gains 93 points on it; deepseek knows `base-select` well
enough that the skill adds 10, but cannot write a scroll-state container query and gains 89 there.

So a block effect is not a property of a skill. It is a property of a skill and a model and a task
distribution, and the composition changes when either does. Two of seven tasks carry the entire
deepseek effect, and a different two carry most of glm's.

### 4.5 A control from the wrong domain

`karpathy-guidelines`, 644 tokens of general coding advice, nothing about web APIs. All 27 tasks with
calibrated headroom, 3 repeats, 243 runs, $22.92.

| arm | pass rate |
|---|---|
| baseline | 48.1% |
| placebo | 42.0% |
| treatment | 46.9% |

uplift +4.9pp, 95% CI [−3.7, +14.8]. The skill loaded in all 81 treatment runs, because its description
says "use when writing or reviewing code" and every task is code. Whether a skill loads is decided by
how broad its description is, not by whether it is relevant.

### 4.6 Structure and cost, without a model

Seven Tier 0 probes describe a package without running it: static cost, shape, trigger precision,
constraint following, injection resistance, negative transfer, and uninstall cleanliness. Across 12
popular packages, the spread is larger than any effect we have measured. One package is 644 tokens end
to end. Another spends 2,375 tokens listing its 47 skills before anything activates. A third ships a
113k JSON file inside the skill directory. Written up in `docs/17`.

## 5. What moved our own numbers

Every item here was found by not believing a result.

**Five grader bugs.** Regex graders encode one valid syntax; correct answers have equivalence classes.
We required `showPopover()` and rejected the declarative `popovertarget`. We banned `insertBefore` and
rejected a feature-detection fallback the skill itself recommended. Every one of the five made the
treatment arm look worse, because the treatment arm was the only arm that read the guide and followed
it. Fixing them turned a −40pp into +20pp on one task.

**An explanation the data destroyed.** We said round one's −4.4pp placebo effect came from injecting
neutral text. Checking `by_arm` showed the placebo arm had never been activated in that round. It was
noise, and we published the correction.

**An interval we withdrew, then restored.** We published +36pp with ±12pp, re-ran, got +30pp, cut the
claim to +27pp with an interval touching zero, then pooled 30 repeats per task and landed at +35.2pp
[+15.7, +59.0]. The second "correction" was as single-run as the first. The lesson is not that any one
of those numbers was wrong; it is that a five-task block with ten repeats cannot support a ±12pp
interval, and we published one anyway.

## 6. Threats to validity

**One model per number.** The block is measured on two models and the composition differs between them.
The 48-task numbers exist only for glm. Treat every cross-model comparison as suggestive.

**Seven tasks is not a domain.** The block is a deliberately selected set, and its interval is computed
by resampling tasks. That interval says how much the answer depends on which tasks you picked. It does
not make seven tasks representative of web development.

**Between-run drift is real and unmodelled.** The same block gave 27 and 39 on consecutive days with
identical inputs. We report the pooled estimate and the observed range rather than pretending the point
estimate is stable.

**The placebo is a construction, not a null.** Neutral prose matched on token count is the best control
we can build, but it is not "no skill" and it is not "a random skill". Its measured effect (−5 to −10pp
under forced injection) is itself a result about long system prompts, not a constant to be subtracted
mechanically.

**Saturation dominates the intent-to-treat number.** 40 of 69 tasks pass at baseline every time. That
proportion is a property of our task set, and a task set built by someone else would move the headline.

**Costs are relay-reported.** For models missing from our price table, requests record whatever the
endpoint reports; one model in this paper reports zero usage and therefore zero cost. We do not
estimate prices.

## 7. Reproducing any of this

```bash
git clone https://github.com/25Cloud/UpliftBench && cd UpliftBench
pnpm install && pnpm build
node dist/cli.js demo                       # Tier 0, no key, 108ms
node dist/cli.js probe path/to/skill        # Tier 0 on anything with a SKILL.md

export UPLIFT_API_KEY=... UPLIFT_MODEL=<exact-model-id>
node dist/cli.js run --taskset tasksets/web-guidance \
  --tasks wmg-044,wmg-058,wmg-060,wmg-061,wmg-064,wmg-065,wmg-068 \
  --skill benchmarks/skills/modern-web-guidance-src/guides \
  --arms baseline,placebo,treatment --repeats 10 --activation forced

node dist/cli.js pool --db .uplift/a/runs.db,.uplift/b/runs.db   # merge repeats into a block estimate
```

Run databases are committed. Seeds, costs, transcripts and grader versions are recorded per run. The
task set locks its version and digests; changing a prompt changes the digest, which changes the version.

## 8. What we still do not know

Whether any of this transfers to non-code domains. Whether a task set written by someone else would
show the same block effect. Whether the block composition on a third model would look like either of
the two we have. Whether the −5 to −10pp cost of long system prompts holds at other context sizes.

The cheapest next experiment is another model on the same seven tasks: 210 runs, two hours. The most
valuable one is the same skill on a task set we did not write, which needs someone else to write one.

That is the point of the federated task-set format: we do not need to be the ones who answer it.
