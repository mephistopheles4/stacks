# The Markdown fix flag is allowlisted, and the allowlist is measured rather than declared

`markdownlint-cli2` is a dev dependency pinned **exact** at `0.23.2`. Its rule
set is narrow, six rules are off with a measurement each, and `pnpm lint:md:fix`
may rewrite **seven** of the fifteen rules that are on. The seven are named in
`scripts/lib/markdown-lint.ts`, and the command **refuses to run** when the
installed version can rewrite a rule that is on neither that list nor a second,
declared one.

Three decisions, one subject: **a tool whose remedy is more dangerous than the
defect it reports.**

[ADR-0067](./0067-the-counters-inputs-are-pinned-exact.md) is why the version is
exact and this record does not re-argue it. What is new here is that the *fix*
half is version-dependent in a way a lint rule set is not: what a rule's fix
does to a file can change under a pin that nobody moved on purpose.

## The measurement that inverted the ticket

[#235](https://github.com/mephistopheles4/stacks/issues/235) opened by saying
`--fix` handles many findings mechanically, and that a stranger can act on
`MD040 at line 38` knowing nothing about this repo. **The second half holds and
the first does not.**

A `--fix` pass at **default** rules over this tree changed **55 files,
+172/−151**, and did three kinds of damage:

- **11 issue references became H1 headings.** Every one is a paragraph opening
  with `#NNN` — `#167's *What is true today* says…` became `# 167's *What is true
  today* says…`, which destroys the reference and the paragraph together. 11 of
  11 findings were false positives (MD018).
- **16 code spans lost an intentional space** (MD038). Ten of them are `` `; ``,
  the subjects separator `AGENTS.md` documents and **G31 gates in both
  directions**. One is `` `^### G(\d+) ` ``, **G41's own documented extraction
  regex**, whose trailing space is what separates `### G4 ` from `### G41 `.
- **A verbatim quotation was renumbered** (MD029), in `docs/gate-register.md`,
  under a heading that says the file *"still defined category 5"*. The passage
  now claimed category 5 and quoted an item numbered 1. This repository's
  decision policy is to carry original reasoning verbatim, so that rule is aimed
  straight at it.

⚠️ **`pnpm test` over that damaged tree was 87 test files, 1055 tests, all
green.** Forty-five gates saw none of it.

## Why that makes this different from the formatter

**Prettier's Markdown damage is loud and this tool's is silent, and the two fail
in opposite directions.** [#231](https://github.com/mephistopheles4/stacks/issues/231)
measured Prettier's column-alignment padding breaking G41 and G31 outright: four
gates go red, on the same commit, before anything merges. A red is a working
gate. markdownlint's damage passes every check in the repository.

So neither tool's result carries to the other, and the protection has to be a
different shape. For a loud failure, the gates *are* the protection. For a silent
one, nothing downstream will ever notice, and the only place to stand is in front
of the edit.

## Why a list, and why the list is not a config file

The obvious implementation is a second configuration file that turns the other
rules off for the fix run. **It does not work, measured three ways at 0.23.2.** A
discovered `.markdownlint.jsonc` beats every mechanism for narrowing it:
`--config` is documented as *"the base configuration"* and loses; the API's
`optionsOverride.config` is never consulted, because
`markdownlint-cli2.mjs` assigns `dirInfo.markdownlintConfig` from the discovered
file directly; and an `overrides` entry at `combine: "replace"` loses too. All
three were tried against a fixture whose override set `default: false`, and all
three still reported a rule that set turns off.

Moving the adopted rules out of `.markdownlint.jsonc` to escape that is not
available: **that exact filename is load-bearing.** It is on CodeRabbit's
recognised list *and* it takes comments, so each rule turned off can carry its
measurement at the line that turns it off. CodeRabbit also skips its own
markdownlint run once a workflow runs one, so the file reconciles review and CI
by construction. The `-cli2` variant CodeRabbit reads is `.json`, without
comments; picking it would silently un-reconcile the halves and lose every
reason.

**So the allowlist is a refusal rather than a filter**, and that is the trade-off
this record exists to state. A file that read as a restriction and restricted
nothing would be worse than no file — the category-1 failure
`docs/gate-register.md` catalogues, arriving in the mechanism written to prevent
a different one.

## Why measured, not declared

A declared list of seven names would be **a claim about 0.23.2 sitting in a file
that outlives it**. What a rule's fix does is a property of a version, so the
list is true when written and unfalsifiable afterwards — and the way it fails is
a bump making an eighth rule fixable, which is exactly the silent case above.

So the check measures. One probe document per adopted rule is linted, fixed, and
linted again; a rule reported before and absent after is one the fix pass
rewrote. That set must equal the two declared lists, in both directions:

- **Wider** — a version bump is rewriting text nobody watched. Red, and the
  command stops before touching a file.
- **Narrower** — a declared name has become a standing permission for a shape the
  tool no longer produces. Red, so it gets deleted rather than sitting there
  granting nothing.

⚠️ **The vacuous-green guard is the half worth naming**, because fixability is
measured as *reported before, absent after*: a rule that stops firing on its own
probe measures as **unfixable**, which is the widening this exists to catch
arriving as a pass. Every adopted rule must fire on its own probe, asserted
separately and planted red.

This is [#235](https://github.com/mephistopheles4/stacks/issues/235)'s debt 5 —
*"the `--fix` allowlist is re-measured at every version bump"* — mechanised in
two places rather than written down in one. G48 (`markdown`) asserts it at merge;
`scripts/lint-md.ts` asserts it before it edits.

## What this costs

**A real markdownlint fix pass runs inside `pnpm test`.** Fifteen probe documents,
three lint passes, in a temp directory that is deleted afterwards — the slowest
thing in `gates/`, and the price of the list being a measurement instead of a
sentence.

**MD050 is fixable and deliberately not on the allowlist.** It is very likely
safe and it has **zero** findings on this tree, so no fix pass was ever run
against it, and this repository does not allowlist a name nobody watched a diff
for. It is on the declared-excluded list instead, where the same reverse
assertion holds it.

⚠️ **A declared exclusion is not a rule the pass skips, and the first version of
this record said it was.** There is no filter — that is this whole document — so
`--fix` applies MD050's fix like any other enabled rule's. **Measured**:
`text __x__ text` became `text **x** text`, while four documents including this
one said it would be left alone, and every clause of G48 was green over it. The
widening check cannot see it: that check fires for a rule on *neither* list, and
a declared exclusion is on one.

⚠️ **And the same hole existed one level out, which is why `"default": false`
is in the config.** The allowlist can only be as wide as the *enabled* set is
known, and this config originally said *"everything not named below keeps its
markdownlint default"* — leaving roughly thirty unadopted rules live, of which
**seven are fixable**: MD004, MD009, MD010, MD030, MD039, MD047 and MD058. Two
independent reviewers each demonstrated it; a planted file with trailing spaces
and a hard tab came back rewritten, unmeasured, with every clause green. **A
rule nobody adopted is a rule nobody probes**, so neither refusal could see any
of them. The config now names its whole rule set, and G48 holds that set and the
probe set to each other in both directions.

**So an exclusion is enforced by declining the whole pass.** If any
declared-excluded rule has a finding, `pnpm lint:md:fix` refuses and names it.
That is the cost of the no-filter shape stated honestly rather than papered over:
the command is all-or-nothing, and a tree with one `__strong__` in it cannot be
auto-repaired at all until somebody fixes that by hand. Cheap here because the
rule has never fired; the alternative is a claim that reads as protection and
provides none, which is the failure this record already exists to avoid.

⚠️ **The failure mode is worth naming, because it is the third instance
[#235](https://github.com/mephistopheles4/stacks/issues/235) recorded and it
arrived inside the mechanism written against it**: *a fix that closes the half
you were looking at reads as a fix for the whole thing.* The allowlist closed the
version-bump half. The rule-already-enabled half stayed open, and the measurement
that would have shown it — the probe run — reported MD050 as fixable on the very
first pass, in a list that was read as agreement.

**The rules reconcile with CodeRabbit and the versions cannot.** Its docs name
`0.23.1`, the review on
[#226](https://github.com/mephistopheles4/stacks/issues/226) ran `0.23.2`, and
this repository can pin only its own copy. Tolerable because the review half is
advisory, and it is why the reconciliation above is about rules and never about
versions.

## What would reverse this

**A fix pass that is loud.** If a future version reported what it changed in a
form a gate could check after the fact, the standing-in-front-of-the-edit shape
stops earning its cost and the list can go.

⚠️ **Bringing Markdown under Prettier reverses more than it looks like.**
[#236](https://github.com/mephistopheles4/stacks/issues/236) excludes Markdown
from the formatter to keep G41 and G31 green, which makes `MD060: compact` their
sole protection. Reversing that exclusion requires dropping MD049 — Prettier
writes `_em_`, this rule writes `*em*`, and whichever ran last wins — **and**
re-deciding MD060, whose `compact` and Prettier's column alignment cannot both
hold. Neither is obvious from either tool's configuration alone.
