# Prettier formats code and nothing else, and two of its settings are load-bearing

`prettier` is a dev dependency pinned **exact** — `3.9.6`, not a caret range.
Its configuration is two overrides and two exclusions:
`singleQuote: true`, `printWidth: 100`, every `*.md` file ignored, and the whole
of `fixtures/` ignored. `pnpm format` writes and `pnpm format:check` reports.

One decision, one subject: **what a formatter is allowed to touch in a
repository whose gates read source as text.**

[ADR-0067](./0067-the-counters-inputs-are-pinned-exact.md) records the exact
pins on the complexity counter's own inputs. This is not that: Prettier computes
no number and moves no series. What it shares with 0067 is only the pinning
argument, applied for a different reason — there, so a count means the same
thing across months; here, so a check does.

## Why a record at all, when the spec's table names three and not this one

[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§8 lists three decisions from this rollout that earn a record, and a formatter is
not among them: *"Everything else here is mechanical — rule lists, series names,
thresholds — or already carries its reasoning on its ticket."*

**That reading misses `AGENTS.md`'s other rule**, which is unconditional and
about dependencies rather than about decisions: *"Do not add dependencies without
noting why in the relevant record under `docs/adr/`."* Prettier is a dependency.
There is no relevant existing record to note it in — 0067 is about the counter's
inputs and a landed record may not be edited — so it needs its own.

**This is 0067's own situation, reached a second time**, and that record's
closing section is the precedent: *"The spec's file table names three ADRs for
the whole rollout and none of them is this one … Recorded here so the reason the
spec's count moved from three to four is legible."* Same move, same reason.

⚠️ **Two sibling tickets add a dependency each and the spec names neither** —
[#251](https://github.com/mephistopheles4/stacks/issues/251) installs
markdownlint and [#254](https://github.com/mephistopheles4/stacks/issues/254)
installs jscpd. So the gap this record steps around is the spec's, not this
ticket's, and each of those owes the same thing.

⚠️ **This was written as 0071 and renumbered before it landed, because four
sessions wrote a file numbered `0071-*` in one evening.** `main` carried 0070 as
its highest and no *pushed* branch held an 0071, which is what this session
checked — and it was the wrong question, because a branch nobody has pushed is
invisible to it and that is the normal state of a session mid-work.

**Settled allocation:** 0071 → [#251](https://github.com/mephistopheles4/stacks/issues/251),
0072 → [#254](https://github.com/mephistopheles4/stacks/issues/254),
0073 → [#255](https://github.com/mephistopheles4/stacks/issues/255),
**0074 → this record**, 0075 → [#257](https://github.com/mephistopheles4/stacks/issues/257),
0076 → [#253](https://github.com/mephistopheles4/stacks/issues/253).

⚠️ **The second collision is the one worth keeping, because resolving the first
caused it.** #253 and #257 had each moved off 0071 to avoid the pile-up, and both
moved to **0075** — two sessions colliding precisely because they were being
careful, and neither able to see the other. #253 moved again, to 0076. So the
count is not one duplicate but two, the second manufactured by the fix for the
first.

⚠️ **And nothing in this repository would have caught either.** Gate row numbers
are held by `G19` (`constitution-scoreboard`), which asserts them **unique and
gapless** and fails loudly on a duplicate. **ADR numbers are held by nothing** —
a sweep of `gates/` finds no check that walks `docs/adr/` at all, so two records
numbered 0075 would both merge and the second would simply be findable by a
number that means two things. That asymmetry is a live gap and is recorded here
rather than fixed, because this ticket may not add a gate as a side effect.

Every renumber happened on a branch, so no landed record was edited — **exactly
what 0067 records happening to itself**, which was written as 0065 and became
0067 while its stack was open.

⚠️ **Verification status, stated because this record is partly about not taking
claims on report.** 0072, 0074 and 0076 were confirmed by reading the pushed
branches. 0071, 0073 and 0075 come from the sessions holding them, whose branches
were still unpushed when this was written and could not be checked from outside.

⚠️ **So a reader may find a gap here, and the gap is not a defect.** 0071 to
0073 are claimed on sibling branches of one rollout that have not merged yet. If
any of them is abandoned its number stays empty rather than being reused, for
the reason 0067 gives: a record that argues *about* another record by number
cannot survive numbers being recycled underneath it.

⚠️ **The general lesson, and it is the second time this rollout has learned
it.** `git ls-remote` cannot see a branch nobody pushed, so "no open branch
claimed it" is a statement about the remote and not about what other sessions are
doing. The only thing that settled this was a sibling session saying so directly.

## Why exact, and not caret

**The tool version is an input to what the check means.** A formatter's output is
its version's defaults, and a minor bump that changes one of them turns an
unchanged tree red on a pull request that touched none of the files it names.

That is the same shape as the counter's pin and a weaker case than it, stated
plainly: a moved complexity series is a silently wrong *number*, while a moved
formatter is a loud red with a one-command remedy. The pin is cheap either way,
and [#227](https://github.com/mephistopheles4/stacks/issues/227) owns the
recurring half — how the repository absorbs a rule-set change at every bump —
which this record does not answer.

## Why `singleQuote`, and why it is not taste

The tree already holds **9,490 single-quoted strings against 661** — 93 percent
— so the setting records a convention rather than imposing one.

**It used to be more than convention, and the fact that it no longer is was the
whole reason this ticket was ordered where it was.** G14 (`commands`) extracted
CLI subcommands with `/\.command\(\s*'([a-z][a-z-]*)'/` and G45 (`deploy-flags`)
extracted flags with `/process\.argv\.includes\(\s*'(--[a-z][a-z-]*)'\s*\)/`.
Both hardcoded a single quote, so flipping the tree to double quotes reduced both
to assertions over nothing — caught only because each carries an `expectFound`
vacuous-extraction guard, and even then the red read *extraction found 0 CLI
subcommands* rather than *the quote form changed*. An accidental quote gate, and
one whose remedy was unreachable for anyone who did not already know it existed.

**[#252](https://github.com/mephistopheles4/stacks/issues/252) repaired it**
before this landed — merged as `fdd2be1`; both patterns now match `['"]`.

⚠️ **So the ordering, not the setting, is the decision here.** This
configuration passed every gate without the repair, which is exactly why the
repair was easy to skip: adopting first would have **frozen** the trap under a
formatter that made it invisible, and a contributor hand-writing
`command("add")` would still have got a red that named no quote.
[#236](https://github.com/mephistopheles4/stacks/issues/236) recommended the
repair *although the configuration no longer needs it*, and
[#229](https://github.com/mephistopheles4/stacks/issues/229) is where the
principle comes from — a red must name a defect in the change. **Ordered first,
landed first.** With it in, `singleQuote` is a record of what the tree already
does and nothing more, which is what it should have been all along.

## Why `printWidth: 100`

**A measured minimum on today's tree, not a derived number.** With `singleQuote`
over the whole tree, 80 changes **330** files, 100 changes **248**, and 120
changes **284**. 120 is *worse* than 100, which is the finding worth keeping:
this repository's comment blocks are hand-wrapped near 80, and a wider print
width unwraps them.

⚠️ **It has no principle behind it and will not survive a very different tree.**
Recorded as a measurement with a date rather than as a rule.

## Why every Markdown file is excluded

**Prettier right-pads Markdown table cells to align a column, and two gates read
an exact single space at a pipe** — G41 (`gate-register`) at
`gate-register.test.ts:154` and G31 (`merge-precedence`) at
`merge-precedence.test.ts:49`. Measured in
[#231](https://github.com/mephistopheles4/stacks/issues/231): formatting Markdown
turns both red, and G41 does it *silently* apart from its own vacuous-extraction
guard — an aligned table extracts nothing at all.

**The honest shape of this is a dodge, and it was measured against the repair.**
[#236](https://github.com/mephistopheles4/stacks/issues/236)'s follow-ups 3, 5
and 6 ran the comparison three times and retracted two intermediate answers. The
settled result: with both regexes fully repaired — read cells through
`tableCells()` **and** match `(?:\*\*|__)` — formatting Markdown and not
formatting it score identically. **What formatting Markdown buys is coverage,
not correctness**: 147 files inside the check rather than outside.

⚠️ **The exclusion moves a load onto a rule in another ticket.** With Markdown
outside Prettier, markdownlint's **MD060 at `"style": "compact"`** is the only
thing holding those two gates' input at one space per pipe — and only at that
style. MD060's default is `any`, which accepts an aligned table that both regexes
are blind to. That is [#251](https://github.com/mephistopheles4/stacks/issues/251)'s
to set, and this record names the dependency so it is not discovered later.

## Why `fixtures/` is excluded

**On fidelity, not on breakage.** Nothing fails when the fixtures are formatted:
the whole suite and `pnpm gate:public` were green in
[#236](https://github.com/mephistopheles4/stacks/issues/236)'s probe. What
Prettier did was requote the YAML frontmatter of **11 vault notes** — `title`,
`author`, `isbn`, `url`, `asin`, `spine_color` — from double to single.

`AGENTS.md`'s adapter contract promises `updateBook` leaves *"key order, quoting,
comments and the note body … byte for byte"* intact. **Quoting is named in that
sentence.** The real vault lives outside this repository, so no formatter will
ever reach it and these fixtures are its only stand-in; a formatter that reaches
them makes them stop resembling the thing they are fixtures of, and does it
silently.

The same exclusion covers `fixtures/api/`'s cached provider responses.
**Reformatting a recorded API response is the same category of error as
reformatting a note** — the fixture stops being a record of what a server said.

## What was ruled out

- **An `.editorconfig` file, alone or alongside.** Refused on measurement: the
  tree holds 0 leading tabs, 0 trailing spaces and 0 missing final newlines, so a
  gate over it is green on day one and can never go red. Recorded in
  [`docs/gates.md`](../gates.md#not-gated-deliberately) with the counts. ⚠️ And
  it is not free to add later, because **Prettier reads one and merges it key by
  key** — a key the config does not shadow silently steers the formatter.
- **Prettier's defaults.** 348 files and **four gates red**, against 91 files and
  none. 3.5× the diff to break the things this configuration is shaped around.
- **Excluding only `docs/` rather than all Markdown.** Also measured green, at
  122 files. It reformats `.claude/commands/crfix.md` and
  `.claude/skills/phase-gate/SKILL.md`, which no gate reads as text — and this
  repository has already been burned once by a committed command nothing gated.
- **`prettier-plugin-astro`.** It closes the one hole this configuration leaves
  and it **arms a trap in the same move**: formatting `.astro` splits a
  three-element bootstrap guard across five lines, and G7 (`astro-no-logic`)
  counts *lines* rather than statements, so a block one **under** its cap of 6 is
  reported as nine — a false red whose message tells the contributor to move code
  nobody moved. Measured in
  [#238](https://github.com/mephistopheles4/stacks/issues/238). Taking the plugin
  obliges repairing G7 in the same change.
- **Refusing a formatter outright.** [#236](https://github.com/mephistopheles4/stacks/issues/236)
  §6 override 4 records this as standing on a single argued edge, which is close
  to no objection at all: the tree is already consistent by hand, and the whole
  yield is a 91-file commit plus a required check. It is ruled out by
  [#229](https://github.com/mephistopheles4/stacks/issues/229)'s routing — a
  style rule whose remedy is one command passes both tests — and not by
  measurement. Recorded as the weakest edge in this record.

## The hole this leaves, stated where a reader will meet it

**Prettier infers a parser from the extension and has none for `.astro`.** Swept
as part of `prettier --write .`, four files — 979 lines, and **every stylesheet
rule the site has**, since this repository holds no `.css` file at all — are
absent from the output and the command exits 0. Named on the command line those
same files are an *error*: `No parser could be inferred`, exit 2.

So a green `format:check` says nothing about a quarter of the site's source, and
the number it prints is not a coverage figure. That belongs beside the command
rather than only here, and it is in
[`docs/commands.md`](../commands.md).

## How this was decided

Recommended by [#236](https://github.com/mephistopheles4/stacks/issues/236),
which built the question as a morphological box on
`research/236-formatter-config` and measured four probes rather than arguing
them. Locked as §6 step 4 of
[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md).
Implemented in [#256](https://github.com/mephistopheles4/stacks/issues/256).

⚠️ **The reformat's size was re-measured at implementation and it is not the
number the ticket carries.** #236 measured 100 files, +3197 / −3132 on an earlier
tree; on `2f672b1` the same configuration gives **91 files, +1276 / −650** in
2.6s, with `pnpm test` (1055 tests), `pnpm build`, `pnpm gate:public` and
`pnpm smoke:render` all green on the result. The file count moved because the
tree did; the line-count *shape* is different too — a near-balanced diff is a
rewrap and this one adds 626 net lines, which is wrapping — and that is recorded
rather than explained away.
