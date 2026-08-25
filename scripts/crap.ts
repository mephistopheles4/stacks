/**
 * The pre-commit CRAP print: what a commit's own functions look like, to the
 * one person who can still change them.
 *
 * **Opt-in per clone** — `git config core.hooksPath .githooks` and nothing
 * else. Nothing in `pnpm install` wires it, no gate runs it, and a contributor
 * who never opts in never meets it. See `docs/commands.md` and
 * `docs/spec/complexity-on-the-trend-layer.md` §5.
 *
 * ⚠️ **It prints and it never refuses.** Every failure below — git, Vitest,
 * ESLint, a missing report — lands as a diagnostic and an exit of 0, because a
 * hook that blocks a commit over an uncalibrated ranking would be the refusing
 * hook §4 turned down. `--no-verify` skips it, and for a print that is fine.
 *
 * The arithmetic, the join and the table are in `lib/crap.ts`, which is pure
 * and specced. Everything here is edge: the git read, the Vitest run, the file
 * read, the clock and the printing.
 */

import { rmSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { complexityOf, type PerFunction } from './lib/complexity.ts';
import {
  fileCoverageOf,
  rank,
  renderReport,
  route,
  rowsFor,
  type CrapRow,
  type IstanbulReport,
} from './lib/crap.ts';
import { gitOutput } from './lib/git.ts';
import { readDeclarations } from './lib/mutation-score.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

/** Where `vitest.config.ts` puts the JSON reporter's output. */
const COVERAGE_DIR = join(REPO_ROOT, '.coverage');
const COVERAGE_FILE = join(COVERAGE_DIR, 'coverage-final.json');

/**
 * Vitest's real entry point rather than its `.bin` shim.
 *
 * A shim is a `.cmd` on Windows and needs a shell, and a shell would put
 * filenames this script did not choose onto a command line an interpreter
 * reads. Spawning `node vitest.mjs` needs no shell, so every path travels as
 * one argument — `lib/run.ts`'s rule for anything arriving from outside,
 * applied to argv rather than to a branch name.
 */
const VITEST = join(REPO_ROOT, 'node_modules/vitest/vitest.mjs');

/**
 * Added, copied, modified or renamed — the files this commit will carry.
 *
 * ⚠️ **`-z`, so the list is NUL-delimited and unquoted.** Without it git
 * C-quotes any path carrying a newline or a non-ASCII byte — `"a\nb.ts"` —
 * which then has to be unquoted correctly or it routes to the wrong scope. And
 * trimming each line, which is what a newline-delimited read wants, eats the
 * leading and trailing spaces that are legal in a path. NUL cannot appear in a
 * filename, so splitting on it needs neither.
 */
function stagedFiles(): string[] {
  const output = gitOutput(
    ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
    REPO_ROOT,
  );
  if (output === undefined) throw new Error('git could not say what is staged');

  return output.split('\0').filter((path) => path.length > 0);
}

/**
 * One `related` run over every measured file at once.
 *
 * ⚠️ **One run, not one per file.** The #197 spike measured 3.3s for a single
 * file's transitive test set; a five-file commit run serially is most of a
 * minute, and §5's budget is about three seconds. Vitest takes the union of the
 * import graphs and the suite is selected once.
 *
 * `--passWithNoTests` is load-bearing rather than tidy: a commit adding a file
 * no spec imports selects nothing, and that is precisely the commit this print
 * exists for. Without it Vitest exits 1, the hook prints a diagnostic, and the
 * function with no test at all — the maximal CRAP in the table — is the one
 * case that never gets printed.
 *
 * ⚠️ **The union is not identical to the per-file runs it replaces, and it errs
 * upward.** A test selected for file B may execute file A on its way past, so a
 * batched number for A is at least its per-file number and sometimes above it.
 * That is more of the real suite rather than less, and it is stated because a
 * reader comparing this against `docs/spec/complexity-on-the-trend-layer.md`
 * §5's *"per changed file"* wording deserves to know which direction the
 * difference runs.
 */
function runCoverage(files: readonly string[]): { ok: boolean; output: string } {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });

  const result = spawnSync(
    process.execPath,
    [VITEST, 'related', ...files, '--run', '--coverage', '--passWithNoTests'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** The last few lines of a Vitest run, which is where it says what went wrong. */
function tail(output: string, lines = 12): string {
  return output.trimEnd().split('\n').slice(-lines).join('\n');
}

async function main(): Promise<void> {
  const started = Date.now();
  const routing = route(stagedFiles(), readDeclarations());

  if (routing.measured.length === 0) {
    // Quiet by default: most commits touch documentation, fixtures or config,
    // and a hook that prints "nothing to say" on every one of them is a hook
    // people turn off. An excluded file still gets its line — that is a fact
    // about the commit rather than noise.
    if (routing.excluded.length > 0) console.log(renderReport([], routing));
    return;
  }

  const run = runCoverage(routing.measured);

  /**
   * ⚠️ **The report's existence decides this, not the exit code.** A run whose
   * tests merely *failed* exits non-zero and still writes a complete, usable
   * report — so treating a red suite as "the run did not finish" prints a
   * sentence that is untrue in the commonest failure there is, and throws away
   * the table for a reason it does not give. A failing suite is exactly when
   * somebody is looking at these functions.
   *
   * The warning is not decoration: coverage measured under a red suite is what
   * *that* run executed, and a test that failed early stops contributing the
   * statements it would have covered. The numbers below it read low.
   */
  if (!existsSync(COVERAGE_FILE)) {
    console.log(
      `\nCRAP: no print this commit — the coverage run did not finish.\n${tail(run.output)}`,
    );
    return;
  }
  if (!run.ok) {
    console.log('\n  ⚠ some tests failed — coverage below is what the failing run measured.');
  }

  const report = JSON.parse(readFileSync(COVERAGE_FILE, 'utf8')) as IstanbulReport;
  const functions = await complexityOf(routing.measured);

  const byFile = new Map<string, PerFunction[]>();
  for (const entry of functions) {
    byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), entry]);
  }

  const rows: CrapRow[] = routing.measured.flatMap((file) =>
    rowsFor(byFile.get(file) ?? [], fileCoverageOf(report, file, REPO_ROOT)),
  );

  console.log(`\n${renderReport(rank(rows), routing)}`);
  console.log(
    `\n  ${((Date.now() - started) / 1000).toFixed(1)}s — this blocks nothing; \`--no-verify\` skips it.`,
  );
}

/**
 * ⚠️ **The one place this rollout swallows an error, and the boundary is why.**
 * `complexityOf` throws rather than under-count, and that is right for the
 * emitter, where a silent zero would move four series. Here the consequence of
 * the same throw would be a blocked commit over a print nobody asked to be
 * blocked by. The throw stays loud everywhere it can be acted on — `pnpm test`,
 * the metrics run — and is caught exactly here, where the only remedy is to
 * stop printing.
 */
main().catch((error: unknown) => {
  console.log(
    `\nCRAP: no print this commit — ${error instanceof Error ? error.message : String(error)}`,
  );
});
