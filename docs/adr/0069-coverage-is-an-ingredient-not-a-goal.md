# Coverage is an ingredient, not a goal

**2026-08-22.** `@vitest/coverage-v8` is a dev dependency, pinned exact to the
installed Vitest, with `coverage.include` derived from `stryker.scopes.json`.
It is **off unless `--coverage` is passed**, nothing in CI passes it, and the
only thing in this repository that reads a coverage number is the opt-in
pre-commit CRAP print.

This reopens [`docs/spec/no-coverage-floor.md`](../spec/no-coverage-floor.md)
**narrowly and on purpose**. That spec refused coverage _tooling_, and the two
facts it refused on have both moved. What it refused _for_ has not moved at all,
and this record exists to keep those two halves apart.

## What changed

**The function-grain blind spot is closed by `include`, and it was measured.**
[#189](https://github.com/mephistopheles4/stacks/issues/189) held that under
Vitest 4 a never-imported function is _missing_ from the report rather than
present at 0% — so CRAP would be undefined exactly where it should be maximal,
which is what disqualified it in
[#191](https://github.com/mephistopheles4/stacks/issues/191). The
[#197](https://github.com/mephistopheles4/stacks/issues/197) spike planted an
orphan file and measured both ways: **with `include` set to the scope globs the
orphan appears with a full `fnMap` and every count at 0%; without it, it
vanishes — 93 files against 72.** `coverage.all`, whose removal was the original
finding, is not the mechanism any more and is not needed.

Reproduced here at the moment of landing, which is what makes it a fact about
this tree rather than about a branch that no longer exists: a probe file no spec
imports scored **CC 7 at 0% (0/7 statements), CRAP 56.0**, and
`packages/site/src/shelf/scene.ts` — 581 statements, 0 hit — sits in the report
exactly as the exclusion list says it would.

**The network risk was the uploader, and there is no uploader.**
[#110](https://github.com/mephistopheles4/stacks/issues/110)'s concern was a
coverage _service_. Collection is local. The full suite runs green under
`--coverage` — 945 of 945 — with G21 (`no-live-network`) silent, which is not an
absence of evidence: G21 replaces `fetch` with one that records and refuses, so
a single request would have failed the test that made it.

**And the cost is affordable at the surface that uses it.** A `related` run over
one file's transitive test set is about 3 seconds; the full suite is +20%, and
nothing runs the full suite with coverage on.

## What did not change

**No goal. No floor, no threshold, no series, no badge.** The _Coverage
percentage_ row in [`docs/gates.md`](../gates.md)'s **Not gated, deliberately**
stands exactly as written, and so does _Changed-lines coverage floor_ beside it.
Both legs that killed the floor survive this record intact:

- **Clause B is surface-independent** — you still raise coverage by adding tests
  that execute lines, at every surface. That is what makes it not a gate, and
  nothing here proposes one.
- **An AI asked to raise a number produces exactly the gap it is asked to
  close** ([#117](https://github.com/mephistopheles4/stacks/issues/117)). This
  is the leg that transfers hardest and the reason the print has no target: a
  CRAP table ranks what a person is already editing and asks for nothing.

The distinction the map drew and this record is named after: **coverage is
banned as a goal, not as an input.** An input is consumed by a formula and
thrown away; a goal is a number somebody is asked to move. Only one of those was
ever refused.

## What this makes historical elsewhere

Two documents said something that this commit falsifies, and a decision that
quietly leaves them saying it is the drift this repository's docs culture exists
to catch. Both are recorded here rather than left to be rediscovered.

**[`no-coverage-floor.md`](../spec/no-coverage-floor.md) is amended, because it
asked to be.** Its title's second clause — _"and no coverage tooling at all"_ —
is no longer true, and its own §5 _Decay_ item named the re-check trigger as
_"the implementation session"_, which this was. A banner at the top of that file
now says what changed and what did not. ⚠️ **§5 predicted the wrong failure**:
it expected a Stryker release to force a provider in. Nothing about #109 moved —
Stryker's vitest-runner still needs none. A consumer that spec had no reason to
anticipate arrived instead.

**[`docs/gates.md`](../gates.md) is deliberately untouched**, and one clause in
it is now historical. The _Changed-lines coverage floor_ row argues in part that
_"a pull request adding a wholly untested module scores 100%"_ — true of a report
with no `coverage.include`, and not true of this repository's report any more.
The row's **disposition does not move**: its other two legs are Clause B and the
AI-volume argument, and either alone is fatal to a floor. The row is left as
written because [#205](https://github.com/mephistopheles4/stacks/issues/205)
asks for exactly that, and because editing the standing refusal in the commit
that reopens the dependency is the shape of change that should never be quiet.
**Named here so it is a known limit rather than an unnoticed one.**

## What holds the reopening open

Three properties, each chosen because the alternative is a claim that quietly
goes stale.

**`include` is derived, never copied.** `no-coverage-floor.md` §2 named the trap
in the act of proposing the fix — _"`coverage.include` closes the hole and is
then itself a claim that can go stale, unwatched, in the effort about claims
that go stale."_ `vitest.config.ts` reads `stryker.scopes.json`, so a scope
added, renamed or re-globbed moves the coverage population in the same edit, and
G38 (`mutation-scope`) already holds that file to the tree. There is no second
list to drift.

**Absent is not zero.** A file `include` puts in the report untouched is a real
0% and a real, maximal CRAP — that is the blind spot closing. A file _missing_
from the report is a broken pipe, and the print says so rather than inventing
the worst number in the table out of a plumbing fault. The two cases are
different states in `lib/crap.ts` and are specced apart.

**The exclusions are applied here and nowhere else.** Twenty-eight files in this
repo read 0% because their only oracle is a browser or a child process. A CRAP
of 420 for `scene.ts` would be a fact about Vitest's reach, not about the code,
so an excluded file prints _no in-process oracle_ and no number. The four
complexity series do the opposite — they never read `exclusions`, because a
function's complexity is a fact about the code whatever runs it.

## Consequences

- One dev dependency, `@vitest/coverage-v8`, pinned **exact** to the installed
  Vitest rather than by range. It is a peer of the test runner and reads its
  internals; a caret here is a silently mismatched pair.
- ⚠️ **`vitest` itself moves from `^4.1.11` to `4.1.11`, and that is the half
  that makes "exact-peer" mean anything.** `@vitest/coverage-v8@4.1.11` declares
  `"vitest": "4.1.11"` as an exact peer, and this repository has no `.npmrc`, so
  pnpm's default is to _warn_ on an unmet peer rather than refuse. Pinning only
  the provider would leave a minor Vitest bump producing a mismatched pair and a
  warning nobody reads. Both are now pinned the way `@stryker-mutator/core` and
  `@stryker-mutator/vitest-runner` are: exact, together, in one edit.
- `pnpm test` is unchanged — same command, same duration, no report written.
- `.coverage/` is gitignored. Nothing commits, uploads or publishes a number.
- The print is **opt-in per clone** (`git config core.hooksPath .githooks`) and
  never blocks a commit. `CONTRIBUTING.md`'s promise that a contributor with no
  agent skills installed passes every gate is untouched: this is not a gate.

**Revisit condition.** If anything ever proposes reading this number outside the
hook — a floor, a badge, a series, a threshold, a pull-request comment — that is
a new decision and it reopens [#117](https://github.com/mephistopheles4/stacks/issues/117),
not this record. This one decided a formula may consume coverage. It decided
nothing about anybody being asked to raise it.

## How this was decided

From [#199](https://github.com/mephistopheles4/stacks/issues/199), the owner's
resolution, carried into
[`docs/spec/complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md)
§5 verbatim:

> **The owner's resolution (#199): shift it left.** CRAP lives **only in a
> pre-commit hook**, computed over the functions the commit touches, printed to
> the one person who can still change the code, with the _never calibrated_
> caveat on the same line.

And the half of #191 that survived its own disqualifier being closed:

> **Still true, and still decisive for the page**: the exponents were never
> calibrated, by the authors' own account; no implementation has ever used a
> mutation score; and a composite on the dashboard is what `trend-layer.md` §3
> refused. **So CRAP is never a series and never a panel.** The four counts stay
> the record.

The spike's own recommendation was narrower than its result, and it is worth
keeping as written, because it names the three things this record had to supply
before the coverage answer was worth anything:

> **Recommendation:** the coverage-availability half of the question is settled
> — `coverage.include` works as advertised, cheaply, for in-process code. That
> does not by itself clear CRAP for a hook. Adoption would need: an ADR
> accepting `@vitest/coverage-v8` as a dependency (reopening a closed decision,
> narrowly), an explicit function-identity scheme, and an explicit answer for
> the 28 out-of-process files.

All three are answered: this record is the ADR; function identity is
`file:line`, printed and never stored, because Istanbul's `anonymous_N` ids are
positional and move when an unrelated arrow is added above them; and the 28
files are the exclusion list, applied by the hook and by nothing else.
