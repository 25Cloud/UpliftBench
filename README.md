<div align="center">

![UpliftBench — same skill, same model, the only difference is whether it gets loaded](docs/assets/hero.svg)

# UpliftBench

**One skill, three arms, three different answers: −2.5pp, +5.6pp, +35pp.**

Same package (`GoogleChrome/modern-web-guidance-src`), same model, same harness. The number moved
because the arm and the task set moved — not because the skill did.

[![ci](https://github.com/25Cloud/UpliftBench/actions/workflows/ci.yml/badge.svg)](https://github.com/25Cloud/UpliftBench/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/upliftbench.svg)](https://www.npmjs.com/package/upliftbench)
[![pages](https://github.com/25Cloud/UpliftBench/actions/workflows/pages.yml/badge.svg)](https://25cloud.github.io/UpliftBench/)
[![protocol](https://img.shields.io/badge/protocol-1.0.0-blue)](docs/02-protocol.en.md)
[![license](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

**[Leaderboard](https://25cloud.github.io/UpliftBench/)** ([`index.json`](https://25cloud.github.io/UpliftBench/index.json)) · [60-second demo](#60-second-demo) · [Results](#what-we-measured) · [Protocol](docs/02-protocol.en.md) · [中文说明](README.zh-CN.md)

```bash
npx upliftbench demo     # Tier 0 card in ~2s. No key, no model calls, no money.
```

</div>

---

## Read this before you trust any uplift number

Twelve skill packages have cards. Four rows have three arms and a confidence interval. **None of those
four is distinguishable from a length-matched placebo:**

| package | uplift | 95% CI | N | what it means |
|---|---|---|---|---|
| `addyosmani/agent-skills` | +2.2pp | [−2.2, +6.7] | 30 | crosses zero |
| `multica-ai/andrej-karpathy-skills` | +4.9pp | [−3.7, +14.8] | 27 | crosses zero |
| `modern-web-guidance-src` (forced) | +5.6pp | [−2.8, +13.2] | 48 | crosses zero |
| `modern-web-guidance-src` (auto) | −2.5pp | [−7.9, +2.5] | 48 | crosses zero |

The only interval in this repository that clears zero is **+35pp [+16, +59]** on seven tasks — and we
wrote those seven ourselves, after the first 48 tasks produced the −2.5pp in the last row. Both facts
are the product. Publishing only the second one is how this ecosystem acquired its +27pp problem.

---

## Why this exists

A skill is markdown injected into an agent's context. That gives it two ways to change an answer. It
makes the context longer, and it adds facts the model may not have. Benchmarks that compare "with
skill" against "without skill" report the sum of both, which is why the ecosystem has plenty of
numbers like +27pp that nobody else can reproduce.

So we add the arm everyone skips: neutral text, matched to the skill's token count within 2%.

| Arm | What the agent gets |
|---|---|
| baseline | nothing |
| placebo | neutral text, same token count as the skill |
| treatment | the skill |

```
uplift_pp       = treatment − placebo     ← goes on the leaderboard
placebo_effect  = placebo − baseline      ← what length alone is worth
headroom_closed = uplift / (1 − placebo)  ← share of the remaining room you filled
```

A skill can look great against baseline and worthless against placebo. Finding out which one you have
is the whole job.

## 60-second demo

No key, no model calls, no money. It reads files.

```bash
npx upliftbench demo
```

```
SkillCard  upliftbench/demo-skill   [Tier 0]
──────────────────────────────────────────────────────
  static cost  228 tok package total   within budget
               └ context injection 228 tok, budget 10,000
               └ duplicated content 53 tok (23.2%)
               ├ SKILL.md                               122
               ├ references/checklist.md                 53
               ├ references/dup.md                       53
               tokenizer approx:weighted (approximation, not an exact tokenizer)
  uninstall    clean
──────────────────────────────────────────────────────
  Tier 1       not measured (needs a task set)
  flags        duplicate_content
```

Point it at anything with a `SKILL.md`:

```bash
npx upliftbench probe path/to/your-skill --only static-cost,uninstall-clean --format markdown
```

Add `--lang en` or `export UPLIFT_LANG=en` for English labels. Tier 1 needs a model and money:

```bash
export UPLIFT_API_KEY=... UPLIFT_MODEL=<exact-model-id>
npx upliftbench run \
  --taskset tasksets/web-guidance \
  --skill benchmarks/skills/modern-web-guidance-src/guides \
  --arms baseline,placebo,treatment --repeats 5 \
  --activation forced --max-cost 60
```

`--activation auto` lets the agent decide when to load the skill. `forced` puts the body straight into
the system prompt, with the placebo arm getting an equal-token substitute. Those are two different
experiments and the tool keeps them apart.

## What we measured

2,945 runs, 69 tasks, 12 skill packages, two models, about $600.

`GoogleChrome/modern-web-guidance-src` against 48 tasks, agent decides whether to load it (720 runs,
$60.93):

| Arm | pass rate |
|---|---|
| baseline | 73.75% |
| placebo | 73.75% |
| treatment | 71.25% |

```
uplift −2.50pp   95%CI [−7.92, +2.50]   N=48   A-grade   → not significant
placebo_effect 0.00pp   activation rate 23%
```

The skill's own description says `MANDATORY: Execute FIRST for all HTML/CSS tasks`. The model loaded
it in 23% of runs. For the other 77%, "treatment" was "baseline" with extra markdown sitting in the
directory. Some of that −2.5pp is the skill, some is the model's willingness to call a tool.

Force the body into context and the same skill flips (432 runs, $71.69):

| Arm | pass rate |
|---|---|
| baseline | 71.53% |
| placebo | 63.89% |
| treatment | 69.44% |

```
uplift +5.56pp   95%CI [−2.78, +13.19]   N=48
placebo_effect −7.64pp
```

9.4k tokens of neutral text costs 7.6 points. The skill's content earns back 5.6. Neither number is
"the" number; they answer different questions.

### Where the skill actually earns its keep

Half of that task set was saturated, and a good chunk of it graded transcription because the prompt
named the API. So we rebuilt tasks where the prompt states the symptom and withholds the API name, on
APIs the skill really documents. Five tasks, three arms, ten repeats (150 runs, $29.79):

| task | what it asks | baseline | placebo | treatment | uplift |
|---|---|---|---|---|---|
| `wmg-060` | customizable `<select>` content | 0/10 | 0/10 | 6/10 | +60pp |
| `wmg-058` | state-preserving DOM move | 1/10 | 0/10 | 4/10 | +40pp |
| `wmg-064` | anchor positioning | 4/10 | 3/10 | 7/10 | +40pp |
| `wmg-061` | scroll-state container query | 6/10 | 7/10 | 9/10 | +20pp |
| `wmg-044` | state-preserving DOM move (API named) | 6/10 | 6/10 | 8/10 | +20pp |
| block | | 34% | 32% | 68% | +36pp, CI [+24, +48] |

That run was published, then re-run twice, because a CI that tight after so much trouble looked
suspicious. Same tasks, same model, same harness:

| run | tasks | repeats | baseline | placebo | treatment | uplift | 95% CI |
|---|---|---|---|---|---|---|---|
| first, 2026-11-12 | 5 | ×10 | 34% | 32% | 68% | +36pp | [+24, +48] |
| re-run, same 5 tasks | 5 | ×10 | 34% | 42% | 72% | +30pp | — |
| expanded block | 7 | ×10 | 36% | 40% | 67% | +27pp | [+1, +56] |
| expanded block again | 7 | ×20 | 47% | 37% | 76% | +39pp | [+19, +62] |
| **pooled** | **7** | **×30** | **45%** | **40%** | **75%** | **+35pp** | **[+16, +59]** |

The pooled row is what we now claim: seven tasks, 30 repeats each, 630 runs, **+35pp with an interval
that clears zero (−5pp from the placebo arm included)**. Every single run of the same block landed
between +27 and +39, and the placebo arm ranged from −10 to +8. The point estimate is stable to about
±6pp; a single run's interval is not.

The seven are the five above plus `wmg-065` (anchor fallback) and `wmg-068` (view transitions), both
added because their calibrated baseline was 0%. All seven are positive when pooled. We also wrote five
other tasks on other modern CSS features; three of them the model already solves 100% of the time, so
they carry no information and stay out of the block. That is in [docs/16](docs/16-消融实验.md) §九.

### The same seven tasks on a second model

`deepseek-v4.1-flash`, forced activation, 10 repeats, 210 runs, $195.89:

| arm | pass rate |
|---|---|
| baseline | 12.9% |
| placebo | 7.2% |
| treatment | 21.4% |

uplift **+14.1pp, 95% CI [0.0, +39.5]**, placebo effect −5.6pp. Smaller, and concentrated differently:

| task | glm | deepseek |
|---|---|---|
| `wmg-061` scroll-state query | +17pp | **+89pp** |
| `wmg-060` customizable select | +93pp | +10pp |
| `wmg-058` DOM move | +60pp | 0pp |
| the other four | +0 to +33pp | 0pp |

glm cannot write `base-select` and gains 93 points there; deepseek half-knows it and gains 10, but
cannot write a scroll-state container query and gains 89 there. A block effect belongs to a skill *and*
a model *and* a task distribution. Methods, threats and the full sequence:
[docs/21-methodology.md](docs/21-methodology.md).

### Field notes: 12 packages, measured with no model

A seventh Tier 0 probe answers the question that comes before "is it useful", which is whether the
thing can be loaded at all. All twelve are on the leaderboard as facts. Snapshot 2026-11-13.

| package | stars | skills | pkg tokens | largest skill | catalog | over budget |
|---|---|---|---|---|---|---|
| `anthropics/skills` | 193.9k | 19 | 849,607 | 526,405 | 1,595 | 5164% |
| `Nutlope/hallmark` | — | 1 | 409,006 | 409,006 | 63 | 2823% |
| `cloudflare/security-audit-skill` | — | 1 | 79,967 | 79,967 | 90 | 399% |
| `obra/superpowers` | 317.0k | 15 | 100,774 | 25,738 | 586 | 157% |
| `KKKKhazix/khazix-skills` | 22.2k | 6 | 75,483 | 17,578 | 200 | 76% |
| `affaan-m/ECC` | 302.2k | 47 | 109,921 | 12,192 | 2,375 | 22% |
| `mattpocock/skills` | 323.4k | 39 | 80,583 | 10,808 | 1,390 | 8% |
| `obsidianmd/obsidian-skills` | 52.2k | 7 | 16,902 | 6,350 | 446 | 0% |
| `op7418/Humanizer-zh` | 22.7k | 1 | 8,042 | 4,204 | 47 | 0% |
| `multica-ai/andrej-karpathy-skills` | 232.7k | 1 | 644 | 644 | 55 | 0% |

Catalog is the sum of every description, which you pay before anything activates. A 302k-star package
spends 2,375 tokens listing 47 skills; a 233k-star package spends 55. Package size is the wrong column
to look at anyway, because a 1.27M-token retrieval corpus can cost 2,444 tokens at activation while a
400k-token single skill costs all 400k. Write-up with the patterns behind those numbers:
[docs/17-横向评测.md](docs/17-横向评测.md).

### A control from the wrong domain

The first question a reviewer asks is whether any skill would show a gain. We took the tiny
`karpathy-guidelines` package, 644 tokens of generic coding advice and nothing about web APIs, and ran
it against the 27 tasks that still had headroom. 243 runs, $22.92.

| arm | pass rate |
|---|---|
| baseline | 48.1% |
| placebo | 42.0% |
| treatment | 46.9% |

uplift +4.9pp, 95% CI [−3.7, +14.8], placebo effect −6.2pp. It loaded in all 81 treatment runs,
because its description says "Use when writing, reviewing, or refactoring code" and every task is
code. Generic advice is not worthless on coding tasks, but 27 tasks cannot tell +4.9pp from noise, and
it never came close to the +35pp block. Whatever the instrument is measuring, it is not manufacturing
gains.

### About that +27-36pp number

`GoogleChrome/modern-web-guidance` is the only package in this ecosystem that published a number about
itself: +27 to +36 percentage points. We measured the same skill and got −2.50pp, then +5.56pp when the
body was forced into context, then +35pp on the seven tasks built to depend on its content. Nobody has
to be lying for those to coexist; they differ in which arm is subtracted, whether the skill was loaded,
and which tasks were used. [docs/20-the-27pp-claim.md](docs/20-the-27pp-claim.md) lays the four
differences side by side and says what would settle it.

## Things we got wrong

Regex graders encode one valid syntax. Correct answers have equivalence classes. We required
`showPopover()` and rejected the declarative `popovertarget`. We banned `insertBefore` and rejected a
feature-detection fallback that the skill itself recommended. Five of these in one day, and every one
made the skill look worse.

Then we published an explanation the data destroyed: we said round 1's −4.4pp placebo effect came from
injecting neutral text, checked `by_arm`, and found the placebo arm had never been activated in round 1.
It was noise.

And 28 of the original 48 tasks graded transcription, because the prompt named the API. Same fixture
with the name removed: baseline dropped from 100% to 0%. One word, 100 points.

The fourth one is newer. We published a block result at +36pp with a ±12pp interval, then re-ran the
identical thing and got +30pp with the placebo arm moving from −2pp to +8pp. Correcting down to +27pp
on the next run was also a single draw: twenty repeats of the same block gave +39pp. Pooling 30 repeats
per task lands at +35pp, CI [+16, +59], which is where it should have started. The lesson is not that
+36 was wrong; it is that a five-task block with ten repeats cannot support a ±12pp interval, and we
published one anyway. Details in [docs/16](docs/16-消融实验.md) §九.

All three are in the changelog and in [docs/16](docs/16-消融实验.md), with the numbers that overturned
the earlier claims.

## What this does not claim

Not that any particular skill is useless. One task set, one model, one harness per number.

Not a cross-package ranking. Twelve packages have cards; four rows carry three-arm numbers.

Not stable at small n. `wmg-064`'s baseline came out 0/3 in one batch and 2/3 in the next, same task,
same model, same prompt. Single-task numbers stay in the lab.

Not a replacement for your own evals. This is a protocol and a ruler, and changing the metric
definition is a major version bump rather than a code change.

## The seven Tier 0 probes

No task set, no model, seconds. They produce facts, not scores, which is why they need no placebo.

| # | Probe | Question it answers |
|---|---|---|
| 1 | `static-cost` | how many tokens, how much duplicated, over budget? |
| 2 | `skill-shape` | frontmatter present, description usable, defer-loaded or monolithic? |
| 3 | `trigger-precision` | does it fire when it should, and stay quiet when it shouldn't? |
| 4 | `constraint-following` | do its never/must rules survive contact with the agent? |
| 5 | `injection-resistance` | does installing it make tool-output injection easier? |
| 6 | `negative-transfer` | does it make unrelated tasks worse? |
| 7 | `uninstall-clean` | after removal, is the environment really clean? |

The last four are the dimensions nobody else measures. A skill that is +20pp inside its domain and
−10pp outside it is net negative, and one that writes to `~/.claude` on install is a liability.

Read the numbers as facts, not verdicts. A large reference corpus can be a defensible design. What the
probes give you is the price tag.

## Putting a number on your own skill

```bash
npx upliftbench probe path/to/skill --format markdown   # Tier 0, seconds, free
npx upliftbench run --taskset tasksets/web-guidance --skill path/to/skill \
  --arms baseline,placebo,treatment --repeats 5          # Tier 1, needs a model
npx upliftbench pool --db .uplift/a/runs.db,.uplift/b/runs.db   # merge repeats of one block
npx upliftbench site                                     # static leaderboard, en + zh-CN
```

Tier 0 runs on Node 22 alone. Tier 1 writes to SQLite and therefore wants `better-sqlite3`, which is
shipped as an optional dependency: if the native build fails on your machine, `demo` and `probe` still
work and `run` tells you what to install.

Two ways to carry the result around. A self-contained badge:

```markdown
![uplift](results/modern-web-guidance-src.badge.svg)
```

Or a CI step that posts a Tier 0 card on every PR ([`action.yml`](action.yml)):

```yaml
- uses: 25Cloud/UpliftBench@main
  with:
    path: path/to/skill
```

## Repository layout

```
src/
├─ cli.ts          probe | run | card | badge | taskset | compare | site | demo | doctor
├─ probes/         the seven Tier 0 probes
├─ runner/         three-arm scheduler, git-worktree isolation, SQLite store
├─ harness/        openai-compat (own agent loop) | claude-code (hooks) | mock
├─ graders/        tests (A) | exact (A) | rubric (B) | visual-diff (B)
├─ metrics/        uplift / headroom / paired bootstrap CI / flaky detection
├─ placebo/        neutral corpus and equal-token construction
└─ render/         SkillCard, badge, static leaderboard
tasksets/          69-task web-guidance@1.5.0 (10 behaviour-graded) + general-20@1.0
results/           13 SkillCards across 12 packages
docs/              01 competition · 02 protocol · 03 probes · 05 schema · 07 roadmap
                   12 implementation notes · 13 calibration · 14 15 measured rounds
                   16 ablation · 17 field notes · 18 launch notes (zh) · 22 launch pack (en)
tests/             126 tests, 21 of them grader self-checks
```

Design constraints we don't bend: the protocol outranks the implementation, the placebo arm is
mandatory, A/B/C tiers never share a table, a task set is locked to its commit and grader version, and
we measure skills rather than ship them.

## Where to read next

| | |
|---|---|
| [`docs/21-methodology.md`](docs/21-methodology.md) | the methods paper: design, tasks, all four block runs, cross-model, threats to validity |
| [`docs/19-how-to-read.md`](docs/19-how-to-read.md) | what the columns mean and the four ways a skill's number goes wrong |
| [`docs/02-protocol.en.md`](docs/02-protocol.en.md) | the protocol: three arms, metrics, grader tiers, versioning |
| [docs/16](docs/16-消融实验.md) | what actually moves a skill's number, five grader bugs, the +36pp block |
| [docs/15](docs/15-第二轮实测.md) | 1,152 runs of the same skill under auto and forced |
| [docs/13](docs/13-任务集标定.md) | why task difficulty is bimodal and 58% of tasks are saturated |
| [docs/12](docs/12-实现说明.md) | every default we chose where the spec was silent |

The protocol and the how-to-read page are in English. The analysis docs are Chinese, written for
whoever runs the next round; [docs/README.md](docs/README.md) is the index. Ask for a section and it
gets translated.

## Status

`protocol/1.0.0`, software `v0.2.8`, Node ≥ 22, Apache-2.0. Published on npm as [`upliftbench`](https://www.npmjs.com/package/upliftbench). No services, no accounts, no telemetry.

CI runs build, tests, task-set validation, a card schema check, a markdown link check, and the demo.
Everything in `results/` and `site/` is generated from committed run databases, and every run's cost is
recorded.

The most useful thing you can send us is a number you think is wrong.
[There is a template for it](.github/ISSUE_TEMPLATE/challenge-a-number.md). Task sets are federated;
[`CONTRIBUTING.md`](CONTRIBUTING.md) has the admission rules and the two that matter most (graders must
accept equivalent answers, prompts must not name the solution). Cite it with
[`CITATION.cff`](CITATION.cff).

Name collision note: this has nothing to do with Criteo's uplift modeling in marketing. Same word,
different target.
