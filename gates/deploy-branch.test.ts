/**
 * G17 — `pnpm deploy:site` publishes `main`, or says why not.
 *
 * Until worktrees, "am I on the right branch" answered itself: there was one
 * checkout and you were standing in it. Now there can be four, each on a
 * different branch, each with a shell open — and they all read the same `.env`,
 * so every one of them has SITE_URL and CF_PAGES_PROJECT and can publish to the
 * live domain with a command that looks identical from all four.
 *
 * ADR-0019 already accepts that the live site may drift from `main`.
 * That was about *when* you deploy, with one place to deploy from. This is
 * about publishing a branch nobody has reviewed to the address people have,
 * which is the asymmetry this project keeps meeting: refusing wrongly costs one
 * flag, publishing wrongly is live and may already have been crawled.
 *
 * Driven through the real script rather than a extracted copy of its rule. A
 * guard that is unit-tested in isolation and not actually wired in is precisely
 * the failure this repo's reverse-asserts exist to catch.
 *
 * See docs/gates.md, row G17 (deploy-branch).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GATED_SERIES } from '../scripts/lib/metrics-read.ts';
import { RECORD_DIR } from '../scripts/lib/metrics-record.ts';
import { renderMetrics, type RunFacts } from '../scripts/lib/metrics.ts';
import { readRepoFile, REPO_ROOT } from './repo.ts';

/**
 * A nightly record written a minute ago — every gated series, so G39
 * (`metrics-freshness`) has nothing to refuse on.
 *
 * ⚠️ **This gate expired once without it.** The freshness check runs *before*
 * the vault refusal this file uses as its sentinel, and for three days after
 * the spine landed it let an empty store through as the dated bootstrap. On
 * day three every scratch repository here — which held no record at all —
 * became a stale one, and four rows went red on a calendar rather than a diff:
 * on `main`, on every pull request, and on the nightly whose record would have
 * cleared it, which runs this suite first and so could not write one. G39's
 * own header had named the trap — *a green that quietly becomes false three
 * days after the spine landed* — for its own assertions, and this file was the
 * one it did not reach.
 */
function freshNightly(): { name: string; document: string } {
  const timestamp = Math.floor(Date.now() / 1000) - 60;
  const sha = 'cccccccc';
  return {
    name: `${String(timestamp)}-${sha}.prom`,
    document: renderMetrics({
      timestamp,
      commit: sha.repeat(5),
      event: 'schedule',
      runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/1',
      // Nobody measured a window for a record this test invented.
      prWindow: 'unknown',
      expected: GATED_SERIES,
      mutationScore: [{ scope: 'packages/core/src', score: 0.7171 }],
      gateSuiteRuntime: 10,
      mutationRunRuntime: 1275,
      liveExclusions: { live: 0, declared: 27 },
      // ⚠️ Every CI-written series, or this record is not fresh — `GATED_SERIES`
      // covers whatever `TREND_SERIES` holds, so a series added anywhere lands
      // here. That is the same trap this file's header records, arriving by a
      // different route: not a calendar this time, but a list that grew.
      complexity: [
        { scope: 'packages/core/src', functions: 120, mass: 340, massOver10: 88, max: 21 },
      ],
    } satisfies RunFacts),
  };
}

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
 *
 * It also carries a fresh trend record at `refs/remotes/origin/metrics` — the
 * mirror `pnpm trend:sync` leaves behind, planted with `update-ref` exactly as
 * G39 does — so the run that crosses the branch guard reaches the vault
 * refusal rather than the freshness one. Each test here wants to observe one
 * decision, and this is the other decision on the path to the sentinel.
 */
function repoOn(branch: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'stacks-branch-'));
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  const commit = (message: string): string => {
    git('add', '-A');
    git('-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid', 'commit',
        '--allow-empty', '-m', message, '--quiet');
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  };
  git('init', '--quiet');
  // An unborn branch has no HEAD to abbreviate — `rev-parse` fails, and the
  // guard treats a git failure as "not a checkout" and allows the deploy. So
  // the repo needs a commit before the branch name means anything.
  commit('branch fixture');
  git('branch', '-M', branch);

  const record = freshNightly();
  mkdirSync(join(dir, RECORD_DIR), { recursive: true });
  writeFileSync(join(dir, RECORD_DIR, record.name), record.document, 'utf8');
  git('update-ref', 'refs/remotes/origin/metrics', commit('records'));
  // The record is on the mirrored ref, not on the branch under test — the
  // working tree goes back to the fixture it was, and HEAD stays on `branch`.
  git('reset', '--hard', '--quiet', 'HEAD~1');
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

/**
 * The trend-record line — proof the run got past the branch guard on a
 * checkout this file cannot plant a record into.
 *
 * Step 0b prints this before it judges anything, so it appears whether the
 * record is fresh, stale or absent; and the guard's `fail()` never returns, so
 * seeing it at all means the guard allowed the run. That makes it the sentinel
 * for the one test here that reads the real checkout, where `PAST_THE_GUARD`
 * lies past a check the environment decides.
 */
const PAST_THE_STEP = 'trend record —';

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

  it('ships a command that supplies no argv of its own', () => {
    // ⚠️ **The remedy `docs/gate-register.md` named for this row and did not
    // build.** Every case here spawns `scripts/deploy.ts` directly, so the argv
    // the *shipped* command supplies is outside the gate's reach: baking
    // `--any-branch` into `package.json` leaves the whole suite green while
    // every deploy overrides the guard, and the script's own written property —
    // that the override "reads in shell history as what it is" — is false while
    // nothing is red.
    //
    // Built while landing G39 (`metrics-freshness`), which inherits the hole
    // exactly: `--check-only` baked in here would downgrade that refusal to a
    // warning with its gate still green. One assertion, in the row whose remedy
    // it is, rather than a copy in each.
    const scripts = (
      JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> }
    ).scripts;

    expect(
      scripts['deploy:site'],
      'deploy:site must pass no arguments of its own — a flag baked in here is an ' +
        'override that appears in nobody shell history and reddens nothing',
    ).toBe('tsx scripts/deploy.ts');
  });

  it('reads the checkout it is actually in, not a fixture', () => {
    // Every test above redirects git at a scratch repository, which is what
    // makes both directions testable at all. This one does not, so it is the
    // only evidence that the guard is wired to the real thing. It asserts
    // whichever answer is correct here rather than skipping when inconvenient.
    const branch = currentBranch();
    const { output } = deploy();

    // ⚠️ **Not `PAST_THE_GUARD`, and the difference is the whole bug this
    // line was written for.** The vault refusal sits past G39's freshness
    // check, which reads a mirrored `refs/remotes/origin/metrics` that **no
    // `actions/checkout` has** — so on a CI checkout of `main` the run
    // refuses on the record and never reaches the vault at all. The scratch
    // repositories above can plant that mirror; this one is the real
    // checkout by definition and cannot. So the sentinel moves *upstream* of
    // every environment-dependent check to the one line that is printed
    // unconditionally at step 0b — which `fail()` never returning makes
    // proof that the guard let this run through, the only thing this row
    // claims.
    //
    // It was invisible until it was red on `main` and nowhere else: CI on
    // `pull_request` is never on `main`, so no pull request can run this
    // branch of it. The old sentinel also held only while the owner's local
    // mirror was fresh, and would have failed on their machine after four
    // quiet days.
    if (branch === 'main') {
      expect(output, 'on main, the guard must let the run reach step 0b').toContain(PAST_THE_STEP);
      expect(output, 'the branch guard must not be what stopped it').not.toContain('not main');
    } else expect(output).toContain(branch);
  });
});
