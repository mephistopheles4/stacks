/**
 * G55 — the pull request title and body are the strings that reach `main`, and
 * something reads them.
 *
 * This repository squash-merges with `squash_merge_commit_title: PR_TITLE` and
 * `squash_merge_commit_message: PR_BODY`. So the pull request title **is** the
 * commit subject on `main`, the local subject is discarded, and until this row
 * landed the one string that actually lands was the unchecked one — held up by
 * review attention alone. Measured 2026-08-26 and again 2026-09-03: nothing
 * anywhere in `.github/` read a title, and there was no `commitlint`, `husky` or
 * `lint-staged` in the tree.
 *
 * ⚠️ **A `commit-msg` hook is the wrong instrument and that is the interesting
 * half.** It validates the subject the author types locally — precisely the
 * string the squash throws away — so it would leave the landed subject unchecked
 * *while making the convention feel enforced*. A layer that reads as coverage
 * and is not is worse than the honest gap it replaces. #288 covers hook adoption
 * on its own terms; this needs no hook framework and no new npm dependency.
 *
 * ## What this asserts, and what `scripts/lib/pr-conventions.test.ts` asserts
 *
 * This spec reads the **disk**: that the checker's two lists are the two lists
 * `AGENTS.md` states, that the job exists and the aggregator requires it, that
 * all four `pull_request` events are named, and that no `run:` step in the
 * workflow interpolates event data into a shell. The **judgement** — which
 * titles pass, which fault a bad one is — is driven directly against the pure
 * module beside it, which is the split `vitest.config.ts` documents for
 * `scripts/`.
 *
 * ## The lists are parsed, not copied
 *
 * A checker that hard-coded the types and scopes would be a second copy of a
 * rule `AGENTS.md` already states, which is the drift G14 and G19 exist to
 * refuse elsewhere. ⚠️ **And a parse is only worth what its reach is** — this
 * repository has a gate that read 28 lines of a 155-line section while reading
 * as though it covered the whole thing. So both directions are asserted, both
 * are floored, and the reach was proved by changing the prose and watching this
 * go red; the observed-red line is in `docs/gate-register.md`.
 *
 * ## What it does not assert
 *
 * ⚠️ **It cannot prove the trigger list.** `on.pull_request.types` naming four
 * events is a claim about GitHub, and no local test can run one. What is
 * asserted is that the key is present and names all four — because a bare
 * `pull_request:` takes the default list and *adding* a `types:` key replaces
 * that default rather than extending it, so a partial list silently drops
 * events. That the `edited` event really re-runs the check has to be observed on
 * a live pull request; the runs are named in the register entry.
 *
 * ⚠️ **It does not read prose.** Whether the body's summary paragraph is any
 * good is outside this and outside every gate here. The rule reads headings and
 * the presence of text.
 *
 * ⚠️ **It says nothing about a branch name.** Not because CI cannot see one —
 * `github.head_ref` carries it on this very event. On **coverage**: `head_ref`
 * exists only on a pull request, so a branch that never opens one is never read,
 * and a check firing on some branches while reading as covering all of them is
 * the shape `docs/gates.md` is a list of.
 *
 * See docs/gates.md, row G55 (pr-conventions), and
 * docs/adr/0057-the-pull-request-title-is-the-commit-subject.md.
 */

import { describe, expect, it } from 'vitest';
import { SCOPES, TYPES, protectedQuestions } from '../scripts/lib/pr-conventions.ts';
import { AGENTS_DOC, expectFound, jobsOf, markdownSection, readRepoFile } from './repo.ts';

const WORKFLOW = '.github/workflows/gates.yml';
const TEMPLATE = '.github/pull_request_template.md';
const CHECKER = 'scripts/lib/pr-conventions.ts';

const jobs = (): Map<string, string> => jobsOf(readRepoFile(WORKFLOW), WORKFLOW);

/**
 * Every `run:` step of a workflow, as the script text the shell would receive.
 *
 * ⚠️ **Written by hand rather than as one regular expression, because the
 * regular expression was wrong and passed.** The first version anchored the
 * `run:` key at six spaces and allowed one optional `- name:` line before it —
 * which matches neither of the two shapes this file actually uses (`      - run:`
 * puts the key after a dash, and a named step puts it at eight spaces, often
 * with an `env:` block in between). It found eight *somethings*, cleared its own
 * floor, and **reported zero findings against a planted `${{ github.event… }}`
 * in the very step this row is about**. A confident zero from a matcher nobody
 * ran a known-bad input through: the failure this repository has now logged
 * enough times to have a name for.
 *
 * The rule is indentation, which is the only thing YAML guarantees here: a
 * block scalar's body is every following line indented further than its key, and
 * blank lines belong to it.
 */
function runSteps(source: string): string[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const steps: string[] = [];

  for (const [at, line] of lines.entries()) {
    const key = /^(\s*)(?:- )?run:(.*)$/.exec(line);
    if (key === null) continue;

    const indent = (key[1] ?? '').length;
    const block = [key[2] ?? ''];

    for (const following of lines.slice(at + 1)) {
      const width = /^\s*/.exec(following)?.[0].length ?? 0;
      if (following.trim().length > 0 && width <= indent) break;
      block.push(following);
    }

    steps.push(block.join('\n'));
  }

  return steps;
}

/**
 * The one sentence in `AGENTS.md` that states both lists, and the two code spans
 * inside it.
 *
 * Bounded to the sentence rather than swept over the whole section on purpose:
 * *"Working rules for agents"* is long, `core cli site gates docs ci` appears in
 * it more than once, and a sweep that happened to find the right span somewhere
 * else would be a gate agreeing with itself. The lead-in is matched literally,
 * so rewording it is red here rather than silently widening the search.
 */
function declaredLists(): { types: string[]; scopes: string[] } {
  const rules = markdownSection(readRepoFile(AGENTS_DOC), 'Working rules for agents', AGENTS_DOC);
  const sentence =
    /`<type>\(<scope>\): <subject>`, type from `([^`]+)`, scope optional and from `([^`]+)`/.exec(
      rules,
    );

  if (sentence === null) {
    throw new Error(
      `no commit-convention sentence in ${AGENTS_DOC}'s "Working rules for agents". This ` +
        'gate holds the checker to that prose, so a reworded sentence must fail here rather ' +
        'than reduce both directions below to assertions over nothing.',
    );
  }

  return {
    types: (sentence[1] ?? '')
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .sort(),
    scopes: (sentence[2] ?? '')
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .sort(),
  };
}

describe('G55 — the checker and AGENTS.md state one rule, not two', () => {
  it('finds both lists in the prose', () => {
    // The vacuous-green guard. Everything below is `toEqual` in both directions,
    // which an empty pair of sets satisfies perfectly.
    const { types, scopes } = declaredLists();

    expectFound(types, `commit types in ${AGENTS_DOC}`, 5);
    expectFound(scopes, `commit scopes in ${AGENTS_DOC}`, 3);
  });

  it('gives the checker exactly the types AGENTS.md declares', () => {
    expect(
      [...TYPES].sort(),
      `the types ${CHECKER} admits are not the types ${AGENTS_DOC} declares. They are one ` +
        'rule, so changing either without the other is the second copy ADR-0026 objects to. ' +
        'Move both, in one commit',
    ).toEqual(declaredLists().types);
  });

  it('gives the checker exactly the scopes AGENTS.md declares', () => {
    expect(
      [...SCOPES].sort(),
      `the scopes ${CHECKER} admits are not the scopes ${AGENTS_DOC} declares`,
    ).toEqual(declaredLists().scopes);
  });

  it('keeps the three branch prefixes that are not commit types out of the type list', () => {
    // `AGENTS.md` names `docs/`, `research/`, `prototype/` and `experiment/` as
    // local branch prefixes, deliberately, so nobody deletes them as
    // non-conformant. This is that care in reverse: a branch prefix is not a
    // commit type, and `docs` is the one of the four that is genuinely both.
    for (const prefix of ['research', 'prototype', 'experiment']) {
      expect(
        [...TYPES],
        `\`${prefix}\` is a branch prefix and not a commit type. Admitting one by analogy ` +
          `would let \`${prefix}: x\` land as a subject on main`,
      ).not.toContain(prefix);
    }
  });
});

describe('G55 — the two protected questions come out of the template', () => {
  it('finds exactly two, so neither the rule nor the file can drift alone', () => {
    // Derived rather than declared: the template tells an author to delete a
    // section that does not apply, then says the two questions may not be
    // deleted — so the protected set is *the headings that are questions*, which
    // is a property of the file. The count is asserted because a template edit
    // that adds or removes a question changes what the checker demands, and that
    // should be a visible red rather than a silent widening.
    expect(
      protectedQuestions(readRepoFile(TEMPLATE)),
      `${TEMPLATE} must carry exactly the two question headings the body rule protects. ` +
        'The rule reads them out of this file, so adding a third question quietly makes it ' +
        'mandatory and deleting one quietly stops it being checked',
    ).toEqual(['Which invariant does this touch?', 'Which gate would catch this breaking again?']);
  });

  it('keeps the template saying the two may not be deleted', () => {
    expect(
      readRepoFile(TEMPLATE),
      `${TEMPLATE} must keep telling authors not to delete the two questions. The checker ` +
        'enforces that sentence; without it the red arrives with no warning anywhere',
    ).toContain('Do not delete the two questions');
  });
});

describe('G55 — the check runs on every pull request, and on edits', () => {
  it('finds the jobs it is about to make claims about', () => {
    expect([...jobs().keys()].length, `jobs parsed out of ${WORKFLOW}`).toBeGreaterThanOrEqual(5);
  });

  it('declares a `conventions` job that runs the checker', () => {
    expect(
      jobs().has('conventions'),
      `no job named \`conventions\` in ${WORKFLOW}. Its row in docs/gates.md says the title ` +
        'and body are read on every pull request, and without the job that row is a claim ' +
        'nothing can fail on',
    ).toBe(true);

    expect(
      jobs().get('conventions') ?? '',
      `the \`conventions\` job in ${WORKFLOW} no longer runs \`scripts/check-pr.ts\``,
    ).toContain('scripts/check-pr.ts');
  });

  it('runs the job unconditionally, because a skipped dependency fails the aggregator', () => {
    // The workflow also runs on `push` to main, where there is no pull request.
    // A job-level `if:` would *skip* the job there, and the aggregator compares
    // each result against 'success' on purpose — so every push to main would
    // redden the required check. The script reads `GITHUB_EVENT_NAME` instead
    // and exits 0 with a line saying so.
    expect(
      jobs().get('conventions') ?? '',
      `the \`conventions\` job in ${WORKFLOW} has grown a job-level \`if:\`. The \`gates\` ` +
        'aggregator fails on a skipped dependency by design, so a conditional job turns the ' +
        'required check red on every push to main. Condition inside the script, not on the job',
    ).not.toMatch(/^ {4}if:/m);

    expect(
      readRepoFile('scripts/check-pr.ts'),
      'scripts/check-pr.ts must decide for itself when there is no pull request to read',
    ).toContain('GITHUB_EVENT_NAME');
  });

  it('names all four pull request events, because a `types:` key replaces the default', () => {
    // A bare `pull_request:` takes `opened`, `synchronize` and `reopened`.
    // Adding `types:` replaces that list rather than extending it, so all four
    // have to be named — and `edited` is the one this row needs, since the
    // remedy for its red is an edit to the title or the body.
    const types = /^ {2}pull_request:\n(?: {4}[^\n]*\n)*? {4}types: \[([^\]]+)\]/m.exec(
      readRepoFile(WORKFLOW),
    )?.[1];

    expect(
      types,
      `no \`types:\` list under \`pull_request:\` in ${WORKFLOW}. Without it the default ` +
        'three events apply and a title edit never re-runs this check, which leaves the red ' +
        'standing after the author has already fixed it',
    ).toBeDefined();

    expect(
      (types ?? '')
        .split(',')
        .map((event) => event.trim())
        .sort(),
      `${WORKFLOW} must name all four pull request events. Naming any of them replaces the ` +
        'default list rather than extending it, so a partial list silently drops events',
    ).toEqual(['edited', 'opened', 'reopened', 'synchronize']);
  });

  it('makes `gates` require it, and test its result against success', () => {
    const aggregator = jobs().get('gates') ?? '';

    expect(
      /needs:\s*\[[^\]]*\bconventions\b[^\]]*\]/.test(aggregator),
      `the \`gates\` aggregator in ${WORKFLOW} no longer lists \`conventions\` in its ` +
        '`needs:`. `gates` is the single required status check, so a job it does not need ' +
        'is a job that blocks nothing',
    ).toBe(true);

    const tested = [...aggregator.matchAll(/needs\.([\w-]+)\.result\s*\}\}"\s*=\s*"success"/g)].map(
      (match) => match[1],
    );

    expect(
      tested,
      "the `gates` aggregator must compare `needs.conventions.result` against 'success'. " +
        'Comparing against `failure` would let a skipped or cancelled job through',
    ).toContain('conventions');
  });
});

describe('G55 — the title reaches the checker as data, never as code', () => {
  it('passes every pull request string through `env:`', () => {
    const conventions = jobs().get('conventions') ?? '';

    for (const variable of ['PR_TITLE', 'PR_BODY', 'PR_AUTHOR']) {
      expect(
        conventions,
        `the \`conventions\` job in ${WORKFLOW} must hand ${variable} to the script through ` +
          '`env:`',
      ).toMatch(new RegExp(`^\\s+${variable}: \\$\\{\\{ github\\.event\\.pull_request\\.`, 'm'));
    }
  });

  it('interpolates no event data into any `run:` step in the workflow', () => {
    // ⚠️ **The hazard this whole row is built around.** A pull request title is
    // attacker-controlled text and this workflow runs on fork pull requests by
    // design. A `${{ }}` expression inside a `run:` block is substituted as text
    // *before the shell starts*, so a hostile title would run as code. The
    // `env:` form above hands it over as data.
    //
    // ⚠️ **Asserted over the whole file, not only the new job**, because the
    // failure is a class rather than an instance: the next job somebody adds
    // here is where it would arrive. `zizmor`'s `template-injection` audit in
    // the `audit` job carries it to every *other* workflow; this is the local
    // half, and it fails without a Python toolchain.
    const runs = runSteps(readRepoFile(WORKFLOW));

    // The floor is the vacuous-green guard, and on its own it is not enough:
    // the first version of this clause cleared a floor of eight while matching
    // the wrong eight things. The positive control is in the register entry —
    // the hazard planted in this file's own `conventions` step, through the
    // identical invocation.
    expectFound(runs, `\`run:\` steps in ${WORKFLOW}`, 12);

    const injecting = runs.filter((block) => /\$\{\{\s*(github\.event|inputs)\b/.test(block));

    expect(
      injecting,
      `\`run:\` steps in ${WORKFLOW} interpolating event data into a shell. A pull request ` +
        'title is attacker-controlled and this workflow runs on forks: the expression is ' +
        'substituted before the shell starts, so the title runs as code. Pass it through ' +
        `\`env:\` and read it as "$VAR": ${injecting.join('\n---\n')}`,
    ).toEqual([]);
  });

  it('runs zizmor in the `audit` job, pinned exact', () => {
    // The rule that generalises the clause above to every workflow added later,
    // including ones this spec does not name. Pinned exact for ADR-0067's
    // reason: a release that adds an audit turns an unchanged tree red on
    // whichever unrelated pull request runs after the bump.
    const audit = jobs().get('audit') ?? '';

    expect(
      audit,
      `the \`audit\` job in ${WORKFLOW} no longer runs zizmor. It is what catches a ` +
        '`template-injection` in a workflow this spec does not read — see ADR-0082',
    ).toContain('zizmor');

    expect(
      audit,
      'zizmor must be pinned to an exact version. A release that adds an audit turns an ' +
        'unchanged tree red on whichever unrelated pull request runs after the bump',
    ).toMatch(/zizmor==\d+\.\d+\.\d+/);
  });
});
