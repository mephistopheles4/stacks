# Gate register

**Triage for 27 rows; the deep pass has run on the other 8.** The population was
commissioned by [#126](https://github.com/mephistopheles4/stacks/issues/126),
running the shape [#113](https://github.com/mephistopheles4/stacks/issues/113)
fixed. It puts the same five questions to every numbered row in
[`docs/gates.md`](./gates.md) and records a one-line verdict each — `clean`, or
the shape of the exposure.

⚠️ **Read the two layers separately, because they carry different weight.** The
**category bullets and Rank line** in every entry are the triage pass:
**suspicion, not proof**, a nomination for the deep pass rather than a finding.
The **Deep pass** block, present on the eight rank-1 rows only, is
[#128](https://github.com/mephistopheles4/stacks/issues/128)'s band one: defects
actually planted, gates actually run, dispositions filled in. Where the two
disagree, the Deep pass block is the evidence and the triage line is the guess it
replaced — and on two rows they do disagree. See **Band one**, below.

**The triage pass planted no defect and ran no mutation.** Where an
Observed-red line is present, it is one of two things, both already in
`docs/gates.md`, neither produced by this session: a **planted demonstration**
— a perturbation or mutation run when that gate was written (G1, G6, G7, G10,
G13, G17, G19–G23, G25, G26, G28, G29 among others) — or a **real defect that
surfaced without planting anything**, found on arrival or by ordinary use
rather than by an adversarial test (G4 "was red on arrival"; G14's `covers`
false-negative "found by the next command added"; G26's corpus defect found by
noticing a real book's recorded refusal contradicted what the provider held).
**Nine rows carry no Observed-red line at all** — G5, G12, G15, G30, G31, G32,
G33, G34, G35 — because `docs/gates.md` records no elaboration for them beyond
their table row, or, for G15, no mutation was run against the row itself. ⚠️ **One
of those nine, G31, was in band one and still has no Observed-red line** — not
for want of trying: four plants were run and **none of them turned the gate
red**, which is the finding rather than a gap in it.

**Dispositions (`gated` / `repaired` / `accepted` / `declined`) are filled in for
the eight rank-1 rows and for nothing else** — the remaining 27 await their
band.

**Scope: the 35 numbered rows `docs/gates.md` holds today** — G1–G35 across its
Invariants, Contract seams and Defect gates tables. The **CI-only gates** table
and the **Not gated, deliberately** table are not numbered rows and are out of
this pass. Two further rows — G36 (`action-pins`) and G37 (`dependency-audit`)
— are decided in spec by [#124](https://github.com/mephistopheles4/stacks/issues/124)
and do not exist in the tree yet; this pass does not triage them, and that gap
is recorded as a spec obligation on #124's side, not here.

**No completeness gate ships with this file.** Per #113 §8, the row-correspondence
gate lands after population, in the same commit as the first row it can actually
fail on — not in this commit, and not as 35 stub sections.

## The five categories

Put to every row, per [#113](https://github.com/mephistopheles4/stacks/issues/113)'s
resolution:

1. **Weakening** — can the gate be edited to stop failing rather than fixed?
2. **Satisfying the letter** — can the gate pass while the property it names is false?
3. **Routing around** — can the property be violated somewhere the gate does not look?
4. **Vacuous green** — does the check return its best possible answer for its worst possible input?
5. **Decay** — does the row rest on a load-bearing claim measured once and never re-measured?

The worked example for category 4 — Vitest 4's `coverage.all` removal scoring an
untested module 100% — is cited, not restated; it lives in `docs/gates.md`'s
amended changed-lines row and is not one of the 35 rows triaged here.

## Rank is not the same thing as flagged

**Settled by [#128](https://github.com/mephistopheles4/stacks/issues/128)**, which
owned the two rules this file had adopted as working answers, and the ordering
question it had left open.

For the deep pass, in the priority order #113 fixed: **1** rows flagged under
*vacuous green*, **2** rows whose gate matches *text rather than structure*,
**3** rows whose gate carries an *allowlist*. A row takes the highest
(lowest-numbered) tier it qualifies for.

**Rule 1 — highest tier wins: confirmed, with the unit named.** Rank is a
*scheduling* device. It decides when a row is first visited, and it never
narrows what gets demonstrated once it is: a row leaves its band with **that
band's category** dispositioned and its other non-clean verdicts still open,
recorded as open rather than closed by the row having been visited. Without
that clause, *deep-passed* would come to mean *one of four exposures
demonstrated* — category 4 arriving in the process instead of in a gate.

**Rule 2 — tier 4 is replaced, not confirmed.** #113's tiers are not a ranking
of the five categories: tier 1 *is* a category, but tiers 2 and 3 are
**mechanisms** (text-matching, an allowlist). So the ranking ranks **how
well-specified the demonstration is** — which is right for scheduling and wrong
for triage, and that single fact explains both gaps triage found. *Asserted
outside `gates/`* is neither a category nor a mechanism but a fact about
**location**, so it leaves the ranking and becomes a **separate per-row axis**,
recorded beside the five verdicts and used as a tiebreak within a band.

Two consequences, both improvements. **G16** — clean on all five, ranked only
for location — leaves the deep pass entirely, because it has nothing to
demonstrate. **G18** loses rank 4 and joins the decay group, which is where its
actual work always was: its rank had been pointing at the wrong job. The
ranking's invariant is now unqualified — **ranked implies flagged**, with no
exception clause to carry.

**Rule 3 — the unranked flagged rows are the last band, ordered by what they
need.** A *decay* flag is discharged by **re-measuring a claim, not by planting
a defect**, so decay rows are cheap, mechanical and independent of one another:
they go first, by row number — **G12, G18, G24, G34** — and three of those four
already carry their answer in `docs/gates.md`'s own prose, which makes their
deep pass a confirmation rather than an experiment. **G6** goes last. Its
routing-around nomination names no mechanism and no measurable claim, so its
demonstration has to be designed from scratch: it costs the most and buys the
least, which is the honest reason to schedule it last rather than first.

**The deep pass's membership is the flagged set, not the ranked set.** Rank
orders it; it does not define it.

---

## Summary

**35 rows triaged, 0 not reached.**

**20 rows carry a rank:**

| Rank 1 — vacuous green | Rank 2 — text over structure | Rank 3 — allowlist |
| --- | --- | --- |
| G17, G20, G21, G22, G23, G25, G26, G31 | G2, G7, G14, G15, G19, G28, G29, G35 | G1, G10, G13, G30 |

All 20 are flagged, with no exception to state — Rule 2 removed the tier-4
column that used to require one. **G16** was ranked 4 and clean on all five
categories, so it is not deep-pass membership at all; **G18** was ranked 4 and
flagged for decay, so it keeps the flag and loses the rank.

**5 rows carry a flag with no rank** — exposed under weakening, routing around,
or decay outside the ranked shapes: **G6, G12, G18, G24, G34**.

**10 rows found nothing on all five categories**: G3, G4, G5, G8, G9, G11,
G16, G27, G32, G33.

**A correction from the previous revision of this file.** 23 category lines
across 14 rows originally read `not discussed` or `not separately
discussed/flagged` — a third verdict state the contract does not admit. Each
was resolved by re-reading the row's evidence (`docs/gates.md`'s prose where
it exists, the gate's own spec file directly where it does not) rather than
defaulted to `clean` to protect this Summary's count: 19 resolved to `clean`
with a stated reason, 4 resolved to genuine, low-confidence `nominated,
unconfirmed` exposures (G31's routing-around and vacuous-green nominations,
G14's routing-around nomination, G35's decay nomination). None resolved to
*not reached* — every one was assessable from evidence already in the repo.
The only headline change from that resolution is **G31 moving from rank 2 to
rank 1** (its vacuous-green nomination outranks its text-matching one); the
flagged, clean and not-reached totals below are unchanged, because every
resolved line sat inside a row that was already counted correctly on the
other side of the flagged/clean line.

Flagged (20 ranked + 5 unranked) and clean (10) partition all 35 rows.

**Total flagged: 25 of 35.**

**A second correction, this revision.** The previous round left category
bullets stating a *reason* with no *verdict* word in front of it — `related to
the above`, `designed against, explicitly`, `asserted outside gates/
entirely`, and similar — the same defect one level down from the 23-line
round before it. A property check (below) rather than an enumerated list
found **10** such bullets in this file as it stood. Each was given the
verdict its existing reasoning already implied, without rewriting the
analysis: **7 resolved to `exposed`** — G7's Routing around and G19's Routing
around (both historical, fixed), G25's Routing around (historical, fixed),
G28's Vacuous green (historical, fixed), G35's Vacuous green (historical,
fixed), and G15's Weakening and Vacuous green (both current, unresolved);
**1 resolved to `nominated, unconfirmed`** — G26's Satisfying the letter; and
**2 resolved to `clean`** — G19's Weakening (the allowlist it described no
longer stands) and G35's Routing around (distinguishing the property question
from G35's separate Rank 4 / outside-`gates/` classification, which is a
location fact rather than a routing-around finding). **Every total above was
recounted mechanically from the 35 sections as they stand now, not carried
forward from the previous revision** — the flagged and clean sets are
unchanged at 25 and 10, because every corrected line sat inside a row already
on the correct side of that split.

**The verdict-admission check**, run against this revision:

```
unadmitted: 0
```

Every category bullet (or, for a row that merges several categories into one
bullet because one exposure answers all of them, every merged bullet) states
`clean`, `exposed`, or `nominated, unconfirmed` before any reasoning.

---

## Band one — the deep pass has run on rank 1

**Commissioned by [#128](https://github.com/mephistopheles4/stacks/issues/128).
Triage nominated; this band demonstrated.** Every rank-1 row was probed by
planting a defect and watching what the gate did. Each carries a **Deep pass**
block under its entry with the plants, the actual runs, a disposition, and an
observed-red line filled **from what was run here** rather than from what
`docs/gates.md` already recorded.

**Eight rows, not the seven #128 names.** G31 moved into rank 1 while that
ticket was open, in the revision above. The band is defined by rank, so it
took the eighth member rather than orphaning it — band two is rank 2, which
G31 had just left.

| Row | Disposition | In one line |
| --- | --- | --- |
| G17 `deploy-branch` | `repaired` | The gate spawns the script, so `--any-branch` baked into `deploy:site` is invisible to it. |
| G20 `public-build-artifact` | `repaired` | The module's verdict is gated; the command's response to it is not. |
| G21 `no-live-network` | *verdict corrected* | Nomination did not survive: both halves re-planted red. Nothing to dispose of. |
| G22 `cover-candidates` | `repaired` | Callers are forced *through* `coverUrls()`; what they do with the result is unwatched. |
| G23 `key-if-present` | cat. 4 *corrected*; cat. 3 `accepted` | Vacuity anchor holds; a second implementation in early-return form still passes. |
| G25 `one-usable-width` | `accepted` | The floor is real at 0.004 and not closable without making a correct packer red. |
| G26 `lookup-recall` | `repaired` | A corpus and its recordings, wrong together, are invisible — which is how it actually happened. |
| G31 `merge-precedence` | `repaired` | The gate never imports the merge. Four defects, 5 of 5 green each time. |

**Two results contradict the triage above**, which is the whole point of a pass
that demonstrates rather than reads: **G31 did not clear** — the entry called it
the lowest-confidence in tier 1 and it produced the band's strongest
demonstration — and **G21 and G23's category-4 nominations did clear**.

### A nomination that does not survive is not dispositioned

⚠️ **The four dispositions presuppose a finding.** G21 exposed the gap: both
re-plants went red, there is no exposure and no remedy to name, and calling that
`repaired` would read as work outstanding. The answer is not a fifth disposition
— #113 refused one, and rightly. It is that **a cleared nomination has its
verdict corrected**, and the demonstration is recorded; dispositions attach to
findings only.

### Cost, which is this band's second output

The two halves of the band were run separately and returned figures that look
contradictory until they are put together, at which point they give the model.
One half saw **near-uniform** cost across four rows, 4–5 minutes each; the other
was **dominated by G31** at roughly twice any of its siblings. The difference is
the state of the evidence: the four uniform rows all carried exposures
`docs/gates.md` already documented, so their plants only had to **confirm**,
while G31 was uncharacterised and needed four plants to establish both that the
vacuity is real *and* that the property survives elsewhere.

> **~2 minutes of orientation per row, plus ~2 minutes per plant. A documented
> exposure needs about two plants; an unconfirmed nomination needs about four.**

⚠️ **Compute is not a cost centre, and the assumption that it would be was
wrong.** The full 636-test suite runs in ~6.5s and file-scoped runs in 0.3–5s, so
plant–run–revert is effectively free and later bands can afford **more** plants
per row than this one used. **Size later bands on reading time and on how many
nominations are unconfirmed — not on suite time, and not on the length of the
`docs/gates.md` section.**

⚠️ **#128's own cost warning pointed at the wrong rows.** It flagged G25 as
expensive because it is asserted in `packages/site/src/shelf/` and "rows riding
`pnpm smoke:render` drive puppeteer". G25's two specs are in-process unit tests
— `smoke:render` appears in `packages/site/src/shelf/shelf-width.test.ts` only in
comments — and G25 came in at the cheap end. The rows that actually drive
puppeteer are G16 and G35, both in later bands.

**Totals:** eight rows, ~63 minutes, 35 vitest invocations. ⚠️ **Both figures are
agent-reported, not instrumented** — self-accounted wall-clock summed across the
band's two halves, in the same spirit as G20's unobserved exit code above. The
*shape* of the model (orientation is fixed, plants are cheap, unconfirmed
nominations cost roughly double) is what later bands should carry; the minutes
are an order of magnitude, not a measurement.

**17 flagged rows remain**: rank 2 (8), rank 3 (4), and the unranked band (5).

**Recounted mechanically from the sections as they stand**, not carried forward
from the prose above — the discipline `aaf7347` established after the summary
went wrong four times in a row:

```
Rank: 1     8
Rank: 2     8
Rank: 3     4
Rank: 4     0
Rank: none 15
            --
            35
```

Twenty ranked, fifteen unranked, thirty-five rows. **`Rank: 4` is zero by
construction now** — G16 and G18 were its only members and both moved when Rule 2
retired the tier.

---

## Band three — the deep pass has run on rank 3

**Commissioned by [#133](https://github.com/mephistopheles4/stacks/issues/133).**
Four rows, all flagged for carrying an *allowlist*, all probed the way band one
probed rank 1: plant the defect, run the suite, read what the gate did. Each
carries a **Deep pass** block under its entry.

| Row | Disposition | In one line |
| --- | --- | --- |
| G1 `adapter-boundary` | cat. 1 `accepted`; cat. 3 `repaired` | The rot-checks hold; a vault note read through `node:child_process` is not a vault read to this gate. |
| G10 `cover-path` | cat. 1 `accepted`; cat. 3 *corrected*, `repaired` | Three of four re-implementations of the original defect pass suite-wide, including the same Windows bug spelled `.at(-1)`. |
| G13 `no-third-party-material` | cat. 1 `accepted`; cat. 3 `repaired` | `docs/images/` is pinned and holds; `fixtures/vault/Library/covers/` is still a directory, and `.svg` is not a binary here. |
| G30 `library-seam` | cat. 1 and cat. 2 *corrected*, `gated` | A new field wired end-to-end through the frontmatter contract never reaches `library.json`, 636 of 636 green. |

**#133 asked two questions and they came back with opposite answers.** *Does each
entry still name something real, and would the gate notice if it stopped?* —
**yes, every time.** *Can the gate be satisfied by editing its exemption list
rather than by fixing the code?* — **yes, every time, and that is not where the
damage is.** Three of these four allowlists are exactly the artifact
`CONTRIBUTING.md` asks for, and the exposures this band found are all one step to
the side: not the entries, but what the list is a list **of**.

### Rule: tier 3 names a mechanism, not category 3

[#133](https://github.com/mephistopheles4/stacks/issues/133) says twice that a
row leaves this band with its **category-3** verdict dispositioned. All four register entries put the allowlist finding under
**Weakening** — category 1 — and they are right to: widening an exemption is
*editing the gate*, which is category 1's own text.

Band one already settled the general form of this when it retired tier 4:
*"#113's tiers are not a ranking of the five categories — tier 1 is a category,
tiers 2 and 3 are mechanisms."* Tier 3 says the gate is *written with an
allowlist*; it does not say which of the five an exposure lands in. **So this
band dispositions every non-clean verdict its plants reached and privileges no
category** — which is how three of these rows come away with a category-1
disposition and a category-3 one, and G30 with a category-1 and a category-2.

### Rule: a correction runs in both directions

Band one established that a nomination which does not survive has its **verdict
corrected** rather than dispositioned. Every one of its corrections ran the same
way: `nominated, unconfirmed` → `clean`.

⚠️ **This band made two corrections in the other direction** — G10's *Routing
around* and G30's *Satisfying the letter*, both recorded `clean` in triage, both
`exposed` under a plant. That direction is the one only a demonstration can
reach: a triage verdict of `clean` is a claim nobody goes back to, and G30's was
`clean` on the reasoning that its fixture is "fully-populated" — true on the day
it was written and held by nothing since.

### Rule: `gated`, used for the first time, reads forward

All four of band one's dispositioned rows had a repaired history, so `repaired`
covered them and the other three dispositions went unexercised. **G30 has no
history at all** — no historical defect, no observed-red line ever recorded in
`docs/gates.md` — and its exposure is live, current, and closable in about three
lines of spec.

`repaired` would be false, `accepted` claims a remedy is unavailable when one is
sitting there, and `declined` is a decision this band has no authority to make.
That leaves `gated`, read **forward**: *the remedy is a gate change, it is named
here, and it is owed to the spec* — the same tense band one's `repaired` rows
already used when they named remedies nobody had built. Recorded as a reading
rather than assumed, and handed to
[band four](https://github.com/mephistopheles4/stacks/issues/134) and
[#120](https://github.com/mephistopheles4/stacks/issues/120) to confirm or
overturn.

### The confirming half, which came back clean

Every reverse-assert in the band was made to fire, and every historical defect
these rows name was re-planted and still goes red:

- **G1** — deleting `packages/core/src/watch.ts` from `ALLOWED` fails *"lets no
  unlisted file reach the filesystem directly"*; adding
  `packages/core/src/library.ts`, which does not import `fs`, fails *"keeps every
  allowlist entry on a file that still imports fs"*; the historical
  `import { readFileSync } from 'node:fs'` in
  `packages/site/src/shelf/scene.ts` goes red.
- **G10** — `cover.split('/').pop()` restored to `packages/core/src/enrich.ts`,
  which is the original defect verbatim, goes red naming that file; the
  stale-entry loop goes red the moment `MAY_IMPORT_BASENAME` has anything to
  iterate.
- **G13** — a second image in `docs/images/` goes red; `git rm --cached` on
  `packages/site/public/og.png` goes red.
- **G30** — a bogus entry in `NOT_PUBLIC` goes red; a key emitted by
  `toLibraryBook` that is neither a record field nor derived goes red.

⚠️ **So the rot half of every allowlist here works, and none of them checks the
one thing that matters: whether a permission was warranted.** Demonstrated on the
two lists where granting is cheapest. G1: a `readFileSync` vault read added to
`packages/core/src/library.ts` plus an `ALLOWED` line reading *"Reads the built
index back for a fast rebuild path. Not note data"* — **636 of 636 green**, both
reverse-asserts satisfied, because the file does exist and does import `fs`. G10:
a `basename` import plus one entry in `MAY_IMPORT_BASENAME` — **636 of 636
green**. Both are `accepted`. `CONTRIBUTING.md` asks for *"a written
justification and a reviewable one-line diff"* and that is precisely what these
produce; no mechanical check reads a justification, and the remedy is review.

### Cost

**Four rows, ~26 vitest invocations, ~35 minutes.** Band one's model held without
adjustment: the three rows carrying documented exposures confirmed in two or
three plants each, and **G30 — the only row whose exposure was unconfirmed —
needed four**, which is the ratio band one predicted.

[#133](https://github.com/mephistopheles4/stacks/issues/133) asked this band to
spend its slack on more plants rather than on finishing early, and it did: **22 plants over four rows, at 6.5 vitest invocations per row
against band one's 4.4**. Three of the four rows' sharpest findings came from
the *extra* plants —
G10's `.at(-1)`, G13's `.svg`, G30's end-to-end field — none of which the first
two plants on those rows would have reached. Compute remains a non-issue: the
full suite is ~6.3s and file-scoped runs are under 1s.

⚠️ **Band one merged while this band's plants were running.** Every plant here was
run against `43445f0`; band one's PR
[#131](https://github.com/mephistopheles4/stacks/pull/131) landed as `e372e2d`,
which changes **this file and nothing else** — no gate spec, no source, and the
same 636-test baseline on both commits. The prose above is written against
`e372e2d`; the numbers below were measured one commit earlier and carry over
unchanged.

⚠️ **Four rows gain an observed-red line here and `docs/gates.md` does not know
it** — G30's is the first that row has ever had. That is deliberate and it is
band one's precedent: PR [#131](https://github.com/mephistopheles4/stacks/pull/131)
changed this file and nothing else. A band writes the register; **carrying the
evidence back into the scoreboard is [#120](https://github.com/mephistopheles4/stacks/issues/120)'s**,
in the commit that lands the remedies, so the file that scores this repo's rules
is edited once rather than four times by four sessions writing it concurrently.

**13 flagged rows remain**: rank 2 (8) and the unranked band (5).

---

## Invariants → gates

### G1 — `adapter-boundary`

**Gate:** [`gates/adapter-boundary.test.ts`](../gates/adapter-boundary.test.ts)
**Date:** 2026-08-11

- **Weakening** — exposed. The gate *is* an allowlist ("each entry justified,
  each reverse-asserted"), and every allowlist entry is a permission by
  `CONTRIBUTING.md`'s own rule. `docs/gates.md` records the reverse-assert
  catching both a stale entry and a dropped one on the same change, which is
  the mitigation, not a closure.
- **Satisfying the letter** — clean. Demonstrated red-capable by perturbation.
- **Routing around** — nominated, unconfirmed. Invariant 4 bars vault access
  outside `packages/core/src/adapters/`; nothing in `docs/gates.md` says
  whether a dynamic `import()`, a `child_process` shell-out, or a non-`fs` I/O
  API would still be caught by whatever sweep backs this allowlist. Not
  demonstrated either way.
- **Vacuous green** — clean, same red-capable evidence.
- **Decay** — clean.

`docs/gates.md` already answers weakening and the demonstration, in its
2026-08-01 note ("G1 caught both halves of this change without being asked")
and the "G1, G3, G6 and G7 were green on arrival" paragraph. Routing around is
not addressed there.

**Observed-red line:** "an `fs` import added to `scene.ts`" (perturbation, per
the G1/G3/G6/G7 paragraph).

**Rank:** 3 (allowlist).

**Deep pass (2026-08-11, band three) — category 1 disposition: `accepted`;
category 3 verdict confirmed, disposition: `repaired`.**

The historical defect re-plants red — `import { readFileSync } from 'node:fs'`
at the top of `packages/site/src/shelf/scene.ts` fails *"lets no unlisted file
reach the filesystem directly"* — and both rot-checks fire on demand: deleting
`packages/core/src/watch.ts` from `ALLOWED` fails the same assertion, and adding
`packages/core/src/library.ts`, which imports no `fs`, fails *"keeps every
allowlist entry on a file that still imports fs"*. The docblock's *"without (2)
the allowlist only ever grows"* is true and watched.

**Category 1 is real and is the shape the repo asked for.** A `readFileSync`
vault read added to `packages/core/src/library.ts`, plus one `ALLOWED` line
reading *"Reads the built index back for a fast rebuild path. Not note data"*,
leaves **636 of 636 green**. Both reverse-asserts pass because they are true —
the file exists, and it does import `fs`. They check an entry's **facts**; the
**warrant** is prose, and no gate reads prose. `accepted`: `CONTRIBUTING.md`
specifies exactly this artifact, and the control is review.

⚠️ **Category 3 was `nominated, unconfirmed` and it survives, by two separate
mechanisms.** Triage asked whether a dynamic `import()`, a `child_process`
shell-out or a non-`fs` I/O API would still be caught. Both plants stay green
suite-wide:

- **A vault note read through `node:child_process`.** An exported
  `readNote(notePath)` in `packages/core/src/library.ts` calling
  `execFileSync('cat', [notePath], { encoding: 'utf8' })` — outside
  `packages/core/src/adapters/`, not on the allowlist — leaves **636 of 636
  green** and `tsc --noEmit` clean. Invariant 4 is violated and the gate that
  exists for invariant 4 has no verdict, because `FS_IMPORT` is a list of
  specifiers and `node:child_process` is not on it. The regex is careful about
  *how* `fs` is reached and silent about *what else reaches a file*.
- **A tracked `.mjs` under `packages/`.** `filesUnder('packages', ['.ts'])`
  matches on extension, so `packages/site/astro.config.mjs` — a real, tracked
  file — may import `node:fs` freely: **636 of 636 green**. `.mjs`, `.cjs`,
  `.mts` and `.cts` are all outside the sweep, and one of those extensions is
  already in the tree.

**Remedy (named, not built):** two, and they are independent. Widen
`filesUnder`'s extension list to the four ESM/CJS spellings, which costs one
argument. Then extend the detector past `fs` — `node:child_process` is the
demonstrated hole, and the honest framing is that the gate currently checks *"no
unlisted file imports `fs`"* while the docblock claims *"nothing outside the
adapters may read or write vault files directly"*, which is the wider property.
Either narrow the docblock to what is checked, or widen the check; a gate whose
stated scope exceeds its real scope is band one's G31 finding arriving here.

**Observed-red (this pass):** `fs` in `scene.ts` fails *"lets no unlisted file
reach the filesystem directly"*; `watch.ts` removed from `ALLOWED` fails the
same; `library.ts` added to `ALLOWED` fails the stale-entry check. The
`child_process` read and the `.mjs` import both leave 636 of 636 green.

### G2 — `public-build`

**Gate:** [`gates/public-build.test.ts`](../gates/public-build.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist in this row itself.
- **Satisfying the letter** — exposed, and `docs/gates.md` says so directly:
  "The existing `gate:public` is a good gate that cannot see three things. It
  greps the *contents* of *text* files... a private value in a permitted field
  passes by construction, and a filename is never read at all." Four of the
  five gaps this describes were closed by the G2-in-full extensions; the
  canary rule (no note bodies) is still a text match by construction.
- **Routing around** — exposed, historically real and largely closed: orphan
  covers, wishlist serialization and protocol-relative `cover:` URLs were all
  routes the original grep missed, all now covered under "G2 in full."
- **Vacuous green** — clean; the canary is asserted present, "so it still
  cannot pass vacuously."
- **Decay** — clean.

`docs/gates.md` already answers this extensively — the "G2 in full" section and
"G2 was red on the orphan-cover assertion."

**Observed-red line:** "by disabling the prune and watching the gate fail"
(orphan covers); the relative `og:image` restored to reproduce rule 5's defect.

**Rank:** 2 (text over structure).

### G3 — `bad-note`

**Gate:** [`gates/bad-note.test.ts`](../gates/bad-note.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean; demonstrated red-capable by perturbing
  the missing-title branch to `not-a-book`, per the G1/G3/G6/G7 paragraph.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; same red-capable demonstration.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers the demonstration only. Nothing found beyond
it.

**Observed-red line:** "the missing-title branch downgraded to `not-a-book`."

**Rank:** none.

### G4 — `hand-edited-notes`

**Gate:** [`gates/hand-edited-notes.test.ts`](../gates/hand-edited-notes.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean. "G4 was red on arrival" is evidence *for*
  the gate, not against it — it caught `updateBook`'s scalar-vs-flow-collection
  gap (`author: [A, B]` silently replaced) the moment it was written, with no
  mutation required.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; the same on-arrival catch is a strong
  non-vacuity signal for the gate itself.
- **Decay** — clean; no load-bearing number.

That is a defect in the code the gate protects, already fixed — not a flaw in
the gate's own mechanism.

`docs/gates.md` already answers this — the "G4 was red on arrival" paragraph.

**Observed-red line:** the pre-fix defect itself: `author: [Marisol Vane, Tomas
Ek]` replaced wholesale, discovered without a planted mutation.

**Rank:** none.

### G5 — `vault-is-truth`

**Gate:** [`gates/repo-hygiene.test.ts`](../gates/repo-hygiene.test.ts) (shared with G13)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean. `docs/gates.md` mentions G5 only in
  passing under G13's section — "G5 pins the same seam from the other side,
  asserting that no ignore rule names `og.png` while everything else
  `publish()` stages is ignored" — which is a real, working assertion, not an
  exposure.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; no basis found.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers this in the sentence above; nothing further
found.

**Observed-red line:** not recorded for G5 specifically.

**Rank:** none.

### G13 — `no-third-party-material`

**Gate:** [`gates/repo-hygiene.test.ts`](../gates/repo-hygiene.test.ts) (shared with G5)
**Date:** 2026-08-11

- **Weakening** — exposed, and this is the row `docs/gates.md` uses to explain
  the category generally: "a *directory* is a standing permission, where every
  other line here names a file." The fix pins `docs/images/` to exactly
  `shelf.png`; the brand art went in as four filenames rather than a directory
  entry, for the same reason.
- **Satisfying the letter** — clean; demonstrated three ways.
- **Routing around** — exposed and current, not merely historical: "a local
  `pnpm test` before `git add` passes over an untracked binary, because G13
  reads what git tracks." The mitigation is procedural ("stage, then run"),
  not gated.
- **Vacuous green** — clean.
- **Decay** — clean.

`docs/gates.md` already answers all of this extensively (the whole G13
section).

**Observed-red line:** "an unlisted PNG copied in beside the icons;
`git rm --cached` on `og.png`; and the old `packages/site/public/og.png` line
restored to `.gitignore`" (three ways).

**Rank:** 3 (allowlist).

**Deep pass (2026-08-11, band three) — category 1 disposition: `accepted`;
category 3 confirmed and widened, disposition: `repaired`.**

Both of this row's documented repairs hold. A second image staged into
`docs/images/` fails *"keeps docs/images to exactly the generated screenshot"*,
so the filename pin that replaced the directory permission does what the row
says it does. `git rm --cached packages/site/public/og.png` fails *"tracks every
allowlisted brand file"* — the half that catches a permission outliving the file
it was granted for.

⚠️ **The other directory was never pinned, and it is the one that matters.**
`GENERATED_BINARY_DIRS` still holds `fixtures/vault/Library/covers/`, and a PNG
staged into it is **636 of 636 green** — no assertion looks at the filename, the
byte count, or where the bytes came from. `docs/gates.md` uses this exact row to
explain the category (*"a directory is a standing permission, where every other
line here names a file"*), then fixed one of its two directories. The unfixed one
is where a downloaded cover already sits on disk in the shape a contributor would
copy. `accepted` for category 1: pinning it by filename would fight
`scripts/make-fixture-covers.ts`, whose whole job is emitting new ones, so the
one-line-diff control is doing the work here as designed.

⚠️ **Category 3 was already `exposed` for the untracked-binary gap; a second and
sharper mechanism sits beside it.** `BINARY` enumerates fifteen raster and
container extensions and **names no vector and no font format**. A hand-written
`packages/site/src/assets/provider-marks/oreilly.svg` and a
`packages/site/public/fonts/inter.woff2`, both staged, leave **636 of 636
green**. This is not hypothetical shape: the repo already tracks six `.svg`
files, so a seventh raises nothing anywhere, and a licensed icon set or a
webfont is third-party material by exactly the argument
`fixtures/README.md` makes about cover art. The row's own text is *"an entry
here is a claim about provenance, never about file type"* — and the sweep that
decides what needs a claim is a claim about file type.

**Remedy (named, not built):** add `svg`, `woff`, `woff2`, `ttf`, `otf`, `eot`
to `BINARY`, which turns the six committed SVGs into six named brand entries and
makes the next one a decision — the `poweredby-google.png` treatment applied to
the format that currently has none. For the fixture-covers directory, the
provenance claim can be made mechanical rather than pinned: assert every file
under it is byte-reproducible by `scripts/make-fixture-covers.ts`, which is what
the directory entry already asserts in prose.

**Observed-red (this pass):** a second image in `docs/images/` fails the
exactly-`shelf.png` assertion; `og.png` untracked fails the brand-file check. A
PNG copied into `fixtures/vault/Library/covers/`, and a staged `.svg` and
`.woff2`, each leave 636 of 636 green.

### G14 — `commands`

**Gate:** [`gates/commands.test.ts`](../gates/commands.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean.
- **Satisfying the letter** — exposed, real, and one of the file's own
  canonical instances: the original regex searched for `\bname\b` anywhere in
  the Commands section, so a new `covers` command passed as documented purely
  because `status`'s description reads "covers still missing." Found by the
  next command added, not by the gate itself. Now anchored to line start.
- **Routing around** — nominated, unconfirmed. Read directly in
  `gates/commands.test.ts`: `cliCommands()` extracts subcommands with a single
  regex (`.command('name')`) against `packages/cli/src/index.ts`, and
  `packageScripts()` reads only the root `package.json`. A command registered
  outside that literal call shape, or a script living in a workspace
  package's own `package.json` rather than the root, would not be swept.
  Not corroborated by `docs/gates.md`; this triage's own reading of the spec.
- **Vacuous green** — clean. The spec's first test (`expectFound` on both
  extracted lists, plus a length floor on the Commands section) exists
  specifically to catch a regex that stops matching and would otherwise let
  every comparison below pass against nothing.
- **Decay** — clean.

`docs/gates.md` already answers the satisfying-the-letter finding — the
2026-08-01 note "G14 had a false negative, found by the next command added."
Routing around and vacuous green come from reading `gates/commands.test.ts`
directly; `docs/gates.md` carries no prose on either.

**Observed-red line:** the `covers` command passing falsely against the
`\bname\b` regex (real defect, not a planted mutation).

**Rank:** 2 (text over structure) — this row and G19, G22 are the three places
`docs/gates.md` logs "a gate that matches prose matches anything."

---

## Contract seams → gates

### G6 — `site-core-imports`

**Gate:** [`gates/site-core-imports.test.ts`](../gates/site-core-imports.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean; demonstrated red-capable ("an inline
  `import { type X }`").
- **Routing around** — nominated, unconfirmed. The seam bars a *value* import
  of `@stacks/core` from site code; nothing in `docs/gates.md` says whether a
  re-export chain or a dynamic `import()` string would still be caught by
  whatever static sweep this gate runs.
- **Vacuous green** — clean, same demonstration.
- **Decay** — clean.

`docs/gates.md` already answers the demonstration; the routing-around question
is not addressed there.

**Observed-red line:** "an inline `import { type X }`" (perturbation).

**Rank:** none (flagged, unranked — the routing-around nomination is not one
of the four ranked shapes).

### G7 — `astro-no-logic`

**Gate:** [`gates/astro-no-logic.test.ts`](../gates/astro-no-logic.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean.
- **Satisfying the letter** — exposed, current and self-acknowledged by the
  repo's own CodeQL triage: `js/bad-tag-filter` fired on `SCRIPT_BLOCK` in this
  spec, flagging the regex as approximate. `docs/gates.md` records that the
  miss it warns about already throws (line 135) and dismisses the finding as
  "used-in-tests" rather than closing the underlying approximation — a live,
  named residual, not a historical one.
- **Routing around** — exposed; the same limit, from the other side: "Fixing it
  properly means an HTML parser dependency... to protect against a first-party
  commit," explicitly declined.
- **Vacuous green** — clean; the miss throws rather than passing silently.
- **Decay** — clean.

`docs/gates.md` already answers this — the CodeQL triage §2 worked example and
the G1/G3/G6/G7 red-capable paragraph.

**Observed-red line:** "an arrow function in an `.astro` script" (perturbation).

**Rank:** 2 (text over structure) — the CodeQL finding is squarely a
regex-approximation exposure, not fully closed.

### G8 — `frontmatter-contract`

**Gate:** [`gates/frontmatter-contract.test.ts`](../gates/frontmatter-contract.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean. "G8 observed red on `shelf_order`" is the
  gate correctly catching a documented-but-unenumerated key, not a flaw in its
  own mechanism.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; the same catch is a non-vacuity signal.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers this — the 2026-08-01 note pairing G8 and G9.

**Observed-red line:** "`shelf_order`, which the parser read and the prose
described but the documented enumeration never listed."

**Rank:** none.

### G9 — `env-contract`

**Gate:** [`gates/env-contract.test.ts`](../gates/env-contract.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean, for the same reason as G8 — the gate
  caught the gap it exists to catch.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; the same catch is a non-vacuity signal.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers this — the same 2026-08-01 note.

**Observed-red line:** "`PORT`, read by `scripts/dev-watch.ts` and documented
nowhere."

**Rank:** none.

### G19 — `constitution-scoreboard`

**Gate:** [`gates/constitution-scoreboard.test.ts`](../gates/constitution-scoreboard.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean today; related to hole 1 below, but the directory
  scoping it used has been replaced with a filesystem check, so no allowlist
  stands here now.
- **Satisfying the letter** — exposed, historical, fixed, and this is the
  row's own headline: it "shipped with three holes of its own, all found by
  review before merge" — a spec-path allowlist scoped to three directory
  prefixes that missed G10's real path; a gate counted as scored if its
  filename appeared *anywhere* in the file, paragraphs included; and a
  citation counted if the words "invariant N" appeared in *any* cell of *any*
  row. The third is explicitly "verbatim the defect logged above for G14."
- **Routing around** — exposed, historical, fixed; the directory-prefix hole
  above is exactly this shape: a real path (G10's `covers/cover-path.test.ts`)
  sat outside the allowlisted roots and was invisible to the checker.
- **Vacuous green** — clean; "observed red eight ways," and all three holes
  were "verified by mutation, not by reading."
- **Decay** — clean; this row is the mechanism other rows lean on to avoid
  decay, not itself shown to have decayed.

`docs/gates.md` already answers this exhaustively — the whole "three holes"
section.

**Observed-red line:** eight listed — a sixth invariant with no row, a row
citing invariant 9, a renamed spec path, an unscored gate file, a status
symbol outside the key, a duplicated row number, a deleted row leaving a gap,
and the `## Invariants` heading renamed.

**Rank:** 2 (text over structure) — this is the second of the three rows
`docs/gates.md` logs "a gate that matches prose matches anything" against.

### G29 — `doc-links`

**Gate:** [`gates/doc-links.test.ts`](../gates/doc-links.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — exposed and self-audited: the code-blanking pass
  (fenced blocks, then inline spans) was measured, not assumed, for what it
  might hide — "the only links it hides are the `x.md` syntax examples in this
  file and in `docs/research/splitting-the-long-docs.md`," both prose about
  the gate rather than real routes.
- **Routing around** — exposed and current, stated in the spec's own doc
  comment: the link finder reads only inline `](target)` links, "which is the
  only link form this repo actually uses... The honest limit is that a form
  nobody writes here is a form this does not see." A reference-style
  `[text]: target` definition or an HTML `<a href>` would not be seen.
- **Vacuous green** — clean; guarded by an `expectFound` floor.
- **Decay** — exposed and self-corrected in the file's own prose: "the first
  draft of this paragraph carried three exact counts and two of them were
  false one edit later" — a load-bearing count that decayed inside the very
  paragraph explaining the category, now removed from prose and kept only as
  the spec's own numeric floor.

`docs/gates.md` already answers all four exposures — lines 239–296 of that
file.

**Observed-red line:** "a one-character typo planted in `docs/plan.md`'s link
to `agents/issue-tracker.md#wayfinding-operations`, then reverted"; the
file-existence half "went red on its own accord" on the `` `](./x.md)` ``
inline-code false positive, pre-fix.

**Rank:** 2 (text over structure) — the unaddressed link-form gap is a live
routing-around risk, but the strongest documented, mechanism-level shape is the
regex's text-matching limit.

---

## Rows with no dedicated narrative in `docs/gates.md`

G30–G34 carry only their table-row description in `docs/gates.md`; none has a
"G30 observed red" style paragraph. Triage below reads the spec file itself
where the table row alone gave no basis.

### G30 — `library-seam`

**Gate:** [`gates/library-seam.test.ts`](../gates/library-seam.test.ts)
**Date:** 2026-08-11

- **Weakening** — exposed, mild: `NOT_PUBLIC` (currently one entry,
  `sourcePath`) is a named exclusion allowlist for what a public build may
  drop. The spec's own doc comment requires a reason for any addition and
  reverse-asserts it — "strips exactly the named exclusions... and nothing
  else" — the same shape G1 uses, well-guarded but still a permission list.
- **Satisfying the letter** — clean; the spec builds a fully-populated fixture
  record specifically so a missing key cannot hide behind an unexercised
  branch.
- **Routing around** — clean. Read in `gates/library-seam.test.ts`: a third
  test ("traces every shipped key back to a record field or a named derived
  one") checks every key `toLibraryBook` actually produces against `FULL`'s
  fields plus the named `DERIVED` set, both directions — so a key reaching
  `library.json` by some route other than the enumerated `BookRecord` fields
  would be caught, not merely a field that fails to reach it.
- **Vacuous green** — clean; the fixture is deliberately unrealistic ("a
  record with a gap in it proves nothing about the key that was missing").
- **Decay** — clean. "Seven new fields crossed this seam in one effort" is a
  historical count nothing else rests on, not a load-bearing claim.

`docs/gates.md` carries no elaboration beyond the table row; the weakening,
routing-around and decay findings all come from reading `gates/library-seam.test.ts`
directly.

**Observed-red line:** not recorded.

**Rank:** 3 (allowlist).

**Deep pass (2026-08-11, band three) — categories 1 and 2 verdicts corrected,
disposition: `gated`.** ⚠️ **The band's strongest finding, and it is this row's
own stated purpose failing.**

**Category 2 read `clean` and is `exposed`.** The verdict rested on *"the spec
builds a fully-populated fixture record specifically so a missing key cannot hide
behind an unexercised branch"* — which describes `FULL` on the day it was
written and is held by nothing since. **Every field of `BookRecord` except
`sourcePath`, `title`, `status` and `tags` is optional**, so `const FULL:
BookRecord` type-checks with any number of fields absent, and *"carries every
record field into a local build"* computes its `missing` set from
`Object.keys(FULL)` — the fixture, never the type.

Planted end to end, as the merge would actually do it: `translator` added to
`BookRecord`, to `FRONTMATTER_CONTRACT`, to `parseNote` as a `keyIfPresent`
line, and to `CLAUDE.md`'s key enumeration — and **not** to `toLibraryBook` and
**not** to `FULL`. Result: **636 of 636 green**, `tsc --noEmit` clean, and **G8
(`frontmatter-contract`) passes it in all three directions**, which is correct —
G8's job stops at the parser. The field reaches the vault and reaches no build.

⚠️ That is verbatim what this gate's own docblock says nothing else held: *"the
merge takes the field into the vault, the shelf never sees it, and every test
still passes."* It is true today with the gate in place. The vacuity anchor does
not help — `Object.keys(FULL).length >= 24` against a `FULL` of exactly 24 keys
is satisfied at its own boundary and cannot notice a twenty-fifth field.

**Category 1 read `exposed, mild` for `NOT_PUBLIC` and the mild list is the
wrong one.** `NOT_PUBLIC` is genuinely reverse-asserted — adding `rating` to it
fails *"strips exactly the named exclusions from a public build"*. **`DERIVED` is
not asserted in either direction.** A name in it that the build never emits is
absorbed silently (`'shelfSlot'` added to `DERIVED` alone: 636 of 636 green), and
it converts the third assertion into a one-line dismissal: emitting an
unexplained `shelfSlot` key from `toLibraryBook` fails *"traces every shipped key
back to a record field or a named derived one"*, and adding `'shelfSlot'` to
`DERIVED` returns the suite to **636 of 636 green** with `library.json` still
carrying an invented key. The gate names two lists, guards one, and the entry
called the guarded one mild.

**Routing around is confirmed `clean`, and narrowly.** Both writers —
`packages/core/src/publish.ts:78` and `packages/cli/src/index.ts:141` — go
straight from `buildLibrary` to `JSON.stringify` with no post-hoc key injection,
so a key cannot enter the artifact behind the gate's back. The hole is on the
**record** side, not the artifact side, which is why the third assertion looked
sufficient.

**Remedy (named, not built):** assert `FULL` against the type rather than
trusting it — the mechanical form is a
`Record<keyof BookRecord, true>` companion, which makes a new optional field a
compile error in this file instead of a silent pass, and retires the `>= 24`
anchor along with it. Then give `DERIVED` `NOT_PUBLIC`'s treatment: assert every
name in it is a key the build actually emits, which is the same reverse-assert
G1 and G10 already carry and the reason their stale entries cannot accumulate.
Both are existing-gate changes; no new row.

**Observed-red (this pass) — the first this row has ever had:** `rating` added to
`NOT_PUBLIC` fails the strips-exactly assertion; a `shelfSlot` key emitted from
`toLibraryBook` fails the key-trace assertion. A `translator` field carried
through the type, the contract, the parser and `CLAUDE.md` but not into
`toLibraryBook` leaves 636 of 636 green; so does a `DERIVED` entry naming a key
nothing emits, and so does the `shelfSlot` key once `DERIVED` names it.

### G31 — `merge-precedence`

**Gate:** [`gates/merge-precedence.test.ts`](../gates/merge-precedence.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; read in `gates/merge-precedence.test.ts` — a direct
  table-vs-table comparison, no exemption list.
- **Satisfying the letter** — nominated, unconfirmed. The spec parses a
  Markdown table out of `docs/spec/metadata-merge.md` to compare against
  `precedence.ts`. G19 shipped with a bug of exactly this shape — reading the
  wrong table cell because a column shifted — in a different file. Nothing in
  `docs/gates.md` or the spec's own comments states this parsing has been
  probed for the same failure; recorded as suspicion only, not evidence.
- **Routing around** — nominated, unconfirmed. Every assertion compares the
  exported `MERGED_FIELDS` / `FIELD_ORDER` / `DEFAULT_ORDER` constants against
  the spec — none of the four tests reads the merge function itself. If the
  code that actually merges providers ever stopped consulting those exports
  (a hardcoded order inlined instead, or a second copy), this row would keep
  passing on the constants alone while the real behavior diverged — the same
  shape G22's "gated the wrong half" defect took before it was found. Not
  corroborated by `docs/gates.md`.
- **Vacuous green** — nominated, unconfirmed. No `expectFound`-style floor
  guards `MERGED_FIELDS` or `FIELD_ORDER`. If either were emptied by a
  refactor, "documents every field the merge actually merges" would iterate
  zero fields and pass, and "implements the order each exception row
  documents" would loop zero times and pass — the file's own `for (const
  [field, order] of Object.entries(FIELD_ORDER))` has no companion assertion
  that the set it iterates is non-empty.
- **Decay** — clean. The one hardcoded real-world string (`"Health, Mind &
  Body"`, Apple's category text) would fail loudly if the provider's wording
  changed, not decay silently — the opposite of this category's shape.

`docs/gates.md` carries no elaboration beyond the table row; every finding
above comes from reading `gates/merge-precedence.test.ts` directly, and the
two nominations are this triage's own, not corroborated by a citation.

**Observed-red line:** not recorded.

**Rank:** 1 (vacuous green) — the empty-set nomination now takes priority over
the text-matching one; both are nominated, unconfirmed, and this is the
lowest-confidence entry in tier 1.

**Deep pass (2026-08-11, band one) — disposition: `repaired`.**

⚠️ **It did not clear. Both nominations are confirmed, and the result is sharper
than the entry above phrases it: the gate row is vacuous, and the property is
held instead by `packages/core/src/metadata/precedence.test.ts` — a unit spec
with no scoreboard row.** G31 returned 5 of 5 green against three separate
defects that each break the merge:

- Dropping `description` from `MERGED_FIELDS` — G31 green; four failures
  elsewhere.
- Emptying `FIELD_ORDER` — G31 green; five failures, **every one** in
  `precedence.test.ts`.
- Bypassing `FIELD_ORDER` in the merge loop (`for (const source of DEFAULT_ORDER)`),
  which is verbatim the class of bug the file's own docblock records having
  shipped — G31 green; the same five.
- Dropping `publisher` from `MERGED_FIELDS` — **one failure in the entire
  repository**, in `precedence.test.ts`. The merge silently stops merging a
  contract field and exactly one test notices; none of them a gate.

The mechanics were confirmed by inspection as well as by planting. The gate
imports `DEFAULT_ORDER`, `FIELD_ORDER` and `MERGED_FIELDS` and never imports the
merge, so no assertion in it can observe what the merge does: the first test
*filters* `MERGED_FIELDS`, so a shorter list stays `[]`; the second iterates
`Object.entries(FIELD_ORDER)`, so empty means zero iterations; the third asserts
`not.toContain`, which an empty object satisfies more easily still. Only the
fourth carries a floor, and it guards the document's side rather than the code's.

⚠️ **The gate's own docblock over-claims, in the direction that matters.** It
opens *"the merge decides which provider wins each field"* and promises red
*"when the document names an order the code does not implement"* — but it
compares two tables. It is red when the constants disagree with the document and
green when the merge stops reading the constants. A gate whose stated scope
exceeds its real scope is this map's own subject matter, found inside a gate the
map is auditing.

**Remedy (named, not built):** two additions to `gates/merge-precedence.test.ts`,
because the plants split cleanly across them. **(1)** An `expectFound`-style
non-emptiness floor on `MERGED_FIELDS` and `Object.keys(FIELD_ORDER)`, asserting
the sets both loops iterate are non-empty and of their expected size — this alone
kills the empty-`FIELD_ORDER` plant. **(2)** A behavioural assertion that calls
the merge itself: build a contributors map holding a distinguishable value for
each of the four providers and, for every field documented in
`docs/spec/metadata-merge.md`, assert the merged result carries the value
belonging to the provider **the document** ranks first. That kills the other
three, none of which a constants-only comparison can see, and it moves the row
from *the two tables agree* to *the merge implements the table*. Existing gate,
no new row.

**Observed-red (this pass):** nothing turned G31 red. Emptying `FIELD_ORDER`,
bypassing it in the merge, and dropping either `description` or `publisher` from
`MERGED_FIELDS` all left `gates/merge-precedence.test.ts` at 5 passed of 5.

### G32 — `absent-only`

**Gate:** [`gates/absent-only.test.ts`](../gates/absent-only.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean, on the evidence available. The spec's own
  doc comment states it "asserts the claim rather than the branch" —
  byte-identical output against a provider that disagrees about everything —
  specifically to avoid the G27-shaped failure of a test that checks a
  condition rather than an outcome.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; the whole-file byte-identity check leaves nothing
  unexercised.
- **Decay** — clean; no load-bearing number.

Its one stated residual is an accepted design tradeoff, not a gaming exposure:
a book that already carries a *wrong* value keeps it, correcting it by hand.

`docs/gates.md` carries no elaboration beyond the table row.

**Observed-red line:** not recorded.

**Rank:** none.

### G33 — `enrich-idempotence`

**Gate:** [`gates/enrich-idempotence.test.ts`](../gates/enrich-idempotence.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean, on the evidence available. The spec is
  explicit about why it exists — G32 cannot see the `## About` body insert at
  all, since a body is not a `BookRecord` field — and asserts the whole-pass
  claim ("run it twice" is safe) rather than a single branch, for the same
  reason as G32.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; the whole-pass assertion leaves nothing
  unexercised.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` carries no elaboration beyond the table row.

**Observed-red line:** not recorded.

**Rank:** none.

### G34 — `enrich-convergence`

**Gate:** [`gates/enrich-convergence.test.ts`](../gates/enrich-convergence.test.ts)
**Date:** 2026-08-11

- **Weakening / satisfying the letter / routing around / vacuous green** —
  clean, on the evidence available; the spec exercises `enrichBook` end to
  end rather than mocking the property it depends on.
- **Decay** — nominated, low confidence. The row's whole guarantee rests on an
  undocumented property of `http.ts` — a cache write only on success, never on
  failure — that the spec's own comment calls out as load-bearing: "Without
  this row, 'run it twice' rests on an undocumented property that a
  well-meant change adding negative caching would break silently." That
  property is recorded only in this test file's doc comment, not in
  `CLAUDE.md` or `docs/gates.md`'s own row text — if the comment is ever
  trimmed, the reason "run it twice" is safe has no other home.

`docs/gates.md` carries no elaboration beyond the table row; the decay
nomination comes from the spec's own doc comment.

**Observed-red line:** not recorded.

**Rank:** none (decay is not one of the four ranked shapes).

### G35 — `enhanced-card`

**Gate:** [`scripts/smoke-render.ts`](../scripts/smoke-render.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no `EXEMPT`/allowlist construct found in
  `scripts/smoke-render.ts`'s card checks.
- **Satisfying the letter** — exposed, and the row's own Failure-mode cell in
  `docs/gates.md` says so directly: "*'the card opened'* was the whole
  assertion, and it stays true through a card with no reading line, links with
  no accessible name, an announcer that never changes, a sheet that dismisses
  on every short drag, and one Escape that closes the enlarged cover **and**
  the card under it." Now widened to `cardFailures`, `checkCoverViewer` and
  `checkSheet`, but the row's own history is the clearest self-documented
  instance of a check passing on a much weaker property than the one it
  reads as protecting.
- **Routing around** — clean; no basis found for the property being violated
  somewhere the check does not look. Being asserted outside `gates/` is a
  location fact captured by Rank 4 below, not a routing-around finding in
  its own right.
- **Vacuous green** — exposed, historical, fixed; related to the
  satisfying-the-letter finding above — the original single-assertion shape
  ("the card opened") is exactly this category, returning its best possible
  answer against the worst inputs the row now checks for.
- **Decay** — nominated, unconfirmed, and concrete: `scripts/smoke-render.ts`
  cites specific spec subsections in its own comments — "§11.1 and §11.2",
  "§11.3 and the fallback in §11.4", "§11.5", "§11.6", "§11.7" — as the map
  from what the code checks to what `docs/spec/enhanced-card.md` §11
  requires. Nothing enforces that those numbers still name what the comment
  claims; a renumbering of the spec would not be caught by G29, which checks
  Markdown link fragments, not bare `§N` prose references.

`docs/gates.md` already answers the core exposure — its own Failure-mode cell
for this row. The decay nomination comes from reading `scripts/smoke-render.ts`
directly; `docs/gates.md` carries nothing on it.

**Observed-red line:** not recorded as a named mutation.

**Rank:** 2 (text over structure) — beats the tier-4 (outside-`gates/`)
classification it would otherwise carry.

---

## Defect gates

### G10 — `cover-path`

**Gate:** [`gates/cover-path.test.ts`](../gates/cover-path.test.ts) + [`packages/core/src/covers/cover-path.test.ts`](../packages/core/src/covers/cover-path.test.ts)
**Date:** 2026-08-11

- **Weakening** — exposed, mild: the caller-exemption list carries a
  stale-entry assertion per ADR-0022 — cited in `docs/gates.md` as the model
  G22's own exemption list initially lacked. Guarded, but still a list.
- **Satisfying the letter** — clean.
- **Routing around** — clean now; this row exists because a rule was
  implemented three times, one of them wrong (`enrich.ts` shadowed
  `node:path`'s `basename`), which the structural half then caught. That is
  the historical defect the row was written to close, not a flaw in the row.
- **Vacuous green** — clean.
- **Decay** — clean.

`docs/gates.md` already answers this — the "G10 observed red" paragraph and
G22's citation of G10's stale-entry guard.

**Observed-red line:** "`enrich.ts`, which shadowed `node:path`'s `basename`
with a `/`-only split, so `..\..\x.png` traversed on Windows"; a third copy
found in `obsidian-adapter.ts`'s wikilink embed.

**Rank:** 3 (allowlist).

**Deep pass (2026-08-11, band three) — category 1 disposition: `accepted`;
category 3 verdict corrected from `clean` to `exposed`, disposition:
`repaired`.**

The structural half is genuinely red-capable and the original defect re-plants:
`cover.split('/').pop()` restored to `packages/core/src/enrich.ts` fails *"is the
only module that derives a filename from a cover value"*, naming that file.
`MAY_IMPORT_BASENAME` is empty, so its stale-entry loop iterates over nothing
today — but it is not vacuous by construction: given one entry that does not
import `basename`, it fails *"has no stale allowlist entries"*. Category 4 stays
`clean`, now demonstrated rather than assumed.

Category 1 behaves as G1's does: adding `packages/core/src/enrich.ts` to
`MAY_IMPORT_BASENAME` **and** a `basename` import to that file leaves **636 of
636 green**, one line of list plus one line of code. `accepted`, for G1's reason.

⚠️ **Category 3 read `clean now` and it is not.** The entry's reasoning was that
the historical triple-implementation is the defect this row closed. It closed
**one spelling of it**. Four re-implementations of the same rule were planted in
`packages/core/src/enrich.ts`, one at a time; **three pass suite-wide**:

| Plant | Result |
| --- | --- |
| `cover.split('/').pop() ?? cover` | **red** — the original, still caught |
| `cover.split('/').at(-1) ?? cover` | **636 of 636 green** |
| `import { basename } from 'path'` (unprefixed) | **636 of 636 green** |
| `import path from 'node:path'; path.basename(cover)` | **636 of 636 green** |

⚠️ **`.at(-1)` is not a stylistic variant — it is the same bug.**
`'..\\..\\x.png'.split('/')` yields a single element whichever tail accessor
reads it, so the traversal that made the row exist survives verbatim, one
method name away from the pattern that catches it. The other two are the
`node:path` specifier: `FS_IMPORT` in G1 goes out of its way to match both `fs`
and `node:fs` and to reach `require` and dynamic `import`, and this gate's twin
regex matches `node:path` only, so the un-prefixed specifier and the namespace
import both pass.

**A fourth mechanism is the sweep, not the pattern.** `sourceFiles()` is
`filesUnder('packages', …)`, so `scripts/` is not scanned: the original
`.split('/').pop()` planted in `scripts/deploy.ts` leaves **636 of 636 green**.
That is the directory holding the most irreversible code in the repo, and it
handles cover filenames.

**Remedy (named, not built):** three, in increasing order of what they buy.
Match the tail accessors together — `.pop()`, `[…]`, `.at(…)`, `.slice(…)` —
since the pattern is already an enumeration and is simply missing members. Drop
the `node:` prefix requirement and catch the namespace form, which is G1's
`FS_IMPORT` idiom applied to the file that needed it more. Extend the sweep to
`scripts/`, a one-line change to `sourceFiles()` whose **cost is unknown until it
is run** — that directory has never been under this rule, so the size of the diff
it demands is the open quantity, not whether to make it. ⚠️ The stale-entry loop
should not be counted as protection until the list is non-empty.

**Observed-red (this pass):** `.split('/').pop()` in `enrich.ts` fails the
only-one-implementation check naming that file; a `MAY_IMPORT_BASENAME` entry
that does not import `basename` fails the stale-entry check. `.at(-1)`, the
un-prefixed `path` import, the `node:path` namespace form, and the original
defect one directory over in `scripts/deploy.ts` each leave 636 of 636 green.

### G11 — `build-modes`

**Gate:** [`gates/build-modes.test.ts`](../gates/build-modes.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean. "G11 was reframed after checking its
  premise" is a scope correction (a review misdiagnosed missing `coverAspect`
  as a rendering bug when `dev-watch.ts` actually runs `--public`), not one of
  the five gaming shapes.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; observed red by removing a permitted-difference
  entry.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers this — the reframing paragraph.

**Observed-red line:** "by removing one entry from that [permitted-difference]
list."

**Rank:** none.

### G12 — `shelf-order`

**Gate:** [`gates/shelf-order.test.ts`](../gates/shelf-order.test.ts)
**Date:** 2026-08-11

- **Weakening / satisfying the letter / routing around / vacuous green** —
  clean.
- **Decay** — exposed, and this is one of the six specimens the top of
  `docs/gates.md` opens with: `CLAUDE.md` stated "Unset means the default
  order," which became unreachable the moment `stacks order --renumber` was
  run once across a vault, so the next unnumbered book sorted behind every
  pinned one. Already repaired (status now sorts ahead of `shelf_order`).

`docs/gates.md` already answers this — the opening table's fourth row and the
G12 paragraph.

**Observed-red line:** not recorded as a mutation; found by design review.

**Rank:** none (decay is not one of the four ranked shapes).

### G15 — `cover-budget`

**Gate:** [`gates/cover-budget.test.ts`](../gates/cover-budget.test.ts)
**Date:** 2026-08-11

- **Weakening** — exposed and current; nothing stops the two budget constants
  being raised to make the row pass again, and the row states its own warning
  against exactly that: "A budget that gets raised whenever it fails is a
  comment."
- **Satisfying the letter** — exposed, current, and unresolved — the clearest
  self-documented instance in the file: "G15 is green and the crash is not
  fixed... it protects *a* property of the build rather than *the* cause of
  the crash, and reading a green G15 as 'phones are fine' is exactly the
  mistake this scoreboard exists to prevent." The gap between what the gate
  measures and what a reader takes it to mean has not been closed.
- **Routing around** — exposed and current: "the ~22 MB of per-book spine
  `CanvasTexture`s is outside every budget here." A real, named memory cost
  the sweep never counts.
- **Vacuous green** — exposed, current and unresolved; restated once more in
  the file's own words: "`smoke:render` screenshots a desktop GL context with
  gigabytes of headroom, which is exactly why the bug was invisible here and
  fatal on a phone."
- **Decay** — clean, distinct from the routing-around finding above. The two
  budget constants (`MAX_COVER_EDGE`, `TEXTURE_BUDGET_BYTES`) are designed to
  go *red* as the library grows, not to quietly stop meaning anything —
  `docs/gates.md` says the correct response when that happens "is to stop
  uploading every cover at once, not to raise the number," which is the
  opposite of a silently-decaying claim. Raising the number instead is the
  Weakening exposure already recorded above, not a Decay one.

`docs/gates.md` already answers all of this at length (lines 579–629), and
says outright that this remains true today, not merely historically.

**Observed-red line:** not recorded as a mutation against G15 itself; the
crash was found by a user on a phone, not by the gate.

**Rank:** 2 (text over structure) — the scope-mismatch is the strongest,
most explicitly unresolved instance of this shape in the whole file.

### G16 — `books-in-case`

**Gate:** [`pnpm smoke:render`](../scripts/smoke-render.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean. The row measures `Box3.setFromObject`
  against the case's real inner faces rather than trusting the layout
  arithmetic.
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; observed red-capable by deleting the clearance.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers this — the G16 paragraph.

**Observed-red line:** "by deleting the clearance and re-running" → residual
0.0203.

**Rank:** none. **Not flagged**: every one of the five verdicts above is clean.

⚠️ **This row is why tier 4 was replaced** ([#128](https://github.com/mephistopheles4/stacks/issues/128), Rule 2). It used to read *rank 4*, which made it
the one ranked-but-not-flagged row and forced the ranking to carry an exception
clause. *Asserted outside `gates/`* is a fact about **location**, not a category
verdict, so it is now a per-row axis rather than a tier — and a row clean on all
five has nothing to demonstrate and is **not deep-pass membership at all**.

**Outside `gates/`:** yes — asserted by `pnpm smoke:render`.

### G17 — `deploy-branch`

**Gate:** [`gates/deploy-branch.test.ts`](../gates/deploy-branch.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; the override flags (`--any`, `--branch`, `--anybranch`,
  `--any_branch`) are tested to *not* work as an accidental stumble-into.
- **Satisfying the letter / vacuous green** — exposed, historical, fixed, and
  this is the row the commissioning ticket itself names as one of three live
  instances of category 4: its first version read whichever branch the suite
  happened to be on and returned early on `main`, so CI — which never runs on
  `main` — exercised only the refusal, and the owner's own runs quietly
  asserted nothing.
- **Routing around** — clean; both directions are asserted unconditionally
  because "a positive check cannot detect a missing guard on its own."
- **Decay** — clean; no measured-once number or claim underlies this row —
  the guard is behavioral (which branch a real git checkout resolves to), not
  a constant that could go stale.

`docs/gates.md` already answers this extensively — the G17 section and its
own changelog entry.

**Observed-red line:** "deleting the guard fails four of seven. Inverting the
comparison — refuse `main`, allow everything else — fails six, including
'lets main through'."

**Rank:** 1 (vacuous green) — named by the commissioning ticket itself as a
live instance of this category.

**Deep pass (2026-08-11, band one) — disposition: `repaired`.**

The historical defect is genuinely fixed, and the fix was watched holding:
comparing against `master` instead of `main` in `scripts/deploy.ts` fails two of
seven, `lets main through` among them, **from a checkout that is not on `main`**
— which is exactly the condition under which the pre-fix ambient-reading gate
saw nothing.

A live exposure remains in the same category, and it is what sets the
disposition. The gate spawns `scripts/deploy.ts` directly, so it never sees the
argv the *shipped command* supplies: adding `--any-branch` to `package.json`'s
`deploy:site` script leaves all 636 tests green while every deploy overrides the
guard. `scripts/deploy.ts` states that the override is "named so it cannot be
typed by accident and reads in shell history as what it is" — baked into the npm
script it appears in nobody's shell history and produces no refusal, so **the
code's own written property is false while the gate is green**.

**Remedy (named, not built):** assert in `gates/deploy-branch.test.ts` that
`deploy:site` is exactly `tsx scripts/deploy.ts` with no trailing argument — or,
stronger, drive one case through `pnpm deploy:site` so the argv the shipped
command actually supplies falls inside the gate's reach. Existing gate, no new
row.

**Observed-red (this pass):** comparing against `master` fails two of seven from
a non-`main` checkout; baking `--any-branch` into `deploy:site` leaves 636 of 636
green.

### G18 — `bounded-cover-bytes`

**Gate:** [`packages/core/src/covers/download.test.ts`](../packages/core/src/covers/download.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; the magic-byte allowlist (JPEG/PNG/WebP) is a content
  allowlist, not a gate-exemption list.
- **Satisfying the letter** — clean; demonstrated red-capable at six of
  fourteen by restoring the old unbounded `download`, against the real
  15s-abort / 20MB-streamed-cap / magic-byte behavior rather than a weaker
  proxy for it.
- **Routing around** — clean. G22's own text states `enrich.ts`, `add-book.ts`
  and `import/index.ts` all reach `covers/cache-cover.ts`'s `download` for
  their bytes, and G22's "routes every cover download" assertion polices that
  every caller of `cacheCover` gets there through one path — so a second,
  unbounded fetch of cover bytes would be a G22 finding as much as a G18 one.
- **Vacuous green** — clean; "observed red at six of fourteen" by restoring
  the old four-line `download`, and the streaming case ran 31 seconds before
  failing, which is the defect demonstrating itself rather than the gate
  quietly passing.
- **Decay** — exposed and explicitly self-stated: "Every case here stubs
  `fetch`, so the checks were also run once against the live providers — which
  is the failure mode a gate made of stubs cannot see," and "This is a
  measurement with a shelf life: it says what the three providers did on 1
  August 2026, not what they must do."

`docs/gates.md` already answers this extensively (lines 426–465).

**Observed-red line:** "restoring the old four-line `download` and
re-running" → six of fourteen fail; the streaming case ran 31 seconds before
failing.

**Rank:** none. **Flagged** under Decay; no tier 1–3 mechanism flaw is
documented, and decay is not one of the ranked shapes.

⚠️ **This row used to read *rank 4*, and the rank was pointing at the wrong
job** ([#128](https://github.com/mephistopheles4/stacks/issues/128), Rule 2).
Its real work is a **re-measurement**, not a plant, so it belongs with the decay
group in the unranked band — where it is scheduled second, by row number. That
its location tier said something different from its actual work is the clearest
argument for making location an axis rather than a tier.

⚠️ **Its claim may not be re-measurable at all**: *"what the three providers did
on 1 August 2026"* cannot be re-checked without the network, which **G21**
forbids. That tension is the row's real question, and `accepted` is a legitimate
answer to it — see [band four](https://github.com/mephistopheles4/stacks/issues/134).

**Outside `gates/`:** yes — asserted in `packages/core/src/covers/download.test.ts`.

### G20 — `public-build-artifact`

**Gate:** [`gates/public-build-artifact.test.ts`](../gates/public-build-artifact.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no `EXEMPT`/allowlist construct found in
  `gates/public-build-artifact.test.ts`.
- **Satisfying the letter / vacuous green** — exposed, historical, fixed, and
  this is the entry `docs/gates.md` itself flags as "the entry worth reading
  here": the `_headers` rule was observed red only against "a `_headers`
  containing nothing *but* the covers block: a shape this repo has never had,
  and the one shape in which the bug is invisible." The gate's own
  demonstration used an unrealistic fixture, so it passed against the
  realistic one with the real defect present — "a defect the gate plants must
  be a defect the file could actually have."
- **Routing around** — clean; a final completeness assertion holds the rule
  list to the planted defects, so the gate "cannot quietly come to cover ten
  of eleven."
- **Decay** — clean; no measured-once number underlies the row — it inspects
  a synthetic `dist/` it assembles itself, not a captured or dated fixture.

`docs/gates.md` already answers this extensively (lines 664–734).

**Observed-red line:** "Restoring the deploy's weak `_headers` check fails
exactly one test... Adding a rule with no planted defect fails the
completeness assertion by name... Making the reporter a no-op fails all but
the two clean-baseline tests."

**Rank:** 1 (vacuous green) — the gate's own realism-of-the-fixture failure is
the purest instance of "passing on the shape that actually matters" in the
file.

**Deep pass (2026-08-11, band one) — disposition: `repaired`.**

The headline is fixed, and this pass demonstrated **that fixture realism itself
is what makes it catch the defect** — the same production defect, run twice
against two fixtures. Restoring the naive whole-text `_headers` search in
`scripts/lib/public-build.ts` fails exactly one of twenty-four against today's
realistic fixture, and passes all twenty-four when the spec's fixture is shrunk
back to the covers-only shape it originally shipped. The repair is the fixture,
not the rule.

A live exposure remains one level up, at the caller boundary. `inspectPublicBuild`
reports faithfully, but nothing asserts that a caller *acts* on the report:
commenting out `process.exit(1)` in `scripts/check-public-build.ts` — leaving the
`FAILED` print in place — leaves all 636 tests green and `pnpm typecheck` clean,
so **`pnpm gate:public` becomes a printer that cannot fail**. Confirmed by
inspection: that line is the sole failure exit on the rules path, and no spec in
the suite spawns the script.

**Remedy (named, not built):** spawn `scripts/check-public-build.ts` against a
synthetic `dist/` carrying one planted defect and assert a **non-zero exit** —
the reverse-assert G17 already applies to `scripts/deploy.ts`. The module's
verdict is gated; the command's response to it is not.

**Observed-red (this pass):** the naive `_headers` search fails one of
twenty-four against the realistic fixture and zero of twenty-four against the
historical one — while commenting out the exit leaves 636 of 636 green.

⚠️ **Not observed:** no real `dist/` was built and `pnpm gate:public` was never
run, so the caller finding rests on suite-green plus a clean typecheck, not on an
exit code anyone watched.

### G21 — `no-live-network`

**Gate:** [`gates/no-live-network.ts`](../gates/no-live-network.ts) + [`gates/no-live-network.setup.ts`](../gates/no-live-network.setup.ts), specced by [`gates/no-live-network.test.ts`](../gates/no-live-network.test.ts)
**Date:** 2026-08-11

- **Weakening** — exposed, deliberate and named: `vi.stubGlobal` is "the
  escape hatch for a test that genuinely needs a response," documented in the
  failure message itself.
- **Satisfying the letter / vacuous green** — exposed, historical, fixed, and
  one of the sharpest instances in the file: the spec imported the module it
  was checking, so "the assertion that the gate was wired up was satisfied by
  the act of asking." Deleting `setupFiles` left all seven checks green.
- **Routing around** — exposed and explicitly, currently scoped rather than
  closed: "What it covers is `fetch`, in this process... a test that shells
  out to a script making its own requests... and any future code that reaches
  the network by some other API" both sit outside it, stated rather than
  gated.
- **Decay** — clean; no measured-once number underlies this row — the guard
  is a runtime record of calls made, not a constant that could go stale.

`docs/gates.md` already answers all three (lines 340–399).

**Observed-red line:** "by restoring the pre-fix `enrich.test.ts`: one test
fails, naming the URL and the stub that fixes it." Also: "Deleting
`setupFiles`... fails four of seven, one of which spends 1.2s fetching a real
cover from `archive.org`."

**Rank:** 1 (vacuous green).

**Deep pass (2026-08-11, band one) — verdict corrected, no disposition.**

⚠️ **The category-4 nomination did not survive demonstration, so this row has
nothing to dispose of.** A disposition presupposes a finding; a nomination that
fails to survive is not dispositioned, its **verdict is corrected** — which is
how this register records a cleared suspicion without minting the fifth
disposition #113 refused. The category-4 line above should now read *clean,
demonstrated* rather than *exposed, historical, fixed*.

Both halves re-planted red against the current tree. Deleting `setupFiles` from
`vitest.config.ts` — the exact mutation that once left all seven checks green —
fails four of seven, and four of 636 across the suite in a single file: the spec
is the only thing standing between an uninstalled guard and a green build, and it
holds. Restoring the pre-fix `packages/core/src/enrich.test.ts` fails one of
eight **by naming the openlibrary.org URL**, while its seven siblings pass —
which is the point, and the sharpest thing this pass found here: every assertion
in that file is indifferent to the cover, so **a throw-only guard would have left
it green**. The `afterEach` recording, not the throw, is the load-bearing half.

**Still open, and not this band's:** the *weakening* verdict (`vi.stubGlobal` as
a documented hatch) and the *routing around* verdict (a test that shells out to
a script making its own requests — `gates/deploy-branch.test.ts` really does
spawn one — and any future non-`fetch` network API). Per Rule 1, those stay open
rather than closing because the row was visited.

**Observed-red (this pass):** deleting `setupFiles` fails four of seven; the
pre-fix `enrich.test.ts` fails one of eight naming the URL, with its seven
siblings green.

⚠️ **Noted without evidence:** `forgetAttempts` is exported, so a test could in
principle clear the record before `afterEach` reads it. Not planted, not
demonstrated — carried as a nomination for whoever takes the routing-around
verdict.

### G22 — `cover-candidates`

**Gate:** [`gates/cover-candidates.test.ts`](../gates/cover-candidates.test.ts) + [`packages/core/src/covers/cache-cover.test.ts`](../packages/core/src/covers/cache-cover.test.ts)
**Date:** 2026-08-11

- **Weakening** — exposed, historical, fixed: the caller-exemption list "had
  no stale-entry assertion, which ADR-0022 requires and G10 has."
- **Satisfying the letter / vacuous green** — exposed, and the row's own
  headline: it "gated the wrong half," proving one implementation existed
  without proving the order was correct. Reversing `coverUrls` — the actual
  production defect — "left all 290 tests green," a check whose judge was the
  defendant, agreeing with itself no matter which way round the tuple ran.
- **Routing around** — exposed, historical, closed by design: "`packages/site/`
  is not exempt either," the first structural gate here with no exempt list.
- **Decay** — clean; "290 tests green" is a historical fact about a past
  failed state, not a number the row currently rests on.

`docs/gates.md` already answers all of this extensively (lines 467–546), and
it is the third row `docs/gates.md` logs "a gate that matches prose matches
anything" against (comments satisfying the sweep).

**Observed-red line:** "adding a fourth module naming the pair" (structural
half); "reversing `coverUrls` now fails one test, by name" (post-fix,
preference half).

**Rank:** 1 (vacuous green) — "left all 290 tests green" on the real defect is
the clearest single instance of this category in the file.

**Deep pass (2026-08-11, band one) — disposition: `repaired`.**

The headline is fixed and was watched holding, and the split the row predicts is
exactly what happened: reversing `coverUrls` in
`packages/core/src/metadata/types.ts` now fails **one of 636 by name**, in
`packages/core/src/covers/cache-cover.test.ts`, while
`gates/cover-candidates.test.ts` stays green — the structural half is blind to
order by design, and the behavioural half caught it alone.

A live exposure remains at the one caller that composes its own candidate order.
`packages/core/src/import/index.ts` calls `coverUrls()` and then decides where
the result goes, so **a caller can call the helper and discard its ranking**:
swapping `[...coverUrls(match), ...fallback]` for `[...fallback, ...coverUrls(match)]`
inverts the file's own stated rule three lines above it — putting Audible's
square artwork ahead of the print cover — and leaves all 636 tests green. Both
structural checks still pass (it names no `coverUrlLarge`; it does call
`coverUrls(`), because **G22's caller check forces callers *through* the helper
and says nothing about what they do with its result**. That sentence is the
general lesson, and it is the shape #128 found again in G31.

**Remedy (named, not built):** extend the row's existing behavioural half —
alongside `cache-cover.test.ts`'s "the preference rule reaches the network"
block, drive `importBooks` with a stubbed `fetch` and assert the **first** URL
fetched is the looked-up print cover and the export's artwork is last. Existing
gate, no new row.

**Observed-red (this pass):** reversing `coverUrls` fails one of 636 by name in
`cache-cover.test.ts` while the structural gate stays green; reversing the
importer's own composition leaves 636 of 636 green.

### G23 — `key-if-present`

**Gate:** [`gates/key-if-present.test.ts`](../gates/key-if-present.test.ts) + [`packages/core/src/key-if-present.test.ts`](../packages/core/src/key-if-present.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean, and explicitly by design: "no allowlist, and
  therefore no allowlist entry that can go stale... the first structural gate
  here to have no exempt list at all."
- **Satisfying the letter / vacuous green** — exposed, historical, fixed, and
  the file's own worked instance of "an inflated floor is slack": the caller
  floor was set to six, counting the spec file itself as a caller, so
  reverting one real caller left six still calling and "the gate stayed green
  through exactly the regression it describes."
- **Routing around** — exposed and explicitly bounded, currently true: the
  anchor matches only the `return <ident> === undefined ? {} :` shape; a
  semantically equivalent rewrite outside that shape (other than the two
  explicitly checked) would not be caught, and the file names the specific
  line it deliberately does not widen to catch (`covers/cover-keys.ts:31`).
- **Decay** — clean, distinct from the vacuous-green finding above. The
  caller-count floor is a lower bound: callers growing past it stays green
  correctly, and callers dropping below it goes red correctly. It is not
  prone to staying green while silently becoming false the way the
  now-fixed inflated floor was.

`docs/gates.md` already answers all of this extensively (lines 741–830).

**Observed-red line:** "a seventh copy under a seventh name (`perhaps`); the
same copy reformatted; a copy in `packages/site/`; a caller reverting to a
bare object; that revert with `keyIfPresent(` left in a comment."

**Rank:** 1 (vacuous green).

**Deep pass (2026-08-11, band one) — category 4 verdict corrected; category 3
disposition: `accepted`.**

⚠️ **The category-4 nomination cleared.** Both re-plants of the historical
inflated-floor defect went red today: rewriting all 20 `keyIfPresent` spreads in
`packages/core/src/library.ts` back to unconditional keys fails the caller check
**naming that exact file**, and a behaviour-identical rewrite of the owner's
ternary in `packages/core/src/key-if-present.ts` fails the anchor check. The
floor repair holds and the vacuity anchor works, so the category-4 line should
now read *clean, demonstrated*.

What the plants demonstrated instead is the **category-3** gap the gate's own
docblock names, and this pass turned it from a stated bound into an observed one:
a genuine seventh implementation, written as the early-return form
`if (value === undefined) return {};` rather than the anchored ternary shape,
sits in the tree with **all 636 tests green**. The docblock argues the anchor
cannot be widened without flagging `packages/core/src/covers/cover-keys.ts`, an
innocent file — so the wider gate is argued *unavailable*, not merely unbuilt,
which is `accepted` rather than `declined`.

**Band one over-delivered here**, and that is worth saying plainly: category 3
belongs to band three. The evidence exists, so the verdict is dispositioned
rather than artificially deferred, and G23's band-three membership is discharged.

**Observed-red (this pass):** unconditional keys in `library.ts` go red naming
that file; the inverted ternary goes red on the anchor — but a second
implementation in early-return form stays green suite-wide.

### G24 — `repo-root`

**Gate:** [`gates/repo-root.test.ts`](../gates/repo-root.test.ts)
**Date:** 2026-08-11

- **Weakening / satisfying the letter / routing around / vacuous green** —
  clean; the anchor is structural (`import.meta.(url|dirname|filename)`), a
  single named owner rather than a directory, and demonstrated red-capable on
  both the sweep and the control.
- **Decay** — exposed, and unusually direct: the issue that produced this row
  argued a second-order benefit (shrinking G1's allowlist), and `docs/gates.md`
  measured it and found it false — "The consolidation shipped here changes
  G1's allowlist by exactly nothing." A load-bearing justification, checked
  and repaired in the same paragraph that states it.

`docs/gates.md` already answers this — the "fourth 'one rule, one
implementation' row" section (lines 843–889).

**Observed-red line:** "restoring `join(dirname(fileURLToPath(
import.meta.url)), '..')` in `smoke-render.ts`" (sweep); "pointing `OWNER` at
a file that derives nothing" (control).

**Rank:** none (decay is not one of the four ranked shapes).

### G25 — `one-usable-width`

**Gate:** [`packages/site/src/shelf/shelf-width.test.ts`](../packages/site/src/shelf/shelf-width.test.ts) + [`packages/site/src/shelf/books.test.ts`](../packages/site/src/shelf/books.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist in a row built entirely from geometric
  bounds and constants.
- **Satisfying the letter / vacuous green** — exposed, and the richest single
  instance of the "judge was the defendant" pattern in the file, recurring
  across the row's own history: an early assertion "passed with the packer
  mutated to wrap at nine tenths of the shelf" because it priced a candidate
  by calling the function it was checking; the outcome-bound floor was
  written as a minimum that made a *correct* packer red, "the same error this
  row already records twice, committed a third time"; `WORST_CLEARANCE` used
  `MAX_LEAN` where it needed `MAX_PROP_LEAN`, "this row's own oldest mistake,
  made a fourth time, three paragraphs after writing it down"; and the
  `endReserve` bound was left citing `MAX_LEAN` after that constant "stopped
  bounding anything," staying green for a whole change.
- **Routing around** — exposed, historical, fixed; related to the
  floor-as-ceiling defect above — a need stated too small let a book get
  rejected for a reason the check could not see was its own clearance charge.
- **Decay** — exposed: "This row said 0.0003 first... Three numbers, three
  corrections, none of them from running the suite: the suite was green for
  all three."

`docs/gates.md` already answers all of this at exhaustive length (lines
891–1137), the single longest section in the file.

**Observed-red line:** eight ways for the original bound (dropping the
clearance charge, inflating it forty-fold, adding a hair to every book's cost,
packing past `USABLE_WIDTH`, wrapping early, starting the cursor clear of the
upright, folding the reserve into the usable width, tuning the reserve below
the swing it must absorb), plus "observed red with `MAX_LEAN` restored and
green with `MAX_PROP_LEAN`" for the later correction.

**Rank:** 1 (vacuous green) — the repeated "judge was the defendant" pattern,
recurring four times in one row despite being named each time, is the
strongest volume of evidence for this category anywhere in the file.

**Deep pass (2026-08-11, band one) — disposition: `accepted`.**

The row's detection floor is live and behaves exactly as its own comment states.
An over-spend of **0.004 per shelved book** in `packages/site/src/shelf/placement.ts`
leaves all 44 of this row's assertions green; **0.0055 goes red** on `mixed`,
reproducing the documented floor to the digit. Both historical corrections
re-planted red as well: restoring `WORST_CLEARANCE` to `MAX_LEAN` fails on
`squareCoverAfterProp`, and a hair of 0.00001 on the face-out branch goes red.

This is not closable without giving up soundness, which is why it is `accepted`
rather than `repaired`: the row records two separate occasions where a sharper
bound turned a **correct** packer red, and it names `pnpm smoke:render` as the
backstop for exactly this residue. Knowingly lived with, with the trade-off
argued in the file.

⚠️ **One qualification the numbers do not carry.** At δ = 0.004 the full suite
*did* go red — four failures in `packages/site/src/shelf/placement.test.ts` —
but that injection site happens to break flush-run geometry. **Whether every
sub-floor over-spend is caught somewhere was not tested**, so "the suite catches
what this row misses" is not established, and the accepted residue is the row's,
not the suite's.

**Observed-red (this pass):** green at δ = 0.004 and red at δ = 0.0055 on
`mixed`; red on `squareCoverAfterProp` with `WORST_CLEARANCE` restored to
`MAX_LEAN`; red on the face-out branch at δ = 0.00001.

### G26 — `lookup-recall`

**Gate:** [`gates/lookup-recall.test.ts`](../gates/lookup-recall.test.ts) + [`gates/recall-corpus.ts`](../gates/recall-corpus.ts)
**Date:** 2026-08-11

- **Weakening** — clean; the corpus is data replayed through a shared
  function, not an exemption list, and it is not a category-1 allowlist.
- **Satisfying the letter** — nominated, unconfirmed. Designed against,
  explicitly: "A recall gate that only asserted positives would be passed by
  a matcher that says yes to everything... Two of the five corpus entries
  exist to make that route red." A deliberate mitigation, not a closure —
  five corpus entries is a narrow guard against a matcher tuned to exactly
  those cases, and nothing in `docs/gates.md` demonstrates the mitigation
  holds against a matcher shaped to pass precisely this corpus.
- **Routing around** — clean. Read in `gates/lookup-recall.test.ts`: the
  corpus is replayed directly through `lookup` and `isProbablySameBook`,
  imported from `packages/core/src/index.ts` — the same shared functions a
  CLI command would call, not a second matcher this row exercises in
  isolation. `docs/gates.md` records no duplicate-implementation defect for
  matching (unlike G10, G22 or G23, each of which found one for a different
  rule), which is consistent with there being one path here to route around.
- **Vacuous green / decay** — exposed, real, and already realized once: "G26
  was replaying refusals as answers, because its corpus had been captured
  without a Google API key... The gate then went green against it for two
  days," with a real book (172 pages, held by Google) recorded as `no-match`.
  A gate whose fixture is captured by a script is only as true as that
  script's environment.

`docs/gates.md` already answers this — the 2026-08-08 note.

**Observed-red line:** not phrased as a mutation; found by noticing a real
book's recorded refusal contradicted what Google actually held.

**Rank:** 1 (vacuous green) — the corpus-capture incident is a real, already-
occurred instance, not a hypothetical.

**Deep pass (2026-08-11, band one) — disposition: `repaired`.**

⚠️ **The already-occurred incident reproduces today, exactly.** Setting one
corpus entry's Google response to `null` in `fixtures/api/lookup-recall.json` —
which is precisely what `scripts/capture-lookup-recall.ts` writes on a 429, via
`recorded[stripKey(url)] = body ?? null` — and flipping that entry's expectation
in `gates/recall-corpus.ts` from `found` to `no-match` leaves **all 636 tests
green**, with a book Google demonstrably holds recorded as unfindable. The key
count guard is untroubled: 19 keys becomes 20, still above `RECALL_CORPUS.length * 2`.

The counter-plant is what makes this a finding rather than an observation about
an inert gate. Flip the corpus expectation **alone**, leaving the recordings
intact, and the gate goes red by name. So the gate detects a corpus that lies on
its own, and is blind only when **the corpus and its recordings are wrong
together** — which is the only way this failure has ever actually arrived.

**Remedy (named, not built):** record **capture provenance** in the fixture and
gate on it. Have `scripts/capture-lookup-recall.ts` write, beside each response,
whether `GOOGLE_BOOKS_API_KEY` was present at capture time and the HTTP status of
each request; have `gates/lookup-recall.test.ts` fail any `no-match` entry whose
evidence rests on a keyless or non-200 capture. ⚠️ **Preferred over the obvious
body-shape heuristic** ("every entry has at least one non-null provider body"):
a genuine no-match can legitimately have all-null Google responses, so the
heuristic would go red on the corpus's own honest negatives. Existing gate, no
new row.

**Observed-red (this pass):** nothing went red on the exposure — the gate is red
when the corpus lies alone, and green when the corpus and its recordings are
wrong together.

### G27 — `enrich-report`

**Gate:** [`gates/enrich-report.test.ts`](../gates/enrich-report.test.ts), over [`packages/cli/src/enrich-report.ts`](../packages/cli/src/enrich-report.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist.
- **Satisfying the letter** — clean. "G27 is a tool that returned a *true*
  answer about a smaller set than it claimed" describes the pre-gate CLI
  defect the row was written to catch (one `break` folding two distinct
  outcomes into `complete`), not a flaw in the gate's own mechanism — the fix
  is structural (`reportEntry` returns a line and its total together,
  compiler-enforced).
- **Routing around** — clean; no stated gap.
- **Vacuous green** — clean; the row is demonstrated red against exactly that
  regression.
- **Decay** — clean; no load-bearing number.

`docs/gates.md` already answers this — the two 2026-08-06 notes on G27.

**Observed-red line:** "making exactly that mutation: two of five fixture
books turn 'complete' and the assertion names why."

**Rank:** none.

### G28 — `no-board-collisions`

**Gate:** [`packages/site/src/shelf/placement.test.ts`](../packages/site/src/shelf/placement.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; no allowlist — the row walks boards geometrically
  across the whole fixture.
- **Satisfying the letter** — exposed, historical, fixed, and self-documented
  with an explicit moral: the row's own first draft used `height / 2` for a
  leaning book's centre, which is only correct for an upright book. For two
  parallel books the error stayed constant across the shared range, so "the
  wrong height still reads a plausible gap" — off by 0.26mm, "which looks
  exactly like a placer that is nearly right." `docs/gates.md` names this
  directly: "a check that disagrees with the code is not automatically the
  one that is right."
- **Routing around** — exposed, historical, fixed: the first version asserted
  only `gap ≥ 0`, leaving the mirror direction (a slot of missing book)
  entirely unchecked.
- **Vacuous green** — exposed, historical, fixed; related to the
  satisfying-the-letter finding above — a wrong-but-plausible-looking number
  is exactly this category, passing on the shape that mattered.
- **Decay** — clean; the 0.26mm error the first draft produced was found by
  an independent re-derivation, not left to rest on a single measurement —
  and no constant in the current row is stated as measured once.

`docs/gates.md` already answers this — the whole G28 section (lines
1139–1185).

**Observed-red line:** four ways — measuring the prop's reach to the footprint
rather than the corners, adding the neighbour's lean in the corner case as
well as the board case, clamping the parallel push at zero, and dropping it
altogether.

**Rank:** 2 (text over structure) — the row's own check computing a subtly
wrong number that still looked plausible is a mechanism-level exposure, ranked
above the tier-4 (outside-`gates/`) classification it would otherwise carry.
