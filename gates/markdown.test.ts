/**
 * G48 — the Markdown gate runs, and its fix pass cannot widen without saying so.
 *
 * Three live documentation defects existed that 45 gates could not see: a
 * six-cell row in a five-column table whose status glyph did not render at all,
 * a dead same-document anchor `gates/doc-links.test.ts` structurally cannot
 * reach because it skips every target starting with `#`, and a duplicate heading
 * in the one file G41 extracts *by heading*. The documentation here is parsed by
 * gates, so its shape is part of the contract rather than a matter of taste.
 *
 * ## Two clauses, because the tool has two failure modes and they are opposites
 *
 * **The check can stop running.** That is the ordinary one: a job deleted, a
 * `needs:` entry dropped, a step renamed. It is caught by reading the workflow,
 * on G42's precedent — a row whose gate is a CI job is *a row nothing can fail
 * on* unless something reads the job.
 *
 * **The fix can start rewriting something nobody measured**, and that one is
 * silent. At *default* rules a `--fix` pass over this tree changed 55 files,
 * turned 11 issue references into H1 headings, stripped an intentional space
 * from 16 code spans — ten of them the `` `; `` separator G31 gates, one of
 * them G41's own extraction regex — and renumbered a verbatim quotation.
 * **`pnpm test` on that damaged tree was all 1055 tests green.** The suite is
 * blind to every one of those, which is why the allowlist is a list and not a
 * test.
 *
 * ⚠️ **So the second clause measures rather than asks.** What a rule's fix
 * *does* is a property of a version, not of a tool, so a declaration that
 * markdownlint fixes seven rules would be a claim about 0.23.2 sitting in a file
 * that outlives it. The clause lints one probe document per adopted rule, fixes
 * them, lints again, and asserts that what actually changed is what two declared
 * lists name. A bump that makes an eighth rule fixable is red here and refused
 * by `pnpm lint:md:fix` before it touches a file — #235's debt 5 mechanised in
 * both places rather than written down in one.
 *
 * ⚠️ **The probe floor is the vacuous-green guard and it is the important
 * half.** Fixability is measured as *reported before, absent after*, so a rule
 * that stops firing on its own probe measures as unfixable — the widening this
 * gate exists to catch, arriving as a pass. Every adopted rule must fire.
 *
 * ⚠️ **And the measurement is only ever as wide as the *enabled* set, which
 * cost this row two unplanted defects.** `PROBES` is the population, so a rule
 * that is enabled and unprobed has a fix nobody measured and nothing refuses.
 * The config ran roughly thirty rules at their markdownlint defaults until two
 * reviewers each planted a file and ran the command: `pnpm lint:md:fix` rewrote
 * **MD009** and **MD010**, and a wider sweep found MD004, MD030, MD039, MD047
 * and MD058 on the same footing — all outside all three lists. The repair is
 * `"default": false`, and the clause holding the enabled set to the probe set
 * in both directions is what stops it rotting back.
 *
 * ## What this gate does not assert
 *
 * ⚠️ **It says nothing about whether the tree is clean.** That is `pnpm lint:md`'s
 * job and the `style` job's, and asserting it here would run the linter twice
 * per CI leg to report the same finding — the reason the check is a job beside
 * `audit` rather than a step in the `suite` matrix in the first place.
 *
 * ⚠️ **And nothing about CodeRabbit's copy.** The rules reconcile by
 * construction, because CodeRabbit reads `.markdownlint.jsonc` and skips its own
 * run once a workflow runs one. The *versions* cannot: it floats and this repo
 * pins only its own. Nothing here can see that half.
 *
 * See docs/gates.md, row G48 (markdown), and
 * docs/spec/static-analysis-and-style.md §6 step 2.
 */

import { describe, expect, it } from 'vitest';
import {
  CONFIG_FILE,
  FIXABLE_NOT_ALLOWLISTED,
  FIX_ALLOWLIST,
  MARKDOWN_GLOBS,
  PROBES,
  enabledRules,
  fixableRules,
  silentProbes,
  unmeasuredFindings,
} from '../scripts/lib/markdown-lint.ts';
import {
  AGENTS_DOC,
  aggregatorResultTests,
  jobsOf,
  markdownSection,
  readRepoFile,
} from './repo.ts';

const WORKFLOW = '.github/workflows/gates.yml';

/**
 * The jobs of the gates workflow, by name.
 *
 * `jobsOf` lives in `repo.ts`, and `action-pins` (G40, G42) reads it too. It was
 * a second, *differently written* parser here until review named it: two
 * implementations of one question agree until the file changes, and then the
 * wrong one is the one nobody re-read. That is what G10, G22, G23, G24 and G25
 * all exist to refuse, so a fresh instance of it would have been this repo's
 * most-gated smell arriving inside a new gate.
 */
const jobs = (): Map<string, string> => jobsOf(readRepoFile(WORKFLOW), WORKFLOW);

describe('G48 — the Markdown check runs on every pull request', () => {
  it('finds the jobs it is about to make claims about', () => {
    // `jobs()` throws when the block is gone; this catches the quieter failure
    // where it parses and finds nothing, which would make every clause below a
    // true statement about an empty map.
    expect([...jobs().keys()].length, `jobs parsed out of ${WORKFLOW}`).toBeGreaterThanOrEqual(4);
  });

  it('declares a job named `style`, beside `audit` and not inside the matrix', () => {
    expect(
      jobs().has('style'),
      `no job named \`style\` in ${WORKFLOW}. Its row in docs/gates.md says the Markdown ` +
        'rule set runs on every pull request, and without the job that row is a claim ' +
        'nothing can fail on',
    ).toBe(true);

    expect(
      jobs().get('style') ?? '',
      `the \`style\` job in ${WORKFLOW} no longer runs \`pnpm lint:md\`. The command is ` +
        'the gate; the job is only where it runs',
    ).toContain('pnpm lint:md');

    // The matrix runs two Node versions. A style verdict does not move with
    // one, so running it there would report the same finding twice — the
    // `audit` job's own stated rule, applied.
    expect(
      jobs().get('style') ?? '',
      `the \`style\` job in ${WORKFLOW} has grown a Node matrix. A Markdown rule break ` +
        'is the same on Node 22 and Node 24, and this job exists to say it once',
    ).not.toMatch(/matrix\.node/);
  });

  it('makes `gates` require it, and test its result against success', () => {
    const aggregator = jobs().get('gates') ?? '';

    expect(
      /needs:\s*\[[^\]]*\bstyle\b[^\]]*\]/.test(aggregator),
      `the \`gates\` aggregator in ${WORKFLOW} no longer lists \`style\` in its \`needs:\`. ` +
        '`gates` is the single required status check, so a job it does not need is a job ' +
        'that blocks nothing',
    ).toBe(true);

    // A `needs:` entry with no `result` test is a dependency that reports and
    // cannot refuse: skipped and cancelled both have to fail the gate rather
    // than pass it by omission, which is why this compares against 'success'.
    // `aggregatorResultTests` is in `repo.ts` because three gates ask it.
    const tested = aggregatorResultTests(aggregator);

    expect(
      tested,
      `the \`gates\` aggregator must compare \`needs.style.result\` against 'success'. ` +
        'Comparing against `failure` instead would let a skipped or cancelled style job ' +
        'through',
    ).toContain('style');
  });

  it('documents both commands where G14 reads them', () => {
    // G14 already holds AGENTS.md's Commands block to package.json in both
    // directions, so an undocumented script is red there. What it cannot say is
    // that the *fix* half exists: a repo that documented only `pnpm lint:md`
    // would pass G14 and leave the remedy unreachable, which is the reach test
    // this gate's routing depends on.
    const commands = markdownSection(readRepoFile(AGENTS_DOC), 'Commands', AGENTS_DOC);

    for (const command of ['pnpm lint:md', 'pnpm lint:md:fix']) {
      expect(
        commands,
        `${command} must stay documented in ${AGENTS_DOC}'s Commands block. A gate whose ` +
          'remedy is undocumented fails the reach test that admitted it',
      ).toContain(command);
    }
  });

  it('keeps `fixtures/` and nested `node_modules` out of the population', () => {
    // Both exclusions are measured rather than tidy. The fixture vault is data:
    // one of its notes is malformed on purpose, because invariant 3 requires it.
    // And `#node_modules` does *not* exclude nested `node_modules` — a run after
    // `pnpm install` linted 171 files instead of 156, pulled in 15 dependency
    // READMEs, and invented four rule classes that are not in this tree.
    expect(MARKDOWN_GLOBS, 'the fixture vault is data, not documents').toContain('!fixtures/**');
    expect(
      MARKDOWN_GLOBS,
      'the short `#node_modules` form misses nested `node_modules`, measured',
    ).toContain('!**/node_modules/**');
  });
});

describe('G48 — the fix pass rewrites what was measured, and nothing else', () => {
  it('pins the tool version exact', () => {
    // ADR-0067: a release that adds a rule turns an unchanged tree red, and a
    // caret range only moves that red onto whichever unrelated pull request
    // runs after the bump. The allowlist below is a claim about one version.
    const manifest = JSON.parse(readRepoFile('package.json')) as {
      devDependencies?: Record<string, string>;
    };
    const pinned = manifest.devDependencies?.['markdownlint-cli2'];

    expect(
      pinned,
      "markdownlint-cli2 must be pinned exact in package.json. What a rule's fix does " +
        'is a property of a version, and the fix allowlist is measured against one',
    ).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('turns off no rule without a written reason beside it', () => {
    // `.markdownlint.jsonc` is that filename because it takes comments *and* is
    // on CodeRabbit's recognised list. The comments are the point: a rule turned
    // off without its measurement is a rule the next session turns back on.
    const config = readRepoFile(CONFIG_FILE);
    const disabled = [...config.matchAll(/^\s*"(MD\d+)": false/gm)].map((match) => match[1]);

    expect(disabled.length, `rules turned off in ${CONFIG_FILE}`).toBeGreaterThanOrEqual(6);

    const lines = config.split('\n');
    const unexplained = disabled.filter((rule) => {
      const at = lines.findIndex((line) => new RegExp(`"${rule ?? ''}": false`).test(line));
      // The comment block immediately above the line that turns it off.
      return at < 1 || !/^\s*\/\//.test(lines[at - 1] ?? '');
    });

    expect(
      unexplained,
      `rules turned off in ${CONFIG_FILE} with no comment above them carrying the ` +
        `measurement that turned them off: ${unexplained.join(', ')}`,
    ).toEqual([]);
  });

  it('reads the config in every shape its own format permits', () => {
    // ⚠️ **This clause exists because the gate was stricter than the file it
    // reads.** `enabledRules` stripped `//` lines and handed the rest to
    // `JSON.parse`, which rejects a **trailing comma** — legal JSONC, accepted
    // by markdownlint-cli2, and so something a person may write in good faith.
    // Two readers of the same bytes disagreed and the stricter one was the
    // gate: `pnpm lint:md` stayed green while this spec failed with
    // `SyntaxError … at position 452`, naming neither the file nor the cause.
    //
    // Found by the #256 session when Prettier's `trailingComma: "all"` added
    // one. A formatter override stops the formatter; this asserts the class, so
    // a hand-edit cannot reopen it. Each variant below is the real config with
    // one legal JSONC construct added, and must read identically to it.
    const source = readRepoFile(CONFIG_FILE);
    const expected = enabledRules(source);

    // ⚠️ **Idempotent on purpose.** The first version appended a comma
    // unconditionally, so run against a file that already carried one it built
    // `,,` — not legal JSONC, correctly refused, and the clause failed for a
    // reason that had nothing to do with what it asserts. A variant builder has
    // to produce the same document from any starting state, or it tests the
    // starting state instead of the rule.
    // ⚠️ **Both anchors are line-anchored, and the block-comment one was not.**
    // It read `source.replace('{', …)`, which inserts at the *first* `{` in the
    // file — the opening brace today only because no header comment happens to
    // contain a brace. This config's comments discuss settings like
    // `{ "style": "compact" }`, so one such comment would put the insertion
    // inside a `//` line, make the variant a no-op, and fail the guard below
    // with a message about the wrong thing. `/^\{$/m` cannot match a comment
    // line. Raised as `js/incomplete-sanitization` by CodeQL — a false positive
    // as a *security* finding, since nothing here sanitises anything, and a
    // true one about the string handling, which is the third question
    // `docs/gates.md`'s triage section asks.
    const variants: Record<string, string> = {
      'a trailing comma before the closing brace': source.replace(/,?(\s*)\}(\s*)$/, ',$1}$2'),
      'a block comment': source.replace(/^\{$/m, '{\n  /* a block comment */'),
    };

    for (const [what, variant] of Object.entries(variants)) {
      expect(variant, `the ${what} variant did not change the source`).not.toBe(source);
      expect(
        enabledRules(variant),
        `${CONFIG_FILE} with ${what} must read the same as without it. JSONC permits it ` +
          'and the linter accepts it, so a gate that refuses it is stricter than the ' +
          'format its own file is named for',
      ).toEqual(expected);
    }
  });

  it('probes every rule the config enables, and enables every rule it probes', () => {
    // ⚠️ **The clause that closes the class, and it was found the hard way —
    // twice.** The fix measurement is only ever as wide as `PROBES`, so a rule
    // that is *enabled and unprobed* has a fix nobody measured and nothing will
    // refuse. This config ran roughly thirty rules at their markdownlint
    // defaults, and two independent reviewers each demonstrated the hole:
    // `pnpm lint:md:fix` rewrote **MD009** and **MD010** on a planted file with
    // no refusal, and a wider sweep found **MD004, MD030, MD039, MD047 and
    // MD058** fixable on the same footing. All seven were outside all three
    // lists.
    //
    // The repair is `"default": false` — the config now names its whole rule
    // set — and this clause is what stops it drifting back open. Both
    // directions: enable a rule without a probe and the fix set is unmeasured
    // again; probe a rule the config does not enable and the probe is measuring
    // markdownlint rather than this repository.
    const { rules, defaultOn } = enabledRules(readRepoFile(CONFIG_FILE));

    expect(
      defaultOn,
      `${CONFIG_FILE} must set \`"default": false\`. Without it every unnamed rule runs ` +
        'at its markdownlint default, and the fix-set measurement below — which probes ' +
        'only the named ones — reports those rules as unfixable because it never asks',
    ).toBe(false);

    expect(rules.length, `rules enabled in ${CONFIG_FILE}`).toBeGreaterThanOrEqual(12);

    expect(
      rules,
      `the rules ${CONFIG_FILE} enables are not the rules scripts/lib/markdown-lint.ts ` +
        'probes. An enabled rule with no probe has a fix nobody measured; a probe for a ' +
        'rule nobody enabled measures markdownlint rather than this repository',
    ).toEqual(PROBES.map(({ rule }) => rule).sort());
  });

  it('keeps every adopted rule breaking on its own probe', async () => {
    // The vacuous-green guard, and the half that matters. Fixability below is
    // measured as "reported before, absent after", so a rule that stops firing
    // measures as unfixable — the exact widening this gate exists to catch,
    // arriving as a pass.
    const { fired } = await fixableRules();
    const silent = silentProbes(fired);

    expect(
      silent,
      `rules whose probe in scripts/lib/markdown-lint.ts no longer breaks them: ` +
        `${silent.join(', ')}. The fixability measurement is only as wide as the rules ` +
        'that fire, so an unmeasured rule reads here as a rule that cannot be fixed',
    ).toEqual([]);
  }, 60_000);

  it('fixes exactly the seven allowlisted rules, plus the one declared exclusion', async () => {
    const { fixable } = await fixableRules();
    const declared = [...FIX_ALLOWLIST, ...FIXABLE_NOT_ALLOWLISTED].sort();

    // Both directions, and they fail differently. A fixable rule on neither
    // list is a version bump rewriting text nobody watched. A declared name
    // that is no longer fixable is a standing permission for a shape the tool
    // no longer produces — the category-1 failure docs/gate-register.md
    // catalogues, so it goes red rather than sitting there granting nothing.
    expect(
      fixable,
      'the rules markdownlint can rewrite are no longer the rules two declared lists ' +
        'name. Widened: apply the new rule by hand, read the diff, and add it to ' +
        'FIX_ALLOWLIST with what you saw. Narrowed: delete the name that no longer ' +
        'earns its place in scripts/lib/markdown-lint.ts',
    ).toEqual(declared);

    // The allowlist is seven names, and the exclusion is not folded into it.
    // Stated separately so that quietly promoting MD050 — which is fixable,
    // very likely safe, and has never had a finding here to measure — is a
    // visible diff rather than a list that grew by one.
    expect(FIX_ALLOWLIST.length, 'the measured-safe allowlist is seven rules').toBe(7);
    expect(
      FIX_ALLOWLIST.filter((rule) => FIXABLE_NOT_ALLOWLISTED.includes(rule)),
      'a rule cannot be both allowlisted and declared-excluded',
    ).toEqual([]);
  }, 60_000);

  it('refuses the whole pass when a declared-excluded rule has a finding', () => {
    // ⚠️ **This clause exists because the sentence it protects was false.** A
    // declared exclusion is not a rule the fix pass skips — nothing narrows the
    // run, which is the whole reason the allowlist is a refusal — so `--fix`
    // rewrote MD050 like any other enabled rule while four documents said it
    // would be left alone. Measured: `text __x__ text` became `text **x** text`.
    // The widening check above cannot catch it, because it only fires for a
    // rule on *neither* list.
    //
    // So the exclusion is enforced by declining the pass, and this is the
    // decision function. Kept pure so the refusal is asserted here rather than
    // only in a command nobody runs in CI.
    for (const rule of FIXABLE_NOT_ALLOWLISTED) {
      expect(
        unmeasuredFindings([rule, 'MD060']),
        `a finding on ${rule} must stop \`pnpm lint:md:fix\`, because the pass cannot be ` +
          'narrowed to leave that one rule alone',
      ).toEqual([rule]);
    }

    // And the reverse: an allowlisted rule must not stop it, or the fix command
    // refuses on every tree it exists to repair.
    expect(
      unmeasuredFindings(FIX_ALLOWLIST),
      'the measured-safe rules must not trip the refusal',
    ).toEqual([]);
  });
});
