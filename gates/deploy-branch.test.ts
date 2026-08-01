/**
 * G17 — `pnpm deploy:site` publishes `main`, or says why not.
 *
 * Until worktrees, "am I on the right branch" answered itself: there was one
 * checkout and you were standing in it. Now there can be four, each on a
 * different branch, each with a shell open — and they all read the same `.env`,
 * so every one of them has SITE_URL and CF_PAGES_PROJECT and can publish to the
 * live domain with a command that looks identical from all four.
 *
 * The Decision Log already accepts that the live site may drift from `main`.
 * That was about *when* you deploy, with one place to deploy from. This is
 * about publishing a branch nobody has reviewed to the address people have,
 * which is the asymmetry this project keeps meeting: refusing wrongly costs one
 * flag, publishing wrongly is live and may already have been crawled.
 *
 * Driven through the real script rather than a extracted copy of its rule. A
 * guard that is unit-tested in isolation and not actually wired in is precisely
 * the failure this repo's reverse-asserts exist to catch.
 *
 * See docs/gates.md, row G17.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './repo.ts';

/**
 * Runs the deploy script far enough to see the branch decision, and no further.
 *
 * STACKS_VAULT points at nothing, which is the check immediately after the
 * branch guard — so whatever the guard decides, the script stops before it can
 * run a gate, stage a build or reach the network. A real environment variable
 * beats `.env`, so this holds on a machine that has a working deploy configured
 * and on CI, which has no `.env` at all.
 */
function deploy(...args: readonly string[]): { status: number; output: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(REPO_ROOT, 'scripts', 'deploy.ts'), ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        SITE_URL: 'https://example.invalid',
        STACKS_VAULT: join(REPO_ROOT, 'no-such-vault-for-this-gate'),
      },
    },
  );
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

function currentBranch(): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

/** The vault refusal — proof the run got past the branch guard. */
const PAST_THE_GUARD = 'STACKS_VAULT points at nothing';

describe('G17 — deploy publishes main', () => {
  it('reaches the branch decision at all', () => {
    // Everything below distinguishes two failure messages. If the script began
    // failing earlier — a syntax error, a missing import — every assertion
    // would still be comparing strings, and the ones expecting a refusal would
    // pass for the wrong reason.
    const { output } = deploy('--any-branch');
    expect(output).toContain(PAST_THE_GUARD);
  });

  it('refuses off main, and lets main through', () => {
    const branch = currentBranch();
    const { status, output } = deploy();

    expect(status).toBe(1);
    if (branch === 'main') {
      expect(output, 'on main, the guard must not be what stops the deploy').toContain(
        PAST_THE_GUARD,
      );
    } else {
      expect(output, `on "${branch}", the deploy must refuse`).toContain('not main');
      expect(output, 'the refusal has to say how to override it').toContain('--any-branch');
      expect(output).not.toContain(PAST_THE_GUARD);
    }
  });

  it('names the branch it refused, so the message is actionable', () => {
    const branch = currentBranch();
    if (branch === 'main') return; // Covered by the case above.

    // A bare "wrong branch" leaves you checking. This is also what proves the
    // guard read the branch rather than matching a constant.
    expect(deploy().output).toContain(branch);
  });

  it('exempts --dry-run, which uploads nothing', () => {
    // A dry run from a feature branch is exactly how someone checks this path
    // before merging it, so blocking it would punish the careful case.
    expect(deploy('--dry-run').output).toContain(PAST_THE_GUARD);
  });

  it('still refuses when only a lookalike flag is passed', () => {
    // `--any` and `--branch` are the two things a half-remembered override
    // becomes. Neither may work: an override you can stumble into is not one.
    for (const flag of ['--any', '--branch', '--anybranch']) {
      expect(deploy(flag).output, `${flag} must not act as the override`).toContain(
        currentBranch() === 'main' ? PAST_THE_GUARD : 'not main',
      );
    }
  });
});
