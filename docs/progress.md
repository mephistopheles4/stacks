# Progress

**Read this first.** It is the only file that says where the project actually is.

This is an **index, not a narrative**. One line per event, newest phase last.
Gists and links — never restate the plan. If you find yourself explaining *what*
a phase does here, it belongs in [`plan.md`](./plan.md) instead.

Update it in the **same commit** as the gate it describes.

**No live counts in Current state.** A book count is wrong again the next time
anyone runs `stacks add`, and a stale number in the one file that claims to say
where the project is costs more than it tells you. Name the command that answers
instead. Counts *inside* a dated record — what an import added, how many books a
phone was rendering when it died — are measurements and stay exactly as they are.

---

## Current state

| | |
| --- | --- |
| **Last green gate** | G46 (`lint`) — ESLint stops being a function inventory and starts being a linter. `pnpm lint` runs the type-checked recommended set, tuned to four repository idioms plus `switch-exhaustiveness-check`, over **every** `.ts` file including tests, and the new `style` job in `gates.yml` refuses a pull request on one finding. It found **33** on arrival across 19 files, **every one of which `pnpm typecheck` passes** — a floating promise and an unbound method among the **9** in `scene.ts`, which sits outside every mutation scope and every complexity scope. ⚠️ **A second config file, never a merge into the counter's**: flat config would put `projectService` on the complexity run and take it from 1.5s to 7.3s, of which **0.7s is 88 extra rules and 5.1s is the one option**. Counter timings either side, unchanged: 1.29s → 1.23s over `packages/core/src`, 2.04s → 2.06s over the tree. ⚠️ **`--fix` repaired 8 of the 33** — the *one documented command with a fix flag* rule was argued about style rules and does not carry to a correctness set ([#253](https://github.com/mephistopheles4/stacks/issues/253), [ADR-0076](./adr/0076-the-linter-is-type-aware-and-pinned.md)) |
| **Before it** | G45 (`deploy-flags`) — every flag `pnpm deploy:site` reads is a flag `docs/commands.md` documents, and the reverse. It landed with the deletion of `--skip-gates`, which skipped the whole four-gate contract on a path that still **uploaded**, lived for **19 of its 21 days** in **two lines of one file, both the implementation**, and bought about **35 seconds** — measured, for the first time in the 21 days it existed ([#152](https://github.com/mephistopheles4/stacks/issues/152), [ADR-0065](./adr/0064-no-flag-skips-the-deploy-gates.md)). ⚠️ **The mechanism was already there and aimed one flag to the left**: G17 pins which spellings override the *branch* guard, while the override that cleared the *contract* was pinned by nothing. The row before this one was G44 (`stryker-reporters`) |
| **And before that** | G39 (`metrics-freshness`) — the trend record is fresh **per series**, or `pnpm deploy:site` refuses on any path that publishes and names which series is not (`--check-only` reports it instead; it uploads nothing). The refusal spends one anonymous fetch to tell *you have not synced* from *the nightly has stopped*. ⚠️ It was green for half an hour against a plant that deleted the refusal outright: the harness proves a run got past by letting it fail on the next check, so the exit code asserted nothing — see [the log](./log/2026-08-19-the-deploy-reads-the-record-and-refuses-per-series.md). ⚠️ Its spec said G38 in four places; that is the **fourth** wrong pre-allocated number in this effort |
| **Stacked on it** | G40 (`action-pins`), G41 (`gate-register`) and G42 (`dependency-audit`) on `claude/mattpocock-skills-154-162-71abbe`, based on G39's branch — **three rows in one commit**, because `gate-register` shipped alone is red on every row and shipped against stubs is green over empty sections. Standalone it was deliberately red on G19's gapless check and on its own floor; **rebased onto G39 it is 795 of 795**. ⚠️ `gate-register`'s **first red was not planted** — G37 (`agents-import`) had landed out-of-band with no register entry, 37 entries against 38 rows. See [the log](./log/2026-08-20-the-register-gate-found-a-row-nobody-triaged.md) |
| **And stacked on that** | G43 (`ignored-mutants`) on `claude/mattpocock-skills-154-163-07f854`, based on G42's branch — **the rollout's seventh and last row**, and the only one asserting a field of `stryker.floors.json`. The floors file lands with it: every scope **`unarmed`**, dated, `ignored` at 0, and one hash of the score-affecting Stryker configuration each CI run now stamps into its record. ⚠️ **Built is not armed and nothing here arms anything** — arming is a human judgement per scope after that scope's 20-run window fills, the windows start together, and there is no single moment at which the ratchet becomes armed. ⚠️ **The window starts at zero on landing**, because every record already on the branch predates the config stamp and an unstamped run cannot be shown to have been scored under these floors |
| **What `deploy:site` refuses on the floors** | four things, with **no flag clearing any of them**: a breached floor, a declared scope with no entry, an entry naming no declared scope, and a run scored under a different configuration. The absence of an override is the design — deploy now carries two metric refusals, and one blanket flag reached for on the stale-record refusal would silently clear the floor as well ([ADR-0061](./adr/0061-the-mutation-floor-refuses-deploy.md)). ⚠️ **A *different* hash refuses whatever is armed; a *missing* one waits for a scope to be armed.** The second half is what stopped the very first deploy after landing from refusing on the eleven records that predate the stamp — teaching whoever hit it how to get past the new machinery. The configuration route stays shut either way, because the calibration window refuses to *derive* a floor from a run it cannot place |
| **The register is gated by that branch** | `docs/gates.md` rows ↔ `docs/gate-register.md` sections, both ways and by count. **A new row lands with its entry or the build is red** — five verdicts, a date, an observed-red line, per [`CONTRIBUTING.md`](../CONTRIBUTING.md). ⚠️ The merged-verdict exemption names **ten** rows, not the one the spec specifies, and is reverse-asserted; the spec's own §4 already recorded the ten |
| **Rollout numbering** | ⚠️ **Every row number pre-allocated by the after-the-scoreboard tickets is one low**, because `agents-import` took G37 out-of-band. **No number is reserved here** — `docs/gates.md` says why, two tables down: *"The number goes in when the row does."* Count the rows in that file at the tip you branch from, and cite slug and number together, never the number alone |
| **Trend layer** | **live.** `.github/workflows/metrics.yml` writes one `.prom` per run to the orphan **`metrics`** branch — `git fetch origin metrics` to read it. Its first nightly found a scope 6.45 points down on a false comment in the PR that built it; see [the log](./log/2026-08-19-the-first-nightly-caught-its-own-author.md). `pnpm trend:sync` is the reading half and is **built** — it replays the branch into a local Prometheus, folds surface D in, and brings up the page you read at <http://localhost:3000/d/stacks-trend-layer>, provisioned from [`grafana/`](../grafana); needs Docker, see [`commands.md`](./commands.md) |
| **Now working on** | [#88](https://github.com/mephistopheles4/stacks/issues/88) — the enhanced card and the provider provenance behind it — is closed and **built**, on `claude/mattpocock-skills-wayfinder-ce3871`, awaiting review. Its spec is [`docs/spec/`](./spec/), kept as written. [#78](https://github.com/mephistopheles4/stacks/issues/78) and [#50](https://github.com/mephistopheles4/stacks/issues/50) before it are closed and built. `gh issue list` is the only current answer to what is open |
| **Queued** | whatever the closed maps left in fog — ask [#50](https://github.com/mephistopheles4/stacks/issues/50)'s and [#88](https://github.com/mephistopheles4/stacks/issues/88)'s *Not yet specified*; [#78](https://github.com/mephistopheles4/stacks/issues/78)'s is empty by construction. [#62](https://github.com/mephistopheles4/stacks/issues/62) separately left the owner three `stacks enrich` commands to run |
| **Decisions** | [`docs/adr/`](./adr/) — extracted from the old Decision Log, one file each |
| **Repository** | [public](https://github.com/mephistopheles4/stacks); `main` protected — PR + `gates` + CodeQL, no bypass |
| **Blocked on** | nothing |
| **Mobile crash** | closed. Two separate bugs: 314 MB of texture (G15), then a driver that cannot sample a shadow map. The shelf paints its shadows now |
| **Deployed** | https://stacks.aymandiab.com — Cloudflare Pages, `pnpm deploy:site` |
| **Running against** | the owner's real vault, not fixtures — `pnpm stacks status` for the count |
| **Enriched** | `stacks enrich` has run twice over the real vault (2026-08-10). 41 books: 40 filled, 1 refused as a mismatch, 1 no provider knows. Ids landed on 37 Google / 26 Open Library / 24 Apple / 2 O'Reilly, and 37 notes gained an `## About`. ⚠️ **The first pass wrote the wrong values and the vault was restored from a backup and re-run** — see [`docs/spec/README.md`](./spec/README.md); `mergeFields` was enforcing absent-only one layer too low, which disabled every per-field exception. A pre-pass copy is at `../Obsidian/stacks-backup-pre-enrich` |

## Gate log

| Phase | Gate | Status | Commit |
| --- | --- | --- | --- |
| 0 — scaffold | `stacks --help` lists commands · empty shelf renders · fixtures committed | ✅ green | tag `phase-0` |
| 1 — data layer | `stacks build` → valid `library.json` · malformed skipped · 4 test cases | ✅ green | tag `phase-1` |
| 2 — shelf | `pnpm smoke:render` → non-blank `artifacts/shelf.png` · 50 books · click opens card | ✅ green | tag `phase-2` |
| 3 — public build | `--public` output has zero canary hits · share card reaches `dist/` | ✅ green | tag `phase-3` |
| 4 — import | dedupe by ISBN then title+author · re-running is idempotent | ✅ green | tag `phase-4` |

Every phase additionally requires `pnpm test && pnpm build` green.

### Phase 1 evidence

- `pnpm test` → 7 files, **62 tests** passed · `pnpm build` clean
- `pnpm stacks build --vault fixtures/vault` → **8 books**, 2 warnings naming
  `The Undelivered Manuscript.md` and `Untitled Import.md`, silent on
  `On Reading Slowly.md`, exit 0 — matching `fixtures/README.md` exactly
- Gate's four cases covered against **real captured** responses: ISBN hit,
  fuzzy title, API miss, malformed frontmatter. No test touches the network.
- End-to-end `stacks add 9781603580557` into a scratch vault: note written,
  real cover downloaded, spine colour extracted, re-running deduped correctly.

### Phase 2 evidence

`pnpm smoke:render` green: 49 of 50 fixture books shelved (wishlist excluded),
715 distinct colours, 40.1% non-background, and a click on a real book opened
its card ("Ember Protocol: Notes on Craft"). Screenshot at `artifacts/shelf.png`.

Aesthetics review came back with three directions, all applied: real bookcase
feel (continuous fill at real proportions, not one sparse row per year),
wishlist books stay off, and spine colour sampled from the cover's binding edge
so it matches the real spine. See [`docs/adr/`](./adr/) for each.

### Phase 3 evidence

`pnpm gate:public` green: builds for real, then greps every text file that
shipped for the canary, for vault note paths, and for `sourcePath` — 0 hits. It
also fails if the canary is missing from the fixture vault, so it cannot pass
vacuously. OG image 24.8 KB at 1200x630. 71 tests pass.

Both gates were made to stage their own input: they previously fought over
`packages/site/public/library.json`, so whichever ran last decided what the
other tested. Verified passing back to back in either order.

Since G20 the rules live in `scripts/lib/public-build.ts`, and
`deploy:site` applies the same ones to the real build rather than its own weaker
copy. The script still owns planting the canary and building from the fixtures.

**2026-08-18 — the key trace, and the vacuous rule beside it**
([#156](https://github.com/mephistopheles4/stacks/issues/156),
[`docs/spec/trend-layer.md`](./spec/trend-layer.md) §5 (i) and (iii)). A new
rule, `unknown-key`: every key on every shipped book is a named `BookRecord`
field or one of two named derived ones (`id`, `coverAspect`). It exists because
the `note-body` rule **cannot fire on a real-vault deploy** — it greps for a
canary planted only in `fixtures/vault` — so invariant 2's real-build check was
vacuous, which is now written down at `FORBIDDEN` and in `deploy.ts`'s header,
where the comment had been claiming the pre-flight re-asserts "no note bodies".
⚠️ **It checks key names, never values**: body text stuffed into `subjects`
passes it, and the structural argument it asserts is a claim about the schema.
G20 now plants that case rather than leaving it asserted — the canary inside
`subjects` fires `note-body` and **not** `unknown-key`, which locates the
boundary exactly: on a fixture build the grep of `library.json`'s contents
catches body text in a permitted field, and on a real build that grep is the
vacuous one. Neither check is the one a reader assumes.

Planted red, observed twice. Patching `toLibraryBook` to ship
`...keyIfPresent('narrator', 'A Narrator')` — the field-wired-through-the-seam
case — made `pnpm deploy:site --dry-run --skip-gates` refuse over the real
41-book `dist/`: *"[unknown-key] 1 key(s) on shipped books that no BookRecord
field and no named derived key explains: narrator (first on "Team Topologies")"*.
G30 went red on the same patch, which is the division of labour: **G30 catches
the seam in CI, this catches the artifact.** G20 carries the permanent plant.
Non-vacuity is `empty-library`'s, confirmed rather than assumed — G20 plants all
three of its cases (no books, no `library.json`, unparseable) — and the clean
path now prints `N distinct book key(s), every one named`, 13 on the fixture
build and 41 books' worth on the real one.

⚠️ The named-derived list is the weakenable part: an offending key is made to
ship by adding its name there, red to green in a one-line diff that reads like
documentation. Two entries, and the comment demands a why-sentence for a third.
`gates/library-seam.test.ts` keeps its own copy of those two names rather than
importing them, so that edit costs two files instead of one; drift between the
copies fails in the safe direction either way. No `docs/gates.md` row — it is a
clause in an existing pre-flight, under G20 — but the **lesson** is there, under
*G2 in full*, where the canary rule's "cannot pass vacuously" is true of
`gate:public` and false of the caller that publishes.

**2026-08-22 — the `csp` rule, and no new row again**
([#127](https://github.com/mephistopheles4/stacks/issues/127),
[ADR-0065](./adr/0065-the-csp-is-generated-not-written.md)). Every built page
carries a `Content-Security-Policy`, and the rule holds each one to the **whole**
directive set in `CSP_DIRECTIVES`, by name and by source, hashes excluded. Per
page, for the reason `robots` is per page. The clean path prints `2 page(s), every
one policed to 7 pinned CSP directive(s), connect-src 'self'`. **The set is
closed**: a directive outside it fails too, because a specific fetch directive
overrides `default-src` for its own resource type. Six `csp` defects planted in
G20, each firing that rule alone, and two more under `headers`, one per framing
control; three existing fixtures needed the meta tag added or they double-fired,
which is the maintenance cost of every rule that reads the built HTML.

⚠️ **The first version pinned two directives and left four deletable**, and review
caught it: `default-src 'none'`, `img-src`, `base-uri` and `form-action` could
each have been dropped from `astro.config.mjs` with every gate green and the page
pixel-identical, while `_headers` and ADR-0065 went on describing the policy they
no longer had. **That is the issue's own failure shape inside the commit closing
it** — and it recurred twice more: in this very entry, which described the narrow
rule and quoted an observation string the code had stopped printing; and one
level out, where the rule walked its own list and never looked at what *else* the
policy declared, so `script-src-elem` — which takes precedence over `script-src`
for `<script>` elements — would have widened it with every pinned directive still
exactly right. **Three passes, and each one found that checking the named thing
had missed the unnamed one.**

⚠️ **The policy is a generated `<meta http-equiv>`, not a header** — Astro
computes `style-src` hashes per page, and `/attribution` carries an inline
`<style>` the index does not, so a hand-written copy in `_headers` is wrong for
one page the day it is written and wrong for both the day a stylesheet crosses
Astro's 4kB threshold. The rule therefore reads `dist/**/*.html`, and
`pnpm smoke:render` — real Chrome, real HTTP — enforces the policy for free,
which a `_headers` policy could never be, since Cloudflare Pages is the only
thing that reads that file. `frame-ancestors` cannot ride in a meta tag, so
`_headers` carries it as a policy of one directive beside `X-Frame-Options: DENY`
— **disjoint from the generated policy rather than a second copy of it**, which is
why a fuller header policy was refused; both framing controls are asserted.

⚠️ **`script-src` names `https://static.cloudflareinsights.com`**, and the
reasoning is in the log entry below rather than here: the live zone injects a Web
Analytics beacon this repo does not contain, and the beacon reports
**same-origin**, so `connect-src` was never the question. Refusing it is a real
choice and not a no-op — the analytics would stop — but it is a policy file
overriding a zone setting for no privacy gain, and the dashboard is where that
belongs. Pinned as a set so a second third-party origin cannot arrive unnoticed.

### Phase 4 evidence

`stacks import audible <export>` against a real Libation export: 22 records, 17
added, 5 correctly matched against books already shelved — two of them separated
only by a *long* subtitle, which needed a dedupe fix first. Re-running added 0
and skipped 22, so the import is idempotent. The vault now holds 25 books, every
one with cover art.

The source is Audible/Libation rather than the brief's Audiobookshelf; see
[ADR-0021](./adr/0021-audible-via-libation.md) for why. `importBooks` is source-agnostic — an ABS importer would
need only a new mapper.

## Environment findings

| Finding | Status |
| --- | --- |
| Node / pnpm / git | ✅ Node 24.14.1, pnpm 11.18.0, git 2.55.0 (Windows) |
| `@stacks/core` resolves under tsx + vitest + astro/tsc | ✅ verified |
| Headless Chrome for Phase 2 | ✅ system Chrome present; use `channel: 'chrome'`, no download |
| `.astro` files are NOT typechecked | ⚠️ keep logic in `.ts`. `astro check` **could not run at all** under TS 7; since [ADR-0066](./adr/0066-typescript-6-until-7-1.md) it runs and is simply not wired in — measured 6.2s over 44 files, finding one real pre-existing error. Whether it becomes a gate row is open |
| **`node -e` with ESM top-level await exits silently** | ⚠️ prints nothing, exit 0. Put scripts in a file and run with `pnpm tsx` |
| **Bash tool sandbox blocks network** | ⚠️ outbound `fetch` needs `dangerouslyDisableSandbox` |
| **A worktree cut by anything but `pnpm worktree` has no `node_modules`** | ⚠️ an agent harness makes its own under `.claude/worktrees/` with a bare `git worktree add`, so every command fails with `'tsx' is not recognized`, which reads as a broken toolchain rather than a missing install. `pnpm install` in it first — that step, and printing which `.env` it reads, is the whole reason `pnpm worktree` exists |
| Google Books unauthenticated | ⚠️ 429s on a shared quota — a bonus, never a dependable fallback |
| **Fixture-capture scripts need the key in the *environment*** | ⚠️ `capture-lookup-recall.ts` read `process.env` without `loadEnv()`, so with the key only in `.env` it recorded a corpus of 429s and G26 went green against it. Fixed; the class is not — check any capture script's env before trusting what it wrote. See [`gates.md`](gates.md) |
| **Zone bot protection can refuse the deploy check** | ⚠️ see below — the deploy still works, the *verification* does not |
| **The scripts echo the commands they run** | ℹ️ since G24 — `gate:public` gained two `$ pnpm …` lines, `pnpm worktree` one. Nothing asserts on that stdout; checked |
| **Stryker's default plugin glob loads nothing under pnpm** | ⚠️ both packages install and symlink correctly and the child runner process still reports *"no TestRunner plugins were loaded"*. Name the plugin: `plugins: ["@stryker-mutator/vitest-runner"]`. See [`spec/mutation-scoring.md`](./spec/mutation-scoring.md) §1 |
| **TypeScript 7 broke Stryker twice, and one of them was invisible to a grep** | ℹ️ **history since [ADR-0066](./adr/0066-typescript-6-until-7-1.md) put the repo on 6.0.3** — kept because it is what the two workarounds were for, and what returns if the pin ever moves back. `@stryker-mutator/typescript-checker`'s peer range `">=3.6"` admits `7.0.2` and then fails at runtime, so it was not installed. Separately `@stryker-mutator/core`'s `ts-config-preprocessor.js` does a **dynamic** `await import('typescript')` and calls `ts.parseConfigFileTextToJson`, which TS 7 does not have — worked around by pointing `tsconfigFile` at a filename not in the project. ⚠️ **On 6.0.3 that second workaround inverts**: the function exists again, so an absent tsconfig is no longer harmless but a checker that cannot start. `tsconfigFile` is back to the real `tsconfig.json`; `checkers` stays `[]` **by decision now, not impossibility** |
| **`process.chdir()` does not exist in a worker thread** | ⚠️ Stryker's vitest-runner hardcodes `pool: 'threads'`, and `packages/cli/src/env.test.ts` calls `chdir` ten times — so any mutation scope wide enough to pull that spec in dies at the **dry** run, before a single mutant. `vitest.stryker.config.ts` drops the one spec |
| **A worktree installed with `pnpm add -w` alone has no `packages/site/node_modules`** | ⚠️ `pnpm install` in the worktree — `astro` and `three` are the *site package's* dependencies, so a root-only install leaves the toolchain looking fine and three things broken. **Measured** by moving that folder aside: `pnpm test` fails **8 spec files** (every one that imports `three`, 131 tests never run), `pnpm build` dies at `Cannot find module 'three'`, and Stryker's sandbox fails with *"Failed to load tsconfig 'astro/tsconfigs/strict'"*. **Stryker's is the one that misleads** — the other two name the missing module and this one names a tsconfig |
| **A Stryker run that crashes leaves its sandbox behind** | ℹ️ `cleanTempDir: true` cleans after a run that *completes*; the two failed runs on 2026-08-18 each left a 3 MB `.stryker-tmp/sandbox-*`. Gitignored, so nothing notices — delete by hand. **It cannot pollute `pnpm test`**, measured by planting specs in a fake sandbox: `vitest.config.ts`'s includes are anchored at `packages/` and `gates/`, and a leftover sits under `.stryker-tmp/` |
| **`promtool` rejects a naive concatenation of two `.prom` files, and it is the whole file that dies** | ⚠️ `# EOF` terminates an OpenMetrics document, so a second document after it is *"unexpected data after # EOF"* and **no block is written at all** — not a partial ingest. `docs/spec/trend-layer.md` §1 says `trend:sync` *"concatenates the files newer than what is stored"*, which is that exact shape. **Measured 2026-08-19** against `prom/prometheus:latest`: one record ingests (4 series); two joined naively fail; the same two with `# EOF` stripped from all but the last ingest as **two blocks**, timestamps intact. That is the join `trend:sync` has to do ([#158](https://github.com/mephistopheles4/stacks/issues/158)) |
| **CRLF anywhere in a `.prom` file is a parse error** | ⚠️ *"invalid metric type \"gauge\r\""* — met by concatenating the records with PowerShell's `Set-Content`, not by the emitter, which writes a bare LF. Worth knowing before anything on Windows touches the record |
| **Actions minutes are free here, and the 3,000/month figure does not apply** | ℹ️ `mephistopheles4/stacks` is **public**, and GitHub Actions on **standard** runners in a public repository is free with no minute quota — the 3,000 is the *private*-repo allowance on Pro. Both jobs use `ubuntu-latest`, which is standard. ⚠️ **This is a property of the repository's visibility, not of the workflow**: make the repo private and the nightly costs ~750 min/month, a quarter of that allowance, at which point the cadence becomes a real decision rather than a free one. `mutation-run-runtime` is the series that would price it |
| **A GitHub Actions `schedule:` only ever fires from the default branch** | ℹ️ so `.github/workflows/metrics.yml`'s nightly, and `workflow_dispatch` on it, cannot be observed from a pull-request branch at all — the file has to be on `main` first. The emitter half is fully testable locally and was; the workflow half is observed after merge, by dispatch. Written down because "the workflow is untested" and "the workflow cannot be tested here" look identical in a PR |
| **`git checkout -- <path>` on a file only the working tree has is a no-op, and on a tracked one it discards uncommitted work** | ⚠️ cost a restore of `docs/gates.md` mid-session: reverting a planted defect took the real edits with it, because the plant and the work were both uncommitted. Commit before planting. The pathspec error for the untracked file was printed and scrolled past |
| **`promtool` comes out of the Prometheus image, and needs `--entrypoint`** | ℹ️ the image's entrypoint is `prometheus`, so the backfill is `docker run --rm --entrypoint promtool prom/prometheus:<tag> tsdb create-blocks-from openmetrics …`. `pnpm trend:sync` takes both halves from one pinned tag on purpose ([ADR-0058](./adr/0058-the-trend-store-is-a-container.md)) — a `promtool` that disagrees with the server about block format fails as *the sync worked and the dashboard is empty*. ⚠️ **Set `--storage.tsdb.retention.time` too**: the default is 15 days and would delete a fourteen-day replay hours after it landed |
| **A Cloudflare `HEAD` for a path this build does not have answers 200 with no `content-length`** | ⚠️ measured 2026-08-19 against the live origin: not a 404, and no size header. The cover comparison read that as `served === 0` and reported the cover stale — **pre-existing in `deploy:site`**, surfaced by the move into `lib/edge-probe.ts`, and now closed with a **third outcome**: such covers come back `uncomparable`, counted and named, never as zero bytes and never silently dropped. See [the log](./log/2026-08-19-the-reading-half-lands-and-a-count-that-said-three.md) |
| Resolved versions | TS **6.0.3, pinned exactly** since [ADR-0066](./adr/0066-typescript-6-until-7-1.md) — was 7.0.2 · Vitest 4 · Astro 7.1.6 · three 0.185.1 · sharp 0.35 · Stryker 9.6.1 (pinned exactly) · Prometheus 2.55.1 (the trend store's image) |

### The deploy check could not read the site

**2026-08-03.** `deploy:site` uploaded correctly and then could not confirm what
the site was serving, because the zone answered every automated request with a
Cloudflare challenge — `403`, `Cf-Mitigated: challenge`. Cleared by allowing
"definitely automated" traffic; the check reads the site again. The code that
came out of it is [ADR-0027](./adr/0027-deploy-check-reports-refusal.md), and it
is deliberately not specific to any of this.

Four things worth keeping, none of which are guessable from the symptom:

- **Images were exempt, so the loud part of the output stayed green.** A run
  makes one HTML request and thirty-odd cover requests; only the HTML one was
  challenged. `.json` was challenged too, `.png` and `.jpg` were not.
- **It failed in the vocabulary of its own false positive.** The refusal
  surfaced as "serving a build with no stamp", which reads exactly like the edge
  propagation delay the check is built to wait out — so it looked like something
  to ignore. That is why it went unnoticed, and why the fix was to make the
  check distinguish the two rather than to change any setting.
- **A DNS change the day before was the obvious suspect and was not the cause.**
  `stacks.aymandiab.com` resolves to the same edge addresses as the root domain
  rather than the Pages range, so it is proxied through the zone — which is what
  makes zone rules apply at all, and is the necessary condition. But that was
  already true: `deploy.ts` records that the zone overrides this build's
  `Cache-Control`, which only happens through a proxy, and this file records
  `X-Robots-Tag` being read off a live response, which a challenge would have
  prevented. A setting changed, not the routing.
- **Only the zone can date it.** Security → Events names the service that
  mitigated a given request, and the account Audit Log says who changed what and
  when. Nothing in this repository can see either — the same blind spot as the
  zone's cache TTL.

## The log

One line per episode, newest last. The narrative lives in [`log/`](./log/) —
one file per investigation, which is what "index, not a narrative" above has
always asked for and what this file stopped being at about 400 lines.

Dates are when the entry first appeared in this file, per `git log`. Three
episodes were written up out of sequence; they are listed by date here, so
"newest last" is true of the list rather than merely claimed by it.

- 2026-07-31 — [Since the phase gates](./log/2026-07-31-since-the-phase-gates.md)
- 2026-07-31 — [Phase A — invariant scoreboard](./log/2026-07-31-phase-a-invariant-scoreboard.md) — **three items still open**
- 2026-08-01 — [The mobile crash — G15](./log/2026-08-01-the-mobile-crash-g15.md) — closed; the longest thread here
- 2026-08-01 — [Worktrees, and the deploy guard that follows from them](./log/2026-08-01-worktrees-and-the-deploy-guard-that-follows-from-them.md)
- 2026-08-03 — [A test had been calling the internet for months — G21](./log/2026-08-03-a-test-had-been-calling-the-internet-for-months-g21.md)
- 2026-08-03 — [Cover acquisition — G22](./log/2026-08-03-cover-acquisition-g22.md)
- 2026-08-03 — [One helper, six copies, three names — G23](./log/2026-08-03-one-helper-six-copies-three-names-g23.md)
- 2026-08-03 — [Shelf placement got an interface — no gate](./log/2026-08-03-shelf-placement-got-an-interface-no-gate.md)
- 2026-08-04 — [The probes became a tuning panel — map #39](./log/2026-08-04-the-probes-became-a-tuning-panel-map-39.md)
- 2026-08-04 — [The logo](./log/2026-08-04-the-logo.md)
- 2026-08-06 — [The lookup was refusing books the providers were holding](./log/2026-08-06-the-lookup-was-refusing-books-the-providers-were-holding.md)
- 2026-08-06 — [The same command was also reporting on fewer books than it counted](./log/2026-08-06-the-same-command-was-also-reporting-on-fewer-books-than-it.md)
- 2026-08-06 — [Books that read as books — map #50 built](./log/2026-08-06-books-that-read-as-books-map-50-built.md)
- 2026-08-06 — [The head corner, closed — four faults, one camera](./log/2026-08-06-the-head-corner-closed-four-faults-one-camera.md)
- 2026-08-08 — [The update that reported success and changed nothing](./log/2026-08-08-the-update-that-reported-success-and-changed-nothing.md)
- 2026-08-08 — [The gaps the owner had always noticed](./log/2026-08-08-the-gaps-the-owner-had-always-noticed.md)
- 2026-08-08 — [The collisions, and the gate that can finally see them](./log/2026-08-08-the-collisions-and-the-gate-that-can-finally-see-them.md)
- 2026-08-09 — [The packer was estimating, and the estimate cost a book a row](./log/2026-08-09-the-packer-was-estimating-and-the-estimate-cost-a-book.md) — map [#78](https://github.com/mephistopheles4/stacks/issues/78), now closed
- 2026-08-09 — [CodeQL became a second required gate, and one of its twelve was real](./log/2026-08-09-codeql-became-a-second-required-gate.md)
- 2026-08-10 — [The artifacts were ours, and the cover finally has somewhere to be looked at](./log/2026-08-10-the-artifacts-were-ours.md) — the staging re-encode was subsampling chroma on 33 of 43 covers; plus the enlarged-cover dialog, and why O'Reilly still has no link
- 2026-08-19 — [The first nightly caught its own author](./log/2026-08-19-the-first-nightly-caught-its-own-author.md) — the trend layer's first four-series row moved one scope 6.45 points, on a false comment in the pull request that built it. Five scopes reproduced exactly; two moved without a source change, which is the tool-noise band measured for the first time
- 2026-08-19 — [The reading half lands, and a count that said three](./log/2026-08-19-the-reading-half-lands-and-a-count-that-said-three.md) — `pnpm trend:sync` replayed nine committed records into a local Prometheus and got the first nightly's figures back to the digit; surface D folded in, writing to the local store only. The spec's four-series / three-bounded discrepancy resolved, and a pre-existing blind spot found in the cover check
- 2026-08-19 — [The page lands, and the store was somebody else's](./log/2026-08-19-the-page-lands-and-the-store-was-somebody-elses.md) — the trend layer's dashboard, provisioned from the repo so the panel order is a diff. ⚠️ The sync had been writing blocks into this checkout while Prometheus served **another worktree's** store: `imported 11 record(s)` against a store answering for nine. The PR window turned out to have no producer anywhere in the rollout, and one wrong explanation was written, tested and reverted before the right one was measured
- 2026-08-19 — [The constitution leaves CLAUDE.md](./log/2026-08-19-the-constitution-leaves-claude-md.md) — the rules moved to `AGENTS.md` and `CLAUDE.md` became a one-line import; three gates observed red in two distinct states, only one of which the ticket predicted. ⚠️ The import itself is still unobserved: `/context` is owed by a human, and `G29` stayed green throughout while eight links pointed at a file with no invariants left in it
- 2026-08-19 — [The deploy reads the record, and the exit code proved nothing](./log/2026-08-19-the-deploy-reads-the-record-and-refuses-per-series.md) — G39 (`metrics-freshness`) lands: the panel, the per-series refusal, and the one fetch that splits *you have not synced* from *the nightly stopped*. The gate passed ten of ten against a plant that deleted the refusal, because the harness's sentinel is itself a refusal; also why the disambiguating fetch writes a second ref, and why the panel's subject is the newest **scored** run
- 2026-08-19 — [The ratchet lands disarmed, and the guard that would have taught the wrong lesson](./log/2026-08-19-the-ratchet-lands-disarmed.md) — G43 (`ignored-mutants`), the floors file, and the four deploy refusals with no override. ⚠️ The config-hash guard **would have refused the first deploy after landing**, because every record on the branch predates the stamp — the exact *teach them how to get past it* failure the no-override decision exists to prevent; it now refuses only once something is armed, and the derivation is what actually shuts that route. ⚠️ **A review names an instance; the repair must cover the class** — four times in one day a fix was scoped to the example a reviewer gave and the twin was found later by somebody else; the query for the rest of the class is almost always one command. ⚠️ **Nobody finds their own defects by re-reading** — every self-found defect across the three branches came from *executing* (planting one, running a refusal by hand, pointing a check at real data), and every defect found by reading was found by somebody else. **Review substitutes for the reading, not for the running.** A plant table inherits its author's picture of the file, so it asks for the wrong value and never the right value in an unexpected shape. ⚠️ Also: `git reset --soft <branch-name>` to squash **silently reverted eleven lines of a neighbouring ticket's work** — a soft reset re-parents onto a tip that moved, and the reverted lines were prose, so nothing could have gone red. ⚠️ The merge half of `metrics.yml` scores nothing, so counting its records would have left every scope with a hole and unarmable forever. Also: a `const` in the temporal dead zone that no test could see, and why the counter must match a comment rather than the words
- 2026-08-20 — [The register gate found a row nobody triaged](./log/2026-08-20-the-register-gate-found-a-row-nobody-triaged.md) — G40 `action-pins`, G41 `gate-register` and G42 `dependency-audit` in one commit. ⚠️ `gate-register`'s **first red was not planted**: `agents-import` (G37) had landed out-of-band with no register entry, 37 entries against 38 rows, and nothing could have noticed before. Three spec claims about the tree measured false — the row numbers, the one-row exemption that is ten, and *exactly one disposition* that the file falsifies 19 times
- 2026-08-22 — [The summary that grew a byte per mutant, and the gate that was reading a clock](./log/2026-08-22-the-summary-that-grew-a-byte-per-mutant.md) — the nightly went red on **two independent faults on one night**, and the reported one was not why. ⚠️ **G17 had been standing on the dated bootstrap**: it drives the real deploy at a scratch repository, step 0b was inserted between the branch guard and its sentinel, a scratch repository holds no records, and the exemption expired on a calendar day — four assertions green for three days, then red on `main`, on every open pull request and on the nightly, at a commit whose only changes were documentation. G39's own docblock had closed that exact trap on G39's row three days earlier. **That half is [#209](https://github.com/mephistopheles4/stacks/pull/209)'s**, reached independently by two sessions within the hour — which the tracker cannot prevent, because every session here authenticates as one account. ⚠️ Separately, **Vitest's `github-actions` reporter appends to `$GITHUB_STEP_SUMMARY` once per `onTestRunEnd`** — once under `pnpm test`, once **per mutant** under Stryker: 923 bytes over four mutants, **1054k over ~5900**, past GitHub's 1024k. Invisible locally, because `GITHUB_ACTIONS` is unset on a laptop and the reporter is never added. G44 (`stryker-reporters`) is the row
- 2026-08-22 — [The CSP lands, and the site was already loading somebody else's script](./log/2026-08-22-the-csp-and-the-beacon-that-was-already-there.md) — [#127](https://github.com/mephistopheles4/stacks/issues/127)'s `csp` rule joins `PUBLIC_BUILD_RULES`; no new gate row, G20's observed-red obligation discharged by joining the roster. ⚠️ **Two of the issue's own premises were false when it was written.** The shelf's "perfect same-origin record" is a property of the *repository*: the live origin serves a second `<script>` — Cloudflare Web Analytics, injected at the edge, on both pages, present in no file here — findable only by asking the origin, never by grep. The first instinct, *block it to enforce #119*, was wrong twice: the injected beacon reports **same-origin** to `/cdn-cgi/rum`, so `connect-src 'self'` was never in tension with it; and #119 rejected a beacon *stacks would build*, its own correction already accepting that edge-injected markup is observed by nothing. ⚠️ **And "blocking removes nothing" — written into five documents before review caught it — is false**: the browser refuses the script and the analytics stop. The argument that holds is narrower: blocking is a policy file overriding a zone setting for no privacy gain, since the beacon reports same-origin and carries nothing derived from the owner's reading. ⚠️ **Reading #127's one-clause compression of #119 instead of #119 produced a confident wrong recommendation.** The policy is a generated per-page `<meta http-equiv>` rather than a hand-written header, because Astro's 4kB inlining threshold means two pages of one build need different `style-src` hashes ([ADR-0065](./adr/0065-the-csp-is-generated-not-written.md)) — and `smoke:render` therefore enforces it for free, which no `_headers` policy could ever be. Also: the security headers were keyed `/`, so `/attribution` was answering Cloudflare's default `Referrer-Policy`, the robots rule's own history repeating
- 2026-08-22 — [The reading surface, and a count printed under somebody else's commit](./log/2026-08-22-the-reading-surface-and-a-count-under-somebody-elses-commit.md) — the print block and the four panels for the complexity series ([#203](https://github.com/mephistopheles4/stacks/issues/203)), on #202's record. ⚠️ **The block anchored on a different record from the one panel 1 names** — `deltaPair` takes the newest *carrier* and panel 1 the newest *scored* run, which are different records on a busy week, so a merge's counts printed under a nightly's commit. Every spec passed while it did: they asserted substrings of the rows, and the wrong line was the one above them. Found by rendering it against eight realistic scopes and reading the output. ⚠️ The `trend:sync` observation **covers the rendering and not the record**: all four panels resolve eight scope-labelled series through Grafana's own provisioned datasource, but the three complexity records were emitted locally into the gitignored `.trend/local` — real counts over the real tree, chosen clock, and **the `metrics` branch was not touched**. That half closes on #202's first CI record
- 2026-08-22 — [Coverage comes back as an ingredient, and the report wrote a null where a column should be](./log/2026-08-22-coverage-comes-back-as-an-ingredient.md) — `@vitest/coverage-v8` enters the repo for one consumer, an opt-in pre-commit CRAP print, with `coverage.include` **derived** from `stryker.scopes.json` so the claim cannot go stale unwatched. ⚠️ **Twenty green tests against planted reports missed a defect the first real report showed in a second**: every `loc.end` the V8 provider writes carries `"column": null`, read as column 0, dropping every statement on a function's closing line — coverage low and CRAP high, worst for the longest functions, which is what the table sorts to the top. ⚠️ `--passWithNoTests` is load-bearing: without it a commit adding a file no spec imports prints a diagnostic instead of the maximal-CRAP row it exists for. G1 (`adapter-boundary`) failed the runner by name and was right. `pnpm test` unchanged at 12.1s; the hook is 3.0s on a three-file commit
- 2026-08-23 — [The terrain for `astro check`, measured while the gate is still blocked](./log/2026-08-23-the-terrain-for-astro-check.md) — [#257](https://github.com/mephistopheles4/stacks/issues/257) is hard-blocked by [#250](https://github.com/mephistopheles4/stacks/issues/250), so the half that does not need the block cleared was done instead: baseline confirmed at one error over 44 files, and #238's plant re-run so the Observed-red line is gathered under this ticket. ⚠️ **The plant ships to two meta tags, not the one #238 recorded** — `og:image` and `twitter:image` both read the same binding. ⚠️ **`.astro` is outside the mutation and complexity scopes by one list, not two**: `complexity.ts`'s `populationOf` reads `stryker.scopes.json`'s globs, so the two counters miss it once rather than independently — and `site-meta.ts`, the module the plant actually corrupts, is an *excluded directory* in that same file, so the bad value crossed from an unscored `.astro` file into an unscored `.ts` file. ⚠️ **`docs/spec/supply-chain.md`'s specimen moves rather than closing**: installing `@astrojs/check` falsifies its *"not a dependency at any version"* clause without settling the TS 7 claim, because the repo is pinned to TS 6 — but the package's own `peerDependencies: { typescript: '^5.0.0 || ^6.0.0' }` is the first in-repository evidence that sentence has ever had, **and it couples this gate to ADR-0066's revisit condition**. Twelve addresses carry a claim the landing commit falsifies; the log lists all of them. Nothing is wired and no dependency is committed

## Notes to the next session

All five phases are green and tagged. The tool runs against the owner's real
vault, not only fixtures.

If you pick this up:

- Run `pnpm test && pnpm build && pnpm smoke:render && pnpm gate:public` first.
  Those four are the contract; if they are green the project is where this file
  says it is.
- **Both gates stage their own fixture vault into `packages/site/public/`.**
  Running them while `pnpm dev:watch` is up swaps the live site to fixture data
  until the next vault edit. Rebuild with
  `pnpm stacks build --public --assets packages/site/public`.
- **Verify covers by eye, not by counting.** Sixteen were swapped for print
  editions once; eleven were right and five were wrong — three were a
  placeholder graphic and two were a different book — and nothing in the counts
  distinguished them. A contact sheet did.
- Configuration lives in `.env` (gitignored): `STACKS_VAULT`, and
  `GOOGLE_BOOKS_API_KEY` without which Google Books 429s on a shared quota.
  There is exactly one, in the main checkout, and every worktree reads it.
- Still open: whether the print and audiobook editions of one title should
  collapse into a single spine. They currently render as two.
- Everything in `fixtures/` is invented. No copyrighted material, ever — see
  `plan.md` §1.
