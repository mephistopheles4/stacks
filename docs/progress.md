# Progress

**Read this first.** It is the only file that says where the project actually is.

This is an **index, not a narrative**. Say what holds now, link the rest, and never restate the plan: what a phase does belongs in [`plan.md`](./plan.md). Update it in the **same commit** as the gate it describes.

**No live counts in Current state.** A book count is wrong again the next time anyone runs `stacks add`. Name the command that answers instead. Counts inside a dated record are measurements and stay as they are.

---

## Current state

All five phases are green and tagged (`phase-0` to `phase-4`). The tool runs against the owner's real vault, not fixtures. The gate scoreboard is [`gates.md`](./gates.md); the history this file used to carry is in [`log/2026-11-12-progress-before-the-cleanup.md`](./log/2026-11-12-progress-before-the-cleanup.md).

| | |
| --- | --- |
| **O'Reilly provider removed (#450), in review** | Lookups go Open Library, then Google, with Apple for covers only. `oreilly_ourn` and `cover_source: oreilly` stay as provenance on older notes and no provider writes them. A cover added by hand needs `cover_source: unknown` written by hand. [ADR-0147](./adr/0147-oreilly-is-removed.md); the spec is [revision 4 on #450](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728372984) |
| **Notice modals (#536), in review (PR #570)** | The Attribution link on the shelf and the Privacy link in the Ask drawer open their notice in one modal over the shelf; `/attribution` and `/privacy` stay as pages. The text exists once (`NoticeBody`, `AttributionNotice`, `PrivacyNotice`); the modal is `packages/site/src/notice/`. G35, G61 and G20's `privacy` rule read it; `scripts/phone-check.ts --notice <name>` is the owner's phone run. [ADR-0146](./adr/0146-the-notices-open-in-one-modal-over-the-shelf.md), [spec](./spec/notice-modals.md). Waiting on the owner: the phone run and the screenshot review |
| **Mutation dry run on every pull request (#558), draft** | G70 (`mutation-dry-run`): a `mutation-dry-run` job in `gates.yml` runs `pnpm exec stryker run --dryRunOnly` on every event and is listed in the `gates` aggregator. The structural gate (the issue's option 2) is not built and waits with the owner. [#558](https://github.com/mephistopheles4/stacks/issues/558) carries the record |
| **Optional Plausible (#562), built, not deployed** | `PUBLIC_PLAUSIBLE_DOMAIN`, read once by `astro.config.mjs`, turns Plausible on for a build; unset is today's site. One module, `packages/site/src/analytics/`, starts the tracker only on `stacks.aymandiab.com`, scrubs every URL to the seven campaign parameters, and sends `Book Picked Up`, `Book Opened` and `Ask Opened`. [ADR-0139](./adr/0139-optional-plausible-direct-to-plausible-io.md), [spec](./spec/optional-plausible.md). ⚠️ **Nothing is turned on:** the owner creates the Plausible site and its goals, sets the variable and deploys |
| **The closed book turns in your hand (#553), built, not deployed** | The closed rest a pickup lands on turns by a drag or the arrow keys. A back arrow by the title and "Close the book" at the foot of the page return an open book to it; the X sits at the top right; the hint hides over an open book. [ADR-0138](./adr/0138-the-closed-book-in-hand-turns-and-the-dialog-goes.md) |
| **A picked-up book arrives closed (#531), built, not deployed** | A click picks a book up and it stops closed and cover-on; a click on it or the Open button opens it; the put-back X is in the header. [ADR-0137](./adr/0137-a-picked-up-book-arrives-closed.md), [spec](./spec/picking-up-closed.md). ⚠️ **A green pull request does not cover it:** G61 skips pull requests, so the closed book on the Pixel is `main`'s push run and the owner's `phone-check.ts --pickups 5` and `--turn 60`. [The stop in the track](./log/2026-11-07-the-stop-in-the-pickup-track.md) |
| **Ask the library (#532), built, not deployed** | The Worker (`packages/ask`), the drawer (`packages/site/src/ask`), the shelf seam, the CSP's two Turnstile entries, `/privacy`, `infra/`, `deploy:ask`, `evals:ask` and G69 (`one-ai-call`) are built and green. The model searches with two tools ([ADR-0132](./adr/0132-the-model-searches-the-library-with-two-tools-and-the-catalogue-leaves-the-prompt.md)), remembers two exchanges ([ADR-0130](./adr/0130-the-page-remembers-two-exchanges-and-sends-them-in-the-user-message.md)) and runs on Workers Paid ([ADR-0133](./adr/0133-the-ask-worker-runs-on-workers-paid-and-the-spend-limit-is-its-only-cap.md)). Proved by throwaway-Worker runs on a test gateway (S12 of [the spec](./spec/ask-the-library.md)): C20, C24 and C30, and the offline halves of the rest by tests. **Not passed, because each needs the live deployed Worker:** C1, C2, C7, C13, C16's live part, C18 and C19's alert; open items are at the top of S12. Waiting on the owner: S13 steps 8 to 11. **The site must not go public until C7 passes** ([the probe](./log/2026-11-05-ask-the-library-live-probe.md)) |
| **Gates** | [`gates.md`](./gates.md) is the scoreboard, one row per rule, G1 to G71. A new row takes the next number at the tip you branch from: count the rows there and cite slug and number together, never the number alone. G46 (`lint`) overlaps G6 (`site-core-imports`) by decision, on the lint rules and not on a new row |
| **Trend layer** | Live. `.github/workflows/metrics.yml` writes one `.prom` per run to the orphan `metrics` branch (`git fetch origin metrics` to read it) and keeps its Stryker report as a 30-day artifact, with the per-scope table in the job summary; survivors are kept past 30 days as `survivors/<timestamp>-<sha>.jsonl` on the orphan `survivors` branch ([ADR-0117](./adr/0117-survivors-are-matched-by-content-and-recorded-on-their-own-orphan-branch.md), [spec](./spec/survivor-record.md)). `pnpm trend:sync` replays the branch into a local Prometheus and brings up the page at <http://localhost:3000/d/stacks-trend-layer>, provisioned from [`grafana/`](../grafana); it needs Docker, see [`commands.md`](./commands.md). Nothing is armed: arming a floor is a human judgement per series |
| **Deploy refusals on the floors** | `pnpm deploy:site` refuses on four things and **no flag clears any of them**: a breached floor, a declared scope with no entry, an entry naming no declared scope, and a run scored under a different configuration. A *different* hash refuses whatever is armed; a *missing* one waits for a scope to be armed ([ADR-0061](./adr/0061-the-mutation-floor-refuses-deploy.md), [`commands.md`](./commands.md)) |
| **Mobile crash** | Real-time shadows are the default ([ADR-0090](./adr/0090-real-time-shadows-are-the-default.md)). The Pixel 10 Pro XL loses its WebGL context when every book reads the shadow map and survives when only the bookcase's program reads it, in 2 draws at every library size, under PCF only ([ADR-0088](./adr/0088-one-program-samples-the-shadow-map-in-two-draws.md)). What kills it is not known, so G61 (`one-shadow-reader`) pins the configuration that survived, not survival. The band the books stopped receiving is painted onto each face-out cover ([the cover shade](./log/2026-09-24-the-cover-shade.md)). A context lost while sampling rebuilds the shelf painted and the device remembers it for 30 days ([ADR-0091](./adr/0091-a-lost-context-falls-back-to-painted-shadows.md)); on this phone a real loss blocks the page, so what works is the record on the next load. ⚠️ Measured on one phone and one driver; `scripts/phone-check.ts` is the check a phone runs |
| **Now working on** | `gh issue list` is the only current answer to what is open. Map [#366](https://github.com/mephistopheles4/stacks/issues/366), picking a book up ([spec](./spec/picking-a-book-up.md)), is built in four steps; what remains is step 4's first deploy and the owner's acceptance, on [#413](https://github.com/mephistopheles4/stacks/issues/413)'s first-deploy checklist |
| **Queued** | Whatever the closed maps left in fog: ask [#50](https://github.com/mephistopheles4/stacks/issues/50)'s and [#88](https://github.com/mephistopheles4/stacks/issues/88)'s *Not yet specified*. [#62](https://github.com/mephistopheles4/stacks/issues/62) left the owner three `stacks enrich` commands to run |
| **Decisions** | [`docs/adr/`](./adr/), one file each |
| **Repository** | [public](https://github.com/mephistopheles4/stacks); `main` protected: PR + `gates` + CodeQL, no bypass |
| **Blocked on** | nothing |
| **Deployed** | <https://stacks.aymandiab.com>, Cloudflare Pages, `pnpm deploy:site` |
| **Running against** | the owner's real vault, not fixtures; `pnpm stacks status` for the count |
| **Enriched** | `stacks enrich` has been run twice over the real vault. A pre-pass copy of the vault is at `../Obsidian/stacks-backup-pre-enrich`; see [`docs/spec/README.md`](./spec/README.md) for the merge's absent-only rule |

## Environment findings

| Finding | Status |
| --- | --- |
| Node / pnpm / git | ✅ Node 24.14.1, pnpm 11.18.0, git 2.55.0 (Windows) |
| `@stacks/core` resolves under tsx, vitest, astro and tsc | ✅ |
| Headless Chrome for Phase 2 | ✅ system Chrome; use `channel: 'chrome'`, no download |
| **`.astro` files are typechecked and counted by nothing** | `astro check` runs inside `pnpm build` as G50 (`astro-types`), `@astrojs/check@0.9.10` pinned exact on `packages/site` ([ADR-0077](./adr/0077-astro-check-is-the-checker-for-astro-files.md)). It needs TypeScript 6.0.3, pinned exactly ([ADR-0066](./adr/0066-typescript-6-until-7-1.md)); the pin's revisit at TS 7.1 un-runs it, and a G50 clause reads the pin. ⚠️ **Keep logic in `.ts`**: every mutation scope and every complexity population globs `*.ts`, so logic in an `.astro` file earns no score and no series |
| **`node -e` with ESM top-level await exits silently** | ⚠️ prints nothing, exit 0. Put scripts in a file and run with `pnpm tsx` |
| **The Bash tool sandbox blocks network** | ⚠️ outbound `fetch` needs `dangerouslyDisableSandbox` |
| **A worktree cut by anything but `pnpm worktree` has no `node_modules`** | ⚠️ every command fails with `'tsx' is not recognized`, which reads as a broken toolchain. Run `pnpm install` in it first. A root-only install (`pnpm add -w`) also leaves `packages/site/node_modules` missing: `astro` and `three` are the site package's dependencies, so `pnpm test` fails the 8 spec files that import `three`, `pnpm build` dies at `Cannot find module 'three'`, and Stryker's sandbox fails with *"Failed to load tsconfig 'astro/tsconfigs/strict'"*, which names a tsconfig and misleads |
| Google Books unauthenticated | ⚠️ 429s on a shared quota: a bonus, never a dependable fallback |
| **Open Library's bare `/api/books` answers 404; `/api/books.json` answers 200** | ⚠️ the docs still show the bare path. The 404 is silent (`HttpGet` returns `undefined` for it as for a miss), so every ISBN lookup would fall through to Google's fuzzy `q=isbn:`. [ADR-0093](./adr/0093-open-library-isbn-lookups-ask-api-books-json.md) |
| **Fixture-capture scripts need the key in the *environment*** | ⚠️ a script that reads `process.env` without `loadEnv()` records a corpus of 429s when the key is only in `.env`, and G26 goes green against it. Check any capture script's env before trusting what it wrote. See [`gates.md`](gates.md) |
| **Zone bot protection can refuse the deploy check** | ⚠️ see *The deploy check and the zone*, below: the deploy works, the *verification* does not |
| **The scripts echo the commands they run** | ℹ️ `gate:public` prints two `$ pnpm …` lines and `pnpm worktree` one. Nothing asserts on that stdout |
| **Stryker's default plugin glob loads nothing under pnpm** | ⚠️ the child runner reports *"no TestRunner plugins were loaded"*. Name the plugin: `plugins: ["@stryker-mutator/vitest-runner"]`. See [`spec/mutation-scoring.md`](./spec/mutation-scoring.md) §1 |
| **Stryker's TypeScript checker is not installed** | ℹ️ `@stryker-mutator/typescript-checker`'s peer range `">=3.6"` admits TypeScript 7.0.2 and then fails at runtime. `tsconfigFile` is the real `tsconfig.json`; `checkers` stays `[]` by decision ([ADR-0066](./adr/0066-typescript-6-until-7-1.md)). On TS 7 a tsconfig filename not in the project had been the workaround for `@stryker-mutator/core`'s dynamic `import('typescript')`, which calls `ts.parseConfigFileTextToJson`; on 6.0.3 that function exists again and an absent tsconfig is a checker that cannot start |
| **`process.chdir()` does not exist in a worker thread** | ⚠️ Stryker's vitest-runner hardcodes `pool: 'threads'`, and `packages/cli/src/env.test.ts` calls `chdir` ten times, so any mutation scope wide enough to pull that spec in dies at the **dry** run. `vitest.stryker.config.ts` drops the one spec |
| **A Stryker run that crashes leaves its sandbox behind** | ℹ️ `cleanTempDir: true` cleans after a run that *completes*; a failed one leaves a 3 MB `.stryker-tmp/sandbox-*`. Gitignored, so nothing notices: delete it by hand. It cannot pollute `pnpm test`: `vitest.config.ts`'s includes are anchored at `packages/` and `gates/` |
| **`promtool` rejects a naive concatenation of two `.prom` files, and the whole file dies** | ⚠️ `# EOF` terminates an OpenMetrics document, so a second document after it is *"unexpected data after # EOF"* and **no block is written**. Strip `# EOF` from all but the last file and the blocks ingest with timestamps intact; that is the join `trend:sync` does ([#158](https://github.com/mephistopheles4/stacks/issues/158)) |
| **CRLF anywhere in a `.prom` file is a parse error** | ⚠️ *"invalid metric type \"gauge\r\""*, met by concatenating records with PowerShell's `Set-Content`. The emitter writes a bare LF |
| **`promtool` comes out of the Prometheus image, and needs `--entrypoint`** | ℹ️ the image's entrypoint is `prometheus`, so the backfill is `docker run --rm --entrypoint promtool prom/prometheus:<tag> tsdb create-blocks-from openmetrics …`. `pnpm trend:sync` takes both halves from one pinned tag on purpose ([ADR-0058](./adr/0058-the-trend-store-is-a-container.md)): a `promtool` that disagrees with the server about block format fails as *the sync worked and the dashboard is empty*. ⚠️ Set `--storage.tsdb.retention.time` too: the default is 15 days and would delete a fourteen-day replay hours after it landed |
| **Actions minutes are free here** | ℹ️ `mephistopheles4/stacks` is public, and Actions on standard runners in a public repository has no minute quota. ⚠️ That is a property of the repository's visibility: made private, the nightly costs ~750 min/month against the 3,000 allowance on Pro, and the cadence becomes a real decision. `mutation-run-runtime` is the series that would price it |
| **A GitHub Actions `schedule:` only fires from the default branch** | ℹ️ `.github/workflows/metrics.yml`'s nightly, and `workflow_dispatch` on it, cannot be observed from a pull-request branch: the file has to be on `main` first. The emitter half is testable locally; the workflow half is observed after merge, by dispatch |
| **A check that only executes on `main` is a check no pull request can prove** | ⚠️ G17 (`deploy-branch`)'s real-checkout arm has a pull-request twin through a designed stop, and what stays `main`-only is the one decision `--any-branch` skips. The mechanism and what to do on a red `main` are on G17's row in [`gates.md`](gates.md) |
| **`git checkout -- <path>` discards uncommitted work on a tracked file, and is a no-op on one only the working tree has** | ⚠️ reverting a planted defect takes the real edits with it when the plant and the work are both uncommitted. Commit before planting |
| **A Cloudflare `HEAD` for a path this build does not have answers 200 with no `content-length`** | ⚠️ not a 404 and no size header. The cover comparison reports such covers `uncomparable`, counted and named, never as zero bytes and never silently dropped. See [the log](./log/2026-08-19-the-reading-half-lands-and-a-count-that-said-three.md) |
| **After a real context loss, Android Chrome blocks WebGL for the page, and a force-stop clears it** | ⚠️ on the Pixel 10 Pro XL, after `GPU process exited unexpectedly` a new canvas in the same page is refused (`Web page caused context loss and was blocked`) for at least 24 s, and a reload at about 9 s is refused too ([the log](./log/2026-09-25-a-lost-context-falls-back-to-painted.md)). **A run after a loss measures the block, not the shelf**, so `scripts/phone-check.ts` force-stops Chrome before every run and removes the lost-context record the loss left; `--keep` skips the force-stop, for looking rather than measuring |
| Resolved versions | TypeScript 6.0.3 pinned exactly · Vitest 4 · Astro 7.2.3 · three 0.185.1 · sharp 0.35 · Stryker 9.6.1 pinned exactly · Prometheus 2.55.1 (the trend store's image) |

### The deploy check and the zone

When the zone answers automated requests with a Cloudflare challenge (`403`, `Cf-Mitigated: challenge`), `deploy:site` uploads correctly and then cannot confirm what the site is serving. Allow "definitely automated" traffic and the check reads the site again. The check reports the refusal instead of waiting it out ([ADR-0027](./adr/0027-deploy-check-reports-refusal.md)). Four things to know:

- **Images are exempt, so the loud part of the output stays green.** A run makes one HTML request and thirty-odd cover requests; only the HTML one is challenged. `.json` is challenged too, `.png` and `.jpg` are not.
- **A refusal reads like the edge propagation delay the check waits out.** It surfaces as "serving a build with no stamp". The check distinguishes the two rather than relying on a setting.
- **A DNS change is not the first suspect.** `stacks.aymandiab.com` is proxied through the zone, which is the necessary condition for zone rules to apply at all; a setting changed, not the routing.
- **Only the zone can date a change.** Security → Events names the service that mitigated a request, and the account Audit Log says who changed what and when. Nothing in this repository can see either.

## The log

One line per episode, newest last. The narrative is one file per investigation in [`log/`](./log/); add a line here and leave the narrative there. Phase A's open items are listed at the end of [its log](./log/2026-07-31-phase-a-invariant-scoreboard.md).

- 2026-07-31 — [Since the phase gates](./log/2026-07-31-since-the-phase-gates.md)
- 2026-07-31 — [Phase A — invariant scoreboard](./log/2026-07-31-phase-a-invariant-scoreboard.md)
- 2026-08-01 — [The mobile crash — G15](./log/2026-08-01-the-mobile-crash-g15.md)
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
- 2026-08-09 — [The packer was estimating, and the estimate cost a book a row](./log/2026-08-09-the-packer-was-estimating-and-the-estimate-cost-a-book.md)
- 2026-08-09 — [CodeQL became a second required gate, and one of its twelve was real](./log/2026-08-09-codeql-became-a-second-required-gate.md)
- 2026-08-10 — [The artifacts were ours, and the cover finally has somewhere to be looked at](./log/2026-08-10-the-artifacts-were-ours.md)
- 2026-08-19 — [The first nightly caught its own author](./log/2026-08-19-the-first-nightly-caught-its-own-author.md)
- 2026-08-19 — [The reading half lands, and a count that said three](./log/2026-08-19-the-reading-half-lands-and-a-count-that-said-three.md)
- 2026-08-19 — [The page lands, and the store was somebody else's](./log/2026-08-19-the-page-lands-and-the-store-was-somebody-elses.md)
- 2026-08-19 — [The constitution leaves CLAUDE.md](./log/2026-08-19-the-constitution-leaves-claude-md.md)
- 2026-08-19 — [The deploy reads the record, and the exit code proved nothing](./log/2026-08-19-the-deploy-reads-the-record-and-refuses-per-series.md)
- 2026-08-19 — [The ratchet lands disarmed, and the guard that would have taught the wrong lesson](./log/2026-08-19-the-ratchet-lands-disarmed.md)
- 2026-08-20 — [The register gate found a row nobody triaged](./log/2026-08-20-the-register-gate-found-a-row-nobody-triaged.md)
- 2026-08-22 — [The summary that grew a byte per mutant, and the gate that was reading a clock](./log/2026-08-22-the-summary-that-grew-a-byte-per-mutant.md)
- 2026-08-22 — [The CSP lands, and the site was already loading somebody else's script](./log/2026-08-22-the-csp-and-the-beacon-that-was-already-there.md)
- 2026-08-22 — [The reading surface, and a count printed under somebody else's commit](./log/2026-08-22-the-reading-surface-and-a-count-under-somebody-elses-commit.md)
- 2026-08-22 — [Coverage comes back as an ingredient, and the report wrote a null where a column should be](./log/2026-08-22-coverage-comes-back-as-an-ingredient.md)
- 2026-08-23 — [The suppression that suppresses nothing, and four measurements that were all the same special case](./log/2026-08-23-the-suppression-that-suppresses-nothing.md)
- 2026-08-23 — [markdownlint lands, and the thing that needed guarding was its remedy](./log/2026-08-23-markdownlint-lands-and-its-remedy-needed-guarding.md)
- 2026-08-23 — [The terrain for `astro check`, measured while the gate is still blocked](./log/2026-08-23-the-terrain-for-astro-check.md)
- 2026-08-23 — [`astro check` lands as G50, and G7's warrant is replaced rather than narrowed](./log/2026-08-23-the-terrain-for-astro-check.md)
- 2026-08-30 — [The bookcase stops flickering, and the fix is applied to the class](./log/2026-08-30-the-bookcase-stops-flickering.md)
- 2026-08-30 — [The woodwork is rosewood, and the UVs are rewritten to world space](./log/2026-08-30-the-woodwork-is-rosewood.md)
- 2026-08-30 — [The species menu, lazy and honest — and the read-back this map earned three times](./log/2026-08-30-the-species-menu-and-the-read-back.md)
- 2026-09-21 — [The survivor set diffs cleanly, and the cross-tree pair did not cross a tree](./log/2026-09-21-the-survivor-set-diffs-cleanly.md)
- 2026-09-22 — [Incremental mode is not score-neutral, and it is still worth running locally](./log/2026-09-22-incremental-is-not-score-neutral.md)
- 2026-09-22 — [The content key holds across a real edit](./log/2026-09-22-the-content-key-holds-across-a-real-edit.md)
- 2026-09-24 — [The woodwork is one mesh](./log/2026-09-24-the-woodwork-is-one-mesh.md)
- 2026-09-24 — [Only the bookcase reads the shadow map](./log/2026-09-24-only-the-bookcase-reads-the-shadow-map.md)
- 2026-09-24 — [The cover shade](./log/2026-09-24-the-cover-shade.md)
- 2026-09-25 — [A lost context falls back to painted](./log/2026-09-25-a-lost-context-falls-back-to-painted.md)
- 2026-09-25 — [Real-time shadows by default](./log/2026-09-25-real-time-shadows-by-default.md)
- 2026-09-25 — [A large library renders black](./log/2026-09-25-a-large-library-renders-black.md)
- 2026-09-25 — [G61 flakes on a late sheet](./log/2026-09-25-g61-flakes-on-a-late-sheet.md)
- 2026-09-26 — [A title lookup carries a different-language edition's ISBN](./log/2026-09-26-title-lookup-foreign-isbn.md)
- 2026-10-16 — [The window that was not set](./log/2026-10-16-the-window-that-was-not-set.md)
- 2026-10-17 — [`smoke:render` waits for state, not for time](./log/2026-10-17-smoke-render-waits-for-state.md)
- 2026-10-17 — [The release-age window's side doors](./log/2026-10-17-release-age-side-doors.md)
- 2026-10-17 — [The open main page](./log/2026-10-17-the-open-main-page.md)
- 2026-10-21 — [The tuning panel joins the pane](./log/2026-10-21-the-tuning-panel-joins-the-pane.md)
- 2026-10-25 — [The duplication backfill](./log/2026-10-25-duplication-backfill.md)
- 2026-11-05 — [The Ask the library live probe](./log/2026-11-05-ask-the-library-live-probe.md)
- 2026-11-06 — [Five models on the Ask evals](./log/2026-11-06-model-comparison.md)
- 2026-11-07 — [The stop in the pickup track](./log/2026-11-07-the-stop-in-the-pickup-track.md)
- 2026-11-08 — [Pages or Workers: the probe](./log/2026-11-08-pages-or-workers-probe.md)

## Notes to the next session

- Run `pnpm test && pnpm build && pnpm smoke:render && pnpm gate:public` first. Those four are the contract; if they are green the project is where this file says it is.
- **`smoke:render` and `gate:public` each stage their own fixture vault into `packages/site/public/`.** Running them while `pnpm dev:watch` is up swaps the live site to fixture data until the next vault edit. Rebuild with `pnpm stacks build --public --assets packages/site/public`.
- **Verify covers by eye, not by counting.** A contact sheet shows a placeholder graphic or a different book that no count distinguishes.
- Configuration lives in `.env` (gitignored): `STACKS_VAULT`, and `GOOGLE_BOOKS_API_KEY`, without which Google Books 429s on a shared quota. There is exactly one, in the main checkout, and every worktree reads it.
- Still open: whether the print and audiobook editions of one title should collapse into a single spine. They render as two.
- Everything in `fixtures/` is invented. No copyrighted material, ever; see `plan.md` §1.
