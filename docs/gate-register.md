# Gate register

**Triage for 10 rows; the deep pass has run on the other 25.** The population was
commissioned by [#126](https://github.com/mephistopheles4/stacks/issues/126),
running the shape [#113](https://github.com/mephistopheles4/stacks/issues/113)
fixed. It puts the same five questions to every numbered row in
[`docs/gates.md`](./gates.md) and records a one-line verdict each — `clean`, or
the shape of the exposure.

⚠️ **Read the two layers separately, because they carry different weight.** The
**category bullets and Rank line** in every entry are the triage pass:
**suspicion, not proof**, a nomination for the deep pass rather than a finding.
The **Deep pass** block, present on all twenty ranked rows and on the five
unranked flagged ones, is
[#128](https://github.com/mephistopheles4/stacks/issues/128)'s band one,
[#132](https://github.com/mephistopheles4/stacks/issues/132)'s band two,
[#133](https://github.com/mephistopheles4/stacks/issues/133)'s band three and
[#134](https://github.com/mephistopheles4/stacks/issues/134)'s band four: defects
actually planted, gates actually run, dispositions filled in. Where the two
disagree, the Deep pass block is the evidence and the triage line is the guess it
replaced — and **they disagree in every band, in both directions**: three rows in
band one, four in band two, two in band three, two in band four. ⚠️ Band one's
own section counts *results* rather than rows and says "two"; both are right about
different things. See **Band one**, **Band two**, **Band three** and **Band
four**, below.

⚠️ **There is a third layer, and it is not a band.** A **Decay re-read** block
sits on three rows — G6, G7 and G35 — from
[#144](https://github.com/mephistopheles4/stacks/issues/144), which re-read
category 5 alone against a bound
[#138](https://github.com/mephistopheles4/stacks/issues/138) restated *after* all
four bands had closed. It plants nothing and deep-passes nothing; it corrects
decay verdicts reached under a rule that no longer applies. See **The decay
re-read**, below.

⚠️ **Band four's section landed last and by a different route from the other
three.** Its pull request ([#136](https://github.com/mephistopheles4/stacks/pull/136))
was **auto-closed by GitHub** on `2026-08-12T10:47:29Z`, one second after band
three's [#135](https://github.com/mephistopheles4/stacks/pull/135) merged: #136
had been retargeted to stack on band three's branch, the repo carries
`delete_branch_on_merge=true`, and deleting the **base** branch of an open pull
request closes it. Nobody closed it and nothing announced it, so band four's
ticket closed recording dispositions its artifact had never delivered — found
three days later from [#138](https://github.com/mephistopheles4/stacks/issues/138)
by asking whether the cited commit was an ancestor of `main`. **The work was
intact the whole time**; only the pull request was gone.

**The triage pass planted no defect and ran no mutation.** Where an
Observed-red line is present, it is one of two things, both already in
`docs/gates.md`, neither produced by this session: a **planted demonstration**
— a perturbation or mutation run when that gate was written (G1, G6, G7, G10,
G13, G17, G19–G23, G25, G26, G28, G29 among others) — or a **real defect that
surfaced without planting anything**, found on arrival or by ordinary use
rather than by an adversarial test (G4 "was red on arrival"; G14's `covers`
false-negative "found by the next command added"; G26's corpus defect found by
noticing a real book's recorded refusal contradicted what the provider held).
**Nine rows carried no Observed-red line at all** — G5, G12, G15, G30, G31, G32,
G33, G34, G35 — because `docs/gates.md` records no elaboration for them beyond
their table row, or, for G15, no mutation was run against the row itself. ⚠️ **One
of those nine, G31, was in band one and still has no Observed-red line** — not
for want of trying: four plants were run and **none of them turned the gate
red**, which is the finding rather than a gap in it. **Five more gained one from a
later band** — G15 and G35 in band two, G30 in band three, G12 and G34 in band
four, each planted for the first time — so **four remain**: G5, G31, G32, G33. All
five of those new lines sit in a Deep pass block, not in the triage line above it,
which is the distinction this whole paragraph is about.

⚠️ **Band four's own correction to this tally said *six*, and it was right about
the file it could see.** `8b8abab` was written against a register holding bands
one and three but not band two, which had not yet landed — so G15 and G35 still
looked unsupplied. **Recounted mechanically over the 35 sections** once all four
bands were in one file: four. The number is not a compromise between the two
prose claims; neither was carried forward.

**Every flagged row has now been deep-passed.** The twenty ranked rows went in
bands one, two and three; band four took the five flagged-but-unranked ones — G6,
G12, G18, G24, G34 — so the remaining 10 rows carry triage verdicts only because
**triage found nothing to flag in them**, not because a band still owes them.

⚠️ **Deep-passed is not the same as dispositioned, and 23 of the 25 carry a
disposition rather than all of them.** `gated` / `repaired` / `accepted` /
`declined` presuppose a finding, so a row whose nomination did not survive has its
**verdict corrected** and is dispositioned by nothing: that is **G21** in band one
and **G34** in band four. This paragraph claimed all twenty until CodeRabbit caught
it on [#137](https://github.com/mephistopheles4/stacks/pull/137) — the rule was
written down in band one, restated in band two, and then contradicted by the
sentence counting the rows it applies to. ⚠️ **It was 22 and three until the decay
re-read gave G7 a `gated` decay disposition**, so the row band two left corrected
and undispositioned now carries one for a different category — which is the rule
working, not an exception to it.

**Scope: the 35 numbered rows `docs/gates.md` holds today** — G1–G35 across its
Invariants, Contract seams and Defect gates tables. The **CI-only gates** table
and the **Not gated, deliberately** table are not numbered rows and are out of
this pass. Two further rows — G36 (`action-pins`) and G37 (`dependency-audit`)
— are decided in spec by [#124](https://github.com/mephistopheles4/stacks/issues/124)
and do not exist in the tree yet; this pass does not triage them, and that gap
is recorded as a spec obligation on #124's side, not here.

⚠️ **Marked, not rewritten — the paragraph above is true of the file it was
written against and false of this one, in three ways.** The scope is now 42
rows, not 35. **The `## CI-only gates` table no longer exists**: it held one
line, was never scored, and its content became row **G42
(`dependency-audit`)**, with its prose kept under a named `## G42 —` heading in
`docs/gates.md`. And the two rows it pre-allocates as G36 and G37 landed as
**G40 (`action-pins`)** and **G42 (`dependency-audit`)** — the numbers moved
twice, because a row number is derived from landing order and never chosen.
⚠️ **The one row this paragraph's scope genuinely missed is G37
(`agents-import`)**, which landed from outside the rollout entirely and was
triaged by nobody until `gate-register` went red on it; its backfilled entry
says so in terms.

⚠️ **Marked 2026-08-19: those two numbers went elsewhere.** G36 is `trend-layer`,
G37 is `agents-import` and G38 is `mutation-scope` — all three landed after this
paragraph was written, and the supply-chain pair it names is now further down the
queue with numbers nobody may choose in advance. Marked rather than corrected in
place, on this file's own mark-never-delete rule: the paragraph is a specimen of
exactly the failure the rollout warns about, which is that **a number allocated
before landing order is known is a guess**. Rows land in merge order and G19
asserts gaplessness at every merge; cite slug and number together, and derive the
number from `docs/gates.md` as you write it.

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
5. **Decay** — ~~does the row rest on a load-bearing claim measured once and never re-measured?~~ **Superseded 2026-08-16**; the original is kept on this file's mark-never-delete rule, because verdicts reached under it are still in the file and each says which test it was reached under. The bound restated by [#138](https://github.com/mephistopheles4/stacks/issues/138) and applied from the decay re-read onward: **does the row rest on a load-bearing claim whose truth was never established, or never re-established, against a check that was available?** ⚠️ **This line stated the retired bound for two days after #138 restated it and #144 moved three verdicts under the restatement** — the definition every future triage reads, left behind by the passes that changed it. Found by the decay re-read part two, from reading the definition rather than any row.

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

**All 20 are flagged**, as of the decay re-read. Rule 2 removed the tier-4 column
that used to require an exception; band two produced the first one of a different
kind and the decay re-read took it back. **G16** was ranked 4 and clean on all
five categories, so it is not deep-pass membership at all; **G18** was ranked 4
and flagged for decay, so it keeps the flag and loses the rank. ⚠️ **G7 kept rank
2 and was clean on all five for three days** — band two corrected both its
non-clean verdicts against three planted attempts that could not reach a green
suite, and then the decay re-read exposed its fifth category, a category band two
never demonstrated against and could not have judged under the bound that existed
then. **A rank is a record of what was suspected, not of what was found**, so it
stays either way; what moved is the verdict line.

**"Flagged" throughout this file means the row's verdicts *as they stand*, not
whether it was ever nominated.** Both readings are defensible and they now
disagree, because a deep pass corrects verdicts in both directions: band two moved
**G7** off the flagged side entirely, and band three moved two verdicts from
`clean` to `exposed` inside **G10** and **G30**, rows that were already flagged, so
those changed the row's contents and not its side. One row has crossed. The file
counts the current reading and says so rather than leaving it to be inferred.
~~Under the historical reading G7 is flagged and the total is 25; under the
current one, which is what every count here uses, G7 is clean and the total is
24.~~ ⚠️ **Marked 2026-08-16 — stale in both halves, and it went stale the same
day it was written.** The decay re-read put **G7** back on the flagged side hours
later, so the two readings no longer disagree about G7 at all; and the total moved
to **25** when the decay re-read part two exposed G33. Kept rather than rewritten
because the *distinction* it draws is still the file's rule, and because a
worked example that expired this fast is worth leaving visible. Rank is the
historical record; the verdict lines are the current one.

**5 rows carry a flag with no rank** — exposed under weakening, routing around,
or decay outside the ranked shapes: **G6, G12, G18, G24, G33**. ⚠️ **This was
five, then four, and is five again**: the decay re-read landed band four's G34
correction into the verdict line band four left standing, and the decay re-read
part two exposed **G33**, a row that had been clean on all five since triage.

**10 rows found nothing on all five categories**: G3, G4, G5, G8, G9,
G11, G16, G27, G32, **G34**.

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

⚠️ **This was 25 until band two, and the row that moved is the point of having a
deep pass at all.** G7's two exposures were both corrected to `clean` after four
plants failed to reach a green suite — triage read `docs/gates.md`'s live CodeQL
residual and nominated it, which was the right call on the evidence triage had,
and the demonstration disagreed. **Recounted mechanically over the 35 sections,
not adjusted by one**: ~~11 rows now carry five clean verdicts~~ — **10** as of
the decay re-read part two; the sentence is band two's and marked rather than
rewritten.

⚠️ **The total is unchanged by the decay re-read and the membership is not, which
is the more useful fact.** Two rows crossed in opposite directions on the same
day: **G7** back to flagged on a decay exposure band two never demonstrated
against, and **G34** to clean, band four's refutation finally reaching the verdict
line it refuted. A carried-forward *"still 24"* would have been true and would
have hidden both. **Recounted mechanically over the 35 sections** — and the
counting script was wrong twice before it was right, most instructively on a
**wrapped bullet**: G34 states its first verdict on the line *after* the category
name, so a per-line test read it as non-clean and kept the row flagged for the
wrong reason. Every total here is from the version that joins a bullet to its
continuation lines.

⚠️ **The decay re-read part two moved the total for the first time since band
two, and it moved *up*.** **G33** crossed from clean to flagged on a decay
exposure — the docblock's *"the only gate that reaches the `## About` body
insert"*, false in the commit that wrote it — and **G21**, already flagged,
gained its fifth. Decay now stands at **24 clean / 11 exposed**, against 26 / 9
before. **Recounted mechanically over the 35 sections after the edits, never
carried forward from the narrative**, which is the discipline
[#149](https://github.com/mephistopheles4/stacks/pull/149)'s review had to
enforce by hand: every total in this Summary and in that block came from one run
of the counting script against the file as it now stands. ⚠️ **That script was
wrong once, in the flattering direction, for a fifth distinct reason** — a match
on `**Decay**` misses G26's merged `**Vacuous green / decay**` bullet and returns
34 sections without saying so.

**A second correction, made in the round that populated this file** — before
either band ran; *"this revision"* is what it said until band two made that read
as band two's. The previous round left category
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

**17 flagged rows remained** when this band closed: rank 2 (8), rank 3 (4), and
the unranked band (5). Bands two and three have since taken twelve of them;
**5 remain**, all unranked.

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

## Band two — the deep pass has run on rank 2

**Commissioned by [#132](https://github.com/mephistopheles4/stacks/issues/132).**
The eight rows triage flagged under *text over structure* — a gate matching prose
where it should match structure. Same shape as band one, one tier down: plant a
defect the file could actually have, watch what the gate does, and record what
was run rather than what `docs/gates.md` already claimed.

| Row | Disposition | In one line |
| --- | --- | --- |
| G2 `public-build` | `accepted` | Real body prose ships into `library.json` while the canary check reports clean. |
| G7 `astro-no-logic` | *verdict corrected* | Three plants, three reds. The approximation is real; a silent pass is not reachable. |
| G14 `commands` | `repaired` | The anchored regex holds — and the extractor still cannot see `.alias()` or a workspace script. |
| G15 `cover-budget` | `accepted` | 23.0 MB of spine textures, measured, outside every budget the gate counts. |
| G19 `constitution-scoreboard` | `repaired`; second finding `gated` | Three holes re-plant red. The status cell is read **positionally**. |
| G28 `no-board-collisions` | `repaired` | Four plants, both directions, each fails the same two of twelve. |
| G29 `doc-links` | `gated` | One stray backtick switches the gate off for the rest of the line. |
| G35 `enhanced-card` | `repaired` | The widened checks catch what the single assertion could not. |

**Four rows contradict the triage above** — twice as many as band one, which is
what a band of *"the gate matches prose"* rows should be expected to produce.
**G7's exposure did not survive** three planted attempts to reach a green suite;
**G14's routing-around nomination did**, twice over, and is now demonstrated
rather than suspected; **G19 was recorded as historical and fixed** and carries a
live defect nobody had found; and **G29's self-audit was credited as *measured,
not assumed*** while measuring the corpus rather than the mechanism.

### `gated` gets a meaning — and two bands reached the same one, separately

⚠️ **Band one used three of the four dispositions and never `gated`.** Band two
reached two findings that fit none of the other three: real, unclosed, nobody has
accepted them, nothing was repaired, and the remedy is a check somebody has to
write. Both of its runners reached for `gated` independently and neither could
say what it meant.

**The reading adopted here: `gated` means the finding is real and unclosed, and
its remedy is a named check for the implementation session to build.** It is the
disposition a map that *decides* can reach, where `repaired` and `accepted` both
describe something that already happened. The alternative reading — *"already
caught by some other gate"* — was rejected: a finding caught by an existing gate
is not a finding, and would have its verdict corrected instead.

⚠️ **That leaves `accepted` and `gated` describing the same facts, and band two
used both — so the rule separating them is written here rather than left to three
worked examples.** A finding is real, unclosed, and carries a named remedy in
either case; **what decides is whether the repo had already conceded the gap in
writing before the plant.** If it had, the deep pass demonstrated something the
file already admitted and the disposition is **`accepted`** — the remedy is
recorded as available, not adopted. If it had not, nobody has accepted anything,
and the disposition is **`gated`**. It reads as a rule about paperwork and is not:
`accepted` asserts a decision somebody made, and inventing one on a finding
nobody has seen is how a register comes to record consent that was never given.

By that rule: **G2** and **G15** are `accepted` — `docs/gates.md` says the canary
rule is *"still a text match by construction"* and spends fifty lines on G15's
scope mismatch, naming a non-gate substitute instead of claiming closure. **G29**
is `gated` — the stray-backtick hole is new, its entry credited the opposite, and
a cheap remedy is named. Band three's **G30** lands the same way for the same
reason: *"no history at all"*.

⚠️ **This section read *"because this band is the first to need one"* until band
three merged first, and that sentence was false when it was written rather than
made false afterwards.** Band three minted `gated` in parallel, for G30, and
arrived at the same reading by a different route — *"the remedy is a gate change,
it is named here, and it is owed to the spec"*, chosen by eliminating the other
three exactly as band two eliminated them. **Two sessions with no contact
defining one disputed word the same way is better evidence for the reading than
either band's argument for it**, and it is worth more than the tidier claim it
replaced. It is also the [#124](https://github.com/mephistopheles4/stacks/issues/124)
→ [#118](https://github.com/mephistopheles4/stacks/issues/118) G36 collision
again — two bands allocating one shared thing from a map that serialises nothing
— with the difference that a word, unlike a row number, can be allocated twice
without either allocation being wrong.

⚠️ **Under this reading band one's G20 residual would be a `gated`, and it carries
no disposition today** — the commented-out `process.exit(1)` that leaves
`pnpm gate:public` a printer that cannot fail, remedy named, nothing decided.
Those are one statement, not two: the disposition it *would* take is `gated`, and
the disposition it *has* is none, because the vocabulary did not exist when band
one wrote it. Left alone rather than edited, being another band's row; noted so
the gap is visible from this side.

### Cost — the model from band one held, and the totals did not

**Eight rows, ~170 minutes, ~36 vitest invocations plus 3 `pnpm smoke:render`
runs.** Band one was ~63 minutes over the same number of rows. ⚠️ **The
difference is not that band two was slower per plant; it is that band two
planted more, on instruction, and hit live findings that then had to be
isolated.** Band one's own model predicted this exactly — *"a documented exposure
needs about two plants; an unconfirmed nomination needs about four"* — and band
two's expensive rows are the ones where the plant came back green and the finding
had to be built up from there: G2 needed a throwaway single-book vault before the
exposure separated from the fixture's own coincidence, and G15 needed the real
`toRows` → `spineCanvasWidth` → `decodedTextureBytes` path run outside the suite
to get a number at all.

⚠️ **#132 was right that G35 is the expensive row and wrong about the size.**
`pnpm smoke:render` costs **20.3–20.6s wall per run**, three runs, ~61s of
puppeteer in total — against a 6.5s suite that is itself not a cost centre. The
row cost ~35 minutes and almost none of it was puppeteer. **Cost in this deep
pass is reading and isolation time; it has now been mispredicted twice, in both
directions, by reasoning about what a spec *runs* instead of what a finding
*takes*.**

**Both figures are agent-reported, not instrumented**, on band one's own caveat.

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

**13 flagged rows remain**: rank 2 (8) and the unranked band (5). ⚠️ **Band four
landed on top of this section rather than after it** — see below; the count in
this sentence is the one that was true when this band wrote it, kept because the
recount belongs to the band that came second.

---

## Band four — the deep pass has run on the five unranked rows

**Commissioned by [#134](https://github.com/mephistopheles4/stacks/issues/134),
on band one's Rule 3 ordering: the four decay rows first by row number, G6
last.** Four of the five were discharged by **re-measuring a claim** rather than
by planting against a gate, which is what a decay flag asks for; G6 needed a
demonstration designed from scratch, and produced the band's result.

| Row | Disposition | In one line |
| --- | --- | --- |
| G12 `shelf-order` | `repaired` | The code repair holds; the gate still quotes the sentence the repair replaced. |
| G18 `bounded-cover-bytes` | `accepted` (time) + `gated` (membership) | The measurement says *three providers*; there have been four since 2026-08-08. |
| G24 `repo-root` | `accepted` | The load-bearing claim re-measures true. A second count in the same paragraph was wrong on arrival. |
| G34 `enrich-convergence` | *verdict corrected* | The property is asserted, not merely commented — and `docs/gates.md`'s own row states it. |
| G6 `site-core-imports` | `repaired` | **Two routes past the gate, and the suite, and the build. `smoke:render` is the only thing that catches them.** |

⚠️ **G6 in full, because it is what this band exists to produce.** The
nomination named a re-export chain and a dynamic `import()`. The **dynamic
import is closed** — planted, red, and closed deliberately by a test whose
comment names it. The two routes that *do* work were not on the list: a
**relative path** into `packages/core/` (no `@stacks/core` literal, so the file
is read and nothing in it is seen) and the **`.astro` `<script>` block**, which
uses the forbidden statement verbatim in a file type `siteFiles()` does not
open. Both leave G6 green, the suite at **636 of 636**, `pnpm typecheck` clean
and `pnpm build` **succeeding** while vite externalizes `sharp` and `node:fs`
into the browser bundle.

**And the backstop is real, which is the other half of the honesty.** `pnpm
smoke:render` goes red on both, in the same required check — *"the shelf never
signalled ready"*. The invariant is defended in CI; it is not defended by the
gate written for it, and the red a visitor to that failure gets names no rule,
no file and no line.

### Two results contradict the triage

**G34 cleared** — the strongest-worded decay nomination in the unranked set
fails on both its legs, and one of them (*"not in `docs/gates.md`'s own row
text"*) is contradicted by line 110 of that file. **G12 half-cleared**: the
triage line's *"already repaired"* is true of the behaviour and false of the
record.

### What re-measurement costs, against band one's model

Band one's model — *~2 min orientation per row, ~2 min per plant; a documented
exposure needs ~2 plants, an unconfirmed nomination ~4* — was measured on rows
that get **planted against**. ⚠️ **It does not transfer to a decay row, and the
direction is the surprise: re-measurement is cheaper than orientation.**

Reading a claim, finding its source and checking it against the tree is `git
grep` and `git log -S` — seconds each. Three of the four decay rows were settled
without running a test at all; the tests that were run afterwards existed to fill
an **observed-red line the row lacked**, which is a separate errand from the
decay question and the reason G12 and G24 have one now.

> **A decay row costs its reading and almost nothing else. An unconfirmed
> nomination with no named mechanism costs the whole band.**

G6 alone took roughly as long as the four decay rows together: three plants, two
`pnpm build` runs, two `pnpm smoke:render` runs and a full-suite run each for
plants B and C. **Totals: five rows, ~50 minutes, 10 vitest invocations, 1
typecheck, 3 builds, 2 render gates.** ⚠️ **Agent-reported, not instrumented**,
on the discipline `aaf7347` established.

⚠️ **Two disclosures about how this band was run**, both bearing on how much its
verdicts are worth.

- **The independence condition in #134's Notes was not met.** It asks for a
  fresh-context agent given the register entry and not this map's
  *Decisions-so-far*. This band was run by the session that read the map, which
  is the weaker arrangement: for the three decay rows whose answer is a document
  comparison the risk is small, and for **G6**, where the demonstration had to be
  designed, it is not — a reader who wants that result independent should note
  that the person who designed the plants had already read the ticket's framing
  of them. The plants themselves are reproducible from the entry.
- **`docs/gates.md` and `CLAUDE.md` were not corrected**, per #134's instruction:
  every finding above names a remedy and builds none of it.

**8 flagged rows remain**: rank 2, and nothing else. ⚠️ **The deep pass is
still not complete, and this band does not get to say it is** — band two was
claimed and unlanded when this was written, so the completeness claim #134
anticipates belongs to it, not here.

⚠️ **Band three published while this band was measuring, and the collision is
worth the paragraph** — it is the hazard #134 warned about, arriving. Both bands
branched from `e372e2d` and both wrote this file, so the sections above and below
were composed rather than merged: band three's runs first, band four rebased onto
it, and **the arithmetic was recounted across all three bands rather than
patched**. The recount was needed rather than tidy — band three left this file's
opening lines reading *"Triage for 27 rows; the deep pass has run on the other
8"* and *"the eight rank-1 rows only"*, which described the file before its own
section was in it. Nothing in wayfinding catches two sessions editing one file;
reading the tip again before publishing does, which is the same lesson band one
recorded and the second time this file has recorded it.

**Recounted mechanically from the sections as they stand**, not carried forward
from any band's own sentence:

```
Deep pass: band one    8
Deep pass: band three  4
Deep pass: band four   5
Awaiting a band        8
Clean, no band        10
                      --
                      35
```

⚠️ **Marked, not corrected: 5 remain.** That line was true when this band closed
and false by the time the band ran above it was assembled into the same file —
band two and band three were open at once, each writing this file, and band three
merged first. **Nothing in wayfinding could have caught it**, which is the G36
lesson a third time; what catches it is the Summary, recounted mechanically over
the 35 sections after both landed. The count band three's own reader needs is
there, not here.

---

## The decay re-read — category 5 against a bound restated after every band ran

[#144](https://github.com/mephistopheles4/stacks/issues/144), 2026-08-15, against
`ae674de`. Not a band: no row is deep-passed here and no plant is run. Every
other verdict in this file is untouched.

[#138](https://github.com/mephistopheles4/stacks/issues/138) restated category 5
— from *"a load-bearing claim that drifted"* to ***"a load-bearing claim whose
truth was never established, or never re-established, against a check that was
available"*** — and admitted **gate-spec docblocks** as a subject, on the measured
ground that a docblock is keyed to its row by G19 forcing slug to equal file stem
where `docs/gates.md`'s prose is not. Both changes landed *after* all four bands
closed, so **every decay verdict in this file was reached under a rule that no
longer applies.**

### The population, and a correction to the ticket that commissioned this

⚠️ **#144's stated population does not survive a mechanical recount, and the
correction is the first result of the pass.** Counted over the 35 sections at
both `f3505ee` (the commit #144 cites) and `ae674de` — identical, so this is not
drift:

| | #144's body | counted |
| --- | --- | --- |
| `clean` | 23 | **27** |
| `exposed` | 11 | **6** |
| resolves to neither token | 1 (G34) | **2 (G34, G35)** |

Five rows filed as *exposed* read `- **Decay** — clean.` verbatim — **G10**,
**G13**, **G15**, **G21**, **G30** — and **G35**, filed as *clean*, is a second
row resolving to neither token. The mechanism is **not established**: *"any
`exposed` anywhere in the section"* would explain the five, but **G1**'s weakening
bullet reads `exposed` and #144 files G1 as clean, so that route is ruled out and
the real one is unknown. Recorded as unknown rather than guessed at.

⚠️ **Counting note, because the naive sweep is wrong by one row.** **34** bullets
match `^- **Decay** —` followed by a space, not 35: **G26** carries its verdict on a merged
`- **Vacuous green / decay**` bullet. A recount that misses it silently drops the
row whose decay finding is among the file's strongest.

**Scope: 28 rows** — the 29 not-exposed, less **G34**, whose decay nomination
band four discharged by demonstration three days ago. ⚠️ #144's own arithmetic
(*"24 − 5 = 19"*) subtracts G12, G18 and G24 twice: they were already out as
exposed. **G6 stays in** — band four ran it for *routing around* and never touched
its decay line — and that decision earned a finding.

The 6 exposed rows are **out**, on #144's one-directional argument: a widened
bound cannot clear an exposure.

### Two rules this pass had to settle first

Neither was decidable from #138 alone, and both are handed to
[#120](https://github.com/mephistopheles4/stacks/issues/120) to confirm.

**Rule 1 — the discharge test: re-measure the nomination's claim, not the fact.**
Band four's *"a decay flag is discharged by re-measuring, not by planting"* leaves
open *what* gets re-measured. Read forward from its own two outcomes, the answer
is the nomination's claim — typically *"this load-bearing claim is held by
nothing."* **G34** failed because that claim was false (the property is asserted
and a plant turns it red). **G35** survives because it is true (nothing reaches
bare `§N`). Without this rule the two rows are indistinguishable, since the
underlying fact is currently fine in both.

**Rule 2 — the docblock surface does not double-count categories 2 and 3.** A
docblock overstating **the gate's own reach** is *satisfying the letter* or
*routing around*, and stays there — band one's **G31**, band three's **G1**
remedy. A docblock asserting a fact whose **truth-maker lives outside the gate
spec** — another document's text, another file's contents, a third-party tool's
behaviour — is the decay surface. The test is mechanical: *where does the thing
that makes this sentence true or false live?* Without it this pass either
re-litigates dispositioned findings or drops rows silently.

### Method, and the two ways the instrument was wrong before it was right

**Pass 1, mechanical, all 35 rows.** Every quotation of 25+ characters in every
gate docblock, matched against the 63 normative documents — `CLAUDE.md`,
`CONTRIBUTING.md`, `SECURITY.md`, `CONTEXT.md`, `docs/gates.md`, `docs/spec/`,
`docs/adr/`. **Result: one stale quotation, and it is the already-known G12.**
That is a negative result and it is worth having: the docblock surface #138
opened yields **no new stale quotation anywhere in the file.**

⚠️ **The sweep gave a clean answer twice before it gave a true one, both times in
the flattering direction** — #126's counting-script bug, twice more:

- **PowerShell's `-like` treats a backtick as an escape character**, so every
  quotation containing a code span silently failed to match. G3 and G4 reported
  stale; both are verbatim correct.
- **Widening the corpus to all 114 tracked `.md` files made the one true positive
  disappear** — G12's superseded sentence is preserved, correctly, in
  `docs/log/`. A quotation must be checked against *the document it claims to
  quote*, not against the repository.

**Pass 2, by hand, the unquoted external-fact claims.** Eleven rows measured
individually: **G3** (CLAUDE.md invariant 3, verbatim ✓), **G4**
(`update-book.test.ts` asserts with `toContain` — 11 occurrences ✓), **G6**,
**G7**, **G8** (CLAUDE.md's *"do not change without updating this file"* heading
✓), **G10** (`covers/cover-path.test.ts` exists ✓), **G11** (`dev-watch.ts:114`
does pass `--public` ✓), **G17** (ADR-0019 does accept the drift, at its `:11` ✓),
**G32** (`enrich.ts` guards every write on `=== undefined` ✓), **G33**
(`types.ts:51`: *"there is deliberately no `body` field"* ✓), **G35**.

### Results

**Three verdicts corrected to `exposed`, all `gated`** — G6 and G7 from `clean`,
**G35 from `nominated, unconfirmed`**. Detail in each row's Decay re-read block;
one line each here.

| Row | Was | Now | The claim |
| --- | --- | --- | --- |
| **G6** | `clean` | `exposed` | The docblock says *"Two things pass"*; three do, and the third is value-imported by the site today. |
| **G7** | `clean` | `exposed` | *"`@astrojs/check` cannot run under TypeScript 7"* — a third-party tool at a version, never established here, unassertable. |
| **G35** | `nominated, unconfirmed` | `exposed` | The `§11.x` map from gate to spec is held by nothing; the nomination's own claim re-measures true. |

⚠️ **G7 returns to the flagged side and G34 leaves it, so the total is unchanged
at 24 of 35 while the membership is not.** Band two moved G7 off the flagged side
by correcting two verdicts on three failed plants — work this pass does not touch;
decay is the fifth category and was never demonstrated against. G34 moves the
other way, band four's refutation reaching the verdict line it refuted. **Two
rows crossing in opposite directions is exactly what a carried-forward total
hides**, which is why the Summary's count is recounted over the 35 sections
rather than adjusted.

⚠️ **This paragraph read *"the total returns to 25"* until CodeRabbit caught it on
[#149](https://github.com/mephistopheles4/stacks/pull/149), and it is the sharpest
thing in this section.** It was written before this pass decided to land G34's
correction, and never revisited once that decision made the number 24 — so the
file carried **two contradicting aggregate claims, 24 in the Summary and 25 here,
inside the register whose subject is claims that quietly stop being true**. The
Summary was recounted mechanically and this sentence was carried forward in
prose; that is the whole difference, and it is band three's closing-count failure
committed by the pass that cites band three's closing-count failure.

**One nomination raised and refused**, recorded because refusing it is the useful
half: **G6**'s pure-subpath purity looked unheld from the docblock and is in fact
*measured* by `pureSubpaths()`. Band two's rule — *a claim about a gate is read
from the gate, not from the gate's prose* — catching a nomination **mid-pass**
rather than after publication, which is the first time on this map it has been
cheap.

### ⚠️ What was not reached, stated rather than left to be inferred

~~**Seventeen of the 28 in-scope rows got the mechanical sweep and a read of their
docblock, but no individual external-fact measurement**: **G1, G2, G5, G9, G13,
G14, G15, G16, G19, G20, G21, G22, G23, G27, G28, G30, G31**.~~ The honest boundary
is that pass 1 covered all 35 for **quotations** and pass 2 covered eleven rows
for **unquoted claims**. A row not individually measured carries a `clean` decay
verdict that has now survived a quotation sweep and nothing more.

⚠️ **Superseded 2026-08-16 — and this list went stale by the same failure its own
warning below describes, one paragraph away from it.** The decay re-read part two
individually measured **eight** of the seventeen — **G5, G9, G16, G20, G21, G22,
G27, G28** — and **G21 moved to `exposed` off one of them**. Derived
mechanically as *in-scope minus measured*, which is how the ⚠️ below says this
list should have been produced in the first place, **nine remain**: **G1, G2,
G13, G14, G15, G19, G23, G30, G31**. Marked rather than rewritten, so the
boundary each pass actually reached stays visible.

⚠️ **This list was wrong in both directions on first publication, and only one
direction was caught by review.** It named **G32** and **G33**, which the
paragraph above records as measured, and it ended *"and the remaining clean
rows"* — a phrase doing the work of an enumeration while naming nothing, which
omitted **G1**, **G13** and **G15**. CodeRabbit caught the two wrongly included on
[#149](https://github.com/mephistopheles4/stacks/pull/149); the three wrongly
omitted were found only by deriving the list mechanically as
*in-scope minus measured*, which is how it should have been produced in the first
place. **The count 17 was right while its members were wrong**, which is the
failure mode a total can never expose.

⚠️ **Fourteen of the 28 were cleared with a *number* test** — *"clean; no
load-bearing number"* (G3, G4, G5, G8, G9, G11, G16, G27, G32, G33) or *"no
measured-once number"* (G17, G20, G21) or G22's *"not a number the row currently
rests on"*. **The restated bound asks about load-bearing *claims*, and a claim
need not be numeric** — #138's own headline specimen, *"it published first"*, is
not a number. Those ten clearances are the likeliest place a further pass finds
something, and the wording is left in place rather than rewritten, so the next
reader can see which test each verdict was reached under.

**Cost:** ~55 min; 1 vitest invocation (baseline, 636 of 636), ~14 read-only
sweeps, 0 plants. Band four's finding holds and strengthens: **re-measurement is
cheaper than orientation**, and a mechanical sweep over 35 rows cost less than any
single row of band one.

---

## The decay re-read, part two — the fourteen cleared on a number test

Commissioned by [#150](https://github.com/mephistopheles4/stacks/issues/150),
which is the block above admitting it did not finish. Two verdicts move, one
keeps its verdict and loses its reason, and **the file's own definition of the
category was still the superseded one** — found by reading the definition rather
than any row.

### The population, and a correction to the ticket that commissioned this

⚠️ **Recounted before starting, as #150 instructs, and its population is one row
short.** #150 lists fourteen, derived from three wordings: *"no load-bearing
number"* (G3, G4, G5, G8, G9, G11, G16, G27, G32, G33), *"no measured-once
number"* (G17, G20, G21), and G22's *"not a number the row currently rests on"*.
A fourth wording exists and neither #144 nor #150 caught it — **G28**, cleared on
*"no constant in the current row is stated as measured once"*, which is the old
numeric bound in different words. **Scope is fifteen**, and the extra row is the
one a three-string match could not see. #150 asked for exactly this check rather
than for trust, and the check earned its place on the first pass.

⚠️ **The instrument was wrong once, in the flattering direction, and the fault
was the pattern rather than the data.** A first sweep for `**Decay**` returned
**34 of 35** sections — silently, since 34 bullets is a plausible answer.
**G26** states `- **Vacuous green / decay**` as one merged bullet, so a match on
the bare category name skips it. Widened to any bolded label containing *decay*,
the count is 35 and the totals reconcile with #144's landed **26 clean / 9
exposed** exactly. This is [#126](https://github.com/mephistopheles4/stacks/issues/126)'s
em dash and #144's three instrument faults a fifth time: **every one of the five
has failed toward a tidier answer**, which is now a strong enough regularity to
state as an expectation rather than a coincidence.

⚠️ **A sixth, caught in review of this block rather than by the pass, and it
strengthens the regularity rather than denting it.** This paragraph first said
*eleven* rows carry fewer than five verdict bullets. It is **ten**. The eleventh
was **G1**, which the first script reported at **seven** bolded bullets because
its two demonstration items — *"A vault note read through `node:child_process`"*,
*"A tracked `.mjs` under `packages/`"* — are formatted like verdicts and are not
verdicts. So the artifact was the *opposite* direction (a row with **more** than
five, not fewer) and it still produced the tidier sentence, because *eleven*
absorbed it silently while *ten plus an outlier* would have raised a question.
**The counting script that produces every total in this file filters bullets to
the five category names; the exploratory one did not**, and the number that
reached prose came from the exploratory one.

**The classifier, stated so the next pass can reproduce it rather than rewrite
it** — added on review of
[#151](https://github.com/mephistopheles4/stacks/pull/151), against
[`32e808a`](https://github.com/mephistopheles4/stacks/commit/32e808a):

- A **row** is a line matching `^### G(\d+) `; its section runs to the next
  `^##` or `^###`. Expect **35**.
- A **verdict bullet** is `^\s*-\s+\*\*<label>\*\*` where `<label>` matches
  `weakening|satisfying|routing|vacuous|decay`, case-insensitive — **the filter
  the exploratory script lacked**, and what excludes G1's two demonstration
  items. A bullet absorbs following lines until the next blank line, bullet, or
  heading, so a **wrapped** verdict is read whole (#144's third fault).
- A bullet's **verdict** is the first of `exposed` / `nominated` / `clean`
  after the em dash, with optional bold markers. Anything else is
  `UNADMITTED`; expect **0**.
- A row is **flagged** if any of its verdict bullets is not `clean`. Decay is
  the bullet whose label *contains* `decay`, which is what catches G26's merge.

⚠️ **A committed script was put and refused.** The register has never shipped
one — #126, #144 and this pass all describe their instrument's faults in prose —
and a script under `gates/` or `scripts/` would be new executable surface added
by a **docs-only** pass, inheriting [#116](https://github.com/mephistopheles4/stacks/issues/116)'s
mutation-scope question and [#113](https://github.com/mephistopheles4/stacks/issues/113)'s
observed-red obligation for a check nothing yet requires. The predicates above
are the reproducible half at none of that cost. **If the totals ever need to be
gated rather than recomputed, that is a row, and it is
[#120](https://github.com/mephistopheles4/stacks/issues/120)'s call, not a
by-product of a re-read.**

**A structural fact the widened sweep establishes, recorded and deliberately not
acted on.** **Ten** rows carry fewer than five verdict bullets, merging categories
that one exposure answers together — but **G26 is the only row in the file whose
*decay* verdict is not separable from another category's**. Every other merge
(G12, G17, G20, G21, G22, G23, G24, G25, G34) keeps Decay as its own bullet.
So #144's aggregate of *9 exposed* is reachable only by reading G26's merged
bullet as decay-exposed — a defensible reading, since the incident is
genuinely both, but **one nobody has ever stated**. Splitting it is not this
pass's to do: G26 is an exposed row, restructuring its verdicts re-decides it,
and #150's scope excludes the exposed six. Handed to
[#120](https://github.com/mephistopheles4/stacks/issues/120) as a naming
obligation, not a verdict.

### ⚠️ The file still defined category 5 by the bound #138 replaced

**The single most consequential thing this pass found, and no row surfaced it.**
`## The five categories` — line 113, where every triage of every future row
starts — read:

> 5. **Decay** — does the row rest on a load-bearing claim measured once and
>    never re-measured?

That is the **pre-[#138](https://github.com/mephistopheles4/stacks/issues/138)**
bound. #138 restated it to *"whose truth was never established, or never
re-established, against a check that was available"*, #144 moved three verdicts
under the restatement, and **neither touched the definition list**. The file
therefore stated the superseded bound at the top and the restated one 640 lines
down, inside the block that applied it — the same shape as
[#149](https://github.com/mephistopheles4/stacks/pull/149)'s *"Total flagged: 25
of 35"* against the Summary's 24, and band three's closing count before it, with
the difference that **this one governs every future verdict rather than
describing a past one**. A reader triaging a new row against "category 5" as the
file defines it would have applied a bound the map retired.

Marked in place rather than replaced, on the file's mark-never-delete rule: the
old wording stays, dated, with the restatement beside it. **Nothing is
re-decided** — #138 owns the bound and #150 explicitly does not reopen it; what
changes is only that the file now says what was already true.

### Results — two verdicts move, both `gated`

**G21 `no-live-network` — `clean` → `exposed`.** The docblock's scope claim is
*"What it covers is `fetch`, in this process — which is every request this repo
makes, **since nothing here uses `node:http` directly**."* That last clause is
false, and **was false when it was written**: `scripts/smoke-render.ts:18` imports
`createServer` from `node:http`, and has since
[`1b48730`](https://github.com/mephistopheles4/stacks/commit/1b48730)
(2026-07-31), while the sentence was authored in
[`95a9edb`](https://github.com/mephistopheles4/stacks/commit/95a9edb)
(2026-08-03) — three days later. Never established, by a check that was one
`git grep` away.

⚠️ **The conclusion survives and the warrant does not, which is the whole
finding.** `createServer` serves; it does not request — so *fetch is every
request this repo makes* still holds today, by an argument the docblock does not
make. A reader who checks the stated reason finds it false and has no way to tell
whether the conclusion went with it.

**Not a double-count with the routing-around verdict**, which is already
`exposed` and quotes the first half of the same sentence. #144's Rule 2 splits
them cleanly: *"what it covers is `fetch`, in this process"* is a claim about
**the gate's own reach** and stays in categories 2 and 3; *"nothing here uses
`node:http`"* is a claim about **the repository's files**, whose truth-maker
lives outside the gate spec, and is the decay surface. The routing-around
concession is about *future* non-`fetch` APIs; nobody conceded a present false
statement.

**Remedy (named, not built):** have the G21 spec assert its own scope claim —
scan **every tracked executable source file** for network-capable APIs outside
`fetch` and fail on any not carrying a written exemption, with
`smoke-render.ts`'s server import as the first exemption and its reason (*it
serves, it does not request*) beside it. That turns the docblock's sentence from
prose into the thing the row already claims it is. `gated`: real, unclosed,
remedy is a named check, and nothing in the repo had conceded it.

⚠️ **This remedy first said "scan tracked `.ts`", and that version shipped the
routing-around hole this file already catalogues twice — corrected on review of
[#151](https://github.com/mephistopheles4/stacks/pull/151).** Band three found
**G1** green against *"a tracked `.mjs` under `packages/`"*, and band four found
**G6** green against an **`.astro` `<script>`** carrying the forbidden statement
*verbatim*, because `siteFiles()` does not open that file type. The repo has one
tracked `.mjs` (`packages/site/astro.config.mjs`) and four tracked `.astro`
files. **A `.ts`-only glob is the cheap way past a narrow scan** —
[#124](https://github.com/mephistopheles4/stacks/issues/124)'s reason for
sweeping `.github/**/*.yml` rather than `workflows/` — so the extension list is
part of the remedy and not an implementation detail, and the exemption list takes
`expectFound` and a reason per entry on `ignoreGhsas`'s shape.

⚠️ **A category-3 hole inside the remedy for a category-5 finding, in the file
that catalogues both, proposed by a pass whose whole subject is claims nobody
checked.** Recorded rather than quietly corrected, because it is the sharpest
evidence on this map that **the register's findings do not reach the person
writing the next remedy** — two bands demonstrated this exact hole and neither
reached a remedy written after both had landed.

**G33 `enrich-idempotence` — `clean` → `exposed`.** The docblock opens **"The
only gate that reaches the `## About` body insert"** and rests the row's separate
existence on **"so G32 cannot see that write at all."** Both are false, and both
were false **in the commit that wrote them** —
[`1d0548f`](https://github.com/mephistopheles4/stacks/commit/1d0548f) authored
this docblock and `gates/absent-only.test.ts`'s body handling together.
`gates/absent-only.test.ts:131` calls
`vault.insertBodySection(book!.sourcePath, '## About', …)`, and its
byte-identical assertion at `:136` **would go red** if that write ever stopped
being absent-only: G32 seeds the heading, runs the pass, and compares the whole
file. G32 does not merely reach the write — it covers it, incidentally.

⚠️ **The two files coordinate and the sentence still overstates.**
`absent-only.test.ts:130` reads *"G33 owns that write; this row owns the
frontmatter"* — a deliberate division of labour, not an oversight, which is why
this is a wording defect and not a design one. But the register repeats the false
premise in a **second place**: G33's *Satisfying the letter* verdict cites *"G32
cannot see the `## About` body insert at all"* as its supporting evidence. That
verdict is not this pass's to move (#128 Rule 1 — a row leaves with its band's
category dispositioned and the others open), so it is **noted, not edited**, on
band two's precedent for G20's residual.

**Remedy (named, not built):** correct the docblock to the claim that is true,
which takes three verbs rather than two — ⚠️ *this remedy first said only "G33
asserts it, G32 depends on it", which understates the finding above it and was
corrected on review of
[#151](https://github.com/mephistopheles4/stacks/pull/151)*:

- **G33 `asserts`** the body insert's idempotence — deliberately, as its
  whole-pass claim, and it **owns** the guarantee.
- **G32 `depends` on it.** Its own comment at `:127–130` says so: without an
  absent-only body write *"the pass legitimately adds one and the byte-identical
  assertion below fails for a reason that has nothing to do with absent-only."*
- **G32 also `detects` its failure, incidentally**, which is the half the
  docblock denies. The dependency and the detection are the same assertion read
  two ways, and *"G32 cannot see that write at all"* is false on the second.

Have both specs' comments state that division — `absent-only.test.ts:130`
already states the ownership half correctly (*"G33 owns that write; this row owns
the frontmatter"*) and `enrich-idempotence.test.ts` contradicts it. `gated`, on
the same reasoning as G21: nothing conceded it in writing, and the concession
that exists (`:130`) asserts the opposite.

⚠️ **Both exposures ship with `Observed-red line: not recorded`, and that is the
rule rather than an oversight.** Band four settled it: **a decay flag is
discharged by re-measuring, not by planting**, and filling an observed-red line
is *"a separate errand"*. Neither finding here is a defect a plant could
demonstrate — a false sentence in a docblock has nothing to go red — so **0
plants** is the correct cost, not a shortfall. Band two counted rows lacking an
observed-red line, so this is said out loud: G21 already carries two from band
one, **G33 still carries none**, and this pass did not add one.

### The verdict that stands and the reason that does not

**G20 `public-build-artifact` — stays `clean`, reason corrected.** Its clearance
reads *"no measured-once number underlies the row"*. A measured-once number does
underlie it: the docblock closes on *"what **the seven text-matching gates in
this folder** cannot do."* `gates/` held **17** `.test.ts` specs when that
sentence was written
([`1168650`](https://github.com/mephistopheles4/stacks/commit/1168650),
2026-08-03) and holds **29** now, with **20** importing `repo.ts`'s text
helpers.

⚠️ **What that does *not* establish, corrected on review of
[#151](https://github.com/mephistopheles4/stacks/pull/151): the subset was never
measured.** This paragraph first read *"so **seven** cannot still be right"*, and
the two numbers behind it are the **whole folder** (17 → 29) and the **`repo.ts`
importers** (20), neither of which is *"text-matching gates"* — a category with
no mechanical definition anywhere in this repo, which is why it was not counted
rather than an oversight. The subset could in principle still be seven. **An
inference stated as a measurement, inside the pass whose subject is exactly
that**, and it is left visible rather than swapped out: the honest form is *the
population this number describes has moved and nobody re-derived the number*,
which is all the decay bound needs and all that was checked.

⚠️ **It is excluded anyway, and the exclusion is the point.**
[#113](https://github.com/mephistopheles4/stacks/issues/113) bounded decay to
claims *a decision or a procedure rests on*, which is what admitted the stale
`133 tests in ~2s` and **excluded the slug count**. Nothing rests on *seven*: it
is a rhetorical contrast inside an argument that holds whatever the number is.
Same class as the slug count, and excluded on the same precedent. **The verdict
was right and its stated reason was wrong**, which is a distinction this file has
now made three times — band two's G7, #144's five rows filed as exposed that read
`clean` verbatim, and this — and which no total can expose.

### Twelve rows re-measured and cleared, with what was checked

Each nomination's **own claim** was re-measured, per #144's Rule 1 — not the fact
it worries about.

| Row | The claim, and where its truth-maker lives | Result |
| --- | --- | --- |
| **G3** | *"The final test asserts the corpus reaches all three kinds"* | Holds — `bad-note.test.ts:138–144`, `expectFound(…, 3)` and an exact set match |
| **G4** | *"`adapters/update-book.test.ts` asserts with `toContain`"*; *"G1 deliberately does not scan `gates/`"* | Both hold — 11 `toContain` calls; `adapter-boundary.test.ts:26–29` states the scope note |
| **G5** | *"`library.json` … gitignored"* | Holds, **and is asserted** — `repo-hygiene.test.ts:129–132` checks `isIgnored` for both paths |
| **G8** | The `shelf_order` drift story; three in-spec assertions | Historical; assertions are structural and in-spec |
| **G9** | *"Variables supplied by the platform, not by this project's `.env`"* (`PROVIDED_BY_PLATFORM`) | Holds. ⚠️ The list is **not reverse-asserted** — a category-3 allowlist matter, not decay, per the double-count rule; handed on rather than claimed here |
| **G11** | *"the dev flow uses `--public` and is fine"* | Holds — `scripts/dev-watch.ts:114` passes `--public` |
| **G16** | *"no load-bearing number"* | Stands. ⚠️ Observation only: `smoke-render.ts:708` hardcodes `× 24` to report cm, against `scene.ts:1056`'s *"1 unit ≈ 24cm"*, unasserted — but it formats a **message**, not the `0.005` threshold, so nothing rests on it |
| **G17** | *"ADR-0019 already accepts that the live site may drift from `main`"* | Holds — `docs/adr/0019-deploying-is-local.md`, the 2026-08-01 entry, verbatim |
| **G22** | *"It is now pinned behaviourally … in `covers/cache-cover.test.ts`"* | Holds — `:170` *"asks for the large cover before the small one"*, asserting `fetched()[0]` is the large URL |
| **G27** | *"issue #62 read `7 with gaps, would fill 1, 5 left alone` off this output"* | Holds — ⚠️ **in the issue's comments, not its body**; a body-only check returns *not found* and would have produced a false exposure |
| **G28** | *"`smoke:render` measures `Box3.setFromObject` against the case's real inner faces"* | Holds — `scene.ts:858`, surfaced to the gate through `window.__shelf.caseOverflow` |
| **G32** | *"every write is `if (book.X === undefined)`"* | Holds — `enrich.ts:177–229`, and `:190` carries the same sentence as an in-file comment |

⚠️ **G27 is the one that nearly went the wrong way, and it is the general
lesson.** Its truth-maker is outside the repository entirely — a GitHub issue,
which **G21 forbids any gate from fetching** — so it sits in exactly G7's
structural position, the second member #144 gave
[#124](https://github.com/mephistopheles4/stacks/issues/124)'s *"relied upon and
unverifiable"* clause. The difference is that G27's claim is **true**, so the
nomination fails on #144's Rule 1 and the verdict stands. **Unverifiable by a
gate is not the same as false**, and a pass that conflated them would have
manufactured an exposure out of a location fact.

### ⚠️ Two corrections back to the block above

Both found by reading #144's own output rather than by looking for them.

1. **#144's *"the only place in the file where a band's correction never reached
   the verdict it corrected"* (G34) is false — there is a second, and it is
   G21.** Band one's deep-pass block states, in terms, *"The category-4 line
   above should now read **clean, demonstrated** rather than **exposed,
   historical, fixed**"* — and the bullet still reads `exposed`. Identical shape
   to the G34 case #144 landed. **Not edited here**: it is band one's verdict and
   category 2/4, not decay, and moving it changes no total (G21 stays flagged on
   its weakening and routing-around verdicts either way). Recorded so the next
   pass does not have to rediscover it.
2. **#144's own count of its number-test clearances is internally
   inconsistent**: the paragraph opens *"Fourteen of the 28 were cleared with a
   number test"*, enumerates 10 + 3 + 1 = 14, and then closes *"Those **ten**
   clearances are the likeliest place a further pass finds something."* The ten
   names the first sub-list only; the sentence reads as the whole population. Left
   marked rather than rewritten.

**Cost:** ~40 min, **0 plants**, 1 counting script (wrong once), ~16 read-only
sweeps, 0 vitest invocations beyond the closing suite run. Band four's
*re-measurement is cheaper than orientation* holds a third time. ⚠️ **The two
findings both came from the same question** — *was this true when it was
written?* — rather than from *has this drifted?*, which is #138's restatement
paying for itself: under the old bound neither row had a measured-once number and
both would have cleared again.

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

**Deep pass (2026-08-12, band two) — disposition: `accepted`.**

`docs/gates.md` already says the canary rule is *"still a text match by
construction"*. This pass turned that sentence into a demonstration, and it took
three plants, because the first two were defeated by things nobody was claiming
credit for.

An `excerpt` field added to `BookRecord` and populated from the note body — a
plausible *"preview snippet"* feature — **left the gate 12 of 12 green**, because
`toLibraryBook` in `packages/core/src/library.ts` enumerates its fields and
silently dropped it. That is a real structural guard, and it is not this gate.
Extending the plant through `toLibraryBook` so the field actually reaches
`library.json` failed 1 of 12 — but only because **8 of the 12 fixture notes carry
the literal canary as their first body line**, so the check fired on a coincidence
of the corpus rather than on the property. Isolating it settles the question: a
one-book vault whose body is real reading prose, taken verbatim from an existing
fixture note that has no canary in it, published with the same plant in place,
**ships that prose into `library.json` while `json.includes(NOTE_BODY_CANARY)` is
`false`**. G2 reports clean over a build carrying a note body.

⚠️ **The interaction with G30 is worth carrying forward, and it is not what the
first reading of it suggests.** `gates/library-seam.test.ts` runs its three checks
over `Object.keys(FULL)` — **a hand-written record literal, not the `BookRecord`
type** — and `FULL: BookRecord` type-checks while missing any *optional* field,
which is nearly every field the contract has. So a body-derived `excerpt?: string`
added to the type and to `toLibraryBook` and **not** added to `FULL` is invisible
to G30 in both directions at once: no build G30 inspects contains it, so neither
the carries-every-field check nor the key-trace has anything to say about it. And
if somebody *does* add it to `FULL`, as that const's own docblock urges, G30 then
**requires it to reach `library.json`** unless it is named in `NOT_PUBLIC` with a
sentence.

Either way, what stands between a body-derived field and the published artifact is
a hand-maintained literal and whoever is reviewing — not a gate. Flagged for
[band three](https://github.com/mephistopheles4/stacks/issues/133), which owns
G30; not edited there, and **not a defect in G30**, whose direction is the right
one for the seam it guards.

⚠️ **This paragraph said something stronger and wrong until G30's source was
read** — *"G30 requires it to ship"*, asserted from the gate's docblock rather
than from `Object.keys(FULL)`. Left recorded rather than quietly fixed: a claim
about a gate, written from the gate's prose, inside the register of gates whose
prose exceeds their reach.

⚠️ **Band three reached the same mechanism from the opposite side, in parallel,
and its verdict is the one to read.** Its G30 entry demonstrates that **a new
field wired end-to-end through the frontmatter contract never reaches
`library.json` at all, 636 of 636 green** — the *under*-shipping failure, where
this row worried about over-shipping. Both are `Object.keys(FULL)` being a hand
list: it cannot notice a field that was never added to it, in either direction.
**Two bands, two opposite fears, one blind spot** — which is a better argument
for reading the gate's source than either finding alone. G30's disposition is
band three's `gated`; nothing here overrides it.

**`accepted` rather than `gated`** because the limit is already recorded, four of
the five gaps it names are closed, and reaching the exposure needs a deliberate
multi-file feature that reads note bodies — invariant 2's *"nothing below the
frontmatter block is parsed"* has to fall first. The remedy below is available,
not adopted.

**Named remedy (not built):** a differential check — build one note twice with
different randomised, non-canary bodies and assert `library.json` is byte-identical
— which tests the property (no field is sensitive to body content) instead of a
string.

**Observed-red (this pass):** the isolated one-book vault is the demonstration and
⚠️ **it is not a vitest run** — a standalone probe driving `publish()` directly.
The in-suite runs were 12 of 12 green with the field dropped, and 11 of 12 with it
shipping, that single failure caused by fixture coincidence rather than by the
plant.

**Other categories:** Weakening, Routing around, Vacuous green, Decay — all
`clean` in triage, **open**, not re-verified.

⚠️ **Not observed:** whether `insertBodySection`'s `## About` write path could
become a read path — the risk `CLAUDE.md` names by name. This pass added no
evidence either way.

**Cost:** ~18 min, 2 file-scoped vitest runs and 2 standalone probes.

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
- **Routing around** — **exposed**, ⚠️ *upgraded from `nominated, unconfirmed`
  by band two, which demonstrated both halves.* Read directly in
  `gates/commands.test.ts`: `cliCommands()` extracts subcommands with a single
  regex (`.command('name')`) against `packages/cli/src/index.ts`, and
  `packageScripts()` reads only the root `package.json`. A command registered
  outside that literal call shape, or a script living in a workspace
  package's own `package.json` rather than the root, would not be swept.
  Not corroborated by `docs/gates.md`; this triage's own reading of the spec —
  and both are live, see the Deep pass block.
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

**Deep pass (2026-08-12, band two) — disposition: `repaired`, and the row's
*other* nomination is the live one.**

The historical defect re-plants cleanly. Removing the `covers` line from
`CLAUDE.md`'s Commands block, leaving `status`'s description with the word
*"covers"* in it, fails `documents every CLI subcommand` by name under today's
anchored regex — 4 of 5. Reverting **the gate** to the historical bare `\bname\b`
form with `CLAUDE.md` still broken passes **5 of 5**. That is the original false
negative reproduced on the current tree, and it converts the claimed repair into
an observed one: the anchor is what holds, and it holds.

⚠️ **The routing-around nomination was confirmed twice, and one half needed no
plant at all.** Adding `.alias('stats')` to the `status` command — a real,
commander-registered subcommand that would run — leaves the gate **5 of 5 green**,
because `cliCommands()` matches only `.command('name')`. And
`packages/site/package.json` **already defines a `preview` script that `CLAUDE.md`
does not document**, invisible today because `packageScripts()` reads the root
manifest only. The Commands section's own claim — *"both lists below, in both
directions"* — is true of the lists it builds and not of the repo.

⚠️ **A third shape turned up by accident, and it is a false *positive*.** A plant
whose code comment contained the literal text `.command('name')` was extracted as
a phantom command called `name` and failed the gate loudly. `cliCommands()` does
not blank comments before matching. Harmless in the direction it fires — it
cannot hide a command — but it is the same text-over-structure mechanism running
the other way.

**Named remedy (not built):** read commander's own registered-command list rather
than regexing the source, or at minimum sweep `.alias(` alongside `.command(`;
and sweep every workspace `package.json`, or write down why only the root counts.

**Observed-red (this pass):** `covers` reported missing, 4 of 5, under the current
anchored regex; the same broken `CLAUDE.md` passes 5 of 5 under the historical
regex. The alias plant passes 5 of 5 with a real undocumented command present.

**Other categories:** Weakening, Vacuous green, Decay — `clean` in triage,
**open**, not re-verified. Routing around — **demonstrated**, not dispositioned:
it is not this row's rank-2 category, and per Rule 1 a row leaves its band with
the other verdicts open rather than closed by the visit.

⚠️ **Not observed:** whether commander exposes a runtime `program.commands` list
`cliCommands()` could read — the natural shape of the remedy above, not
prototyped.

**Cost:** ~25 min, 6 vitest invocations including one failed sub-attempt.

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
- **Decay** — **exposed**, ⚠️ *corrected 2026-08-15 by the decay re-read
  ([#144](https://github.com/mephistopheles4/stacks/issues/144)), from `clean`.*
  The docblock opens *"Two things pass"* and enumerates two; **three pass, and
  the third is value-imported by the site today**. See the Decay re-read block,
  which also records the nomination this pass raised first and then refused.

`docs/gates.md` already answers the demonstration; the routing-around question
is not addressed there.

**Observed-red line:** "an inline `import { type X }`" (perturbation).

**Rank:** none (flagged, unranked — the routing-around nomination is not one
of the four ranked shapes).

**Deep pass (2026-08-11, band four) — disposition: `repaired`.**

⚠️ **The nomination is confirmed, by two routes it did not name, while the one
route it did name turned out to be closed.** Three plants.

**Plant A — `await import('@stacks/core')` in `packages/site/src/shelf/boot.ts`:
red**, 1 of 5, on *"accounts for every mention of the specifier"*. Deliberately
so — that test's own comment names the dynamic import and the bare side-effect
import as the gap it exists to close. The nomination's first leg does not
survive.

**Plant B — `import { ObsidianAdapter } from '../../../core/src/index.ts'` in
the same file: green.** G6 passes 5 of 5, the full suite passes **636 of 636**,
`pnpm typecheck` is clean, and `pnpm build` **succeeds**. The bundle really does
pull it in: vite reports `sharp`, `node:fs/promises`, `node:crypto`,
`child_process` and five more *"externalized for browser compatibility"*. Both
regexes match on the literal `@stacks/core`, and a relative path into the
package contains no such literal, so the file is read and nothing in it is seen.

**Plant C — `import { ObsidianAdapter } from '@stacks/core'` inside
`Shelf.astro`'s `<script>`: green.** G6 and G7 both pass; the full suite passes
636 of 636. This is not an exotic spelling — it is the exact statement the row
forbids, in a file the row does not open: `siteFiles()` is
`filesUnder('packages/site/src', ['.ts'])`, and the site has four `.astro` files
whose `<script>` blocks are client bundles like any other.

**The backstop exists, and was measured rather than assumed.** `pnpm
smoke:render` goes **red on both B and C** — *"the shelf never signalled ready.
Page errors: (0 , Op.createRequire) is not a function"* — and it runs in CI in
the same required `gates` check, after `pnpm build`. So the invariant is
defended; it is not defended by this gate. The docblock's own failure claim
(*"no build error… the shelf silently never boots"*) reproduced exactly, twice.

⚠️ **The backstop is narrower than that reads, and the qualification is the
row's, not the suite's** — G25's residue, in the same shape. Both plants landed
in files the client bundle actually pulls in (`boot.ts`, `Shelf.astro`), which is
why `smoke:render` saw them. **A relative value import in a site `.ts` that the
bundle never reaches** — a module only a spec imports — would leave the bundle
clean and `smoke:render` green, and G6 is blind to it either way. Not planted, so
recorded as untested rather than claimed: *"CI catches this"* holds for the two
routes demonstrated and is not established in general.

⚠️ **What that red does not say is the reason this is still `repaired` and not
`accepted`.** `smoke:render` reports a symptom and a minified page error after a
puppeteer run against a built site: no rule, no file, no line. G6's red names
the offending statement and tells you to use statement-level `import type` or a
pure subpath. The whole argument for a structural gate over a smoke test is that
its red is actionable, and these two are not interchangeable.

**Remedy, named and not built** — two additions to the existing gate, neither
needing an allowlist: extend `siteFiles()` to `.astro`, matching the `<script>`
block G7 already extracts; and sweep for relative specifiers that *resolve* into
`packages/core/`, which is a path computation rather than a second spelling to
match. The re-export leg of the nomination is not reproduced as stated — an
`export … from '@stacks/core'` in site code is matched by `CORE_STATEMENT` and
goes red — the real chain is the relative path.

**Observed-red (this pass):** plant A red on *"accounts for every mention of the
specifier"*; plants B and C green on G6 (636 of 636 suite-wide, build clean) and
red on `pnpm smoke:render`.

**Decay re-read (2026-08-15, [#144](https://github.com/mephistopheles4/stacks/issues/144)) — verdict corrected `clean` → `exposed`; disposition: `gated`.**

⚠️ **This entry records a nomination this pass raised and then refused, because
refusing it is the more useful half.** The docblock says of the pure subpath *"It
imports nothing"* — a load-bearing claim about **a different file**, which is what
makes the subpath exempt from the rule the row exists to enforce. The obvious
reading is that nothing holds it: let `shelf-order.ts` acquire one import and the
site's value import of it becomes a `node:fs` edge into the browser bundle, which
is G6's own failure verbatim.

**The reading is wrong, and reading the gate instead of its prose is what
settled it.** `pureSubpaths()` does not name the subpath — it **measures** it:
a subpath passes only when `packages/core/package.json` exports it *and*
`importsNothing()` finds no imports in the file it points at. A single import
added to `shelf-order.ts` drops it out of the exempt set and turns
`packages/site/src/shelf/books.ts:6` into an offender. The property is asserted,
by a mechanism whose own comment says why the earlier hardcoded name was the
wrong shape: *"an allowlist entry says nothing about whether the module it names
still imports nothing. The name was the check."* This is band four's G34 outcome
arriving from the other direction, and band two's rule — *a claim about a gate is
read from the gate, not from the gate's prose* — catching a nomination mid-pass
rather than after publication.

⚠️ **The exposure is the sentence directly above that mechanism.** The docblock's
`:10` list opens **"Two things pass"** and names `import type` and
`@stacks/core/shelf-order`. **Three pass.** `packages/core/package.json` exports
`./shelf-order` *and* `./subjects`; `subjects.ts` has **0 imports**, so
`pureSubpaths()` admits it; and `packages/site/src/shelf/card.ts:7` value-imports
`@stacks/core/subjects` today, at **636 of 636 green**. `CLAUDE.md:150` carries
the same singular: *"a pure subpath — `@stacks/core/shelf-order` — that imports
nothing."*

**The shape is precise, and it is the mirror of band one's G31.** G31 was a
docblock claiming **more** reach than the gate has. This is a docblock claiming
**less**, and it decayed *because* the gate was generalised: the same commit that
replaced the hardcoded name with a measurement left the enumeration eleven lines
above it naming one. Nothing operational rests on the prose — the gate derives
its own list — so the cost is not a false green. It is that both documents a
contributor would consult tell them a legitimate import is forbidden, and
`card.ts:84` already carries a comment reasoning about what is *"not importable
here (G6)"*.

**Named remedy (not built):** the population exists as a value in the tree —
`pureSubpaths()` already computes it — so
[#138](https://github.com/mephistopheles4/stacks/issues/138)'s adopted rule
applies and the check is nearly free: assert that the subpaths named in the
docblock and in `CLAUDE.md:150` equal `pureSubpaths()`. ⚠️ **It is a prose
assertion, which #113 declined in general on *"prose has no key"*** — admissible
here for #138's stated reason: this prose *does* have a key, the exports map.

**Observed-red (this pass):** none planted; discharged by re-measurement, per
band four's rule. `shelf-order.ts` 0 imports, `subjects.ts` 0 imports, `exports`
holds exactly `.`, `./shelf-order`, `./subjects`, suite 636 of 636.

### G7 — `astro-no-logic`

**Gate:** [`gates/astro-no-logic.test.ts`](../gates/astro-no-logic.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean.
- **Satisfying the letter** — **clean**, ⚠️ *corrected from `exposed` by band
  two, which could not reach a green suite in three planted attempts.* The nomination
  read: exposed, current and self-acknowledged by the repo's own CodeQL triage
  — `js/bad-tag-filter` fired on `SCRIPT_BLOCK` in this spec, flagging the
  regex as approximate; `docs/gates.md` records that the miss it warns about
  already throws (line 135) and dismisses the finding as "used-in-tests"
  rather than closing the underlying approximation. **The approximation is
  real and the exposure is not**: every truncation it admits leaves debris no
  bootstrap-shape pattern accepts. See the Deep pass block, including the
  reason that defence is thinner than a `clean` verdict makes it sound.
- **Routing around** — **clean**, ⚠️ *corrected with the above, being the same
  limit from the other side*: "Fixing it properly means an HTML parser
  dependency... to protect against a first-party commit," explicitly declined.
  The same three plants answer both.
- **Vacuous green** — clean; the miss throws rather than passing silently.
- **Decay** — **exposed**, ⚠️ *corrected 2026-08-15 by the decay re-read
  ([#144](https://github.com/mephistopheles4/stacks/issues/144)), from `clean`.*
  The docblock's opening claim is about a **third-party tool at a version**:
  *"`@astrojs/check` cannot run under TypeScript 7 — TS 7's native compiler does
  not expose the programmatic API the Astro language server needs."* It is the
  whole warrant for this row existing — a rule instead of a compiler — and it is
  restated in `CLAUDE.md` with the word ***yet***, which concedes it expires. See
  the Decay re-read block.

`docs/gates.md` already answers this — the CodeQL triage §2 worked example and
the G1/G3/G6/G7 red-capable paragraph.

**Observed-red line:** "an arrow function in an `.astro` script" (perturbation).

**Rank:** 2 (text over structure) — the CodeQL finding is squarely a
regex-approximation exposure, not fully closed.

**Deep pass (2026-08-12, band two) — *verdict corrected*, no disposition.**

Four attempts to get banned or unscanned logic past `SCRIPT_BLOCK` into a green
suite, in `packages/site/src/components/Shelf.astro`, the repo's only `.astro`
file with a script block. **Three were planted and run, and all three went red;
the fourth was reasoning and was never run.** An HTML comment containing a
literal `<script>…</script>` — which `stripComments` never touches, since it
handles `//` and `/* */` only — was matched *inside the comment* and failed
`finds at least one import in each script block`. A `</script>` sequence smuggled
inside a string literal, placed before a banned `function` declaration, truncated
the capture exactly as CodeQL warns. A malformed opening tag, `<script
data-note="a>b">`, stopped `[^>]*` early. **No executed plant produced a pass.**

⚠️ **This paragraph read *"all four went red"* until CodeRabbit caught it on
[#137](https://github.com/mephistopheles4/stacks/pull/137), and the arithmetic
matters more here than anywhere else in the band.** The fourth item is the
structural argument in the next paragraph — that a truncation always leaves debris
no end-anchored pattern accepts — which was *derived*, not observed, and counting
it as a red run inflated the evidence behind **the one verdict in band two that
was corrected to `clean`**. Three failed plants are still no demonstrated
exposure, so the correction stands; **the claim that carried it does not, and a
register of gates whose stated scope exceeds their real scope is the last document
that gets to round three up to four.** Left recorded rather than quietly fixed, on
the same rule as G2's overstatement above.

⚠️ **The second plant is why this row leaves with a correction and not with a
clean bill of health.** It **did** defeat the check it was aimed at: the `function`
declaration fell outside the truncated capture and **the banned-token scan never
saw it**. What went red was `allows only bootstrap statements`, firing on the
leftover fragment `HREF?.setAttribute('data-x', '`. The gate caught a real defect
**with the wrong assertion**, as a side effect of the truncation rather than by
inspecting the smuggled code. That holds for a structural reason worth writing
down — the capture ends *at* the literal `</script>`, which by construction sits
inside an unclosed string or call, so the tail can never satisfy the end-anchored
`LOOKUP`/`GUARD`/`CALL`/`BRACE` patterns — but it is a property of where the
debris lands, not of anything the gate set out to check. **A future edit that
relaxes the bootstrap-shape check to accept a partial line would remove a defence
nobody knows is load-bearing.** Recorded as an observation, not a nomination:
nothing here demonstrated a pass, and a band that could not find one does not get
to hand a suspicion to the next band.

**Named remedy:** none — no live exposure. `docs/gates.md`'s standing answer (a
real HTML tokenizer, declined as disproportionate for a first-party `.astro`
file) survives independent adversarial testing, which is more than it had before.

**Observed-red (this pass):** **three executed plants** → 4 of 5, 4 of 5, 3 of 5.
None produced a green suite with banned or unscanned logic present. The fourth
attempt is an unexecuted structural argument and **is not observed-red evidence**.

**Other categories:** Weakening, Vacuous green, Decay — `clean` in triage,
**open**, not re-verified.

⚠️ **Not observed:** a **multi-`<script>`-block** file was never tried — the repo
has one block in one component today, so testing it means inventing a second
file, and a two-block shape is structurally different from everything above. Nor
was an unquoted raw `>` inside an attribute value, which real tokenizers and this
regex treat differently. Neither is ruled out.

**Cost:** ~20 min, 4 vitest invocations — three planted runs and one confirming
green after revert — plus one reasoning-only step that ran nothing.

**Decay re-read (2026-08-15, [#144](https://github.com/mephistopheles4/stacks/issues/144)) — verdict corrected `clean` → `exposed`; disposition: `gated`.**

⚠️ **G7 returns to the flagged side, and not by contradicting band two.** Band
two corrected this row's *routing-around* and *satisfying-the-letter* verdicts on
three failed plants, and that work stands untouched. Decay is the fifth category,
it was never demonstrated against, and it is re-read here under a bound
[#138](https://github.com/mephistopheles4/stacks/issues/138) restated after band
two closed.

**The claim.** `gates/astro-no-logic.test.ts:4-5`, present tense:
*"`@astrojs/check` cannot run under TypeScript 7 — TS 7's native compiler does
not expose the programmatic API the Astro language server needs."* It is repeated
where a user meets it, in the gate's own failure message at `:165` — *"(astro
check cannot run under TS 7)"* — and in `CLAUDE.md`: *"`.astro` files are NOT
typechecked (`astro check` cannot run under TypeScript 7 **yet**)."*

**Why it is load-bearing rather than colour.** It is the entire warrant for the
row. G7 exists *because* no compiler can read these files; if the claim stopped
being true, the honest response is not a better regex but deleting the rule and
running the checker. No other row on this file turns so completely on one
sentence about software this repo does not own.

**Measured, 2026-08-15.** `typescript: ^7.0.2` in the root `package.json` and
`astro: ^7.2.1` in **`packages/site/package.json`** — the two halves of the claim
live in different manifests, which is worth stating in a paragraph about where a
sentence's truth-maker sits. **`@astrojs/check` is not a dependency of this repo
at any version**, in any manifest or in `pnpm-lock.yaml`.

⚠️ **"And there never has been" is established rather than asserted**, on this
file's own rule against claims nobody checked: `git log --all -S '@astrojs/check'`
over the manifests and the lockfile returns **no commit** — the string has never
entered a dependency file in this repository's history, and its only appearances
anywhere are prose. So there is no run that can contradict the sentence, there has
never been one, and its truth cannot be established here without adding a
dependency. ⚠️ **And the version it is a claim about moved three commits ago**:
`ae674de`, the tip this pass ran on, is *"ci: bump astro from 7.1.6 to 7.2.1"*.

⚠️ **This is the first specimen on the map whose truth-maker is outside the
repository.** Every earlier one — the `133 tests in ~2s` estimate, the slug
count, CodeQL *"reports alongside the gates"*, `scripts/lib/`'s file count, and
[#118](https://github.com/mephistopheles4/stacks/issues/118)'s *"it published
first"* — was checkable against this tree with one command.
This one is checkable only against somebody else's release. `SECURITY.md`'s
*"relied upon and unverifiable"*, which
[#124](https://github.com/mephistopheles4/stacks/issues/124) extended as a clause
rather than minting as a category and noted *would have exactly one member
today*, now has a second — reached from decay rather than from supply chain, and
worth [#120](https://github.com/mephistopheles4/stacks/issues/120) re-reading that
declination against.

**Named remedy (not built):** the claim's population *does* exist as values in
this tree — `astro` and `typescript` in `package.json` — so
[#138](https://github.com/mephistopheles4/stacks/issues/138)'s adopted rule
applies: date the claim with the versions it was established against and assert
those, so a **major** bump goes red and forces a re-measurement. Staleness becomes
**countable, not caught** — G18's shape, and the same honest limit
[#116](https://github.com/mephistopheles4/stacks/issues/116)'s excluded-file
counts were given. ⚠️ **Cost stated rather than implied:** pinned to minors this
goes red on ordinary Dependabot traffic, which is how a gate gets weakened to make
it pass; majors only.

**Observed-red (this pass):** none, and that *is* the finding — no configuration
of this repository can make the sentence go red, because the tool it is about is
not installed.

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

**Deep pass (2026-08-12, band two) — disposition: `repaired` for the three
documented holes; a fourth, live, undocumented one is `gated`.**

All three historical holes re-plant red against the current tree, each failing
exactly 1 of 14 and moving nothing else. Citation scoping: `invariant 4` moved
out of G1's **Source** cell into its **Gate** cell — the words still in the row,
just not where they count — fails `cites every numbered invariant in a Source
cell`, reporting 4 uncited. Scored-in-prose: `gates/adapter-boundary.test.ts`
dropped from G1's row and added to a paragraph fails `scores every gate in gates/
in a row, not merely in prose`, naming it. Directory prefix:
`covers/cover-path.test.ts` — the real historical path, outside `gates/`,
`packages/` and `scripts/` — fails `names no spec that has been moved or deleted`,
so the filesystem check that replaced the allowlist does see beyond the three
original roots.

⚠️ **The fourth plant is the finding, it is live, and it is in the gate that
scores the scoreboard.** `gives every row a status from its own key` reads the
status as **`row.cells.at(-1)`** — positionally — while every other check in the
file resolves its column by name through `columnIndex()`, the helper whose own
docblock exists because *"the Source column was renamed"* is a different failure
from *"the citation is missing"*. Append a trailing **Notes** column to
`Invariants → gates`, set G1's real **Status** to `❌` — a symbol outside the key
— and put `✅` in the new column: the test still fails on the other rows, **but
G1 drops out of the failure list**. The one row genuinely carrying an invalid
status is silently exonerated, because `.at(-1)` now reads the Notes cell.

**It is a coincidence, not a property, that this works today.** All three tables
end in `Status`; they already carry **6, 6 and 5 columns**, so their shapes differ
and *"a column was added"* is plainly something this file could have. The gate
holding this repo's constitution to its scoreboard finds the status by counting
from the end.

**Named remedy (not built):** read the status through `columnIndex(table,
'Status')`, as the rest of the file already does. One line, and the last place a
positional read belongs.

**Observed-red (this pass):** each of the three re-planted holes fails exactly
1 of 14 in `gates/constitution-scoreboard.test.ts`; the trailing-column plant
fails the status check while **removing from its `wrong` array the one row whose
status is actually invalid** — confirmed by G1's disappearance between the plant
without the bad status and the plant with it.

**Other categories:** Weakening, Vacuous green, Decay — `clean` in triage,
**open**, not re-verified. Routing around — historical, fixed; demonstrated by
the directory-prefix re-plant, which is the same hole from the other side.

⚠️ **Not observed:** the pre-fix gate code was never run beside the plants — it
is not in the tree. *"The old code would have passed"* is read off the current
logic, not watched. What was watched is that today's code catches the shape each
hole describes, which is what re-planting asks for.

**Cost:** ~18 min, 6 file-scoped invocations plus one full suite.

### ⚠️ Two further findings about G19, added 2026-08-20 when G41 landed

**Both belong here rather than in the entries of the rows that found them**, on
this file's rule that a finding about a gate goes in that gate's entry.

**1. The gapless walk is blind to top-row deletion.** It bounds at
`n < numbers.at(-1)`, **exclusive of the maximum**, so deleting the
highest-numbered row leaves it green. Measured rather than argued: against a
tree with the top row's id mangled, `gates/constitution-scoreboard.test.ts` runs
**14 tests, none failing**; mangling an interior row instead fires the check by
name — *"row numbers missing from docs/gates.md … G40"*. **What catches the
top-row case is G41's row-side floor and the register's *no entry without a
row*, and nothing in G19.** That is the stated reason the floor exists on the
row side only. Not repaired here: hardening G19 is a change this rollout would
be *making* rather than deciding, and the same reasoning that leaves the
`TABLES` hole alone applies.

**2. ⚠️ A row can un-anchor another row's slug by citing its spec in prose, and
this is a live defect that was introduced and caught inside one commit.**
`stemsByRow()` matches every `` `gates/<stem>.test.ts` `` **anywhere in the row's
cells**, and the derivation rule applies only where a row names exactly one stem
**and no other row names that same stem.** G42's row explained which table it
was promoted out of by naming `` `gates/constitution-scoreboard.test.ts` ``;
two rows then claimed that stem, and **G19 silently dropped out of its own
derivation rule** — its slug no longer forced to move with its file, with
nothing going red and `expectFound(derived, …, 15)` untroubled at 32.

Found by querying the derivation set directly rather than by any assertion. The
row was rewritten to cite G19 by **number and slug**, which is the form G19
itself already checks elsewhere, and the docblock now carries the rule. ⚠️ **The
general shape is unclosed and named: prose in any row's cells can change which
rows are derived.** A remedy would restrict stem extraction to the **Gate**
column via `columnIndex`, which is the same one-line fix the positional-status
remedy above wants and the same lesson — *read the column, not the row*.
⚠️ **The pre-existing `repo-hygiene` pair (G5, G13) is the legitimate case the
remedy must keep working**, so it is a narrowing of where the gate looks, never
an allowlist.

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

**Deep pass (2026-08-12, band two) — disposition: `gated`. The self-audit
measured the corpus, not the mechanism.**

The triage entry credits the code-blanking pass as *measured, not assumed* — *"the
only links it hides are the `x.md` syntax examples"*. That is true of the files as
they stand and says nothing about what the pass **can** hide. Planted in
`docs/gates.md`: one line carrying a stray opening backtick before
`--legacy-mode`, a genuinely broken link to `docs/nonexistent-file-xyz.md` after
it, and an unrelated closing backtick later on the same line. **3 of 3 green — the
broken link is invisible**, because the inline-code regex ``` (`+)[^\n]*?\1 ```
pairs the two backticks and blanks everything between them. The identical line
with the backticks removed fails `points every link at a file that exists`, naming
`docs/gates.md:174 → docs/nonexistent-file-xyz.md`. Same link, same file; only the
accidental code span differs.

⚠️ **This is not the routing-around gap the entry already records.** That one is
about link *forms nobody writes here* — reference-style definitions, `<a href>`.
This is an ordinary typo, an unclosed backtick, switching the gate off for the
rest of the line, in a repo whose documents are dense with backticks and links,
and where G29 is the gate holding every other document's links to the tree. It
also lands inside this map's own working conditions: [#132](https://github.com/mephistopheles4/stacks/issues/132)
and [#128](https://github.com/mephistopheles4/stacks/issues/128) both warn that a
path written from memory is a red build — and a path written from memory beside a
stray backtick is a green one.

**Named remedy (not built):** either refuse to blank on an odd backtick count per
line, or narrow the inline-code blank to spans that look like code rather than to
any two backtick runs sharing a line. Both are cheap; the second is closer to what
the pass was for.

**Observed-red (this pass):** the same broken link, wrapped in an accidental
inline-code span versus not — 3 of 3 green (hidden) against 1 of 3 red (caught, by
file and line).

**Other categories:** Weakening and Vacuous green — `clean` in triage, **open**.
Routing around — exposed and current per the entry; read in the code and confirmed
by reading only, **open**. Decay — exposed and self-corrected per the entry,
**open**.

⚠️ **Not observed:** the fenced-block half of the blanking pass was never planted
against; only the inline-span half was.

**Cost:** ~10 min, 4 invocations.

---

### G36 — `trend-layer`

**Gate:** [`gates/trend-layer.test.ts`](../gates/trend-layer.test.ts)
**Date:** 2026-08-19
**Triaged at landing**, per this rollout's standing rule — the five categories put
to the row in the commit that lands it, rather than by a later pass reconstructing
what the author knew.

- **Weakening** — **exposed, accepted.** The row is watched by nothing that stops
  a series being deleted from `TREND_SERIES` *and* its row from the table in one
  commit. That edit is green in both directions by construction, because the gate
  is a correspondence and a correspondence between two deleted things holds. **It
  is the same shape as the scope list `mutation-scope` exists to close** — removing
  a scope removes it from numerator and denominator together, so the score does not
  move and simply stops covering that code. Not closable here without a third
  artifact naming the four series, which is the second copy
  [ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) refuses.
- **Satisfying the letter** — **the gate is clean; one of the series it watches
  is not.** The property the row names is *the series CI writes are the series
  the table names*, and the gate asserts exactly that, in both directions, over
  the rendered document rather than over a declaration.

  ⚠️ **`accepted`, and it is about a series rather than about the gate.**
  `live-exclusions` is emitted, so G36's correspondence is satisfied — and **the
  number it carries is 0 by construction**. An exclusion is negated out of
  Stryker's `mutate`, so an excluded file is never mutated and never reaches a
  report; `mutation-scoring.md` §7 says the exclusion flips when somebody
  *"write[s] a test that touches it"*, and a test cannot flip a file Stryker
  never mutates. **The measurement the Trends row names needs a deliberately
  wider run that nothing builds.** Found by review, on the strongest available
  evidence: `scripts/mutation-scopes.ts`'s own removed comment said so — *"this
  is **not** the spec's `live-exclusions` trend, which asks a question a run of
  this config cannot answer"* — and the extraction changed the claim's side with
  no record. **The claim is restored and the weakness carried**, because a series
  incapable of movement is a flat line, and a flat line arriving on time is the
  exact failure this layer exists to expose. ⚠️ **Not closable inside G36**: the
  gate's question is *did a number arrive*, and one did.
- **Routing around** — **exposed, accepted, and named in the gate's own header.**
  The correspondence is asserted against a **complete** run — one where every
  declared series computed. A crashed run legitimately renders fewer series, so a
  real emission path that only ever runs partial would never be compared. Nothing
  routes a *new* series past the check (a new family needs a `# TYPE` line, which
  is what the gate reads), but a series that only appears under a condition the
  fixture does not reproduce is out of reach. **Checked against the routing-around
  verdicts of the rows sharing this mechanism**: G14 (`repaired` — the anchored
  regex holds and the extractor still cannot see `.alias()` or a workspace script)
  and G19 (`repaired`; second finding `gated`). The G14 shape is the one that
  applies, and it is why this gate reads emitted bytes rather than `TREND_SERIES`.
- **Vacuous green** — clean, and asserted rather than argued. Both sides are
  extractions, and an extraction that stops matching reports an empty set which
  trivially satisfies every "each of these is in that". `expectFound` runs on both
  sides before any comparison, and the table's body rows are collected *including*
  a row whose name cell does not parse — the hole G29 is dispositioned `gated` for,
  where one stray backtick switches the check off for the rest of the line. A cell
  that does not parse arrives as its raw text and fails the kebab-case assertion,
  rather than vanishing from the comparison.
- **Decay** — clean at landing. The row rests on two load-bearing claims and both
  were established against a check that was available: that G19 cannot see a fourth
  table (read out of `slugByRow()`'s hardcoded `TABLES`, not assumed), and that the
  emitted document's names are what a dashboard sees (asserted, not commented).

**Observed-red line:** four plants, 2026-08-19, recorded at landing.

| Plant | Result |
| --- | --- |
| a series with no row — a fifth entry in `TREND_SERIES`, emitted | **red**: *"series written to the metrics record that no row of the `## Trends` table names … planted-series"* |
| a row naming a series nothing emits — a fifth table row | **red**: *"rows of the `## Trends` table naming a series nothing emits … planted-row"* |
| a trend named `mutation-scope` | ⚠️ **green — the plant the ticket named does not work yet.** See below. |
| a trend named `commands` | **red**: *"trend names that are also gate slugs … commands"* |
| an emptied Trends table | **red**, and on the vacuity guard rather than on a comparison: *"extraction found 0 rows in the Trends table of docs/gates.md (expected at least 4)"* |

⚠️ **The `mutation-scope` plant is green and that is a fact about the calendar, not
a hole.** `mutation-scope` is the slug of a gate that has **not landed** — it is the
next row in this rollout — so there is no gate slug for a trend of that name to
collide with, and renaming the emitter and the table together keeps the
correspondence intact. The clause is real and was observed on `commands`, which is
G14's slug and exists today. **Recorded rather than quietly substituted**, because
the ticket's acceptance criterion names `mutation-scope` specifically and a reader
checking that box against this file would otherwise find a claim nothing supports.

---

### G37 — `agents-import`

**Gate:** [`gates/agents-import.test.ts`](../gates/agents-import.test.ts)
**Date:** 2026-08-20

⚠️ **This entry is a backfill, and saying otherwise would be the failure it
records.** G37 landed from [#172](https://github.com/mephistopheles4/stacks/pull/172),
**outside this rollout**, in the window between the register being written
against 35 rows and `gate-register` landing — so it is the one row that was
never triaged by anybody. It was found by `gates/gate-register.test.ts` on its
**first run**, which is that gate going red on a real defect rather than on a
planted one, and is recorded as such in G41's entry below.

⚠️ **The rollout's standing rule is *every gate landing before `gate-register`
writes its observed-red line at landing*, and this row did not** — `docs/gates.md`
carries no `## G37` narrative and no observed-red prose, only the table row. The
line below was therefore **planted on 2026-08-20 by the session landing G41**,
not recorded when the gate was written. That is exactly *"the decay category
arriving inside the artifact built to catalogue it"*, and it is written down
rather than smoothed over.

- **Weakening** — clean; no allowlist and no exemption list. `PARSED_SECTIONS`
  is a list of three headings that must be **absent**, which is the inverse of a
  permission: adding to it makes the gate stricter, and removing from it is a
  deletion of an assertion rather than the granting of an exception.
- **Satisfying the letter** — **exposed, and the gate's own docblock records the
  near miss.** The prose said the import must be the *"first content line"*; the
  assertion checks only that `@AGENTS.md` is alone on **a** line. Review caught
  that the stub did not satisfy the stronger sentence either, and **the sentence
  was corrected rather than the gate tightened** — the right call, but it leaves
  the general shape live: the property *"a Claude session actually receives the
  rules"* is wider than *"a line matching `/^@AGENTS\.md$/m` exists"*.
- **Routing around** — **exposed and stated by the gate itself.** It holds the
  **tree**, not the harness: whether a given version of Claude Code honours
  `@AGENTS.md` is a claim about a tool, and G21 forbids the suite from asking
  anything outside the tree. The observation standing in for it is dated and
  version-stamped in `docs/log/2026-08-19-the-constitution-leaves-claude-md.md`.
  ⚠️ **This is the second member of `SECURITY.md`'s *in the tree, asserting a
  fact that lives outside it* category** — the same shape as G40's version
  comment, reached from a different direction.
- **Vacuous green** — clean, and the design is the reason rather than a floor.
  The import-line assertion **is** the control the two absence assertions rest
  on: an empty or missing `CLAUDE.md` fails it, so the absences cannot pass over
  nothing. The docblock says so in terms.
- **Decay** — clean at backfill. The one dated claim is the harness observation
  above, which is version-stamped where it lives rather than asserted here.

**Observed-red line:** **three plants, 2026-08-20, planted at register landing
rather than at row landing** — the gap this entry exists to record.

| Plant | Result |
| --- | --- |
| delete the import line, leaving `See AGENTS.md for the rules.` | **red**: *"CLAUDE.md must contain "@AGENTS.md" alone on a line … without that line a Claude session gets none of the rules — silently, because nothing else would notice"* |
| demote the import to a mention inside a sentence — `This file imports @AGENTS.md at launch.` | **red**, same assertion. This is the plant that proves the anchoring is load-bearing: prose is not a mechanism, and the harness expands a line |
| paste `## Invariants` into the stub — the second constitution ADR-0026 refused | **red**: *"CLAUDE.md carries sections that belong to AGENTS.md: Invariants"* |

**Rank:** none. The two exposures are both *stated limits* rather than
unadmitted holes, and neither is one this rollout can close: the harness claim
is unreachable by construction under G21.

**Disposition: `accepted`** — for the routing-around verdict, which is the only
one carrying an exposure with no available remedy. The satisfying-the-letter
verdict is left open rather than dispositioned; it is a nomination this backfill
raises and does not deep-pass, and calling it `repaired` would read as work
somebody did.

### G38 — `mutation-scope`

**Gate:** [`gates/mutation-scope.test.ts`](../gates/mutation-scope.test.ts) **and**
[`scripts/deploy.ts`](../scripts/deploy.ts)
**Date:** 2026-08-19
**Triaged at landing**, per this rollout's standing rule.

⚠️ **The spec allocated this row G37 and it landed as G38.** `agents-import` took
G37 while this ticket was open — the third time in this rollout a pre-allocated
number was wrong, and the second time by a row from outside it. Recorded rather
than silently corrected, because a reader checking the spec's roster against this
file would otherwise find two documents disagreeing with no account of which is
current. `docs/gates.md`'s own line is why: *"G19 is a stable identifier and tells
you nothing."*

⚠️ **The only row that runs on two surfaces**, and `docs/gates.md` has no column
saying so — a `pnpm test` assertion and a `pnpm deploy:site` refusal under one
slug. Both halves are triaged here, because a category that is clean on one
surface and exposed on the other is exactly what a single verdict would hide.

- **Weakening** — **exposed, and closed by where the rules are written rather
  than by the gate.** The gate makes a rename *loud*: the scope name and its glob
  are both checked, so `git mv packages/core/src/covers packages/core/src/cover`
  goes red until the config is edited. What the gate cannot judge is whether the
  edit that clears it carried the floor across — and the remedy list for a
  zero-mutant refusal **contains the weakening**, since *delete the scope* is a
  legitimate fix and the cheapest way to stop measuring an inconvenient one.
  Unlike lowering a floor, it does not read as a lowering; it reads as cleanup.
  So rename / split / removal rules sit in `stryker.scopes.json` itself, at the
  edit they govern. **`accepted`, and stated plainly: a rule about what a diff
  must look like is not a check.** The floors file the ratchet ticket adds is
  where a lowering becomes visible; this row makes it impossible for the lowering
  to happen *silently*, which is the half available now.
- **Satisfying the letter** — **clean on the structural half, and the
  vacuous-green plant is what shows it.** The property is *every source directory
  is declared or excluded, with no third state*, and the check is per **file**
  rather than per directory: a widened glob is one fault per file it swallowed,
  so the loudness scales with the damage. Emptying the declared list makes every
  file undeclared rather than making the check quiet.
- **Routing around** — **exposed, accepted, and the mechanism was chosen against
  the verdict of the row that shares it.** Per the standing rule, the remedy was
  checked against every register row disposed `gated` or carrying a
  named-and-unbuilt remedy: **G17 (`deploy-branch`)** is the one sharing this
  mechanism, and its live exposure is that *the gate spawns `scripts/deploy.ts`,
  so the argv the shipped command supplies is invisible to it* — remedy named,
  not built. **So the deploy half is not written as a spawn.** The refusal logic
  is a pure function in `scripts/lib/scope-check.ts` with an in-process oracle
  (`scope-check.test.ts`) and `scripts/deploy.ts` is a thin caller, which avoids
  the subprocess boundary rather than inheriting it. ⚠️ **What is left is G17's
  shape one layer up**: nothing asserts that `deploy.ts` still *calls*
  `assertNoEmptyScopes`, so deleting that one line leaves the whole suite green.
  Same residual, one line wide instead of a whole script, and named here rather
  than left to be found. The other mechanism-sharers were read and neither
  applies: G1/G13's allowlist verdicts (*the damage is not the entries but what
  the list is a list of* — met here by every exclusion owing a mechanism string
  and by `stale-exclusion` refusing an entry that names nothing), and G19's
  positional-read finding (this reads JSON by key, not a table by column).
- **Vacuous green** — **clean, and asserted twice over.** Three `expectFound`
  floors — declared scopes at 8, file exclusions at 20, excluded directories at 2
  — plus a floor on the source sweep itself at 60, because a walk that returned
  nothing would make every file trivially declared *and* every glob trivially
  empty at the same time. ⚠️ **The floors are not the whole of it, and this is
  the finding worth carrying:** a gate asserting *"the real declaration has no
  faults"* is satisfied forever by a `declarationFaults` that returns `[]`
  unconditionally, and no floor can see that. The judgement is therefore planted
  in `scripts/lib/scope-check.test.ts` against synthetic trees — one plant per
  clause — and the gate is left asserting only what the disk says.
- **Decay** — **clean at landing, with one dated claim.** The empty-scope
  behaviour is measured rather than assumed: an empty denominator scores 100%
  arithmetically, which is what Stryker's summary line prints, so the residual
  reads `total === 0` and never a percentage. ⚠️ **The deploy half reads a
  snapshot and nothing in it knows how old that snapshot is** — a legitimate
  scope change made after the last local run reads exactly like a scope that
  stopped producing mutants. The refusal names `pnpm mutation:run` as the remedy
  for that case; staleness proper belongs to `metrics-freshness`, the next row in
  this rollout, and duplicating half of it here would be two implementations of
  one question.

⚠️ **Two clauses beyond the six the ticket lists, declared rather than slipped
in.** `stale-exclusion` is *"every declared scope exists on disk"* applied to the
other list — a mechanism attached to nothing reads as a live exemption, and it is
half of what makes **removal** show up in a diff. `excluded-and-declared` is
*"no overlap"* applied across the two lists rather than between two scopes, which
is all the ticket's wording covers; a directory in both is invisible to every
other clause, because its files are claimed and its exclusion names something
real. ⚠️ **The first draft of this entry counted only `stale-exclusion` and
called it "a seventh clause"**, which left the accounting one short in the
artifact whose whole purpose is accurate accounting. Found by CodeRabbit on
[#179](https://github.com/mephistopheles4/stacks/pull/179).

⚠️ **A latent false red, found in the same review and fixed before merge: a
recursive scope holding nothing directly.** `missing-scope` was asked of the
*direct parent* of every source file, so a scope whose files all live one level
below its root reported *"holds no source file on disk"* about a scope that holds
several — while `empty-glob` stayed quiet, because the glob does match them. One
fault, and its message was untrue. **It would have fired on a scope split**,
which is the operation the rename rules above exist to bless, and the cheapest
way out of a red like that is to undo the split. Latent rather than live: every
declared scope today happens to hold at least one file directly, so nothing was
red and nothing would have been until somebody did the sanctioned thing. Scope
names are now checked against every **ancestor** directory; excluded directories
keep the direct-parent set, because an exclusion covers the files directly in a
directory and never a subtree. Regression test added for both halves.

⚠️ **And an eighth check that is not a clause, added in review of that same pull
request: the declaration is compared against `stryker.config.mjs`.** This is the
routing-around bullet above being wrong in the direction it was written to guard.
The bullet checked the *deploy* half against G17 and did not ask the same
question of the merge half, and the answer was there: everything above reads
`stryker.scopes.json`, while **Stryker is driven by `mutate`, which the config
derives from it**. So the whole check could be routed around by editing the
derivation instead of the declaration — one scope dropped in `stryker.config.mjs`
leaves all seven clauses green and empties that scope with nothing to say so
until a nightly moves. `docs/spec/mutation-scoring.md` §6 already listed *"the
`mutate` config changes"* as a fault needing no run to detect; it was not true
when this row landed, and it is now. **The gate imports the real config module
rather than regex-matching its source**, since the thing being checked is a value
the file computes.

⚠️ **A third glob shape throws rather than reporting a fault.** `globToRegExp`
accepts `dir/*.ts` and `dir/**/*.ts` and nothing else, so `*.tsx` in the config
dies inside the gate with a message naming the glob. Red either way; recorded
because the failure arrives as an exception rather than in the fault list, which
is a difference a reader of the output will notice.

**Observed-red line:** seven plants, 2026-08-19, recorded at landing. The
structural ones were run against `gates/mutation-scope.test.ts` alone — a renamed
directory reddens half the suite, and none of that is this row.

| Plant | Result |
| --- | --- |
| rename a scope's directory without editing the config — `git mv packages/core/src/import packages/core/src/imports` | **red, four faults and a second assertion**: *"[missing-scope] declared scope `packages/core/src/import` holds no source file on disk"*, *"[empty-glob] … matches no source file"*, and one *"[undeclared]"* per file that moved |
| a source directory neither declared nor excluded — `packages/core/src/probe/thing.ts` | **red**: *"[undeclared] … is in no declared scope and in no excluded directory … those are the two states, and there is no third"* |
| blank an exclusion's mechanism — `scripts/deploy.ts`'s | **red**: *"[blank-mechanism] exclusion scripts/deploy.ts (in scope "scripts") carries no mechanism"* |
| point a glob at nothing — `packages/core/src/covers/nowhere/**/*.ts` | **red**: *"[empty-glob] declared scope `packages/core/src/covers` has a glob … that matches no source file"*, and **`missing-scope` stays quiet**, which is the clause separating *the code went away* from *the glob stopped reaching it* |
| empty the declared-scope list | **red on the floor, not on a comparison**: *"extraction found 0 declared mutation scopes (expected at least 8)"* |
| **drop one scope from the derivation in `stryker.config.mjs`, touching no declaration** — the routing-around plant, added in review | **red**, naming the glob that vanished: *"stryker.config.mjs's `mutate` is no longer the declaration in stryker.scopes.json … expected [ … 34 ] to deeply equal [ … 35 ]"*, `- "packages/core/src/covers/**/*.ts"`. ⚠️ **Green on all seven clauses at the same time**, which is the whole finding |
| **deploy residual** — declare a scope of type re-exports only, run a real `pnpm mutation:run`, then `pnpm deploy:site --dry-run` | **red, exit 1, nothing built and nothing uploaded**: *"FAILED: declared scope(s) produced no mutants in the last run: packages/core/src/typeonly"* — reached in seconds, before the gates and before the build |

⚠️ **The probe scope left `pnpm test` green, and that is the split working rather
than a hole.** Declaring `packages/core/src/typeonly` — one file of type
re-exports — is structurally perfect: the directory exists, the glob matches it,
nothing overlaps. Only a run can tell that it produced no mutants, which is
precisely why that one clause is at deploy and the other six are not.

**The empty-scope behaviour is now measured, and it is the third of the three
possibilities the spec listed.** `mutation-scoring.md` §6 left it open — *"nobody
knows what Stryker prints for an empty scope: `100`, `NaN`, or omission from the
report"* — and expected the worst. Measured at 2026-08-19 against a full run
(5,594 mutants, 6m55s, `9.6.1`): **omission.** The file appears nowhere in
`mutation.json`, nowhere in the clear-text table, and `pnpm mutation:score` prints
the scope as `0 / n/a` because its own arithmetic already returns `null` for an
empty denominator rather than `1`. So the residual reads `total === 0`, which is
right under all three behaviours — a check written against a *printed* `100`
would have been written against a string that never appeared.

⚠️ **One branch is unobserved and it is named rather than implied**: the
`--check-only` path, which warns instead of refusing. It was left unrun because
that mode continues into a live fetch of the deployed origin, and buying one
console line with a network round-trip against the real site is a poor trade. The
refusing path — the one that can stop a publish — is the one that was planted.

---

### G39 — `metrics-freshness`

**Gate:** [`gates/metrics-freshness.test.ts`](../gates/metrics-freshness.test.ts),
driving [`scripts/deploy.ts`](../scripts/deploy.ts); the dated half in
[`scripts/lib/metrics-read.test.ts`](../scripts/lib/metrics-read.test.ts)
**Date:** 2026-08-19
**Triaged at landing**, per this rollout's standing rule.

- **Weakening** — **exposed, accepted, and it is one number.** The bound is
  `STALE_AFTER_DAYS`; widening 3 to 90 makes the refusal never fire and deletes
  nothing. `docs/spec/trend-layer.md` §7 grades it as **the most weakeable
  artifact this piece produces**, and nothing here closes that — a gate asserting
  *the bound is 3* would be a constant compared with itself. What is bought
  instead is that the same constant is load-bearing in two more places (the
  ratchet's calibration window, the dated bootstrap's expiry), so widening it is
  not a local edit. ⚠️ **The override entry from #121 is superseded**: there is
  no flag to weaken, because there is no flag. What is left is not running
  `pnpm trend:sync`, which is not an edit and leaves no diff.
- **Satisfying the letter** — **exposed, accepted, and inherited rather than
  introduced.** *"Every check here proves a file arrived on time, and none proves
  anything was measured."* A `run_ok 1` written by a job whose measurement step
  an `if:` skipped passes this check and is false; a mutation step quietly
  narrowed to one small directory keeps writing well-formed, punctual,
  meaningless rows. **This row's question is the pipe, and one did arrive.** Not
  closable here: liveness is what a *number moving* would show, and trends carry
  no verdicts.
- **Routing around** — **found in the roster read, and closed before landing.**
  The gate spawns `scripts/deploy.ts` directly, so the argv the **shipped**
  command supplies is outside its reach — G17's named-and-not-built remedy,
  inherited exactly: `--check-only` baked into `package.json`'s `deploy:site`
  downgrades this refusal to a warning with every test here green. Built in
  G17's own gate, where the remedy was named, rather than copied into this one.
  ⚠️ **The rest of the mechanism's roster was read for this**: G17 (`repaired`,
  plus the remedy above), G38 (`accepted` — a snapshot with no age, which is what
  this row exists to answer), G14 (`repaired` — an extractor that cannot see what
  it does not match). The remaining route is one no assertion here reaches: the
  refusal reads a git ref, and anything with write access to the checkout can
  move it.
- **Vacuous green** — **exposed, closed, and it was live for half an hour.**
  ⚠️ **The exit code asserted nothing.** The harness proves a run got past this
  check by letting it fail on the next one, so `status === 1` is equally true of a
  deploy that refused on the record and of one that ignored it. Planted by
  replacing `fail(message)` with `console.warn` — the refusal deleted, the message
  still printed — and **all ten tests passed.** Closed by `expectRefused`, which
  asserts the vault refusal was **never reached**, which is what G17 asserts two
  rows down and what this file had not copied across. Five tests go red on that
  plant now. **The gate was written, run, and green, and it was a gate against
  nothing.**
- **Decay** — **clean at landing, with the decay path named and refused.** The
  dated bootstrap expires on a calendar day, and an assertion of *does not refuse
  today* would have been a green that quietly became false on 2026-08-22. What is
  asserted through the script is that its behaviour **agrees with `judgeRecord`
  today**; the dated behaviour itself is planted against that function, where
  `now` is a parameter. ⚠️ **The spine's date is a constant in the source**, and
  it is the one thing here that will read as furniture once it is years old —
  kept because the alternative, deriving it from git history, makes the exemption
  conditional on a file's history rather than on a date.

**Observed-red line:** five plants, 2026-08-19, recorded at landing. Run against
`gates/metrics-freshness.test.ts` plus `scripts/lib/metrics-read.test.ts`; all
reverted.

| Plant | Result |
| --- | --- |
| **an aggregate bound in place of the per-series one** — every gated series dated by the record's newest sample | **red, two**: the gate's *"refuses on a nightly four days back"* and the judge's *"refuses the series that went quiet, not the record"* — *"expected 'fresh' to be 'stale'"*. This is the failure the row exists to catch: a merge row minutes old over three series four days dead |
| **a series with no sample treated as fine** — `continue` where the absent case pushes | **red, four**, including both `--dry-run` and `--check-only`: *"expected … to contain 'no sample at all'"*. Absent and stale are one verdict, and this is the half that would have been invisible |
| **the bound widened from 3 days to 90** | **red, six** across both files — the stale cases, and *"expected { days: 4, kind: 'bootstrap' } to equal { days: 4, kind: 'never' }"*, because the same constant expires the bootstrap |
| **the two disambiguation messages swapped** | **red, two**: a stale store with a stale branch printed *"The branch holds 0 record(s) this machine has not imported … pnpm trend:sync"*. Same symptom, opposite fix — it sends somebody to look at CI while their own store is what is behind |
| **the refusal downgraded to a warning** — `console.warn` in place of `fail` | ⚠️ **green, ten of ten, before `expectRefused`.** **Red, five**, after: *"the deploy must stop at the record, not carry on and fail at the next check"* |
| **the probe's `--refmap=` removed** — a real defect, not a synthetic plant | **red, one**: *"only `pnpm trend:sync` may move the mirror"*. See below |

⚠️ **The last row is a defect this session shipped and then found, and it is the
one no test would have reported.** An explicit refspec does not stop git
*opportunistically* updating the remote-tracking branch a fetched ref would
normally land on, so the disambiguating probe was fast-forwarding
`origin/metrics` — the mirror the staleness check reads. **The refusal was
correct on the run you were looking at and absent on the next one**, which is not
a state a single-invocation test can see, and it would have published against a
local Prometheus holding nothing. Found by running the three refusals by hand and
reading git's own two lines of output. Closed by `--refmap=`, and held by a ref
comparison across the refusal. [ADR-0060](adr/0060-the-deploy-reads-the-mirror-and-the-probe-never-moves-it.md).

⚠️ **Two branches are unobserved and named rather than implied.** The `never`
verdict — *no record, past the bootstrap* — is planted against `judgeRecord` and
not through the script, for the calendar reason above. And the probe fetch is
exercised against a scratch repository whose `origin` is itself, so **the real
fetch has never run**: what is asserted is that a fetch of a real branch produces
the right message, not that GitHub answers an anonymous one — which
`pnpm trend:sync` exercises for real, on the same code path.
### G40 — `action-pins`

**Gate:** [`gates/action-pins.test.ts`](../gates/action-pins.test.ts)
**Date:** 2026-08-20
**Triaged at landing**, per this rollout's standing rule.

⚠️ **The spec allocated this row G39 and it landed as G40**, for the same reason
G38's entry records one row earlier: `agents-import` took G37 out-of-band from
[#172](https://github.com/mephistopheles4/stacks/pull/172), so every
pre-allocated number in this rollout is one low. Recorded rather than silently
corrected. `docs/gates.md`'s own line is why: *"G19 is a stable identifier and
tells you nothing."*

**The remedy roster was read before this gate was written**, derived by query
rather than remembered: every entry disposed `gated` (G6, G7, G29, G30, G35) and
every entry carrying a named-unbuilt remedy, then the routing-around verdicts of
each row sharing a mechanism. **Three of them changed what got built**, and they
are named in the bullets rather than in a paragraph nobody can check.

- **Weakening** — **exposed, and the floor is the entry.** `expectFound` at 4 is
  lowerable, and the version-shape regex is loosenable to *non-empty* in one
  character, which restores the deleted-comment hole exactly. **There is no
  allowlist**: the one exemption is `uses: ./…`, which is definitional rather
  than enumerated — it names a *shape*, not a set of blessed references, so it
  cannot go stale and there is nothing to revisit. ⚠️ **`accepted`, stated
  plainly**: a floor and a regex are both one edit from weaker, and no gate in
  this repo defends its own constants. What is available is that both edits are
  legible in a diff.
- **Satisfying the letter** — ⚠️ **exposed, live, and the reason the limit is
  written in two places.** The gate proves every third-party action is
  referenced by something **shaped like** an immutable ref and that every one
  carries a version claim; **it cannot prove the claim is true.** A hand-edit
  swapping in a different valid SHA under `# v7.0.1` passes cleanly. That fact
  lives at GitHub, G21 forbids the suite from asking, and **actions have no
  lockfile**, so there is no offline route — the limit is structural rather than
  unbuilt. ⚠️ **It is `cover_source`'s failure verbatim.** `accepted`, and
  written beside the row in `docs/gates.md` *and* in the spec's header comment,
  because G19 does not read spec comments and a limit recorded in one place is a
  limit only that place's readers find.
- **Routing around** — **closed on the axis it was written for, and the
  mechanism was chosen against the verdicts of the rows sharing it.** A second
  workflow, or a composite action under `.github/actions/`, is the cheap way
  past a narrow glob; the sweep is therefore `.github/**/*.yml|yaml` rather than
  `.github/workflows/`. **G19's routing-around verdict is the precedent** —
  *"a real path sat outside the allowlisted roots and was invisible to the
  checker"* — and **G14's is the demonstrated version**: a single regex against
  one named file, which is why the sweep walks a directory and both extensions.
  **G6's named-unbuilt remedy is the one that nearly repeated here**: a proposal
  saying *scan tracked `.ts`* in a tree holding `.mjs` and `.astro`. ⚠️ **What
  is *not* closed, and it is the honest residual: nothing in this repo reads
  what a workflow *does*.** `metrics.yml` can be edited in the same pull request
  that moves the number it records; this row covers the actions a workflow
  calls, never its own body.
- **Vacuous green** — **clean, and floored twice rather than once.** A glob that
  stops matching is the entropic case, so both the file sweep (≥2) and the
  `uses:`-line extraction (≥4) carry floors, and **both were planted**: pointing
  the sweep at a directory with no workflows and breaking the `uses:` regex each
  go red on the floor rather than passing over nothing. The `jobs:` extraction
  **throws by name** rather than returning an empty map, which is
  `markdownSection`'s argument applied one file type across. ⚠️ **That throw is
  called per test rather than once in the `describe` body**, found in review: a
  throw during collection aborts the whole file, so one restructured workflow
  would have taken G40's four clauses down with G42's and reported as five
  unrelated gates vanishing. Measured after the fix — the same plant now leaves
  **5 passed, 5 failed**, with every G40 clause still running.

⚠️ **The sweep reads `git ls-files`, not the disk, and the reason is an incident
rather than a preference.** `gates/repo.ts` already documented the choice —
*"it cannot pick up a stray untracked file and fail a gate on it"* — and on
2026-08-20 a **read-only review agent** dropped a scratch
`.github/actions/zztest/action.yml` into the tree while auditing this very
commit and **reddened this gate on a file that was never committed and could
never have run.** What CI executes is what git tracks. **The cost is G13's
verdict, inherited knowingly**: a local `pnpm test` before `git add` passes over
a new workflow, so the rule there is the rule here — *stage, then run.* ⚠️ **The
plant harness had to be taught the same thing**: `git add -N` leaves an index
entry that outlives the file, and one plant's residue silently turned the next
plant's expected-green into a red until the cleanup cleared the index first.
- **Decay** — ⚠️ **exposed, dated, and it is a bet rather than a slip.** Clause 2
  pins the *shape* of Dependabot's comment; if Dependabot ever emits `# 7.0.1`
  without the `v`, this gate goes red on a bot commit. **Measured rather than
  assumed** against `93730e1` (`dependabot[bot]`, `# v6.0.9` → `# v6.0.10`): pin
  and comment rewritten together, both occurrences. `accepted` — a one-character
  diff, and a gate that reddens on an unexpected format change is behaving
  correctly. **The floor's population is the second dated claim: 13 `uses:`
  lines at `3e2fc88`, 2026-08-20** — 7 in `gates.yml`, 6 in `metrics.yml`,
  against a floor of 4. ⚠️ **The count is here and in the spec header comment,
  and deliberately not in a `docs/gates.md` row**: this entry carries a date by
  construction, and adding a stale-able count to the file already caught
  carrying two would write its own joke.

⚠️ **`docker://` is refused rather than exempted, and it is a reversal
honoured.** The exempted population is zero — this repo has no Dockerfile, no
compose, no devcontainer, no container action — and `docker://alpine:latest` is
a **mutable third-party reference**, which is what the pinning argument is
against. A pre-written rule over `docker://image@sha256:…` was specified and
declined: *an exemption that arrives with a legitimate first instance gets
argued about; one written into the spec before any instance exists never does.*
The consequence worth having is that §5's claim — *every third-party action is
referenced by something shaped like an immutable ref* — **stays true**, where a
`docker://` line would have falsified it with nothing going red.

⚠️ **The `audit`-job assertions live in this spec, and that is G42's teeth
rather than a convenience.** See G42's entry for why the row alone was one
nothing can fail on.

**Observed-red line:** **thirteen plants, 2026-08-20, recorded at landing.** All
seven ways the spec's §9 table names, plus the two it names for G42's teeth,
plus four more. Run against `gates/action-pins.test.ts` alone.

| Plant | Result |
| --- | --- |
| clause 1 — `uses: actions/checkout@v4` | **red**: *"these `uses:` lines do not resolve to `owner/repo[/subpath]@<40 lowercase hex>` … `.github/workflows/gates.yml:58`"* |
| clause 2 — delete a `# vN.N.N`, leave the SHA | **red**: *"these pinned `uses:` lines carry no trailing `# vN[.N…]` comment … deleting the comment must not be a way to satisfy the pinning rule"* |
| clause 2 — `# latest` instead of `# v7.0.1` | **red**, same assertion. **This is the plant that proves *version-shaped* is doing work** — a non-empty check passes here |
| clause 3 — an unpinned `uses:` in `.github/actions/probe/action.yml` | **red**, naming a path **no `.github/workflows/` glob would have opened**: *"`.github/actions/probe/action.yml:5`"* |
| the exemption — `uses: ./.github/actions/probe` | **green**, as specified |
| the withdrawn exemption — `uses: docker://alpine:latest` | **red, two assertions**: the pin clause *and* the named `docker://` refusal, which is the one that names the argument |
| the floor — point the sweep at a directory with no workflows | **red on the floor, not a vacuous pass**: *"extraction found 0 YAML files under .github/ (expected at least 2)"* |
| the floor — break the `uses:` regex | **red**: *"extraction found 0 `uses:` lines under .github/ (expected at least 4)"* |
| the `jobs:` block renamed | **red, and it throws by name** rather than reducing every G42 clause to nothing: *"no `jobs:` block in .github/workflows/gates.yml"* |
| **G42's teeth** — delete the `audit` job | **red, two assertions**: *"no job named `audit` … delete the job and that row is a claim nothing can fail on"* |
| **G42's teeth** — `--audit-level=moderate` | **red**: *"the `audit` job … no longer runs `pnpm audit --audit-level=high`"* |
| **G42's teeth** — drop `audit` from `needs:` | **red**: *"a job it does not need is a job whose failure merges"* |
| **G42's teeth** — test `!= "failure"` instead of `= "success"` | **red**: *"expected [ 'suite' ] to include 'audit'"*. ⚠️ **Skipped and cancelled must fail the gate rather than pass it by omission**, and this is the only plant that reaches that distinction |

⚠️ **What cannot be planted, and is marked reasoned rather than demonstrated:
that a pinned SHA really is the version its comment claims.** It is the limit
the satisfying-the-letter verdict states, and it is why that verdict is
`accepted` rather than open.

### G41 — `gate-register`

**Gate:** [`gates/gate-register.test.ts`](../gates/gate-register.test.ts)
**Date:** 2026-08-20
**Triaged at landing**, per this rollout's standing rule.

⚠️ **It landed in the same commit as `action-pins` and that is the point.**
Shipped alone it would be red on 39 rows — *a gate that has never passed*, not
one observed failing on a real defect. Shipped against 39 stub entries it would
be green over empty sections, which is **category 4 built into the artifact
about category 4**. So it lands with the first new row it can actually go red
on, and **one commit discharges three obligations**: the landing rule, the
supply-chain triage obligation, and the observed-red rule.

- **Weakening** — ⚠️ **exposed, and this row *is* an allowlist, which the spec
  did not anticipate at this size.** `MERGED_BULLETS` holds **ten** entries. The
  spec specifies **one** — G26's merged `**Vacuous green / decay**` bullet — and
  §4 of the same spec already records *"ten rows collapsing five verdicts into
  one line."* Measured at `3e2fc88`: G12, G17, G20, G21, G22, G23, G24, G25, G26
  and G34. **Exempting only G26 would have landed this gate red on nine
  band-authored entries**, and the two ways out of that are both refusals —
  weaken the rule, or rewrite nine verdicts §1 says are *"marked in place, not
  split."* **The list is widened to the measured population and closed there.**
  Every entry names a row **and its exact bullet text**, which is G13's lesson
  (*"a directory is a standing permission, where every other line here names a
  file"*), and **every entry is reverse-asserted in both directions** — a
  merged bullet on an unlisted row is red, and a listed bullet the file no
  longer carries is red as a stale permission. That is G1's recorded mitigation
  (*"the reverse-assert catching both a stale entry and a dropped one on the
  same change"*) and G22's demonstrated gap (*"had no stale-entry assertion,
  which ADR-0022 requires"*). ⚠️ **`accepted`, with the cost named: ten
  permissions where the spec budgeted one.** What the closure buys is that the
  eleventh goes red.
- **Satisfying the letter** — ⚠️ **exposed on dispositions, and the exposure is
  a claim the gate declines to make.** The spec says *exactly one disposition
  per entry*; **the file falsifies that 19 times** — ten triage-only rows carry
  none because triage found nothing to flag, two say in terms that their
  nomination did not survive (G21, G34), two rollout rows disposition inline in
  their bullets (G36, G38), and four carry two because a band and a later decay
  re-read each reached one (G1, G6, G13, G35). **Asserting the false stronger
  claim would have been the failure, not the fix**, so what is asserted is the
  **closed vocabulary** — which is the plant §8 actually names. ⚠️ **An entry
  with no disposition passes this gate, and that is stated as a limit rather
  than left implicit.** ⚠️ **And because that retreat leaves the vocabulary
  check carrying the whole clause, a hole in it costs everything the clause has
  left — which is what review found.** The file writes the field three ways and
  the check required the colon, reading 29 instances and missing the one written
  `Disposition \`gated\`.` So a fifth disposition, in a spelling the file itself
  already uses, passed green. Closed with `:? +`, planted red, and the lesson
  recorded rather than the count quietly corrected: **the narrower a clause
  retreats, the more load each surviving assertion carries.**
- **Routing around** — **exposed on arrival and closed; one residual named.**
  The correspondence sweep reads `### G<n> — \`slug\`` and nothing else, so an
  entry written as `## G40` or `#### G40` would be invisible while reading to a
  human as a real entry. **That is G29's honest limit** — *"a form nobody writes
  here is a form this does not see"* — and it is **closed rather than
  inherited**: every `#{1,6} G<n>` heading at a level other than `###` is
  refused outright. ⚠️ **The residual: an entry can be moved out of the file
  entirely.** Nothing asserts the register is the only document carrying row
  sections, and a second file would satisfy neither direction of this gate nor
  contradict it. Named, not built.
- **Vacuous green** — ⚠️ **exposed on one side only, and the asymmetry is the
  finding.** *No entry without a row* already reddens on any deletion, so
  **entries cannot go vacuous**; the row side can, if the regex over
  `docs/gates.md` stops matching. Floored at **42**, planted. ⚠️ **And on
  top-row deletion the floor is the only structural check in the file**, because
  G19's gapless walk bounds at `n < numbers.at(-1)`, **exclusive of the
  maximum** — a finding about G19 in its own right, recorded in G19's entry
  alongside the `TABLES` hole. **An entry-side floor was declined**: it would go
  red *alongside* the first missing entry, landing two reds on the commit whose
  entire job is demonstrating one.
- **Decay** — ⚠️ **exposed: the floor is a number equal to a population, which
  is the shape that went wrong in the supply-chain piece.** 42 is safe **only**
  under the monotonicity argument — mark-never-delete plus gapless makes the row
  count non-decreasing in normal operation — and **a session copying the pattern
  without that argument copies the mistake.** ⚠️ **The spec's own justification
  for 42 is wrong and the number is right for a different reason.** It calls 42
  *"the row population after this spec lands"*; under the numbering that
  actually landed the rollout ends at **43**, and 42 is the population at **this
  row's own landing commit**. Under the spec's numbering a floor of 42 would
  have been **red at landing**, since `gate-register` lands before the ratchet's
  row. The out-of-band G37 shifted everything by one and made the stated number
  correct by accident. **Recorded rather than corrected in the locked spec**, on
  G38's precedent.

**Observed-red line:** ⚠️ **the first red was not planted.** On its first run
against the tree, `gates/gate-register.test.ts` reported **`G37 has 0
entries`** — `agents-import` had landed out-of-band from
[#172](https://github.com/mephistopheles4/stacks/pull/172) with no register
entry, and 37 entries stood against 38 rows. **That is this gate going red on a
real defect on the day it was written**, which is the field
`CONTRIBUTING.md`'s oldest rule asks for and which most rows satisfy from a
plant. The backfilled entry is above.

**Twelve further plants, 2026-08-20**, covering every way `gaming-analysis.md` §8
names plus two near-miss forms §8 does not — **both of which were green when this
row was first written, and both found by the spec-axis review rather than by the
plant table.** ⚠️ **They are one species and it is worth naming: a gate reading
*one* spelling of a field the file writes *several* ways.** §8's plant table asks
for the wrong *value* in each case and gets a red; neither plant asks for the
right value in an unexpected *shape*, which is where both holes lived. **A plant
table inherits the author's idea of what the file looks like**, and that is the
argument for a fresh-context reviewer over a longer table. **Run twice**, and the second run
is the one that counts: the first was against a *simulated* stack, because this
commit sits on top of `metrics-freshness` and G39's row had not landed yet, so a
placeholder row and entry stood in to make the population 42. **Re-run in full
against the real stack once G39 landed — all ten behaving, the suite at 795 of
795.** Recorded because a plant run against a stand-in is evidence about the
stand-in until somebody re-runs it.

| Plant | Result |
| --- | --- |
| **forward** — land a `docs/gates.md` row with no register section | **red**, and it is this commit's own demonstration: *"G40 has 0 entries; G41 has 0 entries; G42 has 0 entries"* |
| **reverse** — a register section for a row that does not exist | **red**: *"sections naming a row that docs/gates.md does not carry"* |
| **entry shape** — delete a row's observed-red line | **red**: *"a gate never observed failing is not yet a gate"* |
| **entry shape** — a disposition outside the four-word vocabulary | **red** |
| **cardinality** — merge two verdicts into one bullet on a row that is not exempted | **red** |
| **cardinality** — a second `### G26` section | **red**: *"G26 has 2 entries"* |
| **the exemption** — split G26's merged bullet, leaving the exemption behind | **red — the exemption is reverse-asserted**, so it cannot outlive the bullet it exists for |
| **the floor** — break the regex that reads `docs/gates.md`'s rows | **red, not a vacuous pass over two empty sets** |
| **an entry written at a heading level the sweep cannot see** — a `## G40` section | **red**. G29's stated limit, closed rather than inherited |
| **an entry at the right level in the wrong format** — `### G99 — action-pins`, no backticks | **red**, ⚠️ **and it was green until review caught it.** The check was written against heading *level* alone while its own comment claimed *"the near-miss forms are refused outright"* — **a docblock whose stated reach exceeded its assertion's, arriving in the gate built to catalogue exactly that.** Both directions now key off one `ENTRY_HEADING` pattern, so the two cannot drift apart again |
| **a fifth disposition in the one form the file writes without a colon** — `Disposition \`documented\`.` | **red**, ⚠️ **and it was green until review caught it.** The file spells this field three ways and the check required the colon, so it read 29 instances and was blind to the one at `docs/gate-register.md:3139` — **on the only assertion that survived the retreat from *exactly one disposition per entry*.** Now `:? +`, which reaches both field spellings and **no sentence**: the file legitimately says *"dispositioned `gated`"* and *"the disposition it would take is `gated`"*, and matching those would be the prose-matching failure `docs/gates.md` records three times |
| **top-row deletion** — delete the highest-numbered row | **red on the floor**, and on the reverse direction as an orphaned entry — **while G19 stays green, gapless check included.** Verified on the real stack by running `gates/constitution-scoreboard.test.ts` against the same plant: **14 passed, 0 failed.** The interior control ran in the same pass — deleting G40 instead fires gapless by name, *"row numbers missing from docs/gates.md … G40"* — because the walk bounds at `n < numbers.at(-1)`, **exclusive of the maximum**. ⚠️ **That asymmetry is the finding, and it is about G19 rather than about this row** |

⚠️ **What cannot be planted, and is marked reasoned rather than demonstrated:
that the analysis inside an entry is any good.** This gate asserts shape. **It
is the same limit G19 has to slugs**, and G22's lesson applied to this gate
rather than exempting it.

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
- **Decay** — **exposed**, ⚠️ *corrected 2026-08-16 by the decay re-read part
  two ([#150](https://github.com/mephistopheles4/stacks/issues/150)), from
  `clean; no load-bearing number`.* The docblock's **"The only gate that
  reaches the `## About` body insert"**, and the row's warrant for existing
  separately — **"G32 cannot see that write at all"** — are both false, and
  were false in the commit that wrote them: `gates/absent-only.test.ts:131`
  calls `insertBodySection(…, '## About', …)` and its byte-identical assertion
  would go red if that write stopped being absent-only. Disposition `gated`.
  ⚠️ The *Satisfying the letter* verdict above cites the same false premise;
  noted, not edited — it is not this pass's category. See the Decay re-read
  part two block.

`docs/gates.md` carries no elaboration beyond the table row.

**Observed-red line:** not recorded.

**Rank:** none.

### G34 — `enrich-convergence`

**Gate:** [`gates/enrich-convergence.test.ts`](../gates/enrich-convergence.test.ts)
**Date:** 2026-08-11

- **Weakening / satisfying the letter / routing around / vacuous green** —
  clean, on the evidence available; the spec exercises `enrichBook` end to
  end rather than mocking the property it depends on.
- **Decay** — **clean** — *verdict landed 2026-08-15 by the decay re-read
  ([#144](https://github.com/mephistopheles4/stacks/issues/144)); the correction
  is band four's, made in the Deep pass block below on 2026-08-11 and never
  written into this line.* ⚠️ **This is the only place in the file where a
  band's correction did not reach the verdict it corrected** — the Summary
  counted G34 flagged on a nomination the block underneath it had already
  refuted on both legs, and #144 flagged the line as *"resolving to neither
  token and owing a verdict regardless"*. Nothing is re-decided here. Originally,
  and refuted below: *nominated, low confidence.* The row's whole guarantee rests
  on an
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

**Deep pass (2026-08-11, band four) — verdict corrected, no disposition.**

⚠️ **The nomination does not survive, and it fails on both of its legs.** It was
read off the test file's doc comment; neither the row nor the code was checked
against it.

**Leg one — *"recorded only in this test file's doc comment, not in `CLAUDE.md`
or `docs/gates.md`'s own row text"* — false.** `docs/gates.md` line 110 is G34's
own Failure-mode cell, and it states the property verbatim: *"a success is
cached forever, a failure is never cached at all"*. It is also in
`docs/spec/README.md` (P3) and `docs/spec/metadata-merge.md` §"Cache, rate
limits, convergence".

**Leg two — *"if the comment is ever trimmed… has no other home"* — false, and
this is the substantive half: the property is *asserted*, not merely
documented.** Negative caching planted at
[`packages/core/src/metadata/http.ts`](../packages/core/src/metadata/http.ts):64
— writing a cache entry on the `body === undefined` path — turns
`describe('G34 — a failure is never cached, a success is cached forever')` red.
A doc comment cannot go red; this does.

**The anchor's scope, measured.** With that plant in place **exactly 1 test of
636 in the repository fails**, and it is that one. Singular, but real. ⚠️ **The
row's *headline* convergence test stays green under it** — it passes
`flakyApple()` as the `HttpGet` directly and so never touches
`createCachedHttpGet` at all. Which is precisely why the second `describe` block
was added, and it is doing exactly the work its own comment claims.

Also re-measured: the line citation `http.ts:64` in that spec's failure message
still lands on `if (body === undefined) return undefined;`. Accurate today, and
held there by nothing.

**Observed-red (this pass):** negative caching at `http.ts:64` → red on *"writes
nothing to the cache when the request fails"*, 1 of 3 in the file and 1 of 636
repo-wide. The row had no observed-red line before this pass; it has one now.

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
- **Decay** — **exposed**, ⚠️ *corrected 2026-08-15 by the decay re-read
  ([#144](https://github.com/mephistopheles4/stacks/issues/144)), from `nominated,
  unconfirmed`; the nomination survives re-measurement.* Originally, and still
  accurate as a description: `scripts/smoke-render.ts`
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

**Deep pass (2026-08-12, band two) — disposition: `repaired`; the decay
nomination survives, unconfirmed.**

The widened checks catch what the single assertion could not. Restoring the
Escape-closes-both defect verbatim — dropping `if (coverViewer.isOpen()) return;`
from `boot.ts` — and removing `node.title` from icon-only links in `card.ts`, both
live at once, fails `pnpm smoke:render` with **four named lines**: the Escape-scope
failure once, and *"a card link has no accessible name"* three times, once per
icon-only link on the clicked book. A third plant, suppressing the status word for
`read` books, fails **3 of 21** in `card.test.ts`.

**The decay nomination is neither cleared nor dispositioned.**
`scripts/smoke-render.ts` cites `§11.1` through `§11.7` as the map from what it
checks to what `docs/spec/enhanced-card.md` §11 requires. All five citations were
walked item by item against that spec's eight-item list and **all resolve
correctly today**. Nothing enforces they still will — G29 checks Markdown link
fragments, not bare `§N` prose — so the verdict stays *nominated, unconfirmed*:
there is drift to be had and none yet, which is exactly what that verdict is for.

⚠️ **The row's own demonstration is fixture-blind, and it is band one's G20
argument arriving here as a gap rather than as a repair.** The browser-side check
`card.reading.length === 0` never fired, because `scripts/make-50-book-fixture.ts`
gives **every** `status: read` book a date — so no book in the fixture
`smoke:render` builds against can produce an empty reading line. The defect was
watched failing at the unit level instead. The real-vault shape this row's history
cites, books with no dates, does not exist in the corpus the gate runs on. *A
defect the gate plants must be a defect the file could actually have* has a
sibling: **a fixture must be able to exhibit the defect the check is for.**

**Named remedy (not built, for the decay nomination):** parse the `§\d+\.\d+`
references out of `scripts/smoke-render.ts`'s comments and the numbered items out
of `docs/spec/enhanced-card.md`'s acceptance list, and diff them. No puppeteer
needed; it sits naturally beside G29.

**Observed-red (this pass):** `pnpm smoke:render` exits non-zero with four named
failures under two simultaneous plants and exits `OK` after both reverts; the
third plant fails 3 of 21 in `card.test.ts`.

**Other categories:** Weakening and Routing around — `clean` in triage, **open**.
Vacuous green — historical, fixed; demonstrated together with satisfying-the-letter
by the same two plants.

⚠️ **Not observed:** the browser-side reading-line check, for the fixture reason
above — no contrived fixture was built to make it fire.

**Decay re-read (2026-08-15, [#144](https://github.com/mephistopheles4/stacks/issues/144)) — verdict corrected `nominated, unconfirmed` → `exposed`; disposition: `gated`.**

⚠️ **This row is why the discharge test had to be written down.** Band two walked
all five citations item by item, found they *"all resolve correctly today"*, and
left the verdict at `nominated, unconfirmed` — *"there is drift to be had and none
yet."* Under the old bound (*a claim measured once and never re-measured*) that
was the honest answer. Under
[#138](https://github.com/mephistopheles4/stacks/issues/138)'s restated bound it
is not, and the reason is the rule this pass settled: **what gets re-measured is
the nomination's own claim**, not the underlying fact.

**The underlying fact re-measures true.** Re-walked here: `§11.1`–`§11.7` in
`scripts/smoke-render.ts` (`:523`, `:530`, `:536`, `:556`, `:567`) still land on
`docs/spec/enhanced-card.md` §11's items 1–7. Unchanged since band two. ⚠️ Note
the spec's acceptance list has **eight** items and the comments cite seven —
`§11.8`, `published` rendering, is checked by unit tests rather than in the
browser, which is correct and is not a citation fault.

**The nomination's claim also re-measures true, and that is what decides it.**
*"Nothing enforces that those numbers still name what the comment claims"* — G29
holds Markdown link targets and skips bare `§N` prose by construction, and no
other spec reaches it. So the map from what this gate checks to what the spec
requires is established by a human walking it, twice, and by nothing in between
or after. That is *"never re-established against a check that was available"* as a
**standing condition** rather than a historical accident, which is what the
restated bound admits and the old one did not.

**Contrast with band four's G34, deliberately**, because the two look alike and
came out opposite. G34's nomination claimed the load-bearing property was
*"recorded only in this test file's doc comment"*; band four checked and it was
false — the property is asserted, and a plant turns it red. G35's nomination
claims nothing enforces the citations; this pass checked and it is **true**. Same
test, opposite results: **a nomination fails when its own claim is false, not
when the fact it worries about is currently fine.**

**Named remedy:** band two's, unchanged and now dispositioned rather than left
dangling — parse the `§\d+\.\d+` references out of `scripts/smoke-render.ts`'s
comments and the numbered items out of `docs/spec/enhanced-card.md`'s acceptance
list, and diff them. No puppeteer, no network; it sits beside G29.

**Observed-red (this pass):** none planted; discharged by re-measurement per band
four's rule. The band-two `smoke:render` observed-red lines above are untouched.

**Cost, and this is the band's expensive row as #132 predicted:** ~35 min, of
which **three `pnpm smoke:render` runs at 20.3–20.6s wall each, ~61s of puppeteer
in total.** ⚠️ **The prediction was right about the row and wrong about the
size** — 20s a plant is twenty times the 6.5s suite and still nowhere near a cost
centre. What the row actually cost was reading time, the same as every other row
in the band.

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

**Deep pass (2026-08-11, band four) — disposition: `repaired`.**

**The code repair holds, and is red-capable.** `compareShelfPosition` puts
`status === 'reading'` ahead of `shelfOrder`
([`packages/core/src/shelf-order.ts`](../packages/core/src/shelf-order.ts):36–37),
the gate is 6 of 6 green, and deleting those two lines — the pre-repair order —
fails **4 of 6**, including *"a newly started book leads even a fully renumbered
shelf"*, which is the regression the row exists for. `CLAUDE.md`'s current
sentence, *"Unset means the default order: newest finished first"*, reads true.

⚠️ **The decay is repaired in the code and still live in the row's own
justification.** [`gates/shelf-order.test.ts`](../gates/shelf-order.test.ts):8
presents, in the present tense and as something *"CLAUDE.md documents"*:

> "Unset means the default order: reading first, then newest finished."

That sentence is not in `CLAUDE.md`. It **was**, verbatim, until `b0c5d85`
(2026-07-31) — *the commit that made the repair* — which rewrote it in
`CLAUDE.md` and left the quotation standing in the test file **it edited in the
same commit**. `packages/core/src/shelf-order.ts`:27 carries the same superseded
text inside its own reasoning. `git grep` returns exactly two hits for the
phrase, both citations, and zero in the document being cited.

So the row's *"already repaired"* triage line is right about the behaviour and
wrong about the record: a reader who follows the gate to its stated source finds
a different rule than the one quoted. A lesser instance in the same family:
`CLAUDE.md`:90 still states *"Books carrying one come before every book without
one"* unqualified, and it is line 142 — fifty-two lines later — that says a book
you are reading beats a pin.

**Remedy, named and not built:** correct both quotations, and cite the sentence
rather than reproducing it. ⚠️ **A gate is declined rather than merely
unbuilt** — *"every quotation matches its source"* is a text-matching check
over prose, [#113](https://github.com/mephistopheles4/stacks/issues/113)'s
category 2 by construction, and it would be the widest-scoped gate in the repo.

**Observed-red (this pass):** the pre-repair order (deleting the two status
lines) fails 4 of 6. The row had no observed-red line before this pass.

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

**Deep pass (2026-08-12, band two) — disposition: `accepted`, and the number the
row is missing now exists.**

The scope mismatch is real and was measured rather than restated. A standalone
probe drove the **real** code path — `ObsidianAdapter` → `buildLibrary` →
`toRows` → `spineCanvasWidth` → `decodedTextureBytes`, the same functions the
shelf itself uses — over both fixture vaults. Per-book spine `CanvasTexture`s
come to **4.6 MB across the 10-book vault (8 shelved)** and **23.0 MB across the
50-book fixture (41 shelved)**, against a `TEXTURE_BUDGET_BYTES` of 96.0 MB that
counts **none of it**. ⚠️ **That independently corroborates `docs/gates.md`'s
"~22 MB" by a different route** — computed from the placement code rather than
copied from the file — which is worth more than agreement usually is, because
this row's whole problem is a number that reads as covering more than it covers.
Confirmed by inspection: `gates/cover-budget.test.ts` imports `MAX_COVER_EDGE`,
`TEXTURE_BUDGET_BYTES`, `decodedTextureBytes` and `measureCover`, and **nothing
in `gates/` imports `spine-texture.ts` at all**. The spine cost is structurally
invisible to this gate, not merely uncounted.

⚠️ **The weakening exposure is one line and nothing else notices.** Setting
`TEXTURE_BUDGET_BYTES` to `0` fails 4 of 5 with a real message (*"6 covers decode
to 2.4 MB of GPU texture, over the 0.0 MB budget"*), so the assertion is genuinely
exercised and not vacuous. Setting it to 10 GB passes **5 of 5**, with no other
change — and both constants are referenced **only** inside
`gates/cover-budget.test.ts`, so the whole 636-test suite has nothing to say about
raising them. The row's own warning — *"a budget that gets raised whenever it
fails is a comment"* — is defended by nothing but the reviewer.

**`accepted` rather than `gated`**: the gap is documented at length, and the file
names an explicit non-gate substitute (`?debug`, `?solo`, manual review on a real
phone) instead of claiming closure. That is a finding closed by writing a rule
down, which is `accepted` wearing a closure's clothes rather than a fifth
disposition.

**Named remedy (not built):** count spine bytes in the same budget as cover bytes
— `decodedTextureBytes` already exists, and `toRows` + `spineCanvasWidth` supply
the inputs — so the number covers what a phone actually holds rather than the
cover half of it. The measurement above is the prototype.

**Observed-red (this pass):** `TEXTURE_BUDGET_BYTES` → `0` fails 4 of 5 naming the
real total; → 10 GB passes 5 of 5.

**Other categories:** Satisfying the letter — the same scope mismatch as this
row's rank-2 category, not separately dispositioned. Routing around —
**demonstrated** by the 23.0 MB measurement, left open as not this row's category.
Vacuous green — exposed and current in triage, **open**. Decay — `clean` in
triage, **open**.

⚠️ **Not observed:** `pnpm smoke:render` was never run for this row, so the
vacuous-green verdict — that a desktop GL context screens what kills a phone —
gained no evidence here and no cost figure. And 23.0 MB is the **41-book synthetic
fixture**, not the owner's real library; ~0.56 MB/book should extrapolate, but
that is an extrapolation.

**Cost:** ~30 min, one `pnpm fixtures:50`, one standalone probe covering both
vaults, 3 file-scoped vitest runs.

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

**Remedy built (2026-08-19, [#161](https://github.com/mephistopheles4/stacks/issues/161)) — the first of the two forms named above.**
`gates/deploy-branch.test.ts` now asserts `package.json`'s `deploy:site` is
exactly `tsx scripts/deploy.ts`, so a flag baked into the shipped command is red
at merge. The stronger form — driving one case through `pnpm deploy:site` itself —
is **still not built**, and the gap it leaves is narrower but real: this compares
one string and would not see an override arriving by any other route into argv.

Built from the other side of the roster rather than by a pass over this row.
G39 (`metrics-freshness`) is a second deploy-side refusal driven the same way, so
it inherits this hole exactly — `--check-only` baked in here downgrades that
refusal to a warning with its own gate green — and the standing rule for this
rollout is that a remedy is checked against the routing-around verdicts of every
row sharing its mechanism. One assertion, in the row whose remedy it is, rather
than a copy in each. **Observed red**: `"tsx scripts/deploy.ts --check-only"`
fails one of eight, naming both strings.

⚠️ **A second property of this idiom, recorded here because this is where the
next person copies it from: an exit code asserts nothing.** The harness proves a
run got past the check under test by letting it fail on the *next* one — so
`expect(status).toBe(1)` is equally true of a deploy that refused for your reason
and one that ignored your check entirely and fell over a line later. This row
gets it right by accident of wording (`not.toContain(PAST_THE_GUARD)` is on the
refusal cases because two messages had to be told apart); **G39 got it wrong and
was green for half an hour against a plant that deleted its refusal outright.**
The discriminating assertion is that the *later* refusal was never reached. See
the G39 entry's vacuous-green bullet.

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

**Deep pass (2026-08-11, band four) — the claim splits in two: `accepted` on
time, `gated` on membership.**

The spec is 14 of 14 green, so the *"six of fourteen"* denominator still reads
fourteen.

**Half one — what a provider serves today: `accepted`, and honestly.** The
measurement was a manual run against live endpoints; **G21** forbids the suite
to repeat it, nothing schedules it outside the suite, and no configuration
changes either fact. This is what `accepted` is for. What it should say when
written down is what the row does not say now: not merely a **date**, but the
**population** the date applies to.

⚠️ **Half two — and this is why the row is not simply `accepted`. The population
moved, and that half needs no network at all.** The claim is *"what the **three**
providers did on 1 August 2026"*. **O'Reilly became a fourth provider at
`ff93f0a`, 2026-08-08 — seven days later** — and its covers are the sole source
for its own early releases, served from
`learning.oreilly.com/covers/urn:orm:book:<ourn>/1200w/` and downloaded through
the same `download` in
[`packages/core/src/covers/cache-cover.ts`](../packages/core/src/covers/cache-cover.ts).
`COVER_SOURCES` names four providers today; the measurement covered three.

The gap lands on the worst candidate available. That URL ends in `/1200w/` and
carries **no file extension**, so `Content-Type` is the only pre-body signal
there is — and the risk the row names in its own words is that a provider
answering something other than `image/` is refused **silently**, because
`cacheCover` treats every failure as *"no cover"*. A book quietly logged bare, on
the one provider no other provider can answer for.

**Remedy, named and not built:** assert that the set of providers the G18
measurement names equals `COVER_SOURCES` minus `unknown`. That is a repo fact,
checkable offline, and it converts an open-ended shelf-life claim into a bounded
one — a fifth provider goes red until somebody either re-measures or writes down
that they did not. It does not make the measurement fresh; it makes the
staleness **countable**, which is the part that was silent.

⚠️ Nothing here was checked against the live providers, deliberately: G21 is a
gate, not an inconvenience, and the finding did not need it.

**Observed-red (this pass):** none planted. The row's existing line — restoring
the old four-line `download`, six of fourteen — stands, and its denominator was
re-counted rather than trusted.

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
- **Decay** — clean, ⚠️ *reason corrected 2026-08-16 by the decay re-read part
  two ([#150](https://github.com/mephistopheles4/stacks/issues/150)); the
  verdict stands and the reason below did not.* A measured-once number **does**
  underlie the row — the docblock's *"the seven text-matching gates in this
  folder"*, against 17 specs then and 29 now — but nothing rests on it, so it
  is excluded on [#113](https://github.com/mephistopheles4/stacks/issues/113)'s
  load-bearing bound, the slug count's precedent. Originally: no measured-once
  number underlies the row — it inspects
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
- **Decay** — **exposed**, ⚠️ *corrected 2026-08-16 by the decay re-read part
  two ([#150](https://github.com/mephistopheles4/stacks/issues/150)), from
  `clean; no measured-once number underlies this row`.* The old reason was
  right about numbers and the bound is about **claims**: the docblock's
  *"since nothing here uses `node:http` directly"* is false and **was false
  when written** — `scripts/smoke-render.ts:18` imported it three days
  earlier. The conclusion it supports survives (`createServer` serves, it does
  not request); the warrant does not. Distinct from the routing-around verdict
  by #144's Rule 2 — that one is about the gate's own reach, this one about
  the repository's files. See the Decay re-read part two block.

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

**Deep pass (2026-08-11, band four) — disposition: `accepted`.**

**The load-bearing claim re-measures true, which is the whole of the decay
question here.** Of the five files in `scripts/lib/`, only `public-build.ts` and
`walk.ts` import `fs`, and both were already allowlisted at `1168650`
(2026-08-03), a day before G24 landed at `15fd6f1` (2026-08-04); `repo-root.ts`
is `node:path`, `run.ts` and `git.ts` are `node:child_process`. So *"the
consolidation shipped here changes G1's allowlist by exactly nothing"* still
holds, the row's own correction of its issue's second-order argument stands, and
there is nothing outstanding to build — `accepted`, in the sense of *checked and
found still correct*, not *lived with*.

The sweep is red-capable today: adding `new URL('..', import.meta.url)` to
`scripts/make-icons.ts` fails *"lets no other script derive the repo root for
itself"*. ⚠️ Worth noting which spelling that is — the docblock calls
`new URL('..', import.meta.url)` the form *"nobody has written here yet"* and
says the `import.meta` anchor was chosen to cover it. It does.

⚠️ **A second claim in the same paragraph is wrong, and it is not decay.**
*"`scripts/lib/` holds three other shared files"* appears in
[`gates/repo-root.test.ts`](../gates/repo-root.test.ts):24 and in
`docs/gates.md` line 880. At `15fd6f1` — **the commit that wrote both
sentences** — `scripts/lib/` held five files: `repo-root.ts` plus `git.ts`,
`public-build.ts`, `run.ts` and `walk.ts`. Four others, not three, and `git.ts`
was added by that same commit.

**It was wrong on arrival and has never had a true state**, so *decay* — which
asks whether a claim *was* measured and has since drifted — does not name it.
⚠️ **Flagged for [#120](https://github.com/mephistopheles4/stacks/issues/120)
rather than settled here**: whether the five categories should admit
*asserted-but-never-measured* as a widening of category 5, or whether it sits
outside them, is a decision about the taxonomy and not a verdict on a row. And
the honest counter-argument is on the record too — under #113's own bound the
count is **not load-bearing**: it decorates the one-owner-not-a-directory
argument rather than carrying it, so the bound may be excluding it correctly.

The direction of the error is the part worth keeping. The sentence argues that a
directory permission collects whatever later lands in the directory — and it
undercounts because something already had.

**Remedy, named and not built:** correct both counts, or better, drop the number
and state the property. A gate is declined for G12's reason.

**Observed-red (this pass):** `new URL('..', import.meta.url)` in
`scripts/make-icons.ts` → red on the sweep, 1 of 4.

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

**Deep pass (2026-08-12, band two) — disposition: `repaired`, four ways, in both
directions.**

Four plants, each independently failing **exactly 2 of 12** in
`packages/site/src/shelf/placement.test.ts` — `packs a run flush` and `never
drives one board through another` — and nothing else in the file. One check-side:
the original defect restored, `centre = height / 2` for a leaning book. Three
placer-side, in `placement.ts`'s `parallelPushOf`: clamping the push at zero,
dropping it altogether, and doubling it. The last matters most — it produces an
**oversized** gap, which is the mirror direction the first version's `gap ≥ 0`
left entirely unchecked, and the current row catches it with the same assertion
that catches an undersized one.

⚠️ **The re-plant corrects the row's own moral.** `docs/gates.md` reads the repair
as *"a check that disagrees with the code is not automatically the one that is
right"* — true, and not what closes the hole. The restored defect produced a
discrepancy of **9.1e-7 here, four orders of magnitude below the 0.26mm** the
row's history describes, and it still went red: the assertion is
`toBeCloseTo(TOUCHING, 10)`. **What closes this hole is the precision.** At ten
decimal places a wrong-but-plausible number has nowhere to sit, which is the
mechanical version of a lesson the file currently records as a judgment call.

**Named remedy:** none. No live exposure.

**Observed-red (this pass):** four plants, one check-side and three placer-side,
covering both the closing and the opening direction of the historical error; each
fails the same 2 of 12, and each reverts to 12 of 12.

**Other categories:** Weakening and Decay — `clean` in triage, **open**. Routing
around and Vacuous green — historical, fixed; both demonstrated above, the
mirror-direction one by the doubling plant specifically.

⚠️ **Not observed:** `boardGap`'s zero-shared-height branch was not exercised, and
no non-arithmetic regression (a book skipped from the row entirely) was tried.

**Cost:** ~14 min, 5 file-scoped invocations, all under a second.

### G42 — `dependency-audit`

**Gate:** the `audit` job in [`.github/workflows/gates.yml`](../.github/workflows/gates.yml),
asserted by the `action-pins` spec
**Date:** 2026-08-20
**Triaged at landing**, per this rollout's standing rule.

⚠️ **It names a mechanism rather than a `gates/*.test.ts`, and it names the
asserting spec by slug rather than by path — deliberately.** Naming
`gates/action-pins.test.ts` in the row would make **two** rows claim that stem,
which self-exempts both from G19's derivation rule and quietly costs G40 the
anchoring that keeps a slug moving with its file. The slug is the maintained
name and G19 already holds it to the path, so citing it loses nothing. G16
(`books-in-case`) is the precedent for a row that declares its slug rather than
deriving it; the self-exemption in `constitution-scoreboard.test.ts` is
structural, so no allowlist there needed editing.

⚠️ **As first written this row was one nothing can fail on, and that is the
correction that matters most in this piece.** `specPathsNamed()` only
existence-checks `.ts` paths and this row names none, so **delete the `audit`
job *and* its `needs:` entry and CI is green, `pnpm test` is green, and the ✅
still stands.** Promoting a claim into the table G19 reads is **visibility, not
enforcement** — the supply-chain argument applied asymmetrically would have
shipped this effort's own subject matter inside the effort. Closed inside G40's
existing sweep at no new cost.

- **Weakening** — ⚠️ **exposed, and the hatch is the entry.**
  `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` is an allowlist and **every
  entry is a permission.** See the standalone verdict below, which is owed here
  and was triaged by nobody. The threshold is the other lever: `--audit-level`
  is one word from `critical`, and **the assertion is now on the exact string
  `pnpm audit --audit-level=high`**, so both directions are red rather than
  silent. `accepted` for the hatch, **`repaired` for the threshold** — it was
  ungated and now is not.
- **Satisfying the letter** — ⚠️ **exposed, historical, and closed by this
  commit.** The row as first specified is the specimen: a ✅ asserting nothing.
  What closes it is four assertions against the real workflow rather than a copy
  of it — the job exists, its threshold is exact, the aggregator needs it, and
  the aggregator tests its `result` against `success`. **That last one is not
  decoration**: comparing against `'failure'` instead would let a **skipped or
  cancelled** audit through, and a required check that never reports is a
  failure mode this repo's own workflow comments already name.
- **Routing around** — **exposed, and it is inherent to what the job is.** The
  audit reads the lockfile; a dependency introduced by a path the lockfile does
  not describe is not seen, and nothing here checks that the tree CI installs is
  the tree the audit ran against beyond `--frozen-lockfile`. ⚠️ **The narrower
  and more live one: the assertions name `.github/workflows/gates.yml` by
  path.** A second workflow declaring another job called `audit` would satisfy
  nothing and contradict nothing — accepted, because `gates` is a single
  required status check defined in a single file, so the fact being asserted
  genuinely lives in one place. **G14's demonstrated hole**, met by the
  population rather than by a sweep.
- **Vacuous green** — **clean, and floored by the job extraction rather than by
  a count.** `jobsOf` **throws by name** when the `jobs:` block is gone, so a
  restructured workflow fails loudly instead of handing back an empty map and
  letting all four clauses pass over nothing; `expectFound` floors the job list
  at 3. Both planted.
- **Decay** — **clean, with one dated claim, and it is the strongest
  observed-red in this rollout because nobody planted it.** The 2026-08-08
  incident is real history: two advisories, both with patches, one of which
  `pnpm update nanoid` **silently declined** under pnpm 11's seven-day
  `minimumReleaseAge` quarantine. ⚠️ **The `overrides` entry answering it has
  since decayed once on its own** — GHSA-2v37-7h3g-55p8 was **amended upstream**
  from `<3.3.17` to `<3.3.18` on 2026-08-15 and turned CI red on an **unchanged
  lockfile**. *An advisory id is not a stable statement of scope*, which is a
  category-5 specimen arriving from outside the tree entirely.

**Observed-red line:** **two, and they are different failures.** ⚠️ **The
distinction is the point of this row's teeth.**

| | |
| --- | --- |
| **the job going red on an advisory** | **2026-08-08**, real, unplanted: two high advisories, `pnpm update nanoid` reporting success and leaving the tree on the vulnerable version. Recorded in `docs/gates.md` under this heading since before the row existed |
| **the row going red on the job disappearing** | **2026-08-20**, four plants, and **this is the assertion that did not exist.** Delete the `audit` job → *"no job named `audit` … delete the job and that row is a claim nothing can fail on"*. `--audit-level=moderate` → red. Drop `audit` from `needs:` → *"a job it does not need is a job whose failure merges"*. Test `!= "failure"` instead of `= "success"` → *"expected [ 'suite' ] to include 'audit'"* |

**Disposition: `repaired`** — the row existed and asserted nothing; it now
asserts four things about the mechanism it names. No new hole is left open by
the repair, and the two `accepted` residuals are named above.

---

## ⚠️ `auditConfig.ignoreGhsas` — the category-1 verdict this rollout owed

**Not a row, and it does not get one.** It is the escape hatch every other
hatch in this spec is modelled on, and **it was triaged by nobody**: the triage
pass read its row list *from the file*, and when it ran the file held 35 rows.
`docs/spec/supply-chain.md` §3 makes the verdict a **spec obligation** on the
commit landing G40 and G42 rather than an assumption, because *a handoff that
reads as delivered and delivers nothing is category 2 arriving in the
coordination between two tickets instead of in a gate.* Discharged here.

**Measured at `3e2fc88`, 2026-08-20: the hatch has zero live entries.** The
whole `auditConfig:` block in `pnpm-workspace.yaml` is **commented out** — it
exists as a template carrying the rule (*"An entry needs the GHSA id, the date,
and why it does not reach this project… Remove the entry the moment a fix ships;
a permanent ignore is a decision nobody revisits"*) and a specimen line. So
today it grants nothing.

⚠️ **The exposure is not the entries; it is that the rule governing them is a
comment.** Uncomment the block, add `- GHSA-xxxx-xxxx-xxxx` with no date and no
reason, and **nothing goes red** — not `pnpm audit`, which honours it, and not
any gate, since no gate reads `pnpm-workspace.yaml`'s audit config at all. This
file's own opening line is the judgement: *a rule nothing can fail on is a
comment.* It is **the same shape as the `allowBuilds` block two entries up**,
which G13's verdict already names — *every allowlist entry is a permission* —
except that this one is unpopulated, so the failure is latent rather than live.

⚠️ **And the neighbouring `overrides: nanoid` entry is the demonstration that
this hatch's discipline is real work rather than paperwork.** It carries the
GHSA id, two dates, the amendment history and an explicit *"this is deliberately
not an `ignoreGhsas` entry"* — which is precisely the *reach for that hatch
second* rule being obeyed by a human who remembered to. Nothing enforced it.

**Disposition: `accepted`.** The population is zero, so a gate written now would
be a gate over an empty set with no observed red available — *a gate never
observed failing is not yet a gate*, and manufacturing an entry to redden it
would be planting the permission this verdict is about.

**Remedy (named, not built):** when the first real entry lands, assert its
**shape** in the `action-pins` spec, which already reads the supply-chain
surface: every `ignoreGhsas` item matches `GHSA-` + the four-four-four id shape,
and carries a trailing comment holding an ISO date and a non-empty reason. **The
same two-sided rule as `action-pins` clause 2** — the id alone is satisfiable by
deleting the justification, which is the cheapest way to look compliant. ⚠️
**Explicitly *not* a check that the entry's reasoning is sound**, which is
outside any gate here, and not a check that the advisory is still unfixed, which
would need the network G21 forbids.
