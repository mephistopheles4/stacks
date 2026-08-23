# The counter's inputs are pinned exact, and its rule options are read back rather than copied

`eslint`, `@typescript-eslint/parser` and `eslint-plugin-sonarjs` are dev
dependencies pinned **exact** — `10.9.0`, `8.67.0`, `4.2.0` — not caret ranges.
The `complexity` rule's options live in `eslint.config.mjs` and nowhere else,
and `scripts/lib/complexity.ts` obtains them by asking ESLint what it resolved.
The inventory fixture that pins the counting rule lives under `fixtures/`, not
beside its spec.

Three decisions, one subject: **what a complexity count means, and what would
change it without saying so.**

[ADR-0066](./0066-typescript-6-until-7-1.md) records the pin that made ESLint
installable at all, and names the counter as the thing it bought. This record is
about the counter's own inputs, which 0066 does not cover.

## Why exact, and not caret

**They are inputs to the number, the way `timeoutMS` is an input to the mutation
score.** The four complexity series are read as trends across months, so the
question a reader asks of a movement is _did the code change_. A caret range
makes `pnpm install` a second answer to that question, and one that leaves no
diff.

This is not hypothetical arithmetic. ESLint's `complexity` rule gained **every
`?.` link** and **every default value** as branches in v9.0.0 (PR #18152). On
this repository's own `parseNote` that is the difference between 11 and 12 — one
function, one minor version. A caret range would let a Tuesday's `pnpm install`
move `complexity-mass` on all eight scopes at once, in the same direction, at a
commit that changed no code. That is indistinguishable from the repository
genuinely getting harder to reason about, which is the one thing the series
exists to detect.

**The same argument that pins Stryker exactly**
([ADR-0053](./0053-stryker-measures-eight-declared-scopes.md)) and `typescript`
exactly (0066). It is the third application, and the reason is unchanged: an
input that can change under a `pnpm install` is one the record cannot account
for.

`eslint-plugin-sonarjs` is pinned exact although **nothing enables it**. It is
installed because the spike measured cognitive complexity through it and the
spec keeps that as fog; a range on a package that computes nothing today would
be an input waiting to become one silently on the day somebody turns it on.

## Why the rule options are read back, not kept as a constant

The obvious shape was a `COMPLEXITY_RULE_OPTIONS` constant in TypeScript,
imported by both `eslint.config.mjs` and the library. It was written that way
first and replaced, because it puts the one input outside the hash's reach.

⚠️ **The cap does not exist yet** — it is a later step of the same rollout, and
nothing in this change computes a hash. What follows is why the shape is chosen
now rather than retrofitted.

[The cap](../spec/complexity-on-the-trend-layer.md#4-teeth-a-cap-that-only-falls)
is to refuse a record stamped under a different counting rule rather than
comparing it, and the fixture hash is what will tell the two apart. Its canonical
inputs are the two installed versions, the rule's options object, and the
fixture's expected totals. **A second literal would break that**: edit
`eslint.config.mjs` to `max: 5`
and a constant elsewhere would go on hashing the old value, so every cap would be
compared across two different counting rules and nothing anywhere would say so.
The failure is silent and lands on the deploy path.

So `counterInputs()` calls `ESLint#calculateConfigForFile` and takes what ESLint
actually resolved. It is exactly `RunFacts.configHash`'s rule one layer over —
_the run stamps its own, computed from the config it actually loaded rather than
passed in from outside_ — and it was adopted here for that precedent.

**The cost is real and small**: the options are now available only through an
async call, since resolving a config is async. That is one `await` in the two
places that need it, against a failure mode nothing else could see.

**Severity is dropped from what is returned, and that is the one judgement in
this record.** ESLint normalises a rule to `[severity, ...options]`, and
`counterInputs()` keeps only the tail. At `max: 0` every function reports under
`warn` and under `error` alike, so severity cannot move a single count — and
hashing it would refuse records on the deploy path whose numbers either side were
identical. That is `configHashOf`'s `SCORE_NEUTRAL_OPTIONS` applied to a
different configuration file: _hash what changes the number, and nothing else_.
It is also what §4 asks for in its own words — **the `complexity` rule's options
object**. The counter-argument, recorded because it is what would reopen this: it
sits awkwardly beside _stamp the configuration you loaded_, since severity is
part of what was loaded. The reply is that `configHashOf` already draws exactly
this line and drew it first.

## Why the fixture is not beside its spec

`fixtures/complexity/inventory.ts` holds every construct the rule counts. The
natural home is `scripts/lib/`, next to `complexity.test.ts`. It cannot go
there.

`scripts/**/*.ts` is both a declared Stryker scope and a **complexity
population**. A fixture under `scripts/` would therefore be counted into the
`scripts` series — so the file whose job is to hold the counting rule still
would move a series every time it was edited, and adding a construct to it (the
maintenance this fixture is designed to receive) would read on the dashboard as
the `scripts` scope getting more complex. Stryker would mutate it besides.

`fixtures/` is in none of `scope-check.ts`'s `SOURCE_ROOTS`, matches no scope
glob, and is outside `tsconfig.json`'s `include`. **The last of those is a cost,
stated plainly**: the fixture is not typechecked, so it is kept valid TypeScript
by hand and by review rather than by a gate. That is acceptable because ESLint
must parse the file to count it — a fixture that stopped parsing would fail the
spec loudly — and because nothing imports it or executes it.

## What was ruled out

- **A caret range on any of the three.** Above.
- **A `COMPLEXITY_RULE_OPTIONS` constant in TypeScript.** Above. Written first,
  then removed.
- **Deriving the parse from `meta.messages` at runtime** — building the regex
  from the rule's own declared template, reached through
  `eslint/use-at-your-own-risk`. It would survive a re-wording, but a series
  whose definition rests on a module named _use at your own risk_ cannot promise
  that last year's number and this year's mean the same thing — 0066's objection
  to `typescript/unstable`, verbatim. The parse is anchored on the template's
  literal spans instead, and an unreadable message **throws**.
- **Counting a failed parse as zero functions.** A file ESLint cannot parse
  reports no functions, which is indistinguishable from a file that has none. It
  raises instead. The caller decides what a broken step means — for the emitter
  that is `RunFacts.failed`, for the pre-commit print a diagnostic and exit 0.
- **A sampled fixture.** The un-sampled construct is exactly the silent change
  the fixture exists to catch. _Total_ is in the spec's sentence on purpose.

## How this was decided

Locked as §§3–4 of
[`docs/spec/complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md),
from the spike in [#196](https://github.com/mephistopheles4/stacks/issues/196),
which measured `parseNote` at 12 and `asPrivate` at 11 but **did not record which
ESLint version produced them** — the spec calls that out as the reason the pin
must be exact, and it is the clearest possible argument for this record.

Implemented in [#201](https://github.com/mephistopheles4/stacks/issues/201).
The spike's two numbers were re-measured on the pinned versions and reproduce
exactly on ESLint `10.9.0`, which the spike did not test: the rule's counting did
not move between 9 and 10, and now a version that does move it is red rather than
quiet.

⚠️ **Both numbers in this record moved before it landed.** It was written as
0065 against a 0064 that was the TypeScript pin. While the stack was open,
[#216](https://github.com/mephistopheles4/stacks/pull/216) merged an unrelated
0064 to `main` and [#215](https://github.com/mephistopheles4/stacks/pull/215)
claimed 0065, so the pin became [0066](./0066-typescript-6-until-7-1.md) and this
became 0067. Nothing about the decision changed; the renumber happened on the
branch, so no landed record was edited. Recorded because this file argues _about_
the pin's record by number, and a reader finding 0064 elsewhere would otherwise
land on a different decision entirely.

**Whether this deserved its own record was itself a question.** The spec's file
table names three ADRs for the whole rollout and none of them is this one, so
#201's session proposed folding the pin rationale into 0066 and writing nothing.
#200 declined: 0066 is about the compiler, this is about pinning somebody else's
rule implementation, and the README forbids editing a landed record. Recorded
here so the _reason_ the spec's count moved from three to four is legible.
