/**
 * `markdownlint-cli2` ships JSDoc types in a `.mjs`, and no `.d.ts`, so under
 * `strict` its `main` import is an implicit `any` and `pnpm build` refuses it.
 *
 * **Narrow on purpose: this declares the surface this repository calls and no
 * more.** The alternative — `declare module 'markdownlint-cli2';` — makes every
 * call site `any`, which is the version of this file that silently stops
 * checking the arguments the fix pass depends on. If a call needs another
 * option, add it here rather than widening the module.
 *
 * ⚠️ **A hand-written declaration is a claim about a version.** It is pinned
 * exact at 0.23.2 for reasons of its own — see
 * [ADR-0075](../../docs/adr/0075-the-markdown-fix-flag-is-allowlisted.md) — and
 * a bump is where this file is re-read. `logError` in particular is load-bearing
 * and was found by measurement: findings arrive there, not on `logMessage`.
 */
declare module 'markdownlint-cli2' {
  interface Options {
    /** Apply fixable rules in place. */
    fix?: boolean;
    /** Suppress the `Linting: N files` progress line. */
    showProgress?: boolean;
  }

  interface Parameters {
    /** The directory globs resolve against, and the root of config discovery. */
    directory?: string;
    /** Globs and flags, as the command line would carry them. */
    argv?: readonly string[];
    /** Options applied over the discovered configuration. */
    optionsOverride?: Options;
    /** Progress and summary lines. */
    logMessage?: (message: string) => void;
    /** **Rule findings arrive here**, one line each, plus real errors. */
    logError?: (message: string) => void;
  }

  /** Runs one lint (or fix) pass. Resolves to the process exit code. */
  export function main(params: Parameters): Promise<number>;
}
