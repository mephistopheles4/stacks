# ADR-0070 — Stryker's type checker stays off until the compiler version is a hashed ingredient

**Date:** 2026-08-23
**Status:** accepted
**Supersedes the fog item:** _"Stryker's type checker back on"_, on
[#186](https://github.com/mephistopheles4/stacks/issues/186)'s _Not yet
specified_, which reserved this decision _"its own ADR, after the TS 6 pin
lands"_. The pin landed in `738ee75`; this is that ADR.

## Decision

`checkers` stays `[]`. **Not "not yet" — not until a stated condition is met:**
the `typescript` version becomes an ingredient of `RunFacts.configHash`, or of a
sibling hash beside it, so that a compiler upgrade refuses a comparison instead
of silently changing one.

Nothing in this decision changes `stryker.config.mjs`'s exported object, so
**the config hash does not move and no calibration window restarts.** The only
decision-bearing edits are a comment in that file and this one; `docs/adr/README.md`
also gains the index entry every record here carries.

## Context

[ADR-0066](./0066-typescript-6-until-7-1.md) pinned `typescript` to `6.0.3`
exactly and recorded, from the spike on
[#196](https://github.com/mephistopheles4/stacks/issues/196), that the checker
now works where it could not on TypeScript 7:

> Starts and works — 2 of `measure.ts`'s 11 mutants come back `CompileError`.
> ⚠️ **It stays off**; see below.

That "see below" deferred the question rather than answering it, on the correct
grounds that turning the checker on is a **scoring** change and not a
configuration one.

**What a `CompileError` actually does to the number.** The score is Stryker's
total variant, and `scripts/lib/mutation-score.ts` states the arithmetic:

```text
(killed + timeout) / (killed + timeout + survived + noCoverage)
```

> `Pending` sits outside the denominator either way, alongside `CompileError`,
> `RuntimeError` and `Ignored`. That is Stryker's own arithmetic, not a choice
> made here: excluding a mutant is not the same as counting it as killed.

So the checker does not **reclassify** a mutant. It **deletes** it from the
measurement. Which direction each scope moves is therefore unknown and unmeasured
— removing a mutant the suite was killing lowers the score, removing one it was
surviving raises it, and nobody has counted which kind the 2-of-11 were.

## The argument for turning it on, which is real

A mutant that fails `tsc` cannot ship. `pnpm typecheck` runs in CI and `pnpm
build` runs it again, so such a mutant is already caught — by a gate that is
**not the test suite**. Leaving it in the denominator makes the tests answer for
something the compiler owns, and the mutation score is supposed to be a
statement about tests. On that reading, excluding it is more honest, and the
checker makes the score purer.

This is the better argument on the merits and it is why this ADR states a
condition rather than a refusal.

## Why it stays off anyway

**Turning the checker on adds an input to the score that nothing hashes.**

`configHashOf` hashes the Stryker configuration object, minus the output and
logging options in `SCORE_NEUTRAL_OPTIONS`. `checkers` is hashed, correctly — so
the _flip itself_ would be visible. What is **not** in that object, and cannot
be, is the version of `typescript` doing the checking. A one-line Dependabot bump
of the compiler would then move every scope's score with **no hash change and
nothing saying so**.

That is not a hypothetical failure mode in this repo; it is the exact one
[ADR-0067](./0067-the-counters-inputs-are-pinned-exact.md) built `fixtureHash`
to close for the complexity counter, in almost the same words:

> An ESLint upgrade that counts one more construct would raise every count with
> no branch written — breaching every cap at once and reading as a regression
> nobody caused.

Swap _ESLint_ for _TypeScript_ and _count_ for _verdict_ and the sentence
survives intact. Having built a hash to shut that door on one series, opening it
on the other is not a trade-off; it is an inconsistency.

`SCORE_NEUTRAL_OPTIONS`' own doctrine points the same way. It is a **denylist in
a repo that prefers allowlists**, and its comment says why: _"this fails closed
by treating anything unrecognised as score-affecting: an option nobody has
classified is hashed."_ An unhashed compiler version is the one score-affecting
input that failure mode cannot reach, because it is not an option at all.

**The mutant is not lost meanwhile.** With `checkers: []` the mutant still runs —
Vitest transpiles through esbuild, which strips types without checking them — and
gets a real killed-or-survived verdict. Measured across eight runs: `CompileError`
0, `RuntimeError` 0–1. The information is redundant with the compiler, not
absent.

**And the price of being wrong is three weeks.** Enabling the checker restarts
every calibration window: 20 consecutive healthy nightlies per scope, no gap over
three days. Doing it on a 2-of-11 sample from one small file, without knowing
which direction any scope moves, spends that on a guess.

## Consequences

- `stryker.config.mjs` keeps `checkers: []`, and its comment now names the
  hashing gap as the reason rather than pointing at fog.
- **The condition is checkable, and it is somebody's next move rather than a
  wish.** Fold the resolved `typescript` version into the score's stamp — the
  shape `fixtureHashOf` already uses for `eslint` and
  `@typescript-eslint/parser`, read back from what is actually installed rather
  than from `package.json`. With that in place this ADR is superseded by
  re-deciding, not by drift.
- **Do it before a window fills, never during.** The flip restarts every window,
  so its cheapest moment is immediately after a deliberate re-derivation and its
  most expensive is run 19 of 20.
- ⚠️ **This does not settle `tsconfigFile`.** It is hashed today although with
  `checkers: []` it cannot reach a verdict, which is correct conservatism under
  the denylist. Whether it belongs in `SCORE_NEUTRAL_OPTIONS` is
  [#224](https://github.com/mephistopheles4/stacks/issues/224)'s third question
  and is deliberately left there — and note that answering it _yes_ would have to
  be revisited the moment this ADR's condition is met, because a checker that is
  on makes `tsconfigFile` score-affecting again.
