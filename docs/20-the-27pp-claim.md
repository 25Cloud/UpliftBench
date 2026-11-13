# 20 · The +27pp claim

`GoogleChrome/modern-web-guidance` is the one skill package in this ecosystem that published a number
about itself. Its README shows gains in the +27 to +36 percentage point range on its own task set.
We measured the same skill against our own task set and got −2.50pp, then +5.56pp when the skill body
was forced into context. On five tasks built to depend on its content we got +36pp.

Three numbers, one skill. This page is about why that is not a contradiction, and what would settle it.

## What each side measured

| | their number | ours (auto) | ours (forced) |
|---|---|---|---|
| skill artifact | their repo | `guides/` from the same repo | same |
| task set | their own eval targets | 64 tasks, `web-guidance@1.4.0` | same |
| harness | their harness | our openai-compat agent loop | same |
| arm comparison | with skill vs without | treatment vs **token-matched placebo** | same |
| sample | not published per task | 720 runs, 48 tasks, 5 repeats | 432 runs |
| result | +27~36pp | **−2.50pp**, CI [−7.92, +2.50] | **+5.56pp**, CI [−2.78, +13.19] |

Three differences matter, in this order.

**Which arm you subtract.** With-skill versus without-skill includes the effect of adding tokens to the
context. In our forced run that effect alone was worth −7.64pp: 9.4k tokens of neutral text costs 7.6
points. If a benchmark reports with-versus-without, the skill gets credit for overcoming that cost,
and the resulting number is not the skill's contribution.

**Whether the skill was actually loaded.** In auto mode the model loaded it in 23% of our runs. For
the other 77%, "with skill" meant the files sat in a directory. We don't know the activation rate in
their setup; their harness may install the skill differently, or their tasks may prime it harder.

**Which tasks.** Their eval targets were written by the people who wrote the guidance, which is a
reasonable way to demonstrate a skill works. Our 64 tasks were written to be measurable by a grader
with no human in the loop, and half of them turned out to be saturated. On the five we built to depend
on the skill's content, it moved 34% to 68%.

## What this does not mean

It does not mean their number is wrong. We did not reproduce their harness, their tasks or their model
version, so we have no basis for saying their measurement is faulty.

It does not mean ours is right either. One task set, one model, one harness. Ours says what happened
under conditions that are written down and reproducible; theirs says what happened under theirs.

What it does mean is that "+27pp" is not a property of a skill package. It is a property of a skill, a
task distribution, a harness and a way of counting. Publish those four and the number can be checked.

## What would settle it

Run both task sets through one harness with three arms. That needs their tasks in a format a grader
can execute, which is the whole reason `taskset.json` exists as an open format. If the maintainers of
that package want to run it themselves, the command is:

```bash
node dist/cli.js run --taskset <their tasks> --skill <their skill> \
  --arms baseline,placebo,treatment --repeats 5 --activation forced
```

If their tasks show +27pp against a token-matched placebo, that is a real result and we will publish
it as one. If they show +27pp against baseline and ~0 against placebo, then the number was mostly the
context getting longer, and that is worth knowing before anyone else quotes it.

Numbers and run databases for our side: [docs/15](15-第二轮实测.md), [docs/16](16-消融实验.md).
How to read any of these cards: [docs/19](19-how-to-read.md).
