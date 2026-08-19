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
| **Last green gate** | G36 (`trend-layer`) — the series CI writes ↔ `docs/gates.md`'s new `## Trends` table. First row of the after-the-scoreboard rollout |
| **Trend layer** | **live.** `.github/workflows/metrics.yml` writes one `.prom` per run to the orphan **`metrics`** branch — `git fetch origin metrics` to read it. Its first nightly found a scope 6.45 points down on a false comment in the PR that built it; see [the log](./log/2026-08-19-the-first-nightly-caught-its-own-author.md). `pnpm trend:sync`, the reading half, is **not built** |
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
| `.astro` files are NOT typechecked | ⚠️ `astro check` can't run under TS 7 — keep logic in `.ts` |
| **`node -e` with ESM top-level await exits silently** | ⚠️ prints nothing, exit 0. Put scripts in a file and run with `pnpm tsx` |
| **Bash tool sandbox blocks network** | ⚠️ outbound `fetch` needs `dangerouslyDisableSandbox` |
| **A worktree cut by anything but `pnpm worktree` has no `node_modules`** | ⚠️ an agent harness makes its own under `.claude/worktrees/` with a bare `git worktree add`, so every command fails with `'tsx' is not recognized`, which reads as a broken toolchain rather than a missing install. `pnpm install` in it first — that step, and printing which `.env` it reads, is the whole reason `pnpm worktree` exists |
| Google Books unauthenticated | ⚠️ 429s on a shared quota — a bonus, never a dependable fallback |
| **Fixture-capture scripts need the key in the *environment*** | ⚠️ `capture-lookup-recall.ts` read `process.env` without `loadEnv()`, so with the key only in `.env` it recorded a corpus of 429s and G26 went green against it. Fixed; the class is not — check any capture script's env before trusting what it wrote. See [`gates.md`](gates.md) |
| **Zone bot protection can refuse the deploy check** | ⚠️ see below — the deploy still works, the *verification* does not |
| **The scripts echo the commands they run** | ℹ️ since G24 — `gate:public` gained two `$ pnpm …` lines, `pnpm worktree` one. Nothing asserts on that stdout; checked |
| **Stryker's default plugin glob loads nothing under pnpm** | ⚠️ both packages install and symlink correctly and the child runner process still reports *"no TestRunner plugins were loaded"*. Name the plugin: `plugins: ["@stryker-mutator/vitest-runner"]`. See [`spec/mutation-scoring.md`](./spec/mutation-scoring.md) §1 |
| **TypeScript 7 breaks Stryker twice, and one of them is invisible to a grep** | ⚠️ `@stryker-mutator/typescript-checker`'s peer range `">=3.6"` admits `7.0.2` and then fails at runtime, so it is not installed and `checkers: []`. Separately `@stryker-mutator/core`'s `ts-config-preprocessor.js` does a **dynamic** `await import('typescript')` and calls `ts.parseConfigFileTextToJson`, which TS 7 does not have — worked around by pointing `tsconfigFile` at a filename not in the project |
| **`process.chdir()` does not exist in a worker thread** | ⚠️ Stryker's vitest-runner hardcodes `pool: 'threads'`, and `packages/cli/src/env.test.ts` calls `chdir` ten times — so any mutation scope wide enough to pull that spec in dies at the **dry** run, before a single mutant. `vitest.stryker.config.ts` drops the one spec |
| **A worktree installed with `pnpm add -w` alone has no `packages/site/node_modules`** | ⚠️ `pnpm install` in the worktree — `astro` and `three` are the *site package's* dependencies, so a root-only install leaves the toolchain looking fine and three things broken. **Measured** by moving that folder aside: `pnpm test` fails **8 spec files** (every one that imports `three`, 131 tests never run), `pnpm build` dies at `Cannot find module 'three'`, and Stryker's sandbox fails with *"Failed to load tsconfig 'astro/tsconfigs/strict'"*. **Stryker's is the one that misleads** — the other two name the missing module and this one names a tsconfig |
| **A Stryker run that crashes leaves its sandbox behind** | ℹ️ `cleanTempDir: true` cleans after a run that *completes*; the two failed runs on 2026-08-18 each left a 3 MB `.stryker-tmp/sandbox-*`. Gitignored, so nothing notices — delete by hand. **It cannot pollute `pnpm test`**, measured by planting specs in a fake sandbox: `vitest.config.ts`'s includes are anchored at `packages/` and `gates/`, and a leftover sits under `.stryker-tmp/` |
| **`promtool` rejects a naive concatenation of two `.prom` files, and it is the whole file that dies** | ⚠️ `# EOF` terminates an OpenMetrics document, so a second document after it is *"unexpected data after # EOF"* and **no block is written at all** — not a partial ingest. `docs/spec/trend-layer.md` §1 says `trend:sync` *"concatenates the files newer than what is stored"*, which is that exact shape. **Measured 2026-08-19** against `prom/prometheus:latest`: one record ingests (4 series); two joined naively fail; the same two with `# EOF` stripped from all but the last ingest as **two blocks**, timestamps intact. That is the join `trend:sync` has to do ([#158](https://github.com/mephistopheles4/stacks/issues/158)) |
| **CRLF anywhere in a `.prom` file is a parse error** | ⚠️ *"invalid metric type \"gauge\r\""* — met by concatenating the records with PowerShell's `Set-Content`, not by the emitter, which writes a bare LF. Worth knowing before anything on Windows touches the record |
| **Actions minutes are free here, and the 3,000/month figure does not apply** | ℹ️ `mephistopheles4/stacks` is **public**, and GitHub Actions on **standard** runners in a public repository is free with no minute quota — the 3,000 is the *private*-repo allowance on Pro. Both jobs use `ubuntu-latest`, which is standard. ⚠️ **This is a property of the repository's visibility, not of the workflow**: make the repo private and the nightly costs ~750 min/month, a quarter of that allowance, at which point the cadence becomes a real decision rather than a free one. `mutation-run-runtime` is the series that would price it |
| **A GitHub Actions `schedule:` only ever fires from the default branch** | ℹ️ so `.github/workflows/metrics.yml`'s nightly, and `workflow_dispatch` on it, cannot be observed from a pull-request branch at all — the file has to be on `main` first. The emitter half is fully testable locally and was; the workflow half is observed after merge, by dispatch. Written down because "the workflow is untested" and "the workflow cannot be tested here" look identical in a PR |
| **`git checkout -- <path>` on a file only the working tree has is a no-op, and on a tracked one it discards uncommitted work** | ⚠️ cost a restore of `docs/gates.md` mid-session: reverting a planted defect took the real edits with it, because the plant and the work were both uncommitted. Commit before planting. The pathspec error for the untracked file was printed and scrolled past |
| Resolved versions | TS 7.0.2 · Vitest 4 · Astro 7.1.6 · three 0.185.1 · sharp 0.35 · Stryker 9.6.1 (pinned exactly) |

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
