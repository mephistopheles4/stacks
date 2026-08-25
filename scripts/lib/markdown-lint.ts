/**
 * The Markdown gate's two moving parts: which files it reads, and which rules
 * its fix pass is allowed to rewrite.
 *
 * The rule *set* lives in `.markdownlint.jsonc`, where CodeRabbit can read it
 * too. What lives here is everything that file cannot express.
 *
 * ## Why the fix allowlist is not a second config file
 *
 * **Measured at markdownlint-cli2 0.23.2: a discovered `.markdownlint.jsonc`
 * beats every mechanism for narrowing it.** `--config` is documented as *"the
 * base configuration"* and loses; `optionsOverride.config` loses at
 * `markdownlint-cli2.mjs`'s `dirInfo.markdownlintConfig = markdownlintConfig`,
 * which never consults it; and an `overrides` entry at `combine: "replace"`
 * loses too. All three were tried against a fixture with `default: false` and
 * all three still reported a rule that set turns off.
 *
 * So the allowlist cannot be a filter, and pretending otherwise would be the
 * worst of the three options — a file that reads as a restriction and restricts
 * nothing. **It is a refusal instead**, checked before the fix pass touches a
 * file: `fixableRules` measures what the installed version can actually rewrite,
 * and `scripts/lint-md.ts` refuses to run when that set is not exactly
 * `FIX_ALLOWLIST` **plus** `FIXABLE_NOT_ALLOWLISTED` — **eight names, not the
 * seven on the allowlist**, because MD050 is fixable and declared. A version
 * bump that makes a *ninth* rule fixable stops the command rather than silently
 * rewriting the tree with it.
 *
 * ⚠️ **This paragraph said "wider than the names below" and that was wrong** —
 * the measured set is already wider than the allowlist on every run, so read
 * literally the command would refuse always. The code was right and only the
 * description was wrong, which is the failure mode this file exists to guard
 * against, one level up. Caught by CodeRabbit on #264.
 *
 * That refusal is #235's debt 5 — *"the `--fix` allowlist is re-measured at
 * every version bump"* — mechanised rather than written down, and G48
 * (`markdown`) asserts the same measurement at merge.
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './repo-root.ts';

/** The rule set both modes read. Named here because two callers resolve it. */
export const CONFIG_FILE = '.markdownlint.jsonc';

/**
 * The files the gate reads: tracked Markdown, outside `fixtures/`.
 *
 * ⚠️ **`!**\/node_modules/**` and not `#node_modules`.** Measured: the short
 * form does not exclude *nested* `node_modules`, so a run after `pnpm install`
 * linted 171 files instead of 156, pulled in 15 dependency READMEs, and
 * invented four rule classes that are not in this tree.
 *
 * `fixtures/` is out because the fixture vault is **data, not documents**. Its
 * book notes produce findings that are properties of a book note rather than of
 * a document, and one of those notes is malformed on purpose because invariant
 * 3 requires it.
 */
export const MARKDOWN_GLOBS: readonly string[] = [
  '**/*.md',
  '!fixtures/**',
  '!**/node_modules/**',
];

/**
 * The population as a list of files, from git rather than from the disk.
 *
 * ⚠️ **"Tracked `.md`" is the spec's wording and a glob does not deliver it.**
 * `MARKDOWN_GLOBS` above states the *rule*; run as a glob it reads the
 * filesystem, so an untracked scratch file or a gitignored one is linted and
 * can redden a gate over something CI will never see. That is not hypothetical
 * here: `gates/repo.ts` documents `trackedFiles` as preferred *"because it
 * cannot pick up a stray untracked file and fail a gate on it"*, and
 * `action-pins` carries the incident — a read-only review agent dropped a
 * scratch file into `.github/` and reddened a gate on a file that was never
 * committed and would never have run.
 *
 * So the globs are applied to `git ls-files` and handed over as literal paths,
 * which is markdownlint-cli2's `:`-prefixed form. The exclusions stay exactly
 * as documented above, and are applied here rather than restated.
 *
 * ⚠️ **The cost is G13's verdict, inherited knowingly**: a new Markdown file
 * is invisible to `pnpm lint:md` until it is staged. `action-pins` reaches the
 * same trade and states the same rule — **stage, then run.**
 */
export function markdownFiles(): string[] {
  const tracked = execFileSync('git', ['ls-files', '-z', '*.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  return tracked
    .split('\0')
    .filter((path) => path.length > 0)
    .filter((path) => !path.startsWith('fixtures/') && !path.includes('node_modules/'))
    .sort();
}

/**
 * The rules `pnpm lint:md:fix` is allowed to rewrite. **Seven, and the list is
 * the entire protection.**
 *
 * At *default* rules a fix pass over this tree changed 55 files, +172/−151, and
 * did three kinds of damage: 11 issue references turned into H1 headings, 16
 * code spans stripped of an intentional space — ten of them the `` `; ``
 * separator G31 gates, one of them G41's own extraction regex — and one
 * verbatim quotation renumbered. **`pnpm test` on that damaged tree was all
 * 1055 tests green.** Prettier's Markdown damage is loud; this tool's is silent,
 * which is why the protection has to be a list rather than a test suite.
 *
 * Each name below was measured safe on this tree at 0.23.2. Counts are findings
 * at the adopted rule set.
 */
export const FIX_ALLOWLIST: readonly string[] = [
  'MD012', // 1 — consecutive blank lines
  'MD022', // 14 — blank lines around headings
  'MD031', // 5 — blank lines around fences
  'MD032', // 15 — blank lines around lists
  'MD034', // 2 — bare URLs
  'MD049', // 124 — emphasis marker
  'MD060', // 241 — table pipe spacing
];

/**
 * Rules the tool can fix that the allowlist deliberately does not carry.
 *
 * **A declared exclusion, reverse-asserted by G48**, in the `gates/` allowlist
 * idiom: a name here that stops being fixable goes red as a stale permission,
 * and a fixable rule that is on neither list goes red as a new one.
 *
 * **MD050** is enabled in `.markdownlint.jsonc` and is very likely safe, but it
 * has **zero** findings on this tree — there was nothing to run a fix pass
 * against, so it was never measured, and this repo does not put unmeasured
 * names on an allowlist whose whole job is that every name was measured.
 *
 * ⚠️ **A name here is not a rule the fix pass skips, and the first version of
 * this file said it was.** Nothing narrows the run — that is the whole point of
 * the block above — so `--fix` would rewrite MD050 like any other enabled rule.
 * *Measured*: `text __x__ text` became `text **x** text` while four documents
 * said it would be left alone. **So the exclusion is enforced by
 * `unmeasuredFindings` refusing the whole pass** rather than by a filter that
 * does not exist. Write `__G41__` into a scoreboard row and `pnpm lint:md` goes
 * red naming MD050 and the line; `pnpm lint:md:fix` **refuses** and says the
 * same, rather than quietly applying an unmeasured fix.
 */
export const FIXABLE_NOT_ALLOWLISTED: readonly string[] = ['MD050'];

/**
 * The declared-excluded rules that have findings in a given report.
 *
 * Non-empty means the fix pass must not run: the tree contains something only
 * an unmeasured fix would repair, and the pass cannot be narrowed to leave it
 * alone. A pure function of the report so G48 can assert the refusal without
 * running one.
 */
export function unmeasuredFindings(reported: Iterable<string>): string[] {
  const excluded = new Set(FIXABLE_NOT_ALLOWLISTED);
  return [...new Set([...reported].filter((rule) => excluded.has(rule)))].sort();
}

/**
 * Probes that did not break their own rule in a given run.
 *
 * Non-empty means the fixability measurement is narrower than it looks, so the
 * fix pass must not run. Beside `unmeasuredFindings` for the same reason: the
 * decision is asserted by G48 and acted on by `scripts/lint-md.ts`, and two
 * copies of it would be two definitions of *"measured"*.
 */
export function silentProbes(fired: Iterable<string>): string[] {
  const seen = new Set(fired);
  return PROBES.map(({ rule }) => rule).filter((rule) => !seen.has(rule));
}

/**
 * One document per adopted rule, each written to break that rule.
 *
 * Separate files rather than one document on purpose: rules interfere — MD041
 * fires on anything not opening with a heading, MD001 needs two headings to say
 * anything — and a single probe would leave whichever rule lost the interference
 * silently unmeasured, inside the measurement that exists to stop exactly that.
 *
 * ⚠️ **A rule that stops firing on its own probe is a red, not a pass.** G48
 * floors this both ways: every name here must fire, so a rewritten probe cannot
 * quietly reduce the fixability measurement to a statement about nothing.
 */
export const PROBES: readonly { readonly rule: string; readonly markdown: string }[] = [
  { rule: 'MD001', markdown: '# One\n\n### Three\n' },
  { rule: 'MD012', markdown: '# One\n\ntext\n\n\n\nmore\n' },
  { rule: 'MD022', markdown: '# One\ntext\n' },
  { rule: 'MD024', markdown: '# One\n\n## Same\n\ntext\n\n## Same\n\ntext\n' },
  { rule: 'MD031', markdown: '# One\n\ntext\n```js\ncode\n```\ntext\n' },
  { rule: 'MD032', markdown: '# One\n\ntext\n- a\n- b\n\ntext\n' },
  { rule: 'MD033', markdown: '# One\n\ntext <span>x</span> text\n' },
  { rule: 'MD034', markdown: '# One\n\nhttps://example.com/ is bare\n' },
  { rule: 'MD040', markdown: '# One\n\n```\ncode\n```\n' },
  { rule: 'MD041', markdown: 'text, and no heading first\n' },
  { rule: 'MD049', markdown: '# One\n\ntext _emphasis_ text\n' },
  { rule: 'MD050', markdown: '# One\n\ntext __strong__ text\n' },
  { rule: 'MD051', markdown: '# One\n\n[dead](#no-such-heading)\n' },
  { rule: 'MD056', markdown: '# One\n\n| a | b |\n| --- | --- |\n| 1 | 2 | 3 |\n' },
  { rule: 'MD060', markdown: '# One\n\n|a|b|\n|---|---|\n|1|2|\n' },
];

/**
 * The rules `.markdownlint.jsonc` actually turns on.
 *
 * ⚠️ **The set the fix measurement is only ever as wide as.** `fixableRules`
 * probes `PROBES`, so a rule that is enabled and unprobed is a rule whose fix
 * nobody has measured and nothing will refuse — which is not hypothetical: this
 * config ran roughly thirty rules at their defaults until G48 caught
 * `pnpm lint:md:fix` rewriting MD009 and MD010 unmeasured. G48 holds this set
 * and `PROBES` to each other so the gap cannot reopen.
 *
 * Comment lines are stripped rather than parsed with a JSONC library: the only
 * consumer is this repo's own config, `jsonc-parser` is a transitive dependency
 * of the linter rather than a declared one, and a hand-rolled parser for a file
 * somebody else writes would be the wrong trade — for this one it is six lines.
 */
export function enabledRules(source: string): { rules: string[]; defaultOn: boolean } {
  const stripped = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const config = JSON.parse(stripped) as Record<string, unknown>;

  const rules = Object.entries(config)
    .filter(([key, value]) => /^MD\d+$/.test(key) && value !== false)
    .map(([key]) => key)
    .sort();

  return { rules, defaultOn: config['default'] !== false };
}

/** The rule ids one markdownlint-cli2 run reported, per file. */
type Reported = Map<string, Set<string>>;

async function lint(
  directory: string,
  fix: boolean,
  globs: readonly string[] = ['*.md'],
): Promise<Reported> {
  // Imported here rather than at module scope: `gates/` specs import the
  // constants above without ever running a lint, and cli2 pulls in globby,
  // markdown-it and js-yaml on load.
  const { main } = await import('markdownlint-cli2');

  const reported: Reported = new Map();
  await main({
    directory,
    argv: [...globs],
    optionsOverride: { fix, showProgress: false },
    logMessage: () => {},
    // Findings arrive on `logError`, not `logMessage` — measured, and the
    // first version of this read the wrong one and returned an empty set that
    // looked exactly like "nothing is fixable". The default formatter's line is
    // `<file>:<line>[:<col>] error <MDnnn>/<name> …`. Parsed rather than read
    // through `outputFormatters`, which resolves a formatter by module name and
    // cannot be handed a closure.
    logError: (message: string) => {
      const match = /^(\S+?):\d+(?::\d+)? \w+ (MD\d+)\//.exec(message);
      if (!match?.[1] || !match[2]) return;
      const forFile = reported.get(match[1]) ?? new Set<string>();
      forFile.add(match[2]);
      reported.set(match[1], forFile);
    },
  });
  return reported;
}

/**
 * Every rule with at least one finding over the tracked Markdown, right now.
 *
 * The fix pass's other pre-flight input: `fixableRules` says what the *tool*
 * can rewrite, and this says what the *tree* would hand it.
 */
export async function rulesFoundInTree(): Promise<string[]> {
  const reported = await lint(REPO_ROOT, false, markdownFiles().map((path) => `:${path}`));
  const rules = new Set<string>();
  for (const forFile of reported.values()) for (const rule of forFile) rules.add(rule);
  return [...rules].sort();
}

/**
 * What the installed markdownlint can actually rewrite, measured rather than
 * declared.
 *
 * Each probe is linted, fixed, and linted again; a rule that was reported
 * before and is not reported after is one the fix pass rewrote. **Measured
 * through the tool's own behaviour** rather than by reading rule metadata,
 * because "declares a fix" and "changes this file" are different claims and it
 * is the second one that damages a tree.
 *
 * Returns `{ fixable, fired }` — the second so a caller can refuse a probe set
 * that has stopped provoking its own rules.
 */
export async function fixableRules(): Promise<{ fixable: string[]; fired: string[] }> {
  const directory = await mkdtemp(join(tmpdir(), 'stacks-md-probe-'));
  try {
    // The adopted rule set, copied in so the probes are measured under the
    // configuration the gate actually runs — not under markdownlint's defaults,
    // which is the one measurement that would prove nothing.
    await cp(join(REPO_ROOT, CONFIG_FILE), join(directory, CONFIG_FILE));
    await Promise.all(
      PROBES.map(({ rule, markdown }) => writeFile(join(directory, `${rule}.md`), markdown)),
    );

    const before = await lint(directory, false);
    await lint(directory, true);
    const after = await lint(directory, false);

    const fixable = new Set<string>();
    const fired: string[] = [];
    for (const { rule } of PROBES) {
      const file = `${rule}.md`;
      if (before.get(file)?.has(rule)) fired.push(rule);
      for (const reported of before.get(file) ?? []) {
        if (!after.get(file)?.has(reported)) fixable.add(reported);
      }
    }

    return { fixable: [...fixable].sort(), fired: fired.sort() };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
