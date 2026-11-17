# ADR-0171 — The smoke gate is replaced by a three-device BrowserStack check after merge

**Date:** 2026-11-17
**Status:** accepted, built in [#618](https://github.com/mephistopheles4/stacks/issues/618)
**Issue:** [#618](https://github.com/mephistopheles4/stacks/issues/618)
**Spec:** [revision 2](https://github.com/mephistopheles4/stacks/issues/618#issuecomment-6955707557), with [the amendments](https://github.com/mephistopheles4/stacks/issues/618#issuecomment-6955792371)
**Supersedes:** [ADR-0108](0108-g60-and-g61-run-after-merge-not-on-pull-requests.md) (G60 and G61 at deploy), the deploy half of [ADR-0064](0064-no-flag-skips-the-deploy-gates.md)'s gate list, and the "not a gate" line in `scripts/ios-swipe-check.ts`

## Decision

1. **`pnpm smoke:render` is deleted**, with the `smoke:render` step in `gates.yml`, athanor's `smoke`
   entry and `deploy:site`'s run of it. What its cells guarded is either held by a unit test that
   already exists, held by the device check, or deleted: the pull request lists each cell by name.
2. **`pnpm check:devices` replaces it.** On a real Pixel in Chrome, a real iPhone in Safari and
   Chrome on Windows, in parallel, it opens the fixture build through BrowserStack Local, waits
   until `__shelf.ready`, taps a book and waits until `__shelf.held()` names it with the address
   unchanged, holds it ten seconds, fails if `__shelf.fallback()` is anything but `none`, reads the
   console-error count, and saves one screenshot a device. Every wait is on a shelf state flag.
3. **It runs after merge only**, in `devices.yml` on a push to `main`, and it is no required check.
   The key is an environment secret of `browserstack`, whose branch policy allows `main` alone; a
   pull request, a fork and a pushed branch never hold it. The fixture is built and judged in a job
   with no secret; the job holding the key installs no package and runs `node` over this
   repository's own files, with a pinned Local binary (host, path and SHA-256, refused on a
   mismatch) and one tunnel identifier per run. `scripts/lib/key-job.test.ts` holds the import
   graph and the environment.
4. **Nothing is added before a deploy.** If a deploy-time device check is ever wanted, it is a new
   issue.

## Why

A smoke gate drives a headless Chrome on a CI software renderer, and most of what it measured was
that renderer: G60 and G61 were four fifths of every pull request's wait, and the ones that stayed
flaked on a late sheet. ADR-0088 had already said that what kills the context on a phone is not
known and "is answered on a phone, not by arithmetic". The owner's direction (#618): delete the
smoke, do something in BrowserStack, and keep it to what code cannot check without flake.

## What it costs

Coverage against flake and agent time, decided by the owner's direction. Lost for good: the 50-book
render, the open-spread layout, the CSP-violation check, the keyboard, touch, focus and
accessibility cells, and any warning before merge. A broken boot shows on `main` right after the
merge, red, and the device screenshots are what a human looks at.

## What else left with it

The athanor image drops Chromium and its `--no-sandbox` wrapper, so the sandbox risk the owner
accepted in [ADR-0122](0122-athanor-runs-the-suite-in-a-sealed-container.md) for the `smoke` run
has no user, and that part of ADR-0122 no longer holds. Six rows of `docs/gates.md` are retired
(G16, G59, G60, G61, G64, G65) and G35 is reduced to the device check's pickup step, ⬜ until a
live run is seen red. `puppeteer-core` has no caller in the repo's scripts and stays installed
until a follow-up removes it with its lockfile and G67 entries.
