# The commands, in detail

The command lists themselves live in [`AGENTS.md`](../AGENTS.md), where
`gates/commands.test.ts` (G14) holds them to `package.json` and the CLI in both
directions. This file carries the *why* behind some of them — the parts a
session needs only when it is linting, formatting the tree, deploying, cutting
a worktree, reading a mutation score, or changing what reads the shadow map.

⚠️ **`deploy:site`'s gate-ordering rule stayed in `AGENTS.md` on purpose** — it
is compaction-fragile safety, not reference, and no code catches it. It is not
restated here, because a rule with two homes is a rule that drifts
([ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md)).

## `pnpm lint` — the rule set, the fix flag, and the file it is not in

**G46.** The type-checked recommended set from `typescript-eslint`, plus
`eslint:recommended`, plus `switch-exhaustiveness-check`, over every `.ts` file
in the repository — **tests included, no split, no allowlist**. Over the site
package alone it adds `no-restricted-imports` and `no-import-type-side-effects`,
the pair that checks G6's rule a second way; see G6's row in `docs/gates.md`. It exits
non-zero on a single finding, and the `style` job in `gates.yml` runs it on every
pull request.

⚠️ **It is not `eslint.config.mjs`, and running the two together is the mistake
this arrangement exists to prevent.** That file is the complexity counter: one
rule, at a threshold nothing can satisfy, whose resolved options are hashed onto
the trend record. The linter lives in `eslint.lint.config.mjs` and `pnpm lint`
loads it with `--config`, which *replaces* the config lookup rather than adding
to it. Flat config merges every config object whose `files` glob matches, so a
single file would put the linter's `projectService` on the counter's run — and
the counter cannot opt out, because `scripts/lib/complexity.ts` constructs
`new ESLint({ cwd })` with no `overrideConfigFile`. Measured on
[#233](https://github.com/mephistopheles4/stacks/issues/233): **88 extra rules
cost 0.7 seconds and the one option costs 5.1**, taking the counter from 1.5s to
7.3s while changing no count.

**`pnpm lint --fix` repairs about a quarter of what this can report**, and that
is the honest figure rather than a hedge: of the 33 findings on the tree the day
it landed, 8 auto-fixed, 2 carried an editor suggestion and **23 had no fix at
all**. Run it, then read the rest. What makes the 23 reachable is the rule's own
message naming the file, the line and the problem — not the flag.

**Four rule options are tuned, and each one is in the config with its reason.**
`require-await` is off, `no-unused-vars` honours the `_` prefix,
`no-irregular-whitespace` skips regular expressions, and
`switch-exhaustiveness-check` accepts a `default:` clause. Measured on
[#233](https://github.com/mephistopheles4/stacks/issues/233), against the tree at
`c8ba4ee`: untuned the set reported **75** findings and tuned it reported **36**,
removing none of the real ones. All 39 it stopped reporting named deliberate,
documented idiom — a linter that flags the house style trains people to ignore
it. ⚠️ **Do
not remove one of those reasons without removing the option it justifies**: no
gate reads this config, and the comment is what stands in for one.

**It takes about 7.5 seconds**, against `pnpm typecheck`'s 2.2, because it builds
a TypeScript program before any rule runs. That cost is why the same call sits in
`.husky/pre-push` and **not** in `.husky/pre-commit` — a staged subset does not
make it cheaper, since the program is loaded either way.

## `pnpm format` and `pnpm format:check` — and the quarter of the site they never open

**`pnpm format` rewrites the tree; `pnpm format:check` exits non-zero and names
every file that would change.** The check is the gate form and the write is its
whole remedy, which is the property that let a style rule onto the aggregator at
all: whoever hits the red runs one command they did not have to know this
repository to find ([#229](https://github.com/mephistopheles4/stacks/issues/229)).

⚠️ **`pnpm format` reports success having never opened four files, and they are
every stylesheet rule the site has.** Prettier infers a parser from the
extension and has none for `.astro`, so under a directory sweep it skips
`Shelf.astro`, `index.astro`, `Attribution.astro` and `attribution.astro` in
silence — **979 lines, and this repository has no `.css` file at all**. Named on
the command line those same four files are an *error* (`No parser could be
inferred`, exit 2); swept as part of `.` they are simply absent from the count.
So a green `format:check` says nothing whatever about a quarter of the site's
source, and the number it prints is not a coverage figure.

**The gap is left open on purpose.** `prettier-plugin-astro` closes it and is a
new dependency, which `AGENTS.md` says owes a record under `docs/adr/` — and
[#238](https://github.com/mephistopheles4/stacks/issues/238) measured what it
would cost: formatting `.astro` splits a three-element bootstrap guard across
five lines, and **G7 (`astro-no-logic`) counts lines rather than statements**, so
a block one *under* its cap of 6 is reported as nine. That is a false red whose
message tells the contributor to move code that nobody moved. Taking the plugin
means repairing G7 in the same change.

**The configuration is two overrides and three exclusions, and not one of them
is restated here.** `singleQuote: true` and `printWidth: 100` live in
[`prettier.config.mjs`](../prettier.config.mjs); `*.md`, `fixtures/` and
`pnpm-lock.yaml` live in [`.prettierignore`](../.prettierignore). **Each carries
its measured reason as a comment beside the setting it explains**, and
[ADR-0074](adr/0074-prettier-formats-code-and-nothing-else.md) carries the
decision behind the whole set — including which two settings are load-bearing
for a gate rather than cosmetic, what each one was measured against, and the
rule in another ticket that the Markdown exclusion leans on. Summarising any of
that a second time here is what
[ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) exists to prevent.

**Prettier is pinned exact**, not caret-ranged, for
[ADR-0067](adr/0067-the-counters-inputs-are-pinned-exact.md)'s reason: the tool version
is an input to what the check *means*, and a minor bump that changes a default
turns an unchanged tree red.

## `pnpm deploy:site` — the branch guard

**It publishes `main` and refuses anything else**, before the gates rather than
after two minutes of them. With one checkout that question answered itself by
standing somewhere; with worktrees there can be four, on four branches, all
reading the one `.env` — so all of them hold `SITE_URL` and the command looks
identical from every one. `--any-branch` is the deliberate override, and a
detached HEAD is refused outright because nobody could say afterwards what went
out. `--dry-run` and `--check-only` are exempt: neither uploads, and a dry run
from a feature branch is how you would check this path before merging it.
Pinned by `gates/deploy-branch.test.ts`.

**`--stop-after-record` runs as far as the trend record, and stops.** It exits
0 once the record has printed and before anything judges it, so no stale or
absent record decides where the run ends, and nothing is built or published. It
clears nothing: the branch guard runs before it and still refuses — unless
`--dry-run` or `--check-only` skipped the guard, in which case reaching the stop
proves nothing about the branch. It exists so G17's test can drive the real
checkout past the guard on a pull request, where the checkout is never `main`,
without being able to deploy
([#321](https://github.com/mephistopheles4/stacks/issues/321)). Typed by hand it
is a harmless look at the branch guard, `SITE_URL` and the trend record.

## `pnpm deploy:site` — what it checks after the upload

**After the upload it asks the live site which build it is serving**, and then
compares every cover the build produced against what the origin actually serves.
A successful upload is not the same as a changed site, and the two checks fail
differently. Every build stamps `index.html` with a hash of itself, because cover
bytes cannot answer "which build is this": covers are named after book titles and
keep those names, so a deploy that changes only code leaves every one of them
identical and the cover check passes against either build — which it did, minutes
after an upload, while the origin still served the previous `index.html` and
therefore the previous bundle. The cover check remains for the opposite case, a
cached copy carrying the right name and the wrong bytes, which is how the fix for
the mobile crash appeared to deploy while phones kept crashing. The build check
waits out edge propagation before complaining, since a deploy is not live the
instant wrangler returns.

**Both checks read the HTTP status before the body, and say "refused" rather
than guessing.** Bot protection answers a non-browser client with a *challenge
page*, which is HTML carrying no build stamp and a content-length of its own —
so read as content, a refusal is indistinguishable from the stale build these
checks exist to catch, and recommends purging a cache that was never involved.
That is not hypothetical — it happened here, and went unnoticed for a while
because the message read like an edge-propagation delay
([`docs/progress.md`](progress.md)). A refusal retries like anything else
and is reported only after every attempt, since one refusal is not evidence of a
standing one. **Do not make it pass by sending a browser user agent** — that was
measured and does not work. See
[ADR-0027](adr/0027-deploy-check-reports-refusal.md).

## `pnpm deploy:site` — the trend panel, and what a stale record refuses

**Before anything else it prints the trend record**, because a trend is obliged
to reach a person on a cadence and the deploy is the cadence this project has.
The panel is fixed in order: *is this real* — the run that produced the score,
its pull-request window, and each scope's delta — then *is this bad*, each scope
against its own history and never against a target line. Per-mutant resolution
comes from this machine's last `pnpm mutation:run`, so it may be a different run
from the score; the panel says so. **The score never refuses.**

**What refuses is the instrument.** Every CI-written series has a **3-day**
bound, checked **per series**: one going quiet while the others stay healthy is
the failure the record exists to expose, and an aggregate check cannot see it. A
gated series with **no sample at all** refuses exactly as a stale one does.

**Deploy reads the local store** — the `metrics` branch as `pnpm trend:sync` last
fetched it, never a fresh fetch — which is what makes the sync the route past the
refusal. A stale store has two causes wearing one face, so the refusal spends
**one anonymous fetch of the branch tip** and says which it is: *newer rows on the
branch* means run `trend:sync`, *a branch no fresher* means the nightly has
stopped, with the Actions link. That fetch writes its own ref and never moves the
mirror, or a second `deploy:site` would clear the refusal by being run twice —
[ADR-0060](adr/0060-the-deploy-reads-the-mirror-and-the-probe-never-moves-it.md).

**No flag clears it**, and `--check-only` reports instead of refusing: it uploads
nothing, and a mode whose job is asking a live origin what it is serving must not
be blocked by the age of a local record. `--stop-after-record` never reaches the
verdict, and publishes nothing either. Gated by **G39**
(`metrics-freshness`) in [`docs/gates.md`](gates.md).

⚠️ **Honest cost: if you go a long time without deploying, you go that long
without learning.** Nothing in the design fixes that.

## `pnpm deploy:site` — the mutation floor, and the four things it refuses

**Every scope ships `unarmed`, so today this refuses nothing on a score.** The
floors live in `stryker.floors.json`, beside the Stryker config the hash below
ties them to, and the block prints at every deploy: each scope's state, how far
its calibration window has filled, and how long it has sat unarmed.

**Arming is a human judgement, per scope, after that scope's window fills** —
consecutive healthy nightlies covering **ten distinct trees**, no gap over three
days, all scored under the same configuration. Ten *trees*, not ten runs: several
nightlies re-measure one commit while `main` stands still, so a run count named
more evidence than it held ([ADR-0084](adr/0084-the-counting-stamp-is-behaviour-not-a-version.md)). The floor is then the lowest score observed across that window,
applied **once, at arming**. It is not a standing function: after arming a floor
moves up only, by hand, and **re-deriving is lowering**. There is no single
moment at which the ratchet becomes armed, and nothing in the tooling arms
anything.

Four refusals, and **no flag clears any of them**:

| Refusal | What it means |
| --- | --- |
| **breached floor** | an armed scope scored under its floor. Names the scope, the score, the floor, and — when a local mutation report exists — what one mutant is worth in that scope |
| **unaccounted scope** | `stryker.scopes.json` declares a scope `stryker.floors.json` does not name. It would be scored by every run and floored by nothing |
| **orphan entry** | the floors file names a scope nothing declares. Left alone the file rots into a list of places that are not there |
| **configuration mismatch** | the run was scored under a different Stryker configuration from the one these floors were derived under. ⚠️ **A run stamped with a *different* hash refuses whatever is armed** — somebody changed the scoring configuration without re-deriving. A run carrying **no** hash is a record from before the stamp existed, which is evidence of nothing, and refuses only once a scope is armed and there is a comparison to protect |

⚠️ **The absence of an override is the design, not an omission.** `deploy:site`
now carries two metric refusals — a stale record and a floor breach — and a
blanket flag would get reached for on the stale-record one, a blameless dead
pipe, silently clearing the floor at the same time. The only way past a breach is
a committed lowering: a one-line diff in `stryker.floors.json` plus a `notes`
line saying why, in a pull request, through gates, because deploy runs from
`main`. See [ADR-0061](adr/0061-the-mutation-floor-refuses-deploy.md).

⚠️ **The cost is real and is not softened.** The day you add a book and the
deploy refuses because a refactor last Tuesday dropped a scope below its floor,
there is no way to ship that book today. **The design's answer is that the
lowering is visible, not that it is avoidable.**

**`--dry-run` runs all four and uploads nothing**, which is the honest way to
watch one fail on purpose. **`--check-only` does not reach them at all** — it
builds nothing and exists to ask a live origin what it is serving.

⚠️ **A fourth flag, --skip-gates, used to sit here and does not any more.** It
skipped the whole four-gate contract on a path that still uploaded, was written
down nowhere for 19 of the 21 days it existed, and bought about 35 seconds.
Deleted in [#152](https://github.com/mephistopheles4/stacks/issues/152); see
[ADR-0064](adr/0064-no-flag-skips-the-deploy-gates.md). Typing it today is inert
— the gates run — which is the safe direction for a flag still sitting in
somebody's shell history.

**The flags on this page are the roster.** `gates/deploy-flags.test.ts` (**G45**)
holds these four sections to `scripts/deploy.ts` in both directions, so a flag
documented here and unread, or read there and undocumented, is a red build.
⚠️ **That is why the retired flag above is not in backticks**: the gate reads a
flag as a code span, so writing a dead one that way would demand the script grow
it back. **The same applies to the six flags this command merely forwards** —
--public, --vault and --assets go to `stacks build`, --filter to pnpm,
--project-name and --branch to wrangler, and not one of them is a flag you can
type at `deploy:site`. Name those in prose, as this paragraph does, and never in
a code span. ⚠️ **The first draft of this very paragraph broke the gate it was
explaining**, which is the most direct evidence available that the trap is real
and that the red is loud.

`ignored` — the disable-directive counter beside each floor — is the one field
gated at merge, by **G43** (`ignored-mutants`) in [`docs/gates.md`](gates.md).
There are zero such directives in this repo, so any increase is a real event.

## `pnpm worktree <branch>`

`pnpm worktree <branch>` adds a second checkout beside this one — `../stacks-<branch>` —
runs `pnpm install` in it, and tells you which `.env` it will read. Both of
those are needed because `node_modules` and `.env` are gitignored, so a bare
`git worktree add` produces a checkout where every command fails for a reason
that has nothing to do with the branch.

**Origin is fetched first, before anything is decided, and what you were given
is always printed.** Nothing here moves until somebody fetches, and making a
worktree is not that — so any base you did not check is whatever was last
pulled. That is the one failure here that says nothing: the checkout installs,
the tests pass, and the work sits on an old commit. The fetch does not fail the
command when it cannot reach the network, because being offline does not stop
the rest from working; it says so and carries on.

Three cases, and for a while only the first was handled:

- **A new branch** is cut from `origin/main`, not from the local `main`.
- **A branch `origin` already has** is checked out from `origin/<branch>`,
  tracking it. It used to be created *empty off `origin/main`*, because the only
  question asked was whether a **local** branch existed — so a branch a
  colleague or another machine had already pushed came back as a new one of the
  same name, and the first push either bounced or, forced, took the work with
  it.
- **A branch already here** is fast-forwarded when it is strictly behind, and
  otherwise reported and left alone. Never merged or rebased: a branch that is
  ahead or has diverged is yours to resolve, and this command exists to make you
  a checkout.

**There is one `.env`, in the main checkout, and every worktree reads it.** It
is not copied: a copy drifts, and `STACKS_DEV_HOST=1` left behind in a stale one
keeps the shelf on the network long after anyone remembers enabling it. So
editing it changes every worktree at once, which is the point — and a surprise
if you assumed otherwise. Remove a worktree with `git worktree remove <path>`.

## `pnpm mutation:run` and `pnpm mutation:score`

**`pnpm mutation:run` is a measurement, not a gate**, and nothing in `pnpm test`
or `pnpm build` calls it. It runs Stryker over the **eight declared scopes** in
[`stryker.scopes.json`](../stryker.scopes.json) — minutes on a workstation — and
`pnpm mutation:score` turns the one report into one number per scope, which is
the granularity the whole thing exists for. Stryker's own headline is a single
figure over whatever `mutate` matched, and that figure cannot say which scope
moved.

⚠️ **The scope list is the score's definition, so read
[`docs/spec/mutation-scoring.md`](spec/mutation-scoring.md) before editing
it.** `packages/core/src` is the **non-recursive** scope, `timeoutMS` is part of
what a score means rather than a tuning knob, and every exclusion owes a *named
mechanism* — a file is out of reach because something specific puts it there, or
it is not excluded. `covers/measure.ts` has no spec and stays in the denominator
anyway, because "nothing tests it" is a gap and not a mechanism. See
[ADR-0053](adr/0053-stryker-measures-eight-declared-scopes.md).

**`--markdown` prints the nightly's job summary** instead of the terminal
table: the same score table, then per scope the five files with the most
surviving and uncovered mutants, each with its mutants in a collapsed block,
capped at 50 per file. `.github/workflows/metrics.yml` appends it to
`$GITHUB_STEP_SUMMARY`, passing `--mutation-status`, `--artifact-url` and
`--commit`, and uploads both report files as a 30-day artifact the summary links
to. It exits 0 on every path, a missing or truncated report included — the
summary says which instead. ⚠️ The workflow calls it through `pnpm exec tsx`,
because `pnpm run` prints its own banner to stdout.

⚠️ **It is a flag and not a new script because of a hash.** A new `scripts/*.ts`
run by `tsx` would need an exclusion in `stryker.scopes.json`, which moves
`configHash`; the rendering lives in `scripts/lib/mutation-report.ts`, inside the
`scripts` scope, where its spec reaches it.

### Incremental runs are fast, and they are not a score

**While you work, reuse the last run's verdicts**, and pass every flag on the
command line — never in `stryker.config.mjs`:

```sh
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/incremental.json
```

The first run is a full one and writes the results file. After that, a run
takes about a minute where a full one takes 13–18, and it answers *which
mutants moved in the code I just touched*. Keep the file under `artifacts/`:
Stryker's default is `reports/stryker-incremental.json`, and `reports/` is not
ignored.

⚠️ **It is not score-neutral, measured.** A verdict is carried forward when the
mutant's own text and its covering tests look unchanged, and some edits change
neither. On [#347](https://github.com/mephistopheles4/stacks/issues/347),
removing `"Books"` from `fixtures/api/apple-search-hit.json` left three
`apple-books.ts` mutants `Killed` where a full run on the same tree said
`Survived` — and so did a one-line redundant filter elsewhere in the same file.
What it cannot see:

- **A fixture, a helper outside the mutant's span, or `vitest.stryker.config.ts`.**
- **A lost test.** A surviving mutant is re-run only when a test is *added*, so
  a mutant whose only tests went away stays `Survived` instead of `NoCoverage`.

A spec edit is the opposite case: the Vitest runner reports no test positions,
so one changed line re-runs every mutant any test in that file covers — too
much, never too little. The measurements are in
[`docs/log/2026-09-22-incremental-is-not-score-neutral.md`](log/2026-09-22-incremental-is-not-score-neutral.md).

⚠️ **It overwrites `artifacts/stryker/current/mutation.json`**, the report
`deploy:site`'s resolution line reads and `pnpm mutation:score` scores by
default — so either then reports reused verdicts as if they were fresh. **Before
quoting a scope's score, or deploying, run plain `pnpm mutation:run`.** Pass
`--force` to re-run everything while keeping the file.

## `pnpm mutation:stamp`

**The remedy G56 (`config-hash`) prints, and the only thing in the repository
that writes a stamp.** It re-derives `stryker.floors.json`'s `configHash` from
the Stryker configuration beside it and writes the one line back. Run it in the
same diff as whatever moved the configuration — `docs/spec/the-ratchet.md` §4's
route table has always asked for both halves, and G56 is what makes forgetting
the second half a red pull request rather than an ambush at the next deploy.

⚠️ **`--check` asks and writes nothing, and its reader is `.husky/pre-commit`.**
It exits 1 on a stale stamp and 0 on a current one, and **the exit status is the
answer**: the hook discards the output and prints its own warning, so a `--check`
that only printed would make stale and fresh look the same to it. The hook must
never write — rewriting `stryker.floors.json` mid-commit would change what is
about to be committed, outside the staged set — so it needs a way to ask, which
the bare command cannot give. It warns and never refuses; G56 stays the
guarantee, because Dependabot commits with no working tree and `--no-verify`
skips the hook. The flag was cut on
[#329](https://github.com/mephistopheles4/stacks/pull/329) as one nothing called
and came back on [#330](https://github.com/mephistopheles4/stacks/pull/330) with
the hook that calls it — *a field arrives with its reader* working, not
reversed. See [the hooks](#the-hooks--what-arrives-with-pnpm-install-and-reading-the-crap-table).

⚠️ **It re-derives and re-scores nothing.** Running it makes the file
self-consistent, not correct — every floor in it is still a number measured
under the configuration that has just changed. While every floor is `unarmed`
that costs nothing and owes no `notes` entry, which is the case the floors
file's own comment describes. **Once a scope is armed, running this is a
re-derivation and owes a justification like any other lowering**, and neither
this command nor the gate can tell the two apart.

⚠️ **It does not touch `fixtureHash`**, which since
[#341](https://github.com/mephistopheles4/stacks/issues/341) digests the two rule
option sets and the two counter **inventories** — what each rule is held to say
about every counted construct — and no longer the installed tool versions. G56
does not watch that stamp either, deliberately.
[ADR-0079](adr/0079-the-floors-stamp-is-compared-at-merge.md) declined the gate
because a stamp over an *installed version* reddens on every Dependabot bump and
a bot cannot re-derive one; that reasoning held for the stamp as it then was, and
[ADR-0084](adr/0084-the-counting-stamp-is-behaviour-not-a-version.md) removed the
versions rather than the refusal. A behaviour change now reddens
`complexity.test.ts` or `cognitive.test.ts` at merge instead, and correcting that
fixture is what moves the stamp.

## `pnpm duplication:report`

The duplication counts, printed rather than recorded. **The same counter CI
emits** — one counter, one set of thresholds, two callers — so the numbers on
your screen are the numbers that reach the `metrics` branch. Nothing here is a
gate and nothing here refuses on a number; it exits non-zero only when jscpd
could not run at all.

**Two populations, and they do not add up.** The eight declared scopes, and
whole-tree TypeScript. A clone is a relation between two places, so a clone
whose halves sit in two scopes is counted by **both** — the eight rows are
deliberately not a partition of the ninth. The whole-tree row exists because a
scope list is structurally blind to exactly that clone, and because `gates/` is
read by no scope at all. See
[ADR-0072](adr/0072-a-clone-is-a-relation-between-two-places.md).

**Whole-tree means whole-tree *TypeScript*, and the restriction is measured.**
Over every file jscpd reports 1042 duplicated lines, **570 of them JSON this
repository did not write** — cached provider responses and a provisioned
dashboard. Two O'Reilly fixtures share 105 identical lines because one book comes
back from two endpoints, and a recorded response cannot be de-duplicated without
falsifying the fixture.

**The thresholds are the measurement, not settings around it.** 50 tokens, 5
lines, `mild` mode. One step looser gives 82 clones where these give 12, over the
identical tree — so the three are hashed together with the jscpd version into
`jscpd.floors.json`'s `duplicationHash`, kept **separate** from the complexity
counter's `fixtureHash`, and G47 (`ignored-clones`) holds the stamp to the tool
actually installed.

**The share column is derived here and recorded nowhere.** A ratio falls when the
tree grows and nothing else happens, so the record carries counts and the reader
derives the fraction — the rule the complexity counts already follow.

### Suppression blocks

`jscpd` suppression blocks are permitted, **counted, and declared**. A block
removes its lines from the clone count and from the total-line denominator
together — measured, 34 raw lines with a 12-line block report 20 — so the
percentage does not move and nothing else anywhere says a suppression happened.
The per-population count therefore lives in `jscpd.floors.json`, where a diff
shows it, and **G46 sweeps the tree at merge** to hold the file to it.

- **Write it as a whole-line `//` comment.** That is the only permitted form.
  jscpd honours four and removes a *different span* for each, so the other three
  are a red build rather than a wrong number.
- **Add a `notes` line** saying why the block is there. Append-only, never
  cleared — `stryker.floors.json`'s rule and its reason.
- ⚠️ **A block only works when no code follows it.** Measured: with the block
  ending the file jscpd removes it; with one line of code after it, jscpd
  honours **nothing at all**, silently. The counter records the block either
  way, because a block is an *intent* to take code out of a measurement.
- ⚠️ **`--ignore-pattern` is not this and must not be reached for.** Its help
  text reads like region suppression; measured, it skips matching *tokens* and
  leaves the clone reported.

**The permalinks are generated at print time and stored nowhere.** A pinned link
stays valid while it stops describing a block that moved, and a stale link that
still resolves reads as current. They are never a metrics label either —
Pushgateway never forgets a series, so a per-block label would mint a new one
every time a block moved a line.

## `pnpm metrics:emit` and the trend layer

**A score is a trend, not a gate, and `docs/gates.md` now has a place for both.**
A check is a gate when its red has a named, reachable remedy *and* its verdict
does not depend on how much test code exists; otherwise it is a trend. The
taxonomy is **binary** — [`docs/spec/gate-or-trend.md`](spec/gate-or-trend.md)
and [ADR-0054](adr/0054-a-check-is-a-gate-or-a-trend.md) — and it decides
where any *future* check lands, including ones nobody has thought of. A trend
takes no row number and no status: it lives in `docs/gates.md`'s `## Trends`
table, and what is numbered is the gate that watches that table.

**`pnpm metrics:emit` is the writing half of that layer.**
[`.github/workflows/metrics.yml`](../.github/workflows/metrics.yml) calls it and
commits one `metrics/<timestamp>-<sha>.prom` per run to the orphan **`metrics`**
branch; `pnpm trend:sync` below is the reading half. No secret exists anywhere in
that design, and `gates.yml` is untouched, because a required check whose verdict
came from a different commit is reporting about code that is not there.
⚠️ **The record is *durable*, never *immutable*:** the branch is unprotected and
force-pushable, and append-only is enforced by nothing. Both claims are stated
once, in [ADR-0055](adr/0055-ci-writes-a-durable-record.md), rather than a sixth
time here.

## `pnpm trend:sync` — the reading half, and surface D

**One command, run by hand, when you want to look.** It fetches the `metrics`
branch, imports every record this machine has not seen into a local Prometheus,
asks the live origin what it is serving, and restarts the store. Run it twice and
the second run imports nothing **from the branch** — the store records what it
holds by filename, so a merge and a nightly landing in the same second both
survive. The probe is deliberately not idempotent: each run asks the origin
again, so the only record a second run adds is surface D's own.

**It also imports the renovation markers**, which are the orange vertical lines
on the page. They are rendered from `renovations.json` in the repository rather
than read off the branch — a renovation is a repository fact, so CI emits none —
and the store remembers them **by a digest of the document** rather than by
filename, because that one document is rewritten where a record is immutable.
So an unchanged file re-imports nothing, and an appended entry re-imports the
whole set once. ⚠️ **An entry appended on a day no nightly ran still syncs**: it
is the one thing that can make an otherwise empty import worth doing, and taking
the *nothing new* path would leave the page with no line at the moment the
counting rule changed. `--rebuild` re-imports them with everything else.
See [#227](https://github.com/mephistopheles4/stacks/issues/227) and
[ADR-0085](adr/0085-a-renovation-is-declared-and-the-window-may-survive.md).

**No laptop cron and no daemon.** A second scheduled thing that can silently stop
is the failure class this design spends its budget containing, and this one would
leave no Actions history to inspect afterwards. The cost is stated rather than
hidden: nothing arrives until you ask.

**Replay is the point.** A hosted Prometheus rejects samples more than two hours
behind the newest for that series; a git record has no such window, so a sync
after two weeks away replays all fourteen days. *No history when the machine is
off* is a weakness of the **store**, never of the **record**.

### The page you actually read

**<http://localhost:3000/d/stacks-trend-layer>**, and the sync brings it up. It is
a second pinned container, `stacks-grafana`, provisioned **read-only from
[`grafana/`](../grafana) in this repository** — one datasource, one dashboard,
`allowUiUpdates: false`, nothing mounted for it to write to.

**Read panel 1 before panel 2, and the page says so at the top.** Panel 1 asks
*is this real*: the per-scope delta since the previous run, the **PR window**, and
the run's own commit and Actions link. An empty window (`[]`) against a movement
is the tool disagreeing with itself at a fixed commit; `unknown` is **not** an
empty window, it is no answer at all. Panel 2 asks *is this bad*: each scope
against its own history, never against a target line. There is **no confidence
figure** anywhere on it, and the refusal is written on the page rather than only
in the record. See [ADR-0062](adr/0062-the-dashboard-is-provisioned-from-the-repo.md).

**Editing the page means editing `grafana/dashboards/trend-layer.json`.** A layout
dragged around in the browser reverts on the next provisioning reload, by design:
the panel order is a design rule, and a rule that can be dragged is a rule nothing
holds.

**Grafana's own analytics, update checks and news feed are switched off**, because
the whole layer rests on nothing derived from your reading leaving the machine.

### Setup: Docker, and nothing else

The store is a container this command creates on first run — `stacks-prometheus`,
serving <http://localhost:9090>, with its data and the sync's state under
`.trend/` (gitignored). The dashboard is the second, and both sit on a
`stacks-trend` network so Grafana can reach the store by name. **Both bind to
`127.0.0.1`**, because *nobody else can see it* is one of the two honest costs
this design accepts for a localhost store — a property to keep rather than a
phrase. **The backfill tool and the server come from the same pinned image
deliberately**: `promtool` writes TSDB blocks and Prometheus reads
them, and a version disagreement between the two surfaces as *the sync worked and
the dashboard is empty*. A `promtool` on your PATH is deliberately not used. See
[ADR-0058](adr/0058-the-trend-store-is-a-container.md).

⚠️ **A container is reused only when its image *and* its mount match.** A
`stacks-prometheus` left by another checkout of this repo keeps that checkout's
`.trend/`, so the sync would write blocks here and Prometheus would serve there —
`imported 11 record(s)` on a store answering for nine. Measured, not imagined:
`pnpm worktree` makes two checkouts on one machine the ordinary case, and the
container name is global to the Docker daemon. A mismatch recreates the container
and says which path it was serving.

If Docker is not answering, the command says so and imports nothing. The next run
imports those records instead: the store's state advances only after a backfill
succeeds.

### What it refuses, and the one flag

**A rewritten `metrics` branch.** The sync remembers the tip it last imported and
refuses when that tip is no longer an ancestor of the branch. It is
tamper-**evident** and not tamper-proof — nothing can stop a force-push to an
unprotected branch — and what it buys is that the store never silently mirrors a
history that changed underneath it. `pnpm trend:sync --rebuild` is the deliberate
answer once you know what happened: it drops the local blocks and replays the
branch as it now stands, plus every surface-D row, which only this machine has.
See [ADR-0059](adr/0059-the-sync-refuses-a-rewritten-record.md).

### Surface D — the edge check between deploys

`deploy:site` asks the origin what it is serving **at** a deploy; D asks the same
question **between** deploys, and it is folded in here rather than scheduled in
CI. That is a fact rather than a preference: the expected build stamp is
`sha256(index.html + library.json)` and `library.json` is built from the real
vault, which is not in the repo, **so CI can never compute it.** It could only be
told, which costs a token and breaks the property that no secret exists anywhere
in this design ([ADR-0055](adr/0055-ci-writes-a-durable-record.md)).

**D's row goes to the local store only, never the branch**, which keeps both ends
credential-free — at the cost that D's history lives on one machine. A **refusal**
by bot protection writes `run_ok 0` and no build number at all, and is reported as
refused rather than as a stale build: one is no answer, the other is a real answer
and a red one ([ADR-0027](adr/0027-deploy-check-reports-refusal.md)). D skips, and
says so, when `SITE_URL` is unset or the local `dist/` carries no build stamp — a
gap in D's series is honest where an invented row is not.

## `pnpm lint:md` and `pnpm lint:md:fix` — the Markdown gate, and why its fix is allowlisted

**`pnpm lint:md` reports; `pnpm lint:md:fix` repairs the seven rules whose fixes
were measured safe on this tree.** Both read tracked Markdown outside
`fixtures/`, at the rule set in
[`.markdownlint.jsonc`](../.markdownlint.jsonc), where every rule turned off
carries the measurement that turned it off. The gate runs in CI in the `style`
job, and a red there is this command's own output.

The documentation here is load-bearing rather than decorative, which is why a
Markdown rule break is a defect and not a matter of taste. G19 holds
`docs/gates.md` to `AGENTS.md`, G14 holds `docs/commands.md` to `package.json`,
G41 extracts `docs/gate-register.md` **by heading**, and nine gate regexes read
table pipes and emphasis markers as text. When a gate parses a document, the
document's shape is part of the contract.

⚠️ **The rule set is narrow because a default run here is actively dangerous,
and the danger is silent.** At default rules a fix pass over this tree changed 55
files, turned 11 issue references into H1 headings — every `#167's …` became a
heading and lost the reference — stripped an intentional space from 16 code
spans, two of which are regexes gates depend on, and renumbered a **verbatim
quotation** in `docs/gate-register.md` sitting under a heading that says the file
"still defined category 5". `pnpm test` on that damaged tree was **all 1055 tests
green**. Prettier's Markdown damage is loud, because four gates go red; this
tool's is not. The narrow allowlist is the entire protection.

**Three settings are worth knowing about**, because each is a rule whose default
would have protected nothing:

| Setting | Why not the default |
| --- | --- |
| `MD060: compact` | MD060's default is `any`, which enforces consistency *within* a table and accepts a column-aligned one. G41 and G31 hardcode an exact single space at a pipe, so an aligned table passes the linter and goes invisible to both gates. Since Prettier excludes Markdown rather than repairing those regexes, this setting is their sole protection. |
| `MD050: asterisk` | MD050 governs `**strong**`, which is what the nine gate regexes match — MD049 governs `*emphasis*` and is measurably blind to `__G41__`. Zero findings today, so it is purely preventive. |
| `MD013: off` | 1540 findings, 76% of everything the tool reports here, and no auto-fix at any limit. The longest Markdown line is a 2048-character table row, which does not wrap. Recorded in [`gates.md`](gates.md#not-gated-deliberately). |

⚠️ **The fix pass refuses rather than filters, and that is not a stylistic
choice.** markdownlint-cli2's discovered root config beats every mechanism for
narrowing it — `--config` is documented as *"the base configuration"*,
`optionsOverride.config` is never consulted, and an `overrides` entry at
`combine: "replace"` loses too, all three measured at 0.23.2. So a second config
file would read as a restriction and restrict nothing. Instead
`scripts/lint-md.ts` measures what the installed version can actually rewrite,
against one probe document per adopted rule, and **stops before touching a file**
when that set is not exactly the allowlist **plus the declared exclusions** in
`scripts/lib/markdown-lint.ts` — eight names today, not seven, because MD050 is
fixable and declared. It stops for a second reason too: when the tree itself
holds a finding on one of those excluded rules.

That refusal is the mechanised form of a debt: what a rule's fix *does* is a
property of a version, not of a tool, so the allowlist is re-measured at every
bump. G48 (`markdown`) asserts the same measurement at merge, so neither the
command nor CI can drift away from it alone.

**MD050 is the one rule the tool can fix that the allowlist does not carry**, and
that omission is declared rather than accidental: it has zero findings here, so
no fix pass was ever run against it, and this list holds only names somebody
watched.

⚠️ **A declared exclusion is not a rule the fix pass skips.** Nothing narrows the
run — that is the paragraph above — so `--fix` would apply MD050's fix like any
other enabled rule's. Measured: `text __x__ text` became `text **x** text` while
four documents in this repository said it would be left alone. **So the exclusion
is enforced by declining the whole pass**: write `__G41__` into a scoreboard row
and `pnpm lint:md` goes red naming MD050 and the line, and `pnpm lint:md:fix`
**refuses** and tells you to repair it by hand and read the diff. Doing that, and
finding the fix right, is what promotes the rule to the allowlist.

**The version is pinned exact** — `markdownlint-cli2` at `0.23.2` — for
[ADR-0067](adr/0067-the-counters-inputs-are-pinned-exact.md)'s reason. ⚠️ **The
rules reconcile with CodeRabbit and the versions cannot.** CodeRabbit reads
`.markdownlint.jsonc` out of the repository and skips its own markdownlint run
once a workflow runs one, so there is no rule set to negotiate; but its docs name
`0.23.1` and it floats, and this repo can pin only its own copy. That residual is
tolerable because the review half is advisory.

## The hooks — what arrives with `pnpm install`, and reading the CRAP table

**Not commands, and not gates.** Two hook scripts live in
[`.husky/`](../.husky), and unlike everything else optional in this repository
they **arrive on their own**: `husky` is a devDependency and `prepare` is a
lifecycle script, so `pnpm install` wires them for every contributor without
anybody asking. That is a real posture change and it earns its own record —
[ADR-0083](adr/0083-hooks-arrive-with-pnpm-install.md).

⚠️ **The gates are still the whole contract.** Every check in either hook
already refuses in CI, so this layer buys **latency and no new coverage**: a
formatting slip found in three seconds locally instead of three minutes in CI.
A contributor whose hook is broken, skipped or absent passes every gate, and
`--no-verify` skips both hooks — that is not a defect, because nothing here is
a guarantee.

| Hook | Runs | Refuses? |
| --- | --- | --- |
| `pre-commit` | `lint-staged` → `prettier --write` over the staged files | **yes**, and it is the only step here that can |
| `pre-commit` | `pnpm mutation:stamp --check` | no — warns, and G56 refuses the merge |
| `pre-commit` | the CRAP print, opt-in per clone | no — it exits 0 whatever happens |
| `pre-push` | `pnpm lint` | **yes** |

⚠️ **`pnpm lint` is on the push and not the commit, and the reason is
measured.** `eslint.lint.config.mjs` sets `projectService: true`, so the run
costs about 7.3 seconds whatever subset of files it gets — **a staged subset
does not make it cheaper**, because the parser loads the whole TypeScript
program either way. Seven seconds on every commit is how a hook becomes the
thing everyone clears with `--no-verify`.

⚠️ **`lint-staged` names extensions rather than `*`, and that is load-bearing
twice.** Prettier errors on a `.astro` file named explicitly (see above), so
`*` would fail every commit touching the site; and `.prettierignore` keeps
Markdown and `fixtures/` out, which was **verified with a positive control**
rather than assumed — identical malformed content is exit 0 under `fixtures/`
and exit 1 at a path that is not ignored.

**The list is wider than the tree**, deliberately: it carries `js`, `jsx`,
`tsx`, `cjs` and `cts`, of which this repository holds **zero**. A glob that
matches nothing costs nothing, and each of those was checked to parse rather
than error the way `.astro` does — so the only asymmetry left is the safe one.
⚠️ **It is not a policy instrument**: listing `tsx` is not a plan to adopt
React, which the tech decisions rule out and which a formatter glob is the wrong
place to enforce. ⚠️ **And the hook missing a file would not have been a hole
anyway** — `pnpm format:check` sweeps the whole tree and refuses a badly
formatted `.js` (measured), so CI is the backstop this layer never replaces.

### `.githooks/pre-commit` is retired, and why it could not simply stay

**Git has exactly one `core.hooksPath`.** The old hook was opt-in per clone via
`git config core.hooksPath .githooks`; husky claims that same slot on
`pnpm install`. Its own header predicted the collision — *"a husky or lefthook
install among the possibilities … Nothing here needs that slot badly enough to
take somebody's hook manager off them."* Two things cannot own one slot, so the
CRAP print moved into `.husky/pre-commit` rather than competing with it, and its
`pnpm lint` line is superseded by the pre-push hook.

**The print stayed opt-in** — it is a ranking whose exponents nobody calibrated,
and making it everybody's would be the refusing hook
[`docs/spec/complexity-on-the-trend-layer.md`](spec/complexity-on-the-trend-layer.md)
§4 turned down:

```sh
git config --bool stacks.hooks.crap true    # opt in
git config --unset stacks.hooks.crap        # opt out
```

⚠️ **A clone that had opted the old hook in keeps pointing at a file that is
gone until its next `pnpm install`**, which repoints `core.hooksPath` at husky.
Nothing breaks in between: git runs no hook it cannot find.

**It prints and it never refuses.** Every failure — no dependencies installed,
a Vitest run that died, a file ESLint could not parse — costs you the print and
nothing else; the step is called with `|| printf …` and the hook ends in an
unconditional `exit 0`. The only teeth in this rollout remain the per-scope cap
at `deploy:site`.

### What it does, on every commit

For the staged files that fall in a declared mutation scope, it runs
`vitest related <those files> --coverage` — one run, not one per file — counts
the functions with the same ESLint rule the four complexity series use, and
joins the two:

```text
CRAP over 20 functions this commit touches — CC² × (1 − coverage)³ + CC, exponents never calibrated

       56.0  CC   7  0% (0/7)      untestedBranchy               packages/core/src/parse.ts:2
        8.0  CC   8  100% (11/11)  renderReport                  scripts/lib/crap.ts:370
        6.0  CC   2  0% (0/1)      (arrow)                       packages/core/src/parse.ts:9

  no in-process oracle: packages/site/src/shelf/scene.ts

  1.2s — this blocks nothing; `--no-verify` skips it.
```

### Reading it

**Highest first, and the ranking is the whole product.** `CRAP(m) = CC² ×
(1 − coverage)³ + CC` puts a complex function nobody executes at the top and
collapses to plain complexity once a function is fully covered — which is why an
8-complexity function at 100% sits *below* a 7-complexity one at 0%.

⚠️ **The exponents were never calibrated, by the authors' own account.** That is
why the caveat is on the same line as the word CRAP rather than in a footnote,
why the number is never a series, never a panel and never a threshold, and why
nothing anywhere asks anyone to lower it. It ranks the functions in front of you
right now. It is not a score for the codebase, and comparing today's table to
last week's is not a thing it can do: it keeps no history.

Three things print no number at all, and each says which:

- **`no in-process oracle`** — the file is on a mutation scope's exclusion list,
  because its only oracle is a headless browser or a child process. Twenty-eight
  files are in this state. They read 0% for a reason that is about Vitest's
  reach rather than about the code, and a CRAP of 420 for `scene.ts` would be a
  measurement of the harness.
- **`implicit function — no counterpart in the coverage report`** — a class field
  initialiser or a static block. ESLint scores both as functions; Istanbul has
  no entry for either, so there is a complexity and there is no coverage grain.
- **`not in the coverage report`** — the plumbing did not reach it. **This is
  never printed as 0%**, which is the distinction the whole table rests on: a
  file that is *in* the report untouched is a real 0% and a real, maximal CRAP,
  and a file that is *missing* is a broken pipe.

A function with no name — an arrow passed to `.filter()` — is identified by its
`file:line` and shown as `(arrow)`. Istanbul's own `anonymous_7` ids are
positional and shift when an unrelated arrow is added above them, so they are
safe to print and unsafe to store. Nothing here stores them.

Coverage exists in this repository for this print and for nothing else — no
floor, no threshold, no series, no badge. See
[ADR-0069](adr/0069-coverage-is-an-ingredient-not-a-goal.md).

## `pnpm smoke:render` — the render gate, and the one program that reads the shadow map

**The Phase 2 gate, grown.** It builds the 50-book fixture into the site,
serves `dist/` from its own process on a port the operating system picks, and
drives system Chrome headless: a screenshot at `artifacts/shelf.png`, the card,
the cover viewer and the sheet (G16, G35), four staged context losses (G59),
and three pages counted for G60 (`one-shadow-reader`). On a workstation it asks
Chrome for the real GPU; with `CI=true` it renders under SwiftShader, Chrome's
software rasteriser, as the `suite` job does.

**G60's three pages**, each in a browser context of its own at 480×640, each
with a WebGL counting hook installed before any page script:

| page | what it must show |
| --- | --- |
| the default page, 50 books | exactly one program reads the shadow map, in at most 4 draws a frame |
| the default page, 300 books | the same, on a bookcase at least 8 shelves tall |
| `?receivers=all`, 50 books | red — more than one program and more than 4 draws — or the instrument is blind |

The 300-book library is generated at gate time — `pnpm fixtures:50 --books 300`,
invented titles and the six generated covers, every book past the first 50
coverless — and staged into `artifacts/vault-300-public/`, **never** into
`packages/site/public/`: a second server serves its `library.json` and
`covers/` over the same build. Nothing about it is committed.

**Reading a red.** Each line names its clause. `(3)` or `(4)` on a default page
means a program started reading the shadow map, or the bookcase started drawing
more than it did: find which, before anything else. A red on `(8)` means the
control came back green, so the hook cannot see a book program and no green
above it means anything. **Do not raise the budget to clear it** — it is the
shape the phone survived plus room for one member, nobody knows where the edge
is, and why it is 4 is in `scripts/lib/shadow-sampling.ts` and in
`docs/gates.md` under G60's own section.
The check that settles a doubt is a phone, below.

It adds about 20 s to the gate on a workstation: 42 s before G60, 63 s with it
on a local GPU, 78 s under SwiftShader. `pnpm deploy:site` runs it, so a deploy
pays the same.

## `scripts/phone-check.ts` — the check only a phone can run

G60 pins what survived on one phone; it cannot say a phone survives. This does:
it serves a build to a USB-attached Android phone's own Chrome, loads a page,
watches it for two minutes, and says whether the WebGL context held — with
G60's own counts of what read the shadow map, taken on the phone, from the same
hook and judge the gate uses.

```sh
pnpm exec tsx scripts/phone-check.ts                  # the default page, 120 s
pnpm exec tsx scripts/phone-check.ts --matrix         # default ×3, ?shadows=0, ?receivers=all
pnpm exec tsx scripts/phone-check.ts --gpuinfo        # chrome://gpu, in a tab of its own
```

**Not a `pnpm` script, and that is deliberate.** It needs adb and a phone with
USB debugging on, which no CI runner has and [`CONTRIBUTING.md`](../CONTRIBUTING.md)
cannot ask a contributor for — and a `pnpm` script is one G14 would pin in
`AGENTS.md` while nothing ever ran it. `scripts/gh-post.ts` set the precedent.

**Before it runs:** adb on the `PATH`, or `--adb <path>`; the phone plugged in
with USB debugging on and the computer authorised; Chrome on the phone; and a
build to serve. It serves `packages/site/dist/` as it stands, so the library is
whichever one the last build staged — after `pnpm smoke:render`, the 50-book
fixture. `--serve <dir>` points it elsewhere, and `--url https://…` loads a page
it does not serve at all. With two devices attached it refuses to choose:
`--serial <id>`, from `adb devices`.

**What it does to the phone**, every run: wakes the screen and dismisses a
keyguard that has no PIN; **force-stops Chrome**, which is the only thing that
clears the block Chrome puts on a page after a real context loss; clears the
logcat and reads it back; opens a tab of its own and closes it after; **removes
the shelf's lost-context record** for the served origin, since a record left by
an earlier run would start the page painted; and injects a Shift key once a
second so the screen stays on. It changes no setting and touches no flag —
a browser flag is never part of a fix here ([ADR-0090](adr/0090-real-time-shadows-are-the-default.md)).

**When to run it:** before merging anything that touches shadows, materials,
lights, the bookcase's geometry, or three itself — the changes G60 can see the
shape of and not the outcome.

**What a result means.** One of six verdicts, most specific first:

| verdict | meaning |
| --- | --- |
| `lost` | the context was lost, and when |
| `link-fail` | a program would not link, which halts the shelf |
| `no-context` | the page never drew — refused a context, or failed first |
| `invalid-hidden` | the page was behind another for at least one poll, and a hidden page draws nothing |
| `invalid-fallback` | the shelf's fallback did not read `none`, so it may have run painted |
| `survived` | held for the whole wait, in front throughout |

Only `survived` says the shelf held, and **the default page surviving three runs
of 120 s is what "the default holds on this device" means.** `--matrix` does
that, then `?shadows=0`, then `?receivers=all` last: on the Pixel 10 Pro XL it
measured, the reproduction loses its context, and the script expects it to. **If
it survives, the driver has changed** — write the run down in the log. The
script exits non-zero when any other run did not survive.

**What it writes**, to `artifacts/phone/`, which is ignored: one JSON per run —
the device, Chrome's version, the GPU string as the page sees it, the verdict,
G60's counts and any clause they failed, the console — beside the run's whole
logcat and, with `--shot`, a screenshot. The page's GPU string carries no driver
build on Chrome 153, so a result is tied to a driver by `--gpuinfo`, which reads
it off `chrome://gpu`. ⚠️ **A logcat can carry personal data**:
notifications, account names, other apps. The JSON quotes a filtered slice; the
whole file stays in `artifacts/` and is never attached anywhere raw.
