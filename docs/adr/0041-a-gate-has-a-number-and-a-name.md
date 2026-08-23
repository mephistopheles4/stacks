# A gate has a number _and_ a name, and the name is anchored to its spec

Every scoreboard row carries a **Name** column holding a kebab-case slug, and
citations spell both: _"See docs/gates.md, row G19 (constitution-scoreboard)."_
The number did not go away.

## Why not replace the numbers

`G19` is opaque, and that was the complaint that started this. Replacing it was
still wrong, for a reason that is structural rather than sentimental.

**The number is the retirement mechanism.** `docs/gates.md` requires row numbers
to be unique and gapless so that a rule which stops applying keeps its row and
leaves a visible hole — _"Mark it, do not delete it… a deleted row takes with it
the fact that the rule was ever considered."_ A name cannot encode absence. Drop
`no-live-network` and nothing remains to say it was ever there; drop `G21` and
the gap goes red.

The numbers are also cited from ~20 spec headers, several ADRs, CLAUDE.md, the
commit log (`8fb84f5` — "G26 was green against a corpus of 429s") and GitHub
issues. Renaming reaches the first two and cannot reach the rest.

So: number _and_ name, which is the convention this directory already uses —
`0024-decision-record-is-adrs.md` is a number and a name for exactly the same
trade. `docs/gates.md` had already drifted toward it informally, with headings
like `## G25 — one usable width` and every spec header opening `G19 — the
constitution ↔ the scoreboard`. What was missing was a _stable, greppable_ form
and something to keep it true.

## The slug is derived wherever it can be

A name written into twenty files and gated in none is the second copy
[ADR-0026](0026-constitution-is-gated-not-duplicated.md) is about: _"a rule
written down twice is a rule that will be true in one place and false in the
other."_ Adding names without anchoring them would have created 29 new
hand-maintained strings.

The rule that avoids it: **where a row names exactly one `gates/*.test.ts`, and
no other row names that same spec, the slug must equal the file's stem.** So a
moved spec forces its name to move with it.

It covers 23 of 29 rows and self-exempts the remainder without an allowlist —
which is why it is phrased as a property rather than a list:

- **G5** (`vault-is-truth`) and **G13** (`no-third-party-material`) both name
  `gates/repo-hygiene.test.ts`, so neither _uniquely_ claims the stem and the
  clause does not apply. Two rules genuinely share one spec file.
- **G16**, **G18**, **G25** and **G28** name no `gates/` spec at all — they are
  gated by `pnpm smoke:render` or by a test living in `packages/`.

Those six declare their slug; the other 23 cannot drift from their file.

## What is gated

G19 gained six assertions: every row has a well-formed kebab-case slug; no two
rows share one; a derivable slug matches its stem; every citation carries a
_parseable_ slug; every citation names the row's **current** slug; and enough
citations exist for those checks to mean anything.

The "parseable" check is the one that is easy to leave out. A citation the
pattern cannot read — `row G21 (no live network)` — is not wrong, it is
**unchecked**, and a silent skip is how a gate that matches loosely matches
anything. It is asserted as the complement of the freshness check so a
malformed citation goes red rather than quietly falling out of scope.

Citations are found by _line_ rather than by the phrase `row Gn`, because
`gates/repo-hygiene.test.ts` cites two rows in one sentence — "rows G5 and G13"
— and a pattern anchored to the word `row` sees only the first.

**Bare `G8` mentions in prose stay bare.** `docs/gates.md` is full of them, and
requiring a slug on every one would make the document worse to read while
protecting nothing. The citation idiom is what a reader follows.

## The positional read this exposed

Inserting a column revealed that `invariantSourceCells` was reading
`tableCells(line)[2]`. That was already fragile across three tables of differing
widths, and it fails in the worst available way: `[2]` on a shifted table
returns a real string from the **Gate** cell, so the citation check would have
gone on asking the wrong column whether it mentions an invariant, and passing.

Columns are now located by reading the header row, and a missing header
**throws naming the column** rather than returning `-1` — `cells[-1]` is
`undefined`, which would have reported "no invariant is cited" when the truth
was "the Source column was renamed". Right answer, useless message. Same
argument `markdownSection` already makes one level up.

## Observed red

Seventeen mutations, each reproduced red and reverted: a missing slug; two rows
sharing one; `Not_Kebab_Case`; a slug contradicting its uniquely-claimed stem; a
stale citation; a citation with no parseable slug; the `Source` header renamed;
the `Name` header renamed — plus the nine cases G19 already had, re-run because
`invariantSourceCells` changed underneath them.

The two header-rename cases are the ones worth keeping: they fail naming
`Source` and `Name`, not "invariants nothing scores".
