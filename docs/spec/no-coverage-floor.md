# There is no changed-lines floor, and no coverage tooling at all

Sources: [#110](https://github.com/mephistopheles4/stacks/issues/110) (what would
produce one), [#117](https://github.com/mephistopheles4/stacks/issues/117) (the
refusal).

> ⚠️ **The title's second clause is no longer true, and this is the re-check
> §5's _Decay_ item asked for** — _"Re-check trigger: the implementation
> session"_, which this was. `@vitest/coverage-v8` is installed as of
> [#205](https://github.com/mephistopheles4/stacks/issues/205); see
> [ADR-0069](../adr/0069-coverage-is-an-ingredient-not-a-goal.md).
>
> **The refusal below survives in full** — no floor, no threshold, no series, no
> badge, and nothing anywhere asks anybody to raise a number. Coverage was
> readmitted **as an ingredient**: a formula consumes it in an opt-in pre-commit
> print and throws it away. That distinction is the whole of what changed.
>
> **§3's load-bearing fact also survives**, which is worth being exact about
> because §5 predicted its failure as the trigger and that is not what happened.
> Stryker's vitest-runner still needs no coverage provider — nothing about #109
> moved. A _different_ consumer arrived, one this spec had no reason to
> anticipate: a per-function ranking, computed locally, over the functions one
> commit touches.
>
> **One measured claim below is now historical.** §1 leg 2 — _"a pull request
> adding a wholly untested module scores 100%"_ — was true of a report with no
> `coverage.include`. [#197](https://github.com/mephistopheles4/stacks/issues/197)
> measured `include` closing exactly that hole (93 files against 72), and
> `vitest.config.ts` now sets it from `stryker.scopes.json`. **It changes
> nothing about the disposition**: leg 1 (Clause B is surface-independent) and
> leg 3 (an AI asked to raise a number produces the gap it is asked to close)
> are untouched, and either alone is fatal to a floor.

**This section exists because the piece was charted, tested against its own
reversal argument, and turned down.** It is not a gap in the spec; it is a
decision the spec owes, and the number that does not exist is worth more written
down than absent.

**The standing rejection row in [`docs/gates.md`](../gates.md) survives. It does
not survive for the reason it gives.**

**Audience: both.** Leg 1 is an entailment of
[`gate-or-trend.md`](gate-or-trend.md), which is audience-independent; leg 2 is a
Vitest 4 fact; leg 3 is about AI-authored volume and **transfers hardest of the
three.**

---

## 1. Three legs, and the row's own written reason is not one of them

### Leg 1 — Clause B forecloses the word _floor_, at every surface

Clause B is **surface-independent by its own text**: _"diff-locality changes
**where** the measure applies, not **what kind** of measure it is. You still raise
it by adding tests that execute lines."_ So a changed-lines coverage threshold
fails Clause B at the `gates` aggregator, at `pnpm deploy:site`, and anywhere else.

Fails B → not a gate → **trend**. And a trend _"blocks nothing… the series is never
red; its absence is."_ **A floor is a threshold.**

> **There is no surface at which a changed-lines floor can exist under the taxonomy
> already closed.**

⚠️ **The gate-or-trend question turned out to be fatal rather than clarifying.**
The ticket asked which one it is and expected the answer to shape the design. The
answer is **neither**, because the artifact cannot be built either way.

### Leg 2 — `coverage.all`'s removal makes it worse than absent

> ⚠️ **Historical since [#205](https://github.com/mephistopheles4/stacks/issues/205),
> and the leg does not carry the conclusion.** Everything below was true of a
> report with no `coverage.include`; `vitest.config.ts` now sets it from
> `stryker.scopes.json`, so an untested module is present at 0% rather than
> absent, and a changed-lines floor would no longer be structurally green in the
> case it exists to catch. **Legs 1 and 3 are untouched and either alone is
> fatal to a floor** — see [ADR-0069](../adr/0069-coverage-is-an-ingredient-not-a-goal.md).
> Kept as written, because the reasoning is what a later reader has to be able
> to check.

Vitest 4 removed `coverage.all`, and a report now includes only covered files — so
**a pull request adding a wholly untested module contributes zero lines to numerator
_and_ denominator and scores 100%.** The check is structurally green in precisely
the case it exists to catch. _A gate that passes when it should be reddest is worse
than no gate, because it certifies._

⚠️ **It compounds rather than being one bug with one fix.** `diff-cover`'s
zero-denominator branch returns `100` by an explicit branch in
`report_generator.py` — **and that is the same branch that produces the wanted
docs-only pass**, which was the disqualification test this piece was to be judged
on. **The same line produces the wanted behaviour and the fatal one, and no
configuration separates them.** `coverage.include` closes the hole and is then
itself a claim that can go stale, unwatched, **in the effort about claims that go
stale.**

Both providers work and the TypeScript 7 premise never applied — `vitest@4.1.10`
has no `typescript` dependency at all, transforming through Vite/Rolldown, so
neither provider ever meets the compiler this repo pins. **The finding that killed
the piece was not about diffs at all.**

### Leg 3 — the AI-volume reversal was made and refused, not skipped

**The argument's premise is accepted.** _"One contributor"_ no longer describes this
repository: the initiative's whole premise is that AI-authored volume is what broke
reviewer vigilance, and a solo maintainer reviewing agent output is not a solo
maintainer reviewing their own typing. **If the row rested only on _"it would be
noise"_, that shift would reverse it.**

**Followed through, it cuts the other way.** An AI asked to satisfy a diff-coverage
floor **writes tests that execute the lines it has just written** — which is the
coverage row's sentence verbatim, _"an AI asked to raise it produces exactly the gap
it is asked to close"_, now with volume behind it rather than one person's
afternoon. The changed denominator does not change the cheapest route to green; **it
only guarantees the route is taken more often.**

> **So the fact that AI now writes the diffs is an argument _for_ the mutation half
> — which passes Clause B — and an argument _against_ this one.** The premise is
> redirected, not denied.

---

## 2. The row edit — landed by this spec's implementation session

**Current:**

> | Changed-lines floor (diff-cover) | One contributor; it would be noise. |

**Replacement**, with `(diff-cover)` **dropped** — #110 established the row _"names
a tool, not a mechanism"_, and the conclusion is about the measure:

> | Changed-lines coverage floor | Not a gate at any surface: it fails [#112](https://github.com/mephistopheles4/stacks/issues/112)'s Clause B, which is surface-independent, and a trend has no threshold to be a floor. Worse than absent besides — Vitest 4 dropped `coverage.all`, so a pull request adding a wholly untested module scores **100%**, green in exactly the case it exists to catch. Reversal on the grounds that AI now writes the diffs was raised and refused in [#117](https://github.com/mephistopheles4/stacks/issues/117): an AI asked to satisfy a diff-local floor writes tests that execute the lines it just wrote, which is the row above with volume behind it. The original reason — _"one contributor; it would be noise"_ — is no longer why. |

⚠️ **Leaving _"one contributor"_ to stand alone would have been a fourth
understated claim inside a file that already carries three, authored by the ticket
that knew better.**

**The Coverage percentage row is untouched and still binding.** _"No ticket should
ever exist to raise it"_ survives everything in this spec, and **the trend layer
carries no coverage number.**

---

## 3. The scope reduction — stated rather than inferred, because it is large

**No coverage tooling enters this repo at all.**

> ⚠️ **Superseded by [#205](https://github.com/mephistopheles4/stacks/issues/205):
> `@vitest/coverage-v8` is installed, `coverage.include` is set, and the
> dependency has its record — [ADR-0069](../adr/0069-coverage-is-an-ingredient-not-a-goal.md).**
> The list below reads as a live scope reduction and is now a record of what
> _this_ decision did not have to pay for. **The sentence it rests on still
> holds**: Stryker's vitest-runner needs no Vitest coverage provider, and
> nothing about #109 moved. What arrived is a consumer this spec had no reason
> to anticipate — a per-function ranking over the functions one commit touches.
> The uploader, `fetch-depth: 0`, `diff-cover` and the second package ecosystem
> are still refused, and no `gates.yml` job moved off depth 1.

Checked against #109: **Stryker's vitest-runner uses its own `perTest` mutant
coverage and never touches a Vitest coverage provider** — _"your `coverageAnalysis`
property is ignored. The vitest runner plugin will always use `perTest`."_ Nothing
else in this spec needs one either.

So the following are **not decisions the implementation session has to make, and not
costs it has to pay**:

- `@vitest/coverage-v8` or `@vitest/coverage-istanbul` — neither, no exact-peer
  coupling to keep in step with `vitest`, no `@babel/core` tree.
- `coverage.include` / `coverage.exclude` — no report exists to configure.
- `fetch-depth: 0` or any merge-base remedy. **All three `gates.yml` jobs stay at the
  default depth of 1.**
- The v8-vs-istanbul comparison and its wall-clock measurements.
- A [`docs/adr/`](../adr/) record for a new dependency.
- A second package ecosystem (`pip install diff-cover`) in a workflow that has one.
- ⚠️ **Any uploader step** — which would have run **outside the Vitest process**, so
  `gates/no-live-network.ts` (G21) replaces `fetch` inside the suite and **cannot see
  a separate binary in a later step.** `gates.yml`'s own header claim that nothing
  here can reach the network would quietly have stopped being true.
- Codecov's up-to-three commit statuses, and the `pull-requests: write` permission
  every comment-posting option wanted.

**Nothing else on this map depended on the piece**, so it drops out cleanly.

---

## 4. Moot, so the spec does not hunt for answers nobody owed

| Question                                                        | Why it is moot                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the number, derived by replay over the last N merged PRs        | no threshold, so no number. **No retrospective-replay task exists**: it would have needed coverage tooling and N historical runs to calibrate a value nothing uses |
| the base — merge-base vs GitHub's diff                          | nothing computes a diff-restricted report                                                                                                                          |
| the docs-only diff rule                                         | the disqualification test had no candidate left to disqualify                                                                                                      |
| what is coverable — `.astro`, `gates/`, `fixtures/`, `scripts/` | no denominator to decide the membership of                                                                                                                         |
| the escape hatch                                                | a refusal blocks nothing, so there is nothing to escape                                                                                                            |
| gate or trend                                                   | leg 1 — fatal rather than clarifying                                                                                                                               |

---

## 5. Gaming categories — graded

Written by #117 against **the refusal**, since there is no artifact; **graded cold**
by [#139](https://github.com/mephistopheles4/stacks/issues/139), which returned one
finding this section owes.

**1 — Weakening.** The Why cell is prose in a file anyone may edit, and softening one
sentence reopens the whole piece. **What raises the cost**: the replacement text names
the _mechanism_ and cites the entailment, so a softening now reads as a one-line diff
contradicting Clause B rather than as a change of mood. **Nothing mechanical stops
it.**

**2 — Satisfying the letter.** A per-file `coverage.thresholds` with `perFile: true`
plus `--coverage.changed <base>` **is a diff-restricted coverage floor that never uses
the words _changed-lines_ or _diff_.** The row is written against the **measure**, not
the shape or the tool, which is the only reason that lands inside it.

**3 — Routing around.** Re-proposal under another name — _patch coverage_, _new-code
coverage_, _diff quality_. **Dropping `(diff-cover)` closes the tool-shaped half.** The
name-shaped half stays open, and what catches it is Clause B, which is name-independent
and applies to any measure raised by adding tests that execute lines.

**4 — Vacuous green.** A refusal has no green to be vacuous, so the honest
transposition is: **the row exists and nothing reads it.** Nothing gates the prose in
_"Not gated, deliberately"_ — G19 asserts over the numbered rows, not this table — and
nothing here proposes that it should. **Recorded as an accepted limit, not a closed
one.**

**5 — Decay.** ⚠️ **One load-bearing fact was measured once, by this decision**:
_Stryker's vitest-runner needs no Vitest coverage provider_. **The entire scope
reduction above rests on it.** If a future Stryker release changes it, a coverage
provider enters this repo anyway and _"no coverage tooling at all"_ stops being true
with nothing re-checking — **this effort's subject matter aimed at this effort's own
output.** **Re-check trigger: the implementation session, and any Stryker version
bump.** Weaker second item: this refusal rests on Clause B, so revising that taxonomy
silently unsupports it.

⚠️ **The grading finding this section owes: it has zero exposure analysis and zero
mechanism.** Every entry above is reasoning about prose, and the only artifact with a
failure mode is the row itself. **That is honest for a refusal and it is also the
weakest gaming section in this spec** — recorded rather than dressed up, because the
alternative is a section that looks as strong as the ones covering real gates.

---

## 6. What lands where

| Artifact                                                  | Change                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`docs/gates.md`](../gates.md), _Not gated, deliberately_ | **the Changed-lines row replaced** with §2's text; `(diff-cover)` dropped from its name |
| everything else                                           | **nothing.** No dependency, no config, no workflow step, no row, no gate                |

**No gate, and the reason is stated rather than left as an absence**: there is
nothing to gate. A refusal has no red. The one mechanism that touches this piece is
Clause B, which lives in
[`gate-or-trend.md`](gate-or-trend.md#1-the-rule) and is enforced by nobody — **it is
a rule this spec asks future decisions to be held against, not a check.**
