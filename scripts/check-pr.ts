/**
 * G55 — the pull request title and body, checked where the strings actually are.
 *
 * This repository squash-merges with `PR_TITLE`/`PR_BODY`, so the title on the
 * pull request **is** the commit subject that lands on `main` and the body is
 * that commit's message. Nothing read either until this landed:
 * `docs/gates.md`'s *Not gated, deliberately* table carried the row, and
 * [ADR-0057](../docs/adr/0057-the-pull-request-title-is-the-commit-subject.md)
 * pointed at it.
 *
 * ⚠️ **Every string this reads arrives through the environment, never through
 * `${{ }}` in a `run:` step.** A pull request title is attacker-controlled text
 * and this workflow runs on fork pull requests by design; an expression pasted
 * into a script is substituted *before the shell starts*, so a hostile title
 * runs as code. `.github/workflows/gates.yml` passes them as `env:` and
 * `gates/pr-conventions.test.ts` refuses any `run:` step that does otherwise —
 * with zizmor's `template-injection` audit in the `audit` job as the check that
 * generalises to every later workflow ([ADR-0082](../docs/adr/0082-zizmor-lints-the-workflows.md)).
 *
 * The judgement is in `scripts/lib/pr-conventions.ts`, which reads nothing and
 * writes nothing. This is the input and output around it.
 *
 * Run by hand:
 *
 * ```sh
 * PR_TITLE='feat(site): a thing' PR_BODY="$(cat body.md)" pnpm exec tsx scripts/check-pr.ts
 * ```
 */

import { readFileSync } from 'node:fs';
import { pullRequestFaults } from './lib/pr-conventions.ts';

const TEMPLATE = '.github/pull_request_template.md';

function main(): void {
  // ⚠️ **The job runs on every event, including `push` to main, and must report
  // rather than skip.** The `gates` aggregator compares each dependency against
  // `success`, so a skipped job fails the required check — which would block
  // every merge. On a push there is no pull request to read, so this exits 0
  // having said so, and the job still reports.
  if (
    process.env.GITHUB_EVENT_NAME !== undefined &&
    process.env.GITHUB_EVENT_NAME !== 'pull_request'
  ) {
    console.log(
      `no pull request on a \`${process.env.GITHUB_EVENT_NAME}\` event — nothing to check`,
    );
    return;
  }

  const title = process.env.PR_TITLE ?? '';
  const body = process.env.PR_BODY ?? '';
  const author = process.env.PR_AUTHOR ?? '';

  if (title.length === 0) {
    // Not a pass. An empty title means the workflow stopped passing one, which
    // would make every clause below a true statement about nothing — the
    // vacuous green `gates/repo.ts` names `expectFound` after.
    console.error(
      'PR_TITLE is empty. The workflow passes it through `env:`; an empty one means the ' +
        'wiring broke, not that the title is fine.',
    );
    process.exitCode = 1;
    return;
  }

  const faults = pullRequestFaults({
    title,
    body,
    author,
    template: readFileSync(TEMPLATE, 'utf8'),
  });

  if (faults.length === 0) {
    console.log(`the title and body conform: ${title}`);
    return;
  }

  console.error(`This pull request's title or body does not conform (${faults.length}):\n`);
  for (const fault of faults) console.error(`  [${fault.kind}] ${fault.message}\n`);
  console.error(
    'The remedy is an edit to this pull request — no push needed, and anybody with write ' +
      'access can make it, including on a pull request from a fork. Editing the title or ' +
      'body re-runs this check.\n' +
      'The conventions are in AGENTS.md and docs/adr/0057-the-pull-request-title-is-the-commit-subject.md.',
  );
  process.exitCode = 1;
}

main();
