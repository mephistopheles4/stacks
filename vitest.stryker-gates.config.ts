import { defineConfig } from 'vitest/config';

/**
 * Issue #114 — what the `gates/` + `scripts/` mutation scope costs to run at all.
 *
 * Stryker copies the project into `.stryker-tmp/sandbox-*`, and **that copy is not
 * a git repository**. Four specs shell out to git from `REPO_ROOT`, which inside
 * the sandbox is the sandbox:
 *
 *   - `gates/repo-hygiene.test.ts`         G5/G13 — `git ls-files`, `git check-ignore`
 *   - `gates/doc-links.test.ts`            G29    — `trackedFiles()`
 *   - `gates/constitution-scoreboard.test.ts` G19 — `trackedFiles()`
 *   - `gates/deploy-branch.test.ts`               — `git rev-parse --abbrev-ref HEAD`
 *
 * G5 does not fail quietly: its own anti-vacuity guard fires — "extraction found 0
 * tracked files (expected at least 20)" — which is the gate catching the sandbox
 * rather than the sandbox catching the gate. Worth noting for #113: without that
 * guard, three repo-shape gates would have passed vacuously against a copy of the
 * tree, and the mutation score would have been confidently wrong.
 *
 * Plus `packages/cli/src/env.test.ts` for the `pool: 'threads'` reason in
 * `vitest.stryker.config.ts`.
 */
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'gates/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/cli/src/env.test.ts',
      'gates/repo-hygiene.test.ts',
      'gates/doc-links.test.ts',
      'gates/constitution-scoreboard.test.ts',
      'gates/deploy-branch.test.ts',
    ],
    environment: 'node',
    setupFiles: ['./gates/no-live-network.setup.ts'],
  },
});
