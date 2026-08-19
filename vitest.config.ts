import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `gates/` holds the repo-level gates: rules about the shape of the whole
    // tree (which files may import what, which documented keys must exist)
    // rather than about one package's behaviour. They live outside `packages/`
    // because they belong to no package — they read CLAUDE.md, .env.example and
    // the source tree itself. See docs/gates.md.
    // `scripts/` was outside this list until the trend layer's first nightly
    // showed why that mattered: a module extracted into `scripts/lib/` had no
    // in-process oracle, so every one of its mutants was NoCoverage and the
    // `scripts` mutation score fell 6.45 points at a commit that added no
    // untested behaviour anywhere else. A spec under `scripts/` is an ordinary
    // unit test and takes no `docs/gates.md` row — which is exactly why it could
    // not live in `gates/`, where G19 requires every file to be scored.
    include: ['packages/**/src/**/*.test.ts', 'gates/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    // G21 — replaces `fetch` with one that records and refuses, so a test that
    // reaches the network fails saying so instead of merely running slowly.
    // See gates/no-live-network.ts.
    setupFiles: ['./gates/no-live-network.setup.ts'],
  },
});
