# Contributing

Thanks for looking. This project has one unusual rule: **the protocol outranks the code.**
If a change makes the implementation simpler but bends a metric definition, it will be rejected.

Everything below assumes you have run the 60-second demo and `pnpm test` at least once.

---

## The six things we do not bend

1. `uplift = treatment − placebo`. Never `treatment − baseline`.
2. The placebo arm is not optional. A two-arm number must be labelled `uncorrected` and cannot enter a leaderboard.
3. Grader tiers A / B / C never share a table.
4. A task set is locked to a commit + grader version. Ship the lock with the tasks.
5. We measure skills; we do not ship them. A PR that adds a skill package to `benchmarks/` as anything other than a measurement target will be declined.
6. Every published number carries `N` and a 95% CI. No exceptions, including in README badges.

---

## Reporting a wrong number

This is the most valuable contribution there is, and it has its own issue template.

Bring: the card or badge you are disputing, the run database (or the exact command to reproduce),
and what you think is wrong. "The grader accepted an answer my reading of the spec rejects" is a
complete report. So is "this task's baseline was 100% for me and 0% for you".

We have already published five corrections of our own graders. Being wrong here is normal; staying wrong is not.

---

## Submitting a task set (Tier 1)

Task sets are federated: anyone can ship one, we only publish what passes admission.

```bash
# 1. scaffold
mkdir -p tasksets/<domain>/tasks/<task-id>/{fixture}
#    taskset.json + per-task {prompt.md, fixture/, verify.mjs}

# 2. structural + schema checks (exit 3 means "needs a real model run", not a failure)
node dist/cli.js taskset validate tasksets/<domain>

# 3. calibrate: what does the model do with no skill at all?
export UPLIFT_API_KEY=... UPLIFT_MODEL=<exact-model-id>
node dist/cli.js run --taskset tasksets/<domain> --skill examples/demo-skill \
  --arms baseline --repeats 3 --out .uplift/calib-<domain>
node tools/calibrate-web-guidance.mjs --db=.uplift/calib-<domain>/runs.db --domain=<domain>
node tools/calibration-report.mjs tasksets/<domain>

# 4. ship the calibration file with the tasks
```

Admission criteria (checked by `taskset validate` and by a human):

| Requirement | Why |
|---|---|
| `schema_version` + `domain@version` + `grader.version` | comparability across revisions |
| A-tier grader (executable) if you want the main table | see `docs/02-protocol.en.md` §4 |
| `expected_baseline` measured, not guessed | a declared difficulty that measurement can overturn |
| Fixtures committed, no network, no wall-clock dependence | reproducibility |
| **Grader must accept equivalent correct answers** | see the five false negatives in `docs/16` |

**Read this before writing a regex grader**: a grader that encodes one valid syntax silently
penalises the skill arm, and it will not look like a bug — it will look like the skill made things worse.
Prefer behaviour tests (`tasks/<id>/behavior.mjs`, see `wmg-049`) and use regex only for `forbid` guards.

**Read this before writing a prompt**: if the prompt names the API you want, you have written a
transcription task. Baseline will be 100% and the task cannot measure anything. State the symptom,
withhold the solution.

---

## Adding a harness adapter

`src/harness/` has `openai-compat` (owns the agent loop, activation is an explicit `activate_skill` tool),
`claude-code` (reads hook logs) and `mock` (synthetic, for pipeline tests only).

A new adapter implements the `Harness` interface in `src/harness/types.ts`. Two rules:

- if the harness cannot report which skill was activated, return `supported: false` — **do not guess**
- usage must be reported from what the API actually returns; never estimate cost

---

## Code conventions

- TypeScript, Node ≥ 22, ESM, pnpm. `pnpm build && pnpm test && pnpm check:links` must pass.
- Comments and commit messages: Chinese. Code, identifiers, file names: English.
- Anything that produces a datapoint needs a unit test. Anything that renders a number needs a
  test that pins the formatting (we once shipped `−2.50pp` rendered as `−3pp`; that is a wrong number, not a rounding detail).
- Never weaken a test to make a run pass. If a measurement contradicts a test, the test might be the thing that is wrong — but say so explicitly in the PR.

---

## What review looks like

Expect to be asked: *what would this change make a benchmark look like if it were wrong?*
For scoring, grading and task-set changes, that question has to have a concrete answer before merge.
