# The complexity cap only falls, and a record counted under another rule is refused

`complexity-max` and `complexity-mass-over-10` get **per-scope caps** in
`stryker.floors.json` — the mutation ratchet mirrored, because for these two
series the bad direction is up.

> **Cap for a scope = the highest value observed for that scope across its
> calibration window, applied once, at arming.** After arming it moves **down
> only, by hand**.

An armed cap that a scope exceeds **refuses `pnpm deploy:site`**, and no flag
clears it. Two refusals ship beside it: a declared scope carrying no cap entry
for a capped series, and a record counted under a different counting rule from
the one the caps were derived under.

**It ships with every cap `unarmed`**, so today it refuses nothing. Arming is a
human judgement, per scope, after that scope's window fills — there is no moment
at which _the caps_ become armed, and none at which one arms itself. Every entry
is its own decision, by hand.

`complexity-functions` and `complexity-mass` are **not** capped. They grow with
the codebase legitimately, and a cap on either would refuse a feature.

## Why a cap and not a ceiling, in the owner's terms

From [#198](https://github.com/mephistopheles4/stacks/issues/198): _experimenting
a lot, and raising the floor slowly._

**A cap derived from the repo's own history asks nothing until the repo has shown
what it can hold. A ceiling picked from a blog post asks on day one and is gamed
by lunchtime.** That is the whole of it. A per-function ceiling red on a pull
request was refused for two further reasons the prototype measured: _"refactor
this function"_ is not a finite diff, which fails Clause A; and a mechanical
split clears a ceiling without removing a single branch, so the check buys a
rename rather than a simplification.

A pre-commit hook that refuses was refused too. `--no-verify` makes a blocking
hook a gate anyone can skip — a check claiming coverage it does not have.

Clause A is met the way the mutation floor meets it: the remedy is **bring the
function back under the cap, or write the notes entry**. And the refusal lands in
front of a person, because `deploy:site` is human-invoked.

## Raising a cap is a lowering, and costs a notes entry

This is the point most likely to be read as a formality, so it is stated as a
rule rather than as an aspiration: **`notes` is append-only, one line per
raising, never cleared.**

A bare number going 12 to 17 is a diff that says nothing about why. The
justification belongs next to the permission, permanently, where whoever next
opens the file reads it. Nothing enforces this — the file makes an omission
visible, it does not make it impossible, exactly as
[ADR-0061](./0061-the-mutation-floor-refuses-deploy.md) says of the floor's own
notes.

## The fixture hash, and why it is required rather than optional

`stryker.floors.json` carries a top-level `fixtureHash` beside `configHash`, and
the floors reader **requires** it.

**An ESLint upgrade that counts one more construct raises every count with no
branch written.** Without the stamp, that upgrade would breach every armed cap at
once and read as a regression nobody caused — and the deploy would report it as
one. So a record counted under a different rule is **refused rather than
compared**, naming both hashes, and nothing else is compared until they agree.

Canonical inputs, in this order: the exact `eslint` and
`@typescript-eslint/parser` versions **as installed**, the `complexity` rule's
**resolved** options, and the inventory fixture's expected totals. Hashed
positionally, so swapping the two version strings is a different hash.

Two judgements inside that are worth recording:

- **Severity is excluded from the options.** At `max: 0` every function reports
  whether the rule says `warn` or `error`, so severity cannot move a count —
  and hashing it would refuse every record across a `warn` → `error` edit whose
  numbers were identical either side. This is `SCORE_NEUTRAL_OPTIONS` applied to
  a different config: hash what changes the number, and nothing else.
- **The options are read back off the config ESLint actually resolved**, never
  kept as a second literal. A copy in TypeScript is the one input the hash cannot
  see.

⚠️ **`MCCABE_CUT` is deliberately not an input, and the gap it leaves is closed
elsewhere.** It decides what `complexity-mass-over-10` means, but §4's canonical
list is the three above and a fourth would change a contract two implementations
are meant to agree on. The inventory fixture cannot see it either — its only
over-the-cut function scores 13, so a cut of 10, 11 or 12 produces identical
expected totals and an identical hash while every real count moves.

What closes it is the **series name**, asserted against the constant: change the
cut and the assertion is red, or the series is renamed and G36 catches the
missing Trends row. Cheaper than a fourth hash input, and it makes the
relationship between the name and the number structural rather than a
convention.

## The cap window is the floor's window, and a draft got this wrong

**CI nightlies only, twenty consecutive healthy runs, no gap over three days** —
`the-ratchet.md`'s rule, unchanged, walked by the same `streakOf` so that
"inherited verbatim" is structural rather than a claim in a comment.

⚠️ **A draft counted merges as well, and the reasoning was unsound.** It is
recorded here rather than quietly dropped, because the mistake is easy to make
twice and it survived a round of review.

The draft argued: the counts are emitted on merges too, so counting them gives
the window more samples, and _more samples can only raise a derived cap, never
lower one, because the rule takes a maximum_ — therefore the divergence was safe
in the direction that matters.

**That is false for a run-bounded window.** `slice(0, WINDOW_RUNS)` takes the
newest twenty _runs_. Counting merges does not add samples over a fixed period;
it makes twenty runs span two days instead of three weeks. The maximum is then
taken over a strictly **narrower** slice of history, and the derived cap comes
out **lower and tighter** — likelier to refuse, not less likely. The claim would
only have held for a _time_-bounded window, which this is not. `the-ratchet.md`
is explicit on the point it turns on: _"Counted in **runs**, not days."_

**What §6's per-merge resolution actually buys** is unaffected: the record still
carries counts on both events, and the print block still reads them per merge.
That is about what is _measured and displayed_, never about which runs a cap is
_derived_ from.

**The comparison and the window read different rows, on purpose.** A cap is
derived from nightlies and then applied to whatever ran last, including a merge
— see `countedIn`. The cap is a stable historical bound; any run that exceeds it
is the event worth refusing on, whichever half of the workflow produced it.

## What it costs

- ⚠️ **A legitimate refactor can stop a deploy, and this is not softened.** It is
  [ADR-0061](./0061-the-mutation-floor-refuses-deploy.md)'s cost, inherited whole,
  along with its answer: the way past is a committed raising with a notes line,
  visible in a pull request, because deploy runs from `main`.
- **The disarmed period is indefinite by design, and the print is what ends
  it.** The cap lands early — before anything can be armed — precisely so the
  countdown is visible for the whole window, converting _indefinite_ from a
  silence into a dated question asked of the one person who can answer it.
- **A cap can be raised to make a refusal go away.** The date on each entry is
  the only guard against typing `unarmed` instead, and it prints on the line
  where the temptation is.

## Status

Accepted. Ships disarmed: every cap `unarmed`, nothing refused today.

Spec: [`docs/spec/complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md) §4
and §9 step 4. Issue:
[#204](https://github.com/mephistopheles4/stacks/issues/204).
