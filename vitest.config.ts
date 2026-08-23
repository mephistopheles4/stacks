import { readFileSync } from "node:fs";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

/**
 * The eight declared scope globs, read from the file that declares them.
 *
 * ⚠️ **Derived rather than copied, because `coverage.include` is a claim that
 * can go stale.** `docs/spec/no-coverage-floor.md` named that risk while
 * refusing coverage as a floor — *"`coverage.include` closes the hole and is
 * then itself a claim that can go stale, unwatched, in the effort about claims
 * that go stale"*. Reading `stryker.scopes.json` is what makes it unable to:
 * a scope added, renamed or re-globbed moves this list in the same edit, and
 * G38 (`mutation-scope`) already holds that file to the tree.
 */
const { scopes } = JSON.parse(
  readFileSync(new URL("./stryker.scopes.json", import.meta.url), "utf8"),
) as { scopes: { glob: string }[] };

export default defineConfig({
  test: {
    // `gates/` holds the repo-level gates: rules about the shape of the whole
    // tree (which files may import what, which documented keys must exist)
    // rather than about one package's behaviour. They live outside `packages/`
    // because they belong to no package — they read AGENTS.md, .env.example and
    // the source tree itself. See docs/gates.md.
    // `scripts/` was outside this list until the trend layer's first nightly
    // showed why that mattered: a module extracted into `scripts/lib/` had no
    // in-process oracle, so every one of its mutants was NoCoverage and the
    // `scripts` mutation score fell 6.45 points at a commit that added no
    // untested behaviour anywhere else. A spec under `scripts/` is an ordinary
    // unit test and takes no `docs/gates.md` row — which is exactly why it could
    // not live in `gates/`, where G19 requires every file to be scored.
    include: [
      "packages/**/src/**/*.test.ts",
      "gates/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
    // G21 — replaces `fetch` with one that records and refuses, so a test that
    // reaches the network fails saying so instead of merely running slowly.
    // See gates/no-live-network.ts.
    setupFiles: ["./gates/no-live-network.setup.ts"],

    /**
     * Coverage, as an **ingredient and not a goal**.
     *
     * ⚠️ **Off unless `--coverage` is passed, so `pnpm test` is unchanged.**
     * Nothing in this repo reads the number except the pre-commit CRAP print,
     * which is opt-in per clone and prints. There is no floor, no threshold, no
     * series and no badge, and the *Coverage percentage* row in
     * `docs/gates.md`'s **Not gated, deliberately** stands exactly as written.
     * See [ADR-0069](docs/adr/0069-coverage-is-an-ingredient-not-a-goal.md) and
     * `docs/spec/complexity-on-the-trend-layer.md` §5.
     *
     * `include` is what makes the number worth computing at all. Vitest 4
     * dropped `coverage.all`, so without it a file no test imports is *absent*
     * from the report rather than present at 0% — the blind spot that made CRAP
     * undefined exactly where it should be maximal. The #197 spike planted an
     * orphan and measured both ways: 93 files with `include`, 72 without.
     */
    coverage: {
      provider: "v8",
      include: scopes.map((scope) => scope.glob),

      /**
       * ⚠️ **Spread rather than replaced.** Assigning an array here *replaces*
       * Vitest's defaults, which are what keep `node_modules`, `dist` and the
       * config files out — the same trap `stryker.config.mjs` documents for
       * `mutate`, where a replaced default once mutated the test suite and read
       * the score nine points low. `*.test.ts` is named anyway: the scope globs
       * match specs, and a spec's own coverage is not a fact about the code.
       */
      exclude: [...coverageConfigDefaults.exclude, "**/*.test.ts"],

      /** JSON only, into a gitignored directory: the hook is the sole reader. */
      reporter: ["json"],
      reportsDirectory: ".coverage",
    },
  },
});
