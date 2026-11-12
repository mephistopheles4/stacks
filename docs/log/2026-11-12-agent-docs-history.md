# The agent docs' history, moved out on 2026-11-12

Text cut from `docs/spec/README.md`, `docs/notes-on-the-shelf.md`, `docs/shelf-inspectors.md` and `docs/commands.md` because it tells how a rule came to be rather than what holds now ([#585](https://github.com/mephistopheles4/stacks/issues/585)). Each group holds the original words of what was cut or replaced, one source line at a time with a blank line after each, so a table or a sentence in it reads broken; the rule it carried stays in the file named. A group may hold a whole paragraph even where only part of it was cut.

## The moved text

### docs/spec/README.md — cut text (1)

on its issue** ([ADR-0145](../adr/0145-new-specs-live-on-their-issues.md)); the table

below lists both, and the paragraph above it says how. The next paragraph is older

and counts only the files in this folder.

**Sixteen efforts have produced a locked spec in this folder.** Each is decided end to

end, and **each carries its own build order and its own gate roster** — they do not

share one. **The third and the fifth are waiting for an implementation session**, and every

other one is built, as the State column below says (the fifteenth is built on a

branch, not deployed). The

fourteenth is built in the pull request for

[#454](https://github.com/mephistopheles4/stacks/issues/454).

⚠️ **The fifth is the first whose finish line is not a document.** Its map carried

execution as a deliberate override of wayfinder's plan-don't-do default, so it is

done when a rendered bookcase is on `main` — not when this folder is complete.

**This table lists every spec, whether it is a file here or a comment on its

issue** ([ADR-0145](../adr/0145-new-specs-live-on-their-issues.md)). A spec

### docs/spec/README.md — cut text (2)

### docs/spec/README.md — cut text (3)

| Static analysis and style — one routing rule, a verdict per candidate | [`static-analysis-and-style.md`](../spec/static-analysis-and-style.md) | **built.** All four gate rows landed — **G46** (`lint`), **G48** (`markdown`), **G49** (`format`), and **G50** (`astro-types`) inside `pnpm build` — three of them in one `style` job beside `audit`, and all twelve trend rows **this rollout adds** emit: eight duplication and four cognitive. ⚠️ **Twelve is this spec's count, not the nightly's** — `metrics.yml`'s `--expect` list carries sixteen trend series, the other four being the `complexity-*` rows [`complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md) landed. Three refusals recorded. §6 step 9 landed on 2026-09-21 — `cognitive-max` joined `CAPPED_SERIES` and the six duplication caps landed in `jscpd.floors.json`, **every cap disarmed** ([#269](https://github.com/mephistopheles4/stacks/issues/269)). ⚠️ **Arming is not part of this spec** and waits on each window — ten distinct trees, and **a nightly that fails breaks the streak rather than pausing it**; the duplication caps have no window printed yet. ⚠️ **Deliberately thin** — eleven tickets hold the reasoning and the file links rather than retells, per [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md). [The map](https://github.com/mephistopheles4/stacks/issues/228) is **closed as of 2026-08-26** and carries the trail, and the eleven verdicts were also read as one configuration in a morphological box that is deliberately not in this checkout |

| The woodwork reads as wood — rosewood, a drawn fibre, and per-member variation | [`the-woodwork-reads-as-wood.md`](../spec/the-woodwork-reads-as-wood.md) | **waiting for an implementation session**. Nine closed decision tickets, six implementation tickets in a linear chain, and four gate rows. ⚠️ **Tickets two to six must not be run in parallel** — every one of them edits the same module, so handing them to six sessions buys conflicts rather than speed. ⚠️ **Ticket one is the exception**: it heads the chain, shares no source file with the rest, and fixes the backboard flicker that is on `main` today. ⚠️ **The prose spec is on the tracker**, [#300](https://github.com/mephistopheles4/stacks/issues/300); this file is the index that survives when a branch does not. [The map](https://github.com/mephistopheles4/stacks/issues/280) carries the trail |

| Picking a book up — the split gate, the Thoughts extractor, and the motion | [`picking-a-book-up.md`](../spec/picking-a-book-up.md) | **built, step 4 awaiting its first deploy**: four steps in a chain — the split gate ([#410](https://github.com/mephistopheles4/stacks/issues/410)), the extractor ([#411](https://github.com/mephistopheles4/stacks/issues/411)), the held cover tier ([#412](https://github.com/mephistopheles4/stacks/issues/412)), the motion ([#413](https://github.com/mephistopheles4/stacks/issues/413)) — **every one on the security route**, because it publishes note-body text, sanitises it through a CommonMark parser and an allowlist over its tokens, publishes a larger cover copy, or changes what the page's CSP admits. Two new gate rows and five extensions; eight records, [ADR-0100](../adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md) to [ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md), the last two written on #411. ⚠️ **Thin on purpose**: eight closed tickets hold the reasoning. [The map](https://github.com/mephistopheles4/stacks/issues/366) carries the trail |

| A picked-up book arrives closed, and the visitor opens it | [`picking-up-closed.md`](../spec/picking-up-closed.md) | **built** on [#531](https://github.com/mephistopheles4/stacks/issues/531), standard tier, one build session: a click picks a book up and it stops closed; a click on it, or the Open button, opens it; the put-back X leaves the page for the header. [ADR-0137](../adr/0137-a-picked-up-book-arrives-closed.md) supersedes ADR-0102 in part. G35 gains the closed read, the controls, the drawer cells and the lost-context read; G61 reads the book closed and open. ⚠️ **G61 skips pull requests**, so a green pull request does not cover the closed book on a phone: the owner watches `main`'s push run and runs `phone-check.ts --pickups 5` and `--turn 60` (it was `--examine 60` before #553) after merge ([the spec's S14](../spec/picking-up-closed.md#s14-needs-a-human)) |

| `smoke:render` waits for state, not for time | [`smoke-render-waits.md`](../spec/smoke-render-waits.md) | **built** ([#456](https://github.com/mephistopheles4/stacks/pull/456)), standard tier, one build session. 46 waits classified into five kinds, each with one rule; eleven stay fixed and two go against the issue's letter, each on the owner's approval (§S7), and no gate row's assertion changes. ⚠️ **Proved on CI by eight green samples with G60 and G61 on the pull request, and three planted breaks run locally; the planted slowness did not make `main` red at two waits, as §S6.1 asked, and the owner accepted the samples** — see [the log](./2026-10-17-smoke-render-waits-for-state.md). [#436](https://github.com/mephistopheles4/stacks/issues/436) carries the trail and the override list |

| The ratchet tightens — a print line that asks, and never acts | [`the-ratchet-tightens.md`](../spec/the-ratchet-tightens.md) | **built** on [#322](https://github.com/mephistopheles4/stacks/issues/322), standard tier, one build session, no gate row. One print clause beside each armed bound the arming rule says could be tighter, naming the value and its age, and doing nothing else ([ADR-0111](../adr/0111-the-ratchet-asks-to-tighten-in-a-print.md)). ⚠️ **Nothing is armed by it**: arming is the owner's, by hand, now that this has landed after #464. [#322](https://github.com/mephistopheles4/stacks/issues/322) carries the trail and §S9 the override list |

| Retire `scripts/gh-post.ts` | [`retire-gh-post.md`](../spec/retire-gh-post.md) | **built**, signed off 2026-10-17, standard tier, one build session. The repository stops shipping a posting tool, and `AGENTS.md` names none ([ADR-0115](../adr/0115-the-repo-ships-no-posting-tool.md), superseding 0078). No gate row changes. ⚠️ The build re-stamps G56's `configHash` in the same commit. [#461](https://github.com/mephistopheles4/stacks/issues/461) carries the trail |

| `smoke:render` closes its main page before the checks that boot their own | [`close-the-main-page.md`](../spec/close-the-main-page.md) | **built** ([#476](https://github.com/mephistopheles4/stacks/pull/476)), standard tier, one build session. A local probe found G60's 13.5 s to ready per boot is the gate's own main page, left open and drawing beside every later check; closing it after the phone check took four boots from 129.6 s to 32.0 s on 4 pinned cores. No gate row, wait or case order changes. [#397](https://github.com/mephistopheles4/stacks/issues/397) carries the trail |

| The survivor record — every night's survivors, kept past 30 days | [`survivor-record.md`](../spec/survivor-record.md) | **built in the pull request for #344 (a draft until the owner merges it), unproven until its first nightly**; signed off by the owner on 2026-10-17; standard tier. A clean nightly on `main` writes its survivors to a new orphan branch, `survivors`, matched by content key as a multiset, and adds one line to the job summary saying what moved. Warn-only, no new token scope, and no gate row. [#344](https://github.com/mephistopheles4/stacks/issues/344) carries the measurements and the decisions |

| Close the release-age window's remaining side doors | [`release-age-side-doors.md`](../spec/release-age-side-doors.md) | **built in [#477](https://github.com/mephistopheles4/stacks/pull/477)** (a draft pull request until the owner merges it), signed off on 2026-10-17, standard tier, one build session. Four doors from #449's adversarial review. Two of the issue's premises were measured false and are corrected: the missing-time key does not stop git or tarball dependencies, and dlx already applies the window. The trust policy fails today's lockfile on three entries, which the owner let through by exact exclude, with chromium-bidi's tied to puppeteer-core. pnpm dlx doesn't apply the trust policy, so wrangler becomes an exact-pinned devDependency, with an ADR. G67 (`release-age`) is extended; no new row. Four lenses ran on the spec, the security pair among them. [#459](https://github.com/mephistopheles4/stacks/issues/459) carries the trail |

| The deploy reads a full window, the 2026-10-09 renovation preserves, and the armable line rounds down | [`a-full-window-read.md`](../spec/a-full-window-read.md) | **built** in [#471](https://github.com/mephistopheles4/stacks/pull/471), standard tier, one session, spec and build in one pull request. ⚠️ **After merge the owner runs `pnpm trend:sync --rebuild` once**, because the corrected renovation is already in the store. Lands before any bound is armed and before [#462](https://github.com/mephistopheles4/stacks/pull/462)'s build, which reads its rows. [#464](https://github.com/mephistopheles4/stacks/issues/464) carries the trail |

| The duplication series, backfilled from history, and a trend page you can read | [`duplication-backfill.md`](../spec/duplication-backfill.md) | **built in the pull request for [#454](https://github.com/mephistopheles4/stacks/issues/454)**, standard tier on the security route, one session. The whole-tree duplication series reach back to the first commit through one `jscpd --history` run, kept in a committed `jscpd.history.json` that `pnpm trend:sync` renders under series names of its own, so no ratchet reader sees a backfilled point ([ADR-0126](../adr/0126-the-duplication-backfill-is-a-committed-file.md)). The trend page gains a duplication chart, draws its charts as lines across gaps up to three days, and is retitled. No gate row. ⚠️ **After merge the owner runs `pnpm trend:sync` once.** [#454](https://github.com/mephistopheles4/stacks/issues/454) carries the trail |

| Ask the library — a chat drawer on the shelf | [`ask-the-library.md`](../spec/ask-the-library.md) | **built on a branch, not deployed**: the live probe and the live runs are done and recorded in S12; steps 8 to 11 are the owner's. Signed off on 2026-11-04, standard tier with the security pair. A Worker answers visitors in the owner's voice from public build output only, through Workers AI and an AI Gateway spend limit, with search as the fallback. ⚠️ **The steps left are the owner's (S13 steps 8 to 11)**, because they publish, and the prototype only ran locally with test keys. Two lens rounds; [#532](https://github.com/mephistopheles4/stacks/issues/532) carries the record |

### docs/spec/README.md — cut text (4)

| The attribution and privacy notices open in a modal over the shelf | [`notice-modals.md`](../spec/notice-modals.md) | **built in the pull request for [#536](https://github.com/mephistopheles4/stacks/issues/536)**, standard tier, spec revision 3 after two lens rounds. One native `<dialog>` holds both notices; the pages stay; the text exists once and is set at 18 px and 7:1. [ADR-0146](../adr/0146-the-notices-open-in-one-modal-over-the-shelf.md). The phone run is the owner's |

| New specs live on their issues, and the ones written before stay files | no file in this folder: [revision 3](https://github.com/mephistopheles4/stacks/issues/533#issuecomment-6724747498), then [the amendments A1 to A7](https://github.com/mephistopheles4/stacks/issues/533#issuecomment-6724861535), both on [#533](https://github.com/mephistopheles4/stacks/issues/533) | **built** on #533, standard tier, one build session, signed off on 2026-11-08, with the security pair run on step 6 and the whose-comment rule. A new spec is a comment on its issue titled `## Spec: <name> (revision <n>)`; the 28 spec files here stay as written and this table stays the one index. Only a spec comment posted by the owner's account counts, and only once a merged row names it (while its build pull request is open, a sign-off comment from that account that links it and that pull request stands in, and it lapses when the pull request closes). Six files change and no gate does: `AGENTS.md` step 6, the tracker doc's new Specs section, a row in `gates.md`'s not-gated table, this paragraph and row, and [ADR-0145](../adr/0145-new-specs-live-on-their-issues.md) with its row in `docs/adr/README.md` |

| The O'Reilly metadata provider is removed | no file in this folder: [revision 4](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728372984), signed off by [this comment](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728402276), on [#450](https://github.com/mephistopheles4/stacks/issues/450) | **built in the pull request for #450**, standard tier, one build session, signed off on 2026-11-08 on the lead's decision (the owner's ask: "drop O'Reilly"). The provider, its fixtures and its G26 recording are deleted; lookups go Open Library, Google, with Apple for covers only. `oreilly_ourn` and `cover_source: oreilly` stay on older notes, and the inert O'Reilly names in the metadata layer stay unexercised. [ADR-0147](../adr/0147-oreilly-is-removed.md) supersedes ADR-0038. Revisions 1 and 2, which moved the provider to O'Reilly's MCP search with a personal token, were not built; re-adding O'Reilly starts from [revision 2](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728059674). G26 and G31 keep their code and pass; G26's corpus lost one recording. Amendments A1 to A3, three comment and doc edits the lead decided after the first review round: [the amendment comment](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728828080) |

### docs/spec/README.md — cut text (5)

order rather than chosen. ⚠️ **That is not a typo and it is this warning's own

best example**: this line read *"allocates G36–G42"* until the rollout finished,

and it was wrong, because `agents-import` took **G37** out-of-band from

[#172](https://github.com/mephistopheles4/stacks/pull/172) while the rollout was

open — so every pre-allocated number in it landed one low, and four separate

register entries record the correction. A row number is a fact about when

### docs/spec/README.md — cut text (6)

> residuals are the artifact — with the build order below now reading as what

### docs/spec/README.md — cut text (7)

> twice, against the real vault — 40 books filled on the first pass and 1 more on

> the second, which is the convergence property G34 asserts, doing it for real.

### docs/spec/README.md — cut text (8)

> ⚠️ **The real data found a bug the fixtures could not.** `mergeFields` skipped

> any field the primary already carried — and Open Library is the primary for

> almost every book *and* always has `publish_date` and `subjects`, so the named

> per-field exceptions never ran once. The vault filled with bare years where the

> table says Google wins and with raw headings like

> `nyt:paperback_advice=2012-01-14` where it says Apple's genres win. Fixed, the

> vault restored from a pre-pass backup and re-enriched: full dates went from a

> handful to **30 of 41**, and the Open Library noise is gone from all of them.

> Absent-only is a rule about *the note*, not about which provider wins, and

> enforcing it one layer too low made the whole table decorative.

### docs/spec/README.md — cut text (9)

> The ADR list below proposed five;

> [0044](../adr/0044-precedence-is-a-table-not-a-judgement.md)–[0049](../adr/0049-the-card-is-a-non-modal-bottom-sheet.md)

> are **six**. Absent-only earned one of its own

> ([0046](../adr/0046-absent-only-holds-unconditionally.md)): the list had it

> folded into the precedence record, and it is a separate decision with a

> separate cost — a book already wrong stays wrong.

### docs/spec/README.md — cut text (10)

> **The marks have landed, and not the way §5 assumed.** The card's three are

> **redrawn monotone glyphs** on the owner's instruction, which trades this

> spec's redistribution residual for a modification one — see

### docs/spec/README.md — cut text (11)

> powered-by graphic *is* vendored unaltered, and turned out to be 62×30 rather

> than the 144×26 this document guessed, and dark on transparent, so it sits on a

> plate. Apple's own icon was 404 at every URL tried.

### docs/spec/README.md — cut text (12)

Numbers are deliberately **unassigned** — `docs/gates.md`'s own note is that a

row's number is not knowable until it lands, and the highest live row is G29.

### docs/spec/README.md — cut text (13)

Landed as **G30**–**G34**; the labels below are how the spec referred to them

before they had numbers.

### docs/spec/README.md — cut text (14)

| **M3** | *(not a new gate)* G26 `lookup-recall`'s corpus **re-captured through `loadEnv()`** | A merge change moves its expectations, and a corpus captured without the Google key once replayed refusals as answers for two days |

### docs/spec/README.md — cut text (15)

and a real trade-off.** Five decisions in this effort meet all three. The

proposal is a *list*, not five written records — writing them is implementation

work, and the next free number is **0044**.

### docs/notes-on-the-shelf.md — replaced text, now near line 5

This is P2 in the brief — *architectural insurance: design for, don't build*.
Nothing here is implemented. It exists so that the decisions being made now, in
the renderer and in the publisher, don't quietly foreclose it, and so that the
reasoning survives the session it was worked out in.

> **Specified.** [Map #366](https://github.com/mephistopheles4/stacks/issues/366)
> finished this design, and the result is a locked spec:
> [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md). Build from that
> file, not from this one. This one is kept as written, because it is the
> reasoning the spec rests on; where the two differ, the spec is the later
> word. Three places differ: the heading is now locked (below), the held tier is
> capped at 1200 px rather than the vault original, and releasing the other
> covers on pickup is deferred (§2). **Built from the spec** in four steps,
> [#410](https://github.com/mephistopheles4/stacks/issues/410) to
> [#413](https://github.com/mephistopheles4/stacks/issues/413), so "nothing here
> is implemented" above describes the day this was written.

### docs/notes-on-the-shelf.md — replaced text, now near line 29

Invariant 2 currently reads:

### docs/notes-on-the-shelf.md — replaced text, now near line 36

legal under one and illegal under the other. Nothing has noticed so far because
no code has ever wanted to read a note body.

### docs/notes-on-the-shelf.md — replaced text, now near line 62

An earlier draft of this design gave `private:` a third state for "publish the
book but not its notes". It isn't needed: that state is simply not writing a
public section, which is also what every existing note in every existing vault
already does.

### docs/notes-on-the-shelf.md — replaced text, now near line 145

- **held tier** — the vault-quality original, one book at a time.

  *Built since as a re-encoded copy capped at 1200px, not the original:* see
  [ADR-0105](../adr/0105-a-cover-has-a-shelf-tier-and-a-held-tier.md) and
  `HELD_COVER_EDGE`. The paragraph below is the reasoning as it stood before.

### docs/notes-on-the-shelf.md — replaced text, now near line 149

That cuts against the 512px decision as currently written in [`docs/adr/`](../adr/0015-cover-texture-budget.md).

### docs/notes-on-the-shelf.md — replaced text, now near line 152

policy — and a public build will eventually need to stage a full-size copy
alongside the capped one, fetched only on pickup.

Usefully, this helps rather than hurts the memory problem that caused the mobile
crash: picking one book up is the natural moment to release every other cover.

### docs/notes-on-the-shelf.md — replaced text, now near line 154

> **Since superseded on both points.** The held tier is capped at 1200 px, and
> releasing the other covers waits for G15 (`cover-budget`) to go red: the crash
> was not cover memory
> ([ADR-0105](../adr/0105-a-cover-has-a-shelf-tier-and-a-held-tier.md),
> [#377](https://github.com/mephistopheles4/stacks/issues/377)).

### docs/notes-on-the-shelf.md — replaced text, now near line 162

- ~~**The heading name.** `## Thoughts` is a placeholder that reads well; nothing
  above depends on the word.~~ **Decided:** `## Thoughts`, exact and
  case-sensitive, locked by map #366 and carried in
  [the spec](../spec/picking-a-book-up.md).

### docs/shelf-inspectors.md — replaced text, now near line 4

a visitor who does not ask for it. They lived in [`AGENTS.md`](../../AGENTS.md) until
that file's size became [#174](https://github.com/mephistopheles4/stacks/issues/174);
nothing here changed but where it sits, and `AGENTS.md` points at this file.

### docs/shelf-inspectors.md — replaced text, now near line 20

below. Two defects at the head of every hardback survived two code reviews, a
479-test suite and a gate that reports every renderer counter — because they
moved none of them. `?solo` found both in one screenshot.

### docs/shelf-inspectors.md — replaced text, now near line 27

reads. The head corner was re-cut seven times before this existed, and every one
of those rounds was judged from a hand-dragged orbit, so no two before-and-afters
were the same picture and *"it looks better"* was never checkable. `distance` is

### docs/shelf-inspectors.md — replaced text, now near line 34

  more than 3.6° under the horizon — which is why
  [#56](https://github.com/mephistopheles4/stacks/issues/56) decided there is no
  tail cap and never will be.

### docs/shelf-inspectors.md — replaced text, now near line 41

not a disposal.** That sentence was written here once, about the case's assembly
seams, and the owner produced a shelf screenshot at the shelf's own `minDistance`
with the seam plainly in it. What had actually happened is that the claim was
made from a render the writer had already decided was clean. **Anything you want
to dismiss on visibility grounds gets a shelf render at `minDistance` first, and
somebody other than the person who wants it dismissed should look at it.**

### docs/shelf-inspectors.md — replaced text, now near line 53

bookcases, which is
[#287](https://github.com/mephistopheles4/stacks/issues/287)'s decision and not
an accident. A book-derived seed was declined on arithmetic as well as on taste:

### docs/shelf-inspectors.md — replaced text, now near line 58

That is exactly what defeats a differ. [#282](https://github.com/mephistopheles4/stacks/issues/282)'s
harness compares two renders of one scene, so with a per-load draw the two frames
differ by the dice as well as by the treatment and a count of just-noticeable
pixels stops meaning anything. Forced, the dice are equal and the difference is
the arm.

### docs/shelf-inspectors.md — replaced text, now near line 65

`pnpm smoke:render` selects when `CI=true` — 0 of 3,888,000 samples, worst Δ 0.
On the same machine's **GPU** path the identical pair differs on **6 samples of
207,000 at worst Δ 1**, and tripling the settle does not shrink it. That residual
is rasterisation, not the dice: it is measured with the dice held fixed, and
against it two seeds move 507,396 samples at worst Δ 99. A harness asserting
byte identity has to say which renderer it means, or it will read a GPU's noise
floor as a seed that did not hold.

### docs/shelf-inspectors.md — replaced text, now near line 80

repeated key wins. Three of this shelf's measured false zeros came from a query
string nobody had proved: `URLSearchParams.get` returning the *first* of a
duplicated key, so an arm asking for 512 rendered 1024 and differenced to a
perfect 0.000%; and `Number(null)` being `0` rather than `NaN`, so an absent
`?woodVary=` passed a `>= 0` guard and disarmed the whole variation. A seed that
dropped out of a query must not silently agree with another shot whose seed also
dropped out.

### docs/shelf-inspectors.md — replaced text, now near line 112

  reaches the eager bundle
  ([#488](https://github.com/mephistopheles4/stacks/issues/488)).

### docs/shelf-inspectors.md — replaced text, now near line 125

  `shelf-url.ts`'s, and the module-level `written` flag (#426) lives in the view,

### docs/shelf-inspectors.md — replaced text, now near line 159

`?receivers=all` joined the ten probes as an eleventh, for their reason: it is how
`?shadows=1` still reaches what it drew before the books stopped reading the map

### docs/shelf-inspectors.md — replaced text, now near line 165

cannot be tuned by a link. `?tune=` is retired: a page ignores it and prints one

### docs/shelf-inspectors.md — replaced text, now near line 172

**Two old probes mean what they always meant against a
different default** since real-time shadows became every visitor's

### docs/shelf-inspectors.md — replaced text, now near line 184

This is [`docs/progress.md`](../progress.md)'s oldest rule about instruments,

### docs/shelf-inspectors.md — replaced text, now near line 186

slider. It caught seven real faults; they are listed there.

### docs/commands.md — `pnpm lint` — the rule set, the fix flag, and the file it is not in

> `new ESLint({ cwd })` with no `overrideConfigFile`. Measured on
> [#233](https://github.com/mephistopheles4/stacks/issues/233): **88 extra rules
> cost 0.7 seconds and the one option costs 5.1**, taking the counter from 1.5s to
> 7.3s while changing no count.

> **`pnpm lint --fix` repairs about a quarter of what this can report**, and that
> is the honest figure rather than a hedge: of the 33 findings on the tree the day
> it landed, 8 auto-fixed, 2 carried an editor suggestion and **23 had no fix at
> all**. Run it, then read the rest. What makes the 23 reachable is the rule's own
> message naming the file, the line and the problem — not the flag.

> `switch-exhaustiveness-check` accepts a `default:` clause. Measured on
> [#233](https://github.com/mephistopheles4/stacks/issues/233), against the tree at
> `c8ba4ee`: untuned the set reported **75** findings and tuned it reported **36**,
> removing none of the real ones. All 39 it stopped reporting named deliberate,
> documented idiom — a linter that flags the house style trains people to ignore
> it. ⚠️ **Do
> not remove one of those reasons without removing the option it justifies**: no

### docs/commands.md — `pnpm format` and `pnpm format:check` — and the quarter of the site they never open

> whole remedy, which is the property that let a style rule onto the aggregator at
> all: whoever hits the red runs one command they did not have to know this
> repository to find ([#229](https://github.com/mephistopheles4/stacks/issues/229)).

> new dependency, which `AGENTS.md` says owes a record under `docs/adr/` — and
> [#238](https://github.com/mephistopheles4/stacks/issues/238) measured what it
> would cost: formatting `.astro` splits a three-element bootstrap guard across

### docs/commands.md — `pnpm deploy:site` — the branch guard

> without being able to deploy
> ([#321](https://github.com/mephistopheles4/stacks/issues/321)). Typed by hand it

### docs/commands.md — `pnpm deploy:site` — the upload, and what it refuses

> the pinned wrangler's start-up code, not by a deploy. The owner accepted this
> ([#459](https://github.com/mephistopheles4/stacks/issues/459)); the repository has

> **After a wrangler bump merges, run `pnpm install` before the next deploy**: the
> refusal above is that reminder, and it fires after the four gates, so run the
> install first and save the minutes. **The first deploy after this change is also
> the first proof** that wrangler reaches its login through that environment and
> that `workerd: false` is enough for `pages deploy`; nothing short of a real
> deploy shows either. Both fail safe, since a failing upload publishes nothing.
> A variable that only `.env` supplies, a proxy setting say, no longer reaches the
> upload unless it is a `CLOUDFLARE_` or `WRANGLER_` name.

### docs/commands.md — `pnpm deploy:site` — what it checks after the upload

> identical and the cover check passes against either build — which it did, minutes
> after an upload, while the origin still served the previous `index.html` and
> therefore the previous bundle. The cover check remains for the opposite case, a
> cached copy carrying the right name and the wrong bytes, which is how the fix for
> the mobile crash appeared to deploy while phones kept crashing. The build check

> That is not hypothetical — it happened here, and went unnoticed for a while
> because the message read like an edge-propagation delay
> ([`docs/progress.md`](../progress.md)). A refusal retries like anything else

### docs/commands.md — `pnpm deploy:site` — published Thoughts, and taking them back

> addresses (the owner, on #412), so every earlier one stays public until it is

### docs/commands.md — `pnpm deploy:site` — the mutation floor, and the four things it refuses

> now carries two metric refusals

> ⚠️ **A fourth flag, --skip-gates, used to sit here and does not any more.** It
> skipped the whole four-gate contract on a path that still uploaded, was written
> down nowhere for 19 of the 21 days it existed, and bought about 35 seconds.
> Deleted in [#152](https://github.com/mephistopheles4/stacks/issues/152); see
> [ADR-0064](../adr/0064-no-flag-skips-the-deploy-gates.md). Typing it today is inert
> — the gates run — which is the safe direction for a flag still sitting in
> somebody's shell history.

> a code span. ⚠️ **The first draft of this very paragraph broke the gate it was
> explaining**, which is the most direct evidence available that the trap is real
> and that the red is loud.

### docs/commands.md — `pnpm deploy:ask`, `pnpm evals:ask` and `pnpm ask:status` — the Ask the library Worker

> S3, [#541](https://github.com/mephistopheles4/stacks/issues/541)). It reads

> it to wrangler, though wrangler reads `.env` itself on every run (#459). `wrangler login`'s OAuth scopes have no observability
> scope, and every query answered 403 with its token on 2026-11-06. Without the variable

> documented, corrected by the first deployed day's replies (#548). **To undo a record**,

### docs/commands.md — `pnpm turnstile` — the Ask the library Turnstile widget and its secret

> [ADR-0135](../adr/0135-the-turnstile-widget-is-made-and-rotated-by-a-script.md), issue
> [#537](https://github.com/mephistopheles4/stacks/issues/537). **Owner-run at a terminal,

### docs/commands.md — `pnpm worktree <branch>`

> Three cases, and for a while only the first was handled:

> tracking it. It used to be created *empty off `origin/main`*, because the only
>   question asked was whether a **local** branch existed — so a branch a
>   colleague or another machine had already pushed came back as a new one of the
>   same name, and the first push either bounced or, forced, took the work with
>   it.

### docs/commands.md — `pnpm mutation:run` and `pnpm mutation:score`

> Measured on 2026-10-24: one file, 21 mutants, 7 s, the report intact on the
> host. `--mutate` takes a comma-separated list.

### docs/commands.md — A red dry run on a pull request (G70)

> Measured on 2026-11-08, with `scripts/ask-status.ts` instrumented: it fails in
> about three seconds on the 2026-11-07 break, naming the same spec and
> `expected '/**\n * Daily totals for the Ask the …' to match /if \(linked\) \{\s*fail\(/`.
> ⚠️ **Naming the file the spec reads is not enough.** The Vitest runner narrows

> renovation entry the way [#557](https://github.com/mephistopheles4/stacks/issues/557) did.

### docs/commands.md — Incremental runs are fast, and they are not a score

> neither. On [#347](https://github.com/mephistopheles4/stacks/issues/347),
> removing `"Books"` from `fixtures/api/apple-search-hit.json` left three
> `apple-books.ts` mutants `Killed` where a full run on the same tree said
> `Survived` — and so did a one-line redundant filter elsewhere in the same file.

### docs/commands.md — Survivors on every recent night — `scripts/persistent-survivors.ts`

> script ([#472](https://github.com/mephistopheles4/stacks/issues/472)).

### docs/commands.md — `pnpm mutation:stamp`

> route table has always asked for both halves, and G56 is what makes forgetting

> skips the hook. The flag was cut on
> [#329](https://github.com/mephistopheles4/stacks/pull/329) as one nothing called
> and came back on [#330](https://github.com/mephistopheles4/stacks/pull/330) with
> the hook that calls it — *a field arrives with its reader* working, not
> reversed. See [the hooks](../commands.md#the-hooks--what-arrives-with-pnpm-install-and-reading-the-crap-table).

> ⚠️ **It does not touch `fixtureHash`**, which since
> [#341](https://github.com/mephistopheles4/stacks/issues/341) digests the two rule
> option sets and the two counter **inventories** — what each rule is held to say
> about every counted construct — and no longer the installed tool versions. G56
> does not watch that stamp either, deliberately.
> [ADR-0079](../adr/0079-the-floors-stamp-is-compared-at-merge.md) declined the gate
> because a stamp over an *installed version* reddens on every Dependabot bump and
> a bot cannot re-derive one; that reasoning held for the stamp as it then was, and
> [ADR-0084](../adr/0084-the-counting-stamp-is-behaviour-not-a-version.md) removed the
> versions rather than the refusal. A behaviour change now reddens
> `complexity.test.ts` or `cognitive.test.ts` at merge instead, and correcting that
> fixture is what moves the stamp.

### docs/commands.md — `pnpm duplication:report`

> **Whole-tree means whole-tree *TypeScript*, and the restriction is measured.**
> Over every file jscpd reports 1042 duplicated lines, **570 of them JSON this
> repository did not write** — cached provider responses and a provisioned
> dashboard. Two O'Reilly fixtures shared 105 identical lines because one book came
> back from two endpoints, and a recorded response cannot be de-duplicated without
> falsifying the fixture. Those fixtures were deleted with the provider
> ([ADR-0147](../adr/0147-oreilly-is-removed.md)); the figures above were measured
> before that and have not been re-measured.

> `jscpd.history.json`** (#454). It

> first-parent commit up to the parent of #262, the commit that published the
> first duplication series.

### docs/commands.md — `pnpm metrics:emit` and the trend layer

> and `docs/gates.md` now has a place for both.**

### docs/commands.md — `pnpm trend:sync` — the reading half, and surface D

> See [#227](https://github.com/mephistopheles4/stacks/issues/227) and

> ([ADR-0111](../adr/0111-the-ratchet-asks-to-tighten-in-a-print.md),
> [#463](https://github.com/mephistopheles4/stacks/issues/463)).

### docs/commands.md — Setup: Docker, and nothing else

> `.trend/`, so the sync would write blocks here and Prometheus would serve there —
> `imported 11 record(s)` on a store answering for nine. Measured, not imagined:
> `pnpm worktree` makes two checkouts on one machine the ordinary case, and the

### docs/commands.md — `pnpm lint:md` and `pnpm lint:md:fix` — the Markdown gate, and why its fix is allowlisted

> and the danger is silent.** At default rules a fix pass over this tree changed 55
> files, turned 11 issue references into H1 headings — every `#167's …` became a
> heading and lost the reference — stripped an intentional space from 16 code
> spans, two of which are regexes gates depend on, and renumbered a **verbatim
> quotation** in `docs/log/2026-08-20-gate-register.md` sitting under a heading that says the file
> "still defined category 5". `pnpm test` on that damaged tree was **all 1055 tests
> green**. Prettier's Markdown damage is loud, because four gates go red; this
> tool's is not. The narrow allowlist is the entire protection.

> other enabled rule's. Measured: `text __x__ text` became `text **x** text` while
> four documents in this repository said it would be left alone. **So the exclusion

### docs/commands.md — The hooks — what arrives with `pnpm install`, and reading the CRAP table

> Markdown and `fixtures/` out, which was **verified with a positive control**
> rather than assumed — identical malformed content is exit 0 under `fixtures/`
> and exit 1 at a path that is not ignored.

### docs/commands.md — `.githooks/pre-commit` is retired, and why it could not simply stay

> **Git has exactly one `core.hooksPath`.** The old hook was opt-in per clone via
> `git config core.hooksPath .githooks`; husky claims that same slot on
> `pnpm install`. Its own header predicted the collision — *"a husky or lefthook
> install among the possibilities … Nothing here needs that slot badly enough to
> take somebody's hook manager off them."* Two things cannot own one slot, so the
> CRAP print moved into `.husky/pre-commit` rather than competing with it, and its
> `pnpm lint` line is superseded by the pre-push hook.

> **The print stayed opt-in** — it is a ranking whose exponents nobody calibrated,

### docs/commands.md — `pnpm smoke:render` — the render gate, and the one program that reads the shadow map

> It adds about 20 s to the gate on a workstation: 42 s before G61, 63 s with it
> on a local GPU, 78 s under SwiftShader. `pnpm deploy:site` runs it, so a deploy

### docs/commands.md — `scripts/phone-check.ts` — the check only a phone can run

> A book arrives closed ([#531](https://github.com/mephistopheles4/stacks/issues/531)),

> address switch**: #371's prototype looped on `?autoplay=5`, which any link could
> carry to a visitor's phone, and nothing in a URL can start this.

> does ([#536](https://github.com/mephistopheles4/stacks/issues/536), the notice
> modals' claim C4), so the same run says whether the WebGL context held with the

> `AGENTS.md` while nothing ever ran it. The retired `gh-post.ts` set a precedent.

### docs/commands.md — `athanor run` — the suite in a sealed Linux container

> Measured on 2026-10-21, with the image already built: `test` 21 s (150 files,
> 2877 passed, 2 skipped, as on the host), `typecheck` 6 s, `lint` 18 s, `build`
> 16 s, `smoke` 242 s with G60 and G61 included. A test planted to fail made
> `athanor run` exit 1 with `outcome: fail`.

### docs/commands.md — The agent guard — `scripts/agent-test-guard.ts`

> Measured on the owner's Windows machine: **219 ms** median for an unguarded
> command against 151 ms for a bare `node`, and 330 ms for a guarded one, which
> probes athanor. To switch it off, delete the `PreToolUse` entry.

### docs/commands.md — Analytics

> Optional Plausible on the shelf ([#562](https://github.com/mephistopheles4/stacks/issues/562),
> [ADR-0139](../adr/0139-optional-plausible-direct-to-plausible-io.md),
