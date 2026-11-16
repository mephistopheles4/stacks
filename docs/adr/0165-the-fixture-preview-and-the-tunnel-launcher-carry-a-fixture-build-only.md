# ADR-0165 — The fixture preview and the tunnel launcher carry a fixture build only, and the BrowserStack key stays out of every `.env`

**Date:** 2026-11-16
**Status:** accepted, built in [#605](https://github.com/mephistopheles4/stacks/issues/605)
**Issue:** [#605](https://github.com/mephistopheles4/stacks/issues/605), ticket T6 of the room spec ([#593](https://github.com/mephistopheles4/stacks/issues/593), revision 3, S13 and S6.7)
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)

## Decision

1. **The fixture build is made by the tool, never assumed.** `scripts/browserstack-local.ts` (the
   tunnel launcher) and `pnpm preview:fixture` each build the 50-book fixture vault into a scratch
   `dist/` under `artifacts/room-devices/`, run G20's rules on it, and refuse a `library.json` that
   does not list the fixture's marker book (`FIXTURE_MARKER_ID`, the long-Thoughts book that only
   `scripts/make-50-book-fixture.ts` writes) or holds a title the generator could not have written.
   They serve or upload that folder alone, never the dev server or `packages/site/dist`.
2. **The preview is a Pages preview branch, a constant.** `PREVIEW_BRANCH` is `preview-fixture`; the
   command takes no branch argument and refuses `main` and the production branch in any spelling.
   A preview is a public address, so it is read and then deleted (`--delete`, which removes only
   preview-environment deployments of that branch, and nothing when the list is of a shape nobody
   expected).
3. **The confinement probe is a scratch-only file at the worker's path** (`--probe`). The worker's
   `_headers` block is keyed on that exact path, so the probe has to be served there to be read
   under it; it is written into the scratch copy after G20 has passed on it, never into `public/`.
   `--probe --control` loosens the block so the worker can fetch, and the probe must come back red.
   The page carries the real page's own policy, so a browser that applied the page's policy to the
   worker shows as eval blocked (S6.10).
4. **The key lives in the launcher's own environment.** It is read from `process.env` only, goes to
   the binary through a temp `--config-file`, owner-only and deleted on every exit, and is never in
   a URL, a command line, the binary's environment or a printed line. `deploy:site`, `deploy:ask`,
   `preview:fixture` and the launcher refuse to run while a root `.env` or `.env.local` names a
   `BROWSERSTACK_` variable (names only), and `uploadEnv` drops every such variable from what
   wrangler is given, because wrangler reads the root `.env` itself.

## Why

A tunnel carries whatever is on its one port to a device cloud, and a preview is a public address:
the only content either may carry is invented. Checking the build, and not the operator's care, is
what makes a mistake a refusal. The key is the one credential here that no gate can see leave, so the
rules keep it out of the places a process other than the launcher reads.

## Not decided

- The config file's key name (`key`) is unconfirmed: BrowserStack's page for `--config-file` names no
  YAML keys. The first real run settles it, and the launcher's docs say so.
- A key in the shell of a deploy is dropped from wrangler's environment, not refused: the shell is
  the owner's, and the spec's refusal is of the files wrangler reads on its own.
