# Gate register

**Triage pass, not the deep pass.** This is the population commissioned by
[#126](https://github.com/mephistopheles4/stacks/issues/126), running the shape
[#113](https://github.com/mephistopheles4/stacks/issues/113) fixed. It puts the
same five questions to every numbered row in [`docs/gates.md`](./gates.md) and
records a one-line verdict each — `clean`, or the shape of the exposure.
**Suspicion, not proof.** A verdict here is a nomination for the deep pass, not
a finding, and nothing here has been demonstrated by planting a defect. No
dispositions (`gated` / `repaired` / `accepted` / `declined`) are filled in —
those belong to the deep pass.

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

For the deep pass, in the priority order #113 fixed: **1** rows flagged under
*vacuous green*, **2** rows whose gate matches *text rather than structure*,
**3** rows whose gate carries an *allowlist*, **4** rows asserted *outside
`gates/`*. A row takes the highest (lowest-numbered) tier it qualifies for.

Tiers 1–3 are category verdicts, so a row in one of them necessarily carries a
non-clean verdict — ranked implies flagged. **Tier 4 is different: it is a
structural fact about *where the check runs*, not a verdict on any of the five
categories.** A row can be asserted outside `gates/` and still be clean on all
five — that row is ranked (for the deep pass's location-based ordering) but
not flagged (no exposure was found). G16 is exactly this case: outside
`gates/` per pnpm smoke:render, clean on all five categories. G18 is the
contrast — also outside `gates/`, but carries a genuine Decay exposure, so it
is both ranked and flagged.

A row flagged only under *weakening* (non-allowlist), *routing around*, or
*decay* outside these four shapes carries no rank — flagged, not ordered,
because the ranking rule does not reach it.

**The deep pass's membership is the flagged set, not the ranked set.** Rank
orders it; it does not define it.

---

## Summary

**35 rows triaged, 0 not reached.**

**22 rows carry a rank:**

| Rank 1 — vacuous green | Rank 2 — text over structure | Rank 3 — allowlist | Rank 4 — outside `gates/` |
| --- | --- | --- | --- |
| G17, G20, G21, G22, G23, G25, G26 | G2, G7, G14, G15, G19, G28, G29, G31, G35 | G1, G10, G13, G30 | G16, G18 |

Of those 22, **21 are also flagged** — every rank-1/2/3 row is flagged by
construction, and G18 (rank 4) carries a genuine Decay exposure. **G16 (rank
4) is not flagged**: all five of its categories are clean, and it is ranked
only because tier 4 is a structural property (location), not a category
verdict. See "Rank is not the same thing as flagged," above.

**4 more rows carry a flag with no rank** — exposed under weakening, routing
around, or decay outside the four ranked shapes: **G6, G12, G24, G34**.

**10 rows found nothing on all five categories**: G3, G4, G5, G8, G9, G11,
G16, G27, G32, G33.

Flagged (21 ranked + 4 unranked) and clean (10) partition all 35 rows.

**Total flagged: 25 of 35.**

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

### G14 — `commands`

**Gate:** [`gates/commands.test.ts`](../gates/commands.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean.
- **Satisfying the letter** — exposed, real, and one of the file's own
  canonical instances: the original regex searched for `\bname\b` anywhere in
  the Commands section, so a new `covers` command passed as documented purely
  because `status`'s description reads "covers still missing." Found by the
  next command added, not by the gate itself. Now anchored to line start.
- **Routing around** — not discussed further.
- **Vacuous green** — related to the above; not separately discussed.
- **Decay** — clean.

`docs/gates.md` already answers this — the 2026-08-01 note "G14 had a false
negative, found by the next command added."

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
- **Routing around** — the same limit, from the other side: "Fixing it
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

- **Weakening** — related to hole 1 below; not a standing allowlist today.
- **Satisfying the letter** — exposed, historical, fixed, and this is the
  row's own headline: it "shipped with three holes of its own, all found by
  review before merge" — a spec-path allowlist scoped to three directory
  prefixes that missed G10's real path; a gate counted as scored if its
  filename appeared *anywhere* in the file, paragraphs included; and a
  citation counted if the words "invariant N" appeared in *any* cell of *any*
  row. The third is explicitly "verbatim the defect logged above for G14."
- **Routing around** — the directory-prefix hole above is exactly this shape:
  a real path (G10's `covers/cover-path.test.ts`) sat outside the allowlisted
  roots and was invisible to the checker.
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
- **Routing around** — not discussed; no basis found.
- **Vacuous green** — clean; the fixture is deliberately unrealistic ("a
  record with a gap in it proves nothing about the key that was missing").
- **Decay** — not discussed.

`docs/gates.md` carries no elaboration beyond the table row; the allowlist
finding comes from reading the spec directly.

**Observed-red line:** not recorded.

**Rank:** 3 (allowlist).

### G31 — `merge-precedence`

**Gate:** [`gates/merge-precedence.test.ts`](../gates/merge-precedence.test.ts)
**Date:** 2026-08-11

- **Weakening** — not discussed; no basis found.
- **Satisfying the letter** — nominated, unconfirmed. The spec parses a
  Markdown table out of `docs/spec/metadata-merge.md` to compare against
  `precedence.ts`. G19 shipped with a bug of exactly this shape — reading the
  wrong table cell because a column shifted — in a different file. Nothing in
  `docs/gates.md` or the spec's own comments states this parsing has been
  probed for the same failure; recorded as suspicion only, not evidence.
- **Routing around** — not discussed.
- **Vacuous green** — not discussed.
- **Decay** — not discussed.

`docs/gates.md` carries no elaboration beyond the table row; the suspicion
above is this triage's own, grounded in G19's precedent rather than in a
citation.

**Observed-red line:** not recorded.

**Rank:** 2 (text over structure) — nominated only, lowest-confidence entry in
this tier.

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

- **Weakening** — not discussed.
- **Satisfying the letter** — exposed, and the row's own Failure-mode cell in
  `docs/gates.md` says so directly: "*'the card opened'* was the whole
  assertion, and it stays true through a card with no reading line, links with
  no accessible name, an announcer that never changes, a sheet that dismisses
  on every short drag, and one Escape that closes the enlarged cover **and**
  the card under it." Now widened to `cardFailures`, `checkCoverViewer` and
  `checkSheet`, but the row's own history is the clearest self-documented
  instance of a check passing on a much weaker property than the one it
  reads as protecting.
- **Routing around** — asserted outside `gates/` entirely, per the ticket's
  own tier-4 list; nothing else discussed.
- **Vacuous green** — related to the satisfying-the-letter finding above; the
  original single-assertion shape is exactly this category.
- **Decay** — not discussed; the gate reads `docs/spec/enhanced-card.md` §11
  by section number, and nothing pins that reference to the spec staying at
  that numbering.

`docs/gates.md` already answers the core exposure — its own Failure-mode cell
for this row.

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

- **Weakening** — the row states its own warning directly: "A budget that gets
  raised whenever it fails is a comment," naming the exact move that would
  weaken it.
- **Satisfying the letter** — exposed, current, and unresolved — the clearest
  self-documented instance in the file: "G15 is green and the crash is not
  fixed... it protects *a* property of the build rather than *the* cause of
  the crash, and reading a green G15 as 'phones are fine' is exactly the
  mistake this scoreboard exists to prevent." The gap between what the gate
  measures and what a reader takes it to mean has not been closed.
- **Routing around** — exposed and current: "the ~22 MB of per-book spine
  `CanvasTexture`s is outside every budget here." A real, named memory cost
  the sweep never counts.
- **Vacuous green** — related, restated once more in the file's own words:
  "`smoke:render` screenshots a desktop GL context with gigabytes of headroom,
  which is exactly why the bug was invisible here and fatal on a phone."
- **Decay** — not separately discussed.

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

**Rank:** 4 (outside `gates/`, per the ticket's own tier-4 list — a structural
property of *where the check runs*, not a category verdict). **Not flagged**:
every one of the five verdicts above is clean, so this row is ranked without
being flagged. Rank and flag are different things here; see the Summary.

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
- **Decay** — not discussed.

`docs/gates.md` already answers this extensively — the G17 section and its
own changelog entry.

**Observed-red line:** "deleting the guard fails four of seven. Inverting the
comparison — refuse `main`, allow everything else — fails six, including
'lets main through'."

**Rank:** 1 (vacuous green) — named by the commissioning ticket itself as a
live instance of this category.

### G18 — `bounded-cover-bytes`

**Gate:** [`packages/core/src/covers/download.test.ts`](../packages/core/src/covers/download.test.ts)
**Date:** 2026-08-11

- **Weakening** — clean; the magic-byte allowlist (JPEG/PNG/WebP) is a content
  allowlist, not a gate-exemption list.
- **Satisfying the letter / routing around** — not separately flagged beyond
  the stub limit below.
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

**Rank:** 4 (outside `gates/`, per the ticket's own tier-4 list) — the decay
exposure is real but decay is not one of the four ranked shapes, and no tier
1–3 mechanism flaw is documented. **Flagged**: the Decay verdict above is
non-clean, so unlike G16 this row is both ranked and flagged.

### G20 — `public-build-artifact`

**Gate:** [`gates/public-build-artifact.test.ts`](../gates/public-build-artifact.test.ts)
**Date:** 2026-08-11

- **Weakening** — not discussed.
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
- **Decay** — not discussed.

`docs/gates.md` already answers this extensively (lines 664–734).

**Observed-red line:** "Restoring the deploy's weak `_headers` check fails
exactly one test... Adding a rule with no planted defect fails the
completeness assertion by name... Making the reporter a no-op fails all but
the two clean-baseline tests."

**Rank:** 1 (vacuous green) — the gate's own realism-of-the-fixture failure is
the purest instance of "passing on the shape that actually matters" in the
file.

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
- **Decay** — not discussed.

`docs/gates.md` already answers all three (lines 340–399).

**Observed-red line:** "by restoring the pre-fix `enrich.test.ts`: one test
fails, naming the URL and the stub that fixes it." Also: "Deleting
`setupFiles`... fails four of seven, one of which spends 1.2s fetching a real
cover from `archive.org`."

**Rank:** 1 (vacuous green).

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
- **Decay** — not discussed.

`docs/gates.md` already answers all of this extensively (lines 467–546), and
it is the third row `docs/gates.md` logs "a gate that matches prose matches
anything" against (comments satisfying the sweep).

**Observed-red line:** "adding a fourth module naming the pair" (structural
half); "reversing `coverUrls` now fails one test, by name" (post-fix,
preference half).

**Rank:** 1 (vacuous green) — "left all 290 tests green" on the real defect is
the clearest single instance of this category in the file.

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
- **Decay** — not discussed.

`docs/gates.md` already answers all of this extensively (lines 741–830).

**Observed-red line:** "a seventh copy under a seventh name (`perhaps`); the
same copy reformatted; a copy in `packages/site/`; a caller reverting to a
bare object; that revert with `keyIfPresent(` left in a comment."

**Rank:** 1 (vacuous green).

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

- **Weakening** — not discussed.
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
- **Routing around** — related to the floor-as-ceiling defect above.
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

### G26 — `lookup-recall`

**Gate:** [`gates/lookup-recall.test.ts`](../gates/lookup-recall.test.ts) + [`gates/recall-corpus.ts`](../gates/recall-corpus.ts)
**Date:** 2026-08-11

- **Weakening** — not discussed; the corpus is not an allowlist in the
  category-1 sense.
- **Satisfying the letter** — designed against, explicitly: "A recall gate
  that only asserted positives would be passed by a matcher that says yes to
  everything... Two of the five corpus entries exist to make that route red."
  Deliberate mitigation, not a closure — five corpus entries is a narrow
  guard against a matcher tuned to exactly those cases.
- **Routing around** — not discussed beyond the above.
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

- **Weakening** — not discussed.
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
- **Vacuous green** — related to the satisfying-the-letter finding above.
- **Decay** — not discussed.

`docs/gates.md` already answers this — the whole G28 section (lines
1139–1185).

**Observed-red line:** four ways — measuring the prop's reach to the footprint
rather than the corners, adding the neighbour's lean in the corner case as
well as the board case, clamping the parallel push at zero, and dropping it
altogether.

**Rank:** 2 (text over structure) — the row's own check computing a subtly
wrong number that still looked plausible is a mechanism-level exposure, ranked
above the tier-4 (outside-`gates/`) classification it would otherwise carry.
