# markdownlint lands, and the thing that needed guarding was its remedy

G48 (`markdown`) is the third of this repository's documentation gates and the
first that reads Markdown *as Markdown*. G19 holds `docs/gates.md` to
`AGENTS.md`, G14 holds `docs/commands.md` to `package.json`, G41 extracts
`docs/gate-register.md` by heading, and G29 resolves links — but nothing checked
the shape those four all parse. Three live defects existed because of it, and 45
gates could see none of them.

The rule set and every measurement behind it were decided on
[#235](https://github.com/mephistopheles4/stacks/issues/235) and assembled into
[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§6 step 2. This is the implementation half, and what it found on the way.

## The defects were already repaired, and that is worth recording

All three — the six-cell row in a five-column table, the dead same-document
anchor, the duplicate heading in the register — were fixed by
[#246](https://github.com/mephistopheles4/stacks/issues/246) before this row
landed. **Checked rather than assumed**: the ticket lists repairing them as an
acceptance criterion, and a session that trusted the criterion instead of the
tree would have spent an hour re-finding fixes already on `main`. A count of
table cells and a heading-duplicate sweep answered it in one command each.

The consequence is the good one: **the gate does not land red on its own day
one**, which is what the spec asked for and what the ordering in §6 exists to
produce.

## The allowlist could not be a config file, and the tool says so three ways

The plan was the obvious one — `.markdownlint.jsonc` for the check, a second
config naming the seven fix-safe rules for `pnpm lint:md:fix`. **It does not
work, and the failure is silent**, which is the shape this whole ticket is about.

Measured at markdownlint-cli2 0.23.2, against a fixture whose override set
`default: false`:

| Mechanism | Result |
| --- | --- |
| `--config other.jsonc` | loses. Its own `--help` says *"the **base** configuration"* |
| `optionsOverride: { config }` | loses. `markdownlint-cli2.mjs` assigns `dirInfo.markdownlintConfig` from the discovered file and never consults it |
| `overrides: [{ filter, config, combine: 'replace' }]` | loses |

In all three the narrowed config reported a rule it turns off. **A discovered
`.markdownlint.jsonc` at the root always wins**, and moving the adopted rules out
of that filename is not available — it is the filename because it is on
CodeRabbit's recognised list *and* takes comments, which is what lets each rule
turned off carry its measurement at the line that turns it off.

So the allowlist became a **refusal** rather than a filter: `scripts/lint-md.ts`
measures what the installed version can rewrite and stops before touching a file
when that set is wider than the declared one.
[ADR-0075](../adr/0075-the-markdown-fix-flag-is-allowlisted.md) records it,
because *"a file that reads as a restriction and restricts nothing"* is the
category-1 failure the register catalogues, and shipping the config file anyway
would have been that failure arriving inside the mechanism written against a
different one.

⚠️ **The first draft did ship that file.** `.markdownlint-fix.jsonc` was written,
committed to nothing, and deleted twenty minutes later when a run showed it
reporting MD040 — a rule its own `default: false` turns off. It would have read
correct in review.

## Measuring the fix set, and the empty result that looked like an answer

The clause that replaces the declaration lints one probe document per adopted
rule, fixes them, and lints again; a rule reported before and absent after is one
the fix pass rewrote.

⚠️ **The first implementation returned an empty set**, and an empty set is
exactly what *"nothing is fixable"* looks like. Every assertion built on it would
have passed. It was parsing `logMessage`, and markdownlint-cli2 sends findings to
`logError` — visible in one debug run dumping both, and invisible in the result.
**The measurement that returns nothing is the one to distrust**, which is why the
gate now floors it: every adopted rule must fire on its own probe, asserted as
its own clause and planted red.

That floor is not decoration. Fixability is measured as *reported before, absent
after*, so **a rule that stops firing measures as unfixable** — the widening the
clause exists to catch, arriving as a pass. Respacing MD060's probe table proved
it: two clauses red, the floor naming MD060 and the fix-set comparison narrowing
by one.

## The same defect twice, and neither was found by re-reading

**Two unplanted defects, both *the right mechanism aimed at the wrong half*.**
That is [#235](https://github.com/mephistopheles4/stacks/issues/235)'s own
recorded failure shape, and it arrived twice inside the row that quotes it.

**One: a declared exclusion is not a rule the pass skips.**
`FIXABLE_NOT_ALLOWLISTED` named MD050, and the widening check fires only for a
rule on *neither* list — so `--fix` rewrote `text __x__ text` to
`text **x** text` while four documents said it would be left alone. Every clause
green. The fix: an exclusion declines the whole pass, since nothing can narrow
the run.

**Two: the same hole one level out.** The config said *"everything not named
below keeps its markdownlint default"*, leaving roughly thirty unadopted rules
live — **seven of them fixable**: MD004, MD009, MD010, MD030, MD039, MD047,
MD058. A planted file with trailing spaces and a hard tab came back rewritten,
unmeasured. **A rule nobody adopted is a rule nobody probes**, so the refusal
could not see any of them. The fix: `"default": false`, and a clause holding the
enabled set to the probe set both ways.

⚠️ **Each repair's own measurement agreed it was complete, because each was
built from the half it was looking at.** The probe run reported MD050 as fixable
on its very first execution — the evidence was on screen and read as agreement.

⚠️ **All three findings came from running, not reading**, which is
[the ratchet log](2026-08-19-the-ratchet-lands-disarmed.md)'s rule holding a
third time. An adversarial reviewer asked what the code *does* rather than what
it says; two independent reviewers each planted a file and ran the command.
Re-reading the allowlist found nothing, twice. **Review substitutes for the
reading, not for the running.**

## What the tree cost, and what it was not

`pnpm lint:md:fix` changed **51 documentation files**, and every change was
MD060 table-pipe spacing or `_em_` → `*em*`. **None of the three damage classes
recurred**, because MD018, MD038 and MD029 are off: no issue reference became a
heading, no code span lost a space, no quotation was renumbered. That is the
whole argument for the narrow set, observed rather than quoted.

The residual needing a person was **45 findings**: 40 fenced code blocks with no
language, two heading-increment skips, two inline-HTML reports, one
first-line-heading.

**Two of those were real rendering defects and MD033 is how they surfaced.** Both
`docs/gate-register.md` and `docs/spec/static-analysis-and-style.md` contained a
backslash-escaped backtick *inside* a code span — `` `### G<n> — \`slug\`` ``.
Markdown has no escape inside a code span, so the span closes early, the rest of
the line falls into raw text, and `<n>` is parsed as an HTML tag and **dropped
from the rendered page**. Both were describing a gate's extraction pattern, and
both rendered wrong wherever anyone read them. The fix is double-backtick
delimiters. MD033 was adopted for inline HTML and found a broken code span.

The two heading-increment skips were `#` → `###` in two log files that have no
`##` at all — the only two of 31 logs written that way. Promoted to `##`, which
is the house style the other 29 already use and changes no anchor.

⚠️ **One suppression, and it is file-scoped with its reason in the file.**
`.github/pull_request_template.md` starts at `##` on purpose: a pull request's
top-level heading is its *title*, which GitHub renders separately, so an `#`
there duplicates it. MD041 is right about a document and wrong about that one.

## The `style` job exists now, and two rows are still to come

S1 (ESLint) and S2 (Prettier) land in the same job, each with its own row — the
spec is explicit that a job records *where* a check runs and a row records *what*
is protected. The job's accepted cost is that a red names `style` rather than the
tool; the remedy is that every command in it runs alone and prints its own fix
command, which `pnpm lint:md` does.

⚠️ **Measured once `lint` and `lint:md` were sharing the job, rather than left
as a thing to find out.** A planted tight delimiter row shows the cost is
narrower than the sentence: **three routes name the tool and only one thing is
ambiguous.** The step is `- name: lint:md`, so Actions marks *that step* failed
in the run's own list before anybody opens a log; every finding line carries
`MDnnn/rule-name` with its file and line; and the trailer names
`pnpm lint:md:fix`. **What stays ambiguous is the check name in the pull
request's list** — one line reading `style` — and nothing past it. The shape
that would break this is a single step running two tools, and no step here does.

## Numbering, and one thing the next session should check

**G48** was the next free row at this branch's tip, and **ADR-0075** the next free
record. ⚠️ Three sibling tickets on the same map are open —
[#253](https://github.com/mephistopheles4/stacks/issues/253),
[#255](https://github.com/mephistopheles4/stacks/issues/255) and
[#256](https://github.com/mephistopheles4/stacks/issues/256) — and the spec's §8
names 0071 as the next free number for a record about the consistency ruling,
which this one is not. Both numbers are facts about landing order, not
reservations. **Count the rows and the records at the tip you branch from**, and
cite slug and number together.
