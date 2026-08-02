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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './repo.ts';

/**
 * A throwaway repository sitting on `branch`, for the child's git to answer
 * from instead of this one.
 *
 * Needed because the branch this suite happens to be running on is not
 * controllable, and testing only the ambient one gets both directions wrong at
 * once: CI runs on `pull_request` and so is never on `main`, while the owner
 * mostly is — so the refusal would be the only thing ever exercised in CI, and
 * on `main` the gate would quietly assert nothing at all. A gate that goes
 * inert on the branch it protects is the vacuous-green trap this repo built
 * `expectFound` for.
 *
 * `GIT_DIR` redirects only *which repository git reads*. The script is the real
 * one, the guard is the real guard, and git really does resolve the branch —
 * nothing is stubbed except the checkout being asked about.
 */
function repoOn(branch: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'stacks-branch-'));
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '--quiet');
  // An unborn branch has no HEAD to abbreviate — `rev-parse` fails, and the
  // guard treats a git failure as "not a checkout" and allows the deploy. So
  // the repo needs a commit before the branch name means anything.
  git('-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid', 'commit',
      '--allow-empty', '-m', 'branch fixture', '--quiet');
  git('branch', '-M', branch);
  return dir;
}

const ON_MAIN = repoOn('main');
const OFF_MAIN = repoOn('some-feature');

afterAll(() => {
  for (const dir of [ON_MAIN, OFF_MAIN]) {
    // Windows will refuse while a handle inside .git is still closing, and a
    // few kilobytes left in the OS temp directory is not worth failing a gate
    // over — it is swept by the OS and by nothing this project owns.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* empty */
    }
  }
});

/**
 * Runs the deploy script far enough to see the branch decision, and no further.
 *
 * STACKS_VAULT points at nothing, which is the check immediately after the
 * branch guard — so whatever the guard decides, the script stops before it can
 * run a gate, stage a build or reach the network. A real environment variable
 * beats `.env`, so this holds on a machine that has a working deploy configured
 * and on CI, which has no `.env` at all.
 */
function deploy(
  options: { repo?: string; args?: readonly string[] } = {},
): { status: number; output: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(REPO_ROOT, 'scripts', 'deploy.ts'), ...(options.args ?? [])],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        SITE_URL: 'https://example.invalid',
        STACKS_VAULT: join(REPO_ROOT, 'no-such-vault-for-this-gate'),
        // Absent, the guard reads this checkout — which is what the last test
        // here wants and what every other test here must not depend on.
        ...(options.repo === undefined
          ? {}
          : { GIT_DIR: join(options.repo, '.git'), GIT_WORK_TREE: options.repo }),
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
    // Everything below distinguishes two messages. If the script began failing
    // earlier — a syntax error, a missing import — every assertion would still
    // be comparing strings, and the ones expecting a refusal would pass for the
    // wrong reason.
    expect(deploy({ repo: ON_MAIN }).output).toContain(PAST_THE_GUARD);
  });

  it('lets main through', () => {
    const { output } = deploy({ repo: ON_MAIN });

    expect(output, 'on main, the guard must not be what stops the deploy').toContain(
      PAST_THE_GUARD,
    );
    expect(output).not.toContain('not main');
  });

  it('refuses anything else, and says which branch and how to override', () => {
    const { status, output } = deploy({ repo: OFF_MAIN });

    expect(status).toBe(1);
    expect(output).toContain('not main');
    // Naming the branch is what proves the guard read one rather than matching
    // a constant — and a bare "wrong branch" leaves you checking which.
    expect(output).toContain('some-feature');
    expect(output, 'a refusal has to say how to override it').toContain('--any-branch');
    expect(output).not.toContain(PAST_THE_GUARD);
  });

  it('refuses a detached HEAD, which has no name to record', () => {
    const detached = repoOn('doomed');
    execFileSync('git', ['checkout', '--detach', '--quiet'], { cwd: detached, stdio: 'ignore' });

    expect(deploy({ repo: detached }).output).toContain('detached HEAD');
    rmSync(detached, { recursive: true, force: true });
  });

  it('exempts --dry-run and --check-only, which upload nothing', () => {
    // A dry run from a feature branch is exactly how someone checks this path
    // before merging it, so blocking it would punish the careful case.
    expect(deploy({ repo: OFF_MAIN, args: ['--dry-run'] }).output).toContain(PAST_THE_GUARD);
    expect(deploy({ repo: OFF_MAIN, args: ['--check-only'] }).output).not.toContain('not main');
  });

  it('takes --any-branch as the override, and nothing that merely resembles it', () => {
    expect(deploy({ repo: OFF_MAIN, args: ['--any-branch'] }).output).toContain(PAST_THE_GUARD);

    // An override you can stumble into is not one. These are what a
    // half-remembered flag becomes.
    for (const flag of ['--any', '--branch', '--anybranch', '--any_branch']) {
      expect(
        deploy({ repo: OFF_MAIN, args: [flag] }).output,
        `${flag} must not act as the override`,
      ).toContain('not main');
    }
  });

  it('reads the checkout it is actually in, not a fixture', () => {
    // Every test above redirects git at a scratch repository, which is what
    // makes both directions testable at all. This one does not, so it is the
    // only evidence that the guard is wired to the real thing. It asserts
    // whichever answer is correct here rather than skipping when inconvenient.
    const branch = currentBranch();
    const { output } = deploy();

    if (branch === 'main') expect(output).toContain(PAST_THE_GUARD);
    else expect(output).toContain(branch);
  });
});
