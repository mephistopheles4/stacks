/**
 * The Markdown gate.
 *
 *     pnpm lint:md          # report every rule break; exit 1 on any
 *     pnpm lint:md:fix      # rewrite what the seven allowlisted rules can fix
 *
 * Both modes go through this file so the glob list has one definition. It is
 * the same argument G24 makes about the repo root: the exclusion
 * `!**\/node_modules/**` is measured — the short form misses nested
 * `node_modules` and pulls 15 dependency READMEs into the run — and a rule
 * that is measured in one place and re-typed in another is a rule that
 * eventually differs between the two.
 *
 * ⚠️ **The fix pass refuses rather than filters, and `scripts/lib/markdown-lint.ts`
 * says why**: markdownlint-cli2's discovered root config beats `--config`,
 * `optionsOverride.config` and `overrides` alike, all three measured, so the
 * allowlist cannot narrow the run. It stops it instead.
 *
 * The rule set, and the measured reason under every rule turned off, is
 * `.markdownlint.jsonc`. Read `docs/spec/static-analysis-and-style.md` §6 step 2
 * before widening either.
 *
 * ## ⚠️ `main`'s return code is the gate. Discarding it is a silent forever-pass
 *
 * This file imports the library and calls `main` itself, which is the correct
 * use of it — `markdownlint-cli2.mjs` **exports** `main` and runs nothing on
 * import. The published CLI, `markdownlint-cli2-bin.mjs`, is a thin wrapper that
 * calls the same function and exits on its code; `package.json`'s `bin` field is
 * what `npx markdownlint-cli2` resolves to.
 *
 * **So the `if (code !== 0) process.exit(code)` below is the entire difference
 * between a gate and a decoration.** `main` prints its findings through the
 * callbacks either way, so a version of this function that awaited it and
 * ignored the result would look correct, print every rule break, and **exit 0
 * forever** — green CI over a broken tree, with the findings scrolling past in
 * the log.
 *
 * ⚠️ **Not hypothetical, and it is why this paragraph exists.** A sibling
 * session shelling out to `node …/markdownlint-cli2.mjs` — the library path,
 * one wrapper short of the CLI — got **no output at all and exit 0**, for every
 * input including a canary with four known defects, and read it as a clean tree.
 * Six characters from the working entry point, and both exit 0. Raised against
 * this file by that session on the grounds that the next person to touch it will
 * see `main()` returning something and may not know that dropping it is the
 * whole failure.
 */

import {
  FIXABLE_NOT_ALLOWLISTED,
  FIX_ALLOWLIST,
  fixableRules,
  markdownFiles,
  rulesFoundInTree,
  silentProbes,
  unmeasuredFindings,
} from './lib/markdown-lint.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

const fix = process.argv.includes('--fix');

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/**
 * The pre-flight the fix pass does not get to skip.
 *
 * There is no flag for it. #235 measured the damage a *default* fix pass does
 * here — 55 files, 11 issue references turned into headings, a documented
 * separator stripped out of 16 code spans, a verbatim quotation renumbered, and
 * all 1055 tests green over the wreckage. The allowlist is what stands between
 * this command and that, so a command that could run with the allowlist
 * unverified would be the allowlist not existing.
 */
async function refuseUnlessEveryFixIsMeasured(): Promise<void> {
  const { fixable, fired } = await fixableRules();

  const silent = silentProbes(fired);
  if (silent.length > 0) {
    fail(
      `these rules no longer break on their own probe: ${silent.join(', ')}.\n` +
        'The fix-set measurement below is only as wide as the rules that fire, so an\n' +
        'unmeasured rule here would read as a rule that cannot be fixed. Repair the\n' +
        'probes in scripts/lib/markdown-lint.ts before running the fix pass.',
    );
  }

  const declared = new Set([...FIX_ALLOWLIST, ...FIXABLE_NOT_ALLOWLISTED]);
  const undeclared = fixable.filter((rule) => !declared.has(rule));
  if (undeclared.length > 0) {
    fail(
      `markdownlint can now rewrite ${undeclared.join(', ')}, which nobody has measured\n` +
        "on this tree. That is the version bump #235 warned about: what a rule's fix\n" +
        'does is a property of a version, not of a tool.\n\n' +
        'Run `pnpm lint:md`, apply those rules by hand, look at the diff, and add the\n' +
        'name to FIX_ALLOWLIST in scripts/lib/markdown-lint.ts with what you saw.',
    );
  }

  // The second half, and the one a filter would have handled if a filter were
  // available. `FIXABLE_NOT_ALLOWLISTED` names rules the tool *can* fix and
  // nobody has watched it fix, and nothing narrows this run — so the only way
  // to keep an unmeasured fix from landing is to decline the whole pass.
  //
  // ⚠️ Written after measuring the opposite. `text __x__ text` became
  // `text **x** text` under this command while four documents said MD050 would
  // be left alone: the refusal above only fires for a rule on *neither* list,
  // and a declared exclusion sailed straight through it.
  const unmeasured = unmeasuredFindings(await rulesFoundInTree());
  if (unmeasured.length > 0) {
    fail(
      `the tree has findings on ${unmeasured.join(', ')}, whose fix is declared\n` +
        'excluded in scripts/lib/markdown-lint.ts — the tool can apply it and nobody\n' +
        'has watched it do so on this repository.\n\n' +
        'This pass cannot skip one rule: markdownlint-cli2 gives no way to narrow a\n' +
        'run below the root config, measured three ways. So it declines instead.\n\n' +
        'Run `pnpm lint:md`, repair those findings by hand, and read the diff. If the\n' +
        'fix is right, move the rule to FIX_ALLOWLIST with what you saw.',
    );
  }
}

async function run(): Promise<void> {
  if (fix) await refuseUnlessEveryFixIsMeasured();

  // Literal `:`-prefixed paths from `git ls-files`, not the globs themselves —
  // `markdownFiles` says why, and the short version is that a glob reads the
  // disk while the spec's population is the tracked files.
  const files = markdownFiles();
  if (files.length < 50) {
    fail(
      `only ${files.length} tracked Markdown file(s) found. This gate has read 146 for ` +
        'its whole life, so a number this low means the population collapsed rather than ' +
        'the tree shrinking — and a lint over nothing passes.',
    );
  }

  const { main } = await import('markdownlint-cli2');
  const code = await main({
    directory: REPO_ROOT,
    argv: files.map((path) => `:${path}`),
    optionsOverride: { fix },
    logMessage: (message: string) => {
      // The population is 146 literal paths now, and cli2 echoes every one of
      // them on its `Finding:` line — measured: `showFound: false` does not
      // suppress it, that option guards a different line. Dropped here so the
      // findings are not buried under the roster. `Linting: N files` stays,
      // because it is the anti-vacuity signal a reader actually wants.
      if (message.startsWith('Finding: ')) return;
      console.log(message);
    },
    logError: (message: string) => {
      console.error(message);
    },
  });

  if (code !== 0) {
    // The remedy, in the output that reported the break — which is the whole
    // reason this gate clears #229's reach test. A red naming `style` and not
    // the tool is the accepted cost of one CI job for three gates; the fix
    // command being in the failure is the agreed remedy for it.
    console.error(
      '\nMarkdown rule breaks above. `pnpm lint:md:fix` repairs the seven rules whose\n' +
        'fixes are measured safe here; everything else needs a person, on purpose.\n',
    );
    process.exit(code);
  }
}

await run();
