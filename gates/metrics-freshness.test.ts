/**
 * G39 — the trend record is fresh, or `pnpm deploy:site` says which series is not.
 *
 * **The record's age is a property of the tree, so this could not be a `pnpm
 * test` assertion.** A freshness check in the suite goes red on a quiet week,
 * and a contributor opening a pull request after ten idle days would meet a red
 * gate whose remedy — *restart the nightly* — is not a diff they can make. *A
 * stranger paying for your dead pipe is not a gate; it is a tax.* So the gate is
 * the **deploy refusal**, and this file drives it.
 *
 * ⚠️ **The slug names the property checked, not the consequence**: *the record
 * is fresh*, not *the deploy refuses*.
 *
 * G17 (`deploy-branch`)'s idiom, for the same reason it was invented: the
 * record this checkout happens to hold is not controllable, and testing only
 * the ambient one gets both directions wrong at once. `GIT_DIR` redirects
 * **which repository git reads** — the script is the real one, the check is the
 * real check, and git really does resolve the refs. Nothing is stubbed except
 * the record being asked about.
 *
 * ⚠️ **What this file cannot plant is the calendar.** The dated bootstrap
 * expires on a day, and the deploy has no way to be told what day it is, so
 * *prints at 2 days, refuses at 4* is observed in
 * `scripts/lib/metrics-read.test.ts` against the judgement itself. What is
 * asserted here is that the script's behaviour today **agrees with that
 * judgement** — a wiring assertion that cannot expire, rather than a green that
 * quietly becomes false three days after the spine landed.
 *
 * See docs/gates.md, row G39 (metrics-freshness), and
 * docs/spec/trend-layer.md §4.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DAY, GATED_SERIES, SPINE_LANDED, judgeRecord } from '../scripts/lib/metrics-read.ts';
import { RECORD_DIR } from '../scripts/lib/metrics-record.ts';
import { renderMetrics, type RunFacts } from '../scripts/lib/metrics.ts';
import { expectFound, REPO_ROOT } from './repo.ts';

const NOW = Math.floor(Date.now() / 1000);

interface Planted {
  name: string;
  document: string;
}

/** A nightly — all four series, which is what the bound covers. */
function nightly(agoSeconds: number, sha = 'aaaaaaaa'): Planted {
  const timestamp = NOW - agoSeconds;
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
    } satisfies RunFacts),
  };
}

/** A merge row — one series, which is what `push: main` legitimately writes. */
function merge(agoSeconds: number, sha = 'bbbbbbbb'): Planted {
  const timestamp = NOW - agoSeconds;
  return {
    name: `${String(timestamp)}-${sha}.prom`,
    document: renderMetrics({
      timestamp,
      commit: sha.repeat(5),
      event: 'push',
      runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/2',
      // Nobody measured a window for a record this test invented.
      prWindow: 'unknown',
      expected: ['gate-suite-runtime'],
      gateSuiteRuntime: 9,
    } satisfies RunFacts),
  };
}

const scratch: string[] = [];

/**
 * A throwaway repository holding a planted record, for the child's git to read.
 *
 * `stored` is what the last `pnpm trend:sync` mirrored — the local store's view
 * — and `branch` is what the `metrics` branch holds **now**. Passing different
 * sets is what makes the disambiguating fetch's two messages testable: they are
 * one symptom with opposite fixes, and the whole point of spending a request is
 * telling them apart.
 */
function repoWith(stored: readonly Planted[] | undefined, branch?: readonly Planted[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'stacks-metrics-'));
  scratch.push(dir);

  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  const commit = (records: readonly Planted[]): string => {
    mkdirSync(join(dir, RECORD_DIR), { recursive: true });
    for (const record of records) writeFileSync(join(dir, RECORD_DIR, record.name), record.document, 'utf8');
    git('add', '-A');
    git('-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid', 'commit',
        '--allow-empty', '-m', 'records', '--quiet');
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  };

  git('init', '--quiet');
  // The branch guard runs first and reads this repository too, so it has to be
  // one the deploy is allowed to publish from — otherwise every test here would
  // be observing G17's refusal instead of this one.
  git('-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid', 'commit',
      '--allow-empty', '-m', 'root', '--quiet');
  git('branch', '-M', 'main');

  if (stored !== undefined) {
    // The mirror `pnpm trend:sync` writes and nothing else moves. `update-ref`
    // rather than a fetch: what is being planted is the state a sync left
    // behind, and reaching a network to establish it would defeat the point.
    git('update-ref', 'refs/remotes/origin/metrics', commit(stored));
  }
  if (branch !== undefined) {
    git('branch', 'metrics', commit(branch));
    // Origin is this same repository, so the probe fetch is a real fetch of a
    // real branch and reaches nothing outside the temp directory.
    git('remote', 'add', 'origin', dir);
  }
  return dir;
}

afterAll(() => {
  for (const dir of scratch) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows holds a handle inside .git a moment longer; the OS sweeps it. */
    }
  }
});

/**
 * Runs the deploy far enough to see the record decision, and no further.
 *
 * STACKS_VAULT points at nothing, which is the refusal immediately after this
 * check — so whatever it decides, the script stops before it can run a gate,
 * stage a build or reach the network.
 */
function deploy(repo: string, args: readonly string[] = []): { status: number; output: string } {
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
        GIT_DIR: join(repo, '.git'),
        GIT_WORK_TREE: repo,
      },
    },
  );
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

/** One ref of a scratch repository, or `''` where there is no such ref. */
function refAt(repo: string, ref: string): string {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], {
    cwd: repo,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

/** The vault refusal — proof the run got past the record check. */
const PAST_THE_CHECK = 'STACKS_VAULT points at nothing';

/**
 * The deploy stopped **here**, rather than somewhere later.
 *
 * ⚠️ **An exit code alone asserts nothing in this harness, and that was found
 * by planting it.** The sentinel that proves a run got past this check is
 * itself a refusal, so `status === 1` is true of a script that ignored the
 * record entirely and fell over on the vault a line later. Deleting the
 * refusal — printing the message and carrying on — left every exit-code
 * assertion here green. The discriminating fact is that the vault refusal was
 * **never reached**, which is G17's own idiom two rows down.
 */
function expectRefused(status: number, output: string): void {
  expect(status).toBe(1);
  expect(
    output,
    'the deploy must stop at the record, not carry on and fail at the next check',
  ).not.toContain(PAST_THE_CHECK);
}

describe('G39 — the harness reaches the check at all', () => {
  it('gets past a fresh record, and prints it', () => {
    // Without this every assertion below would still be comparing strings: a
    // syntax error or a missing import fails earlier, and the tests expecting a
    // refusal would pass for the wrong reason.
    const { output } = deploy(repoWith([nightly(3600)]));

    expect(output, 'a fresh record must not be what stops the deploy').toContain(PAST_THE_CHECK);
    expect(output).toContain('trend record');
    expect(output).toContain('71.71%');
    expect(output).not.toContain('is stale');
  });

  it('plants a record the writer would actually write', () => {
    // The documents here come from `renderMetrics`, so a parser tested against
    // them is agreeing with the writer rather than with this file's author.
    expectFound([...GATED_SERIES], 'series the bound covers', 4);
    expect(nightly(0).document).toContain('# EOF');
  });
});

describe('G39 — per-series, because the record is not one number', () => {
  it('refuses on a nightly four days back, naming which series is stale', () => {
    // The merge row on top is the failure an aggregate check cannot see: the
    // newest row in the store is minutes old and three quarters of the
    // instrument has been dead since Saturday.
    const { status, output } = deploy(repoWith([nightly(4 * DAY), merge(600)]));

    expectRefused(status, output);
    expect(output).toContain('the trend record is stale');
    expect(output).toContain('mutation-score');
    expect(output).toContain('mutation-run-runtime');
    expect(output).toContain('live-exclusions');
    // The series that is fine must not be named, or "which series" means
    // nothing and the refusal is an aggregate one wearing a list.
    expect(output).not.toContain('gate-suite-runtime ');
    expect(output).toContain('4 days ago');
  });

  it('refuses a series with no sample at all exactly as a stale one', () => {
    const { status, output } = deploy(repoWith([merge(600)]));

    expectRefused(status, output);
    expect(output).toContain('no sample at all');
    expect(output).toContain('mutation-score');
  });
});

describe('G39 — one fetch, two messages', () => {
  it('sends you to the sync when the branch has rows the store lacks', () => {
    const repo = repoWith([nightly(4 * DAY)], [nightly(4 * DAY), nightly(600, 'cccccccc')]);
    const before = refAt(repo, 'refs/remotes/origin/metrics');
    const { status, output } = deploy(repo);

    expectRefused(status, output);
    expect(output).toContain('pnpm trend:sync');
    expect(output).not.toContain('actions/workflows/metrics.yml');

    // ⚠️ **The probe must not move the mirror**, and the first implementation
    // did. An explicit refspec does not stop git *opportunistically* updating
    // the remote-tracking branch a fetched ref would normally land on, so the
    // probe was fast-forwarding the ref the staleness check reads — and the
    // refusal cleared itself on the second run, over a local Prometheus that
    // had imported nothing. Every test here passed either way; it was found by
    // running the refusal by hand and reading git's own output. See ADR-0060.
    expect(
      refAt(repo, 'refs/remotes/origin/metrics'),
      'only `pnpm trend:sync` may move the mirror — a probe that moves it lets the ' +
        'next deploy publish against a store that imported nothing',
    ).toBe(before);
    expect(refAt(repo, 'refs/remotes/origin/metrics-probe'), 'the probe ref is written').not.toBe(
      '',
    );
  });

  it('sends you to Actions when the branch is no fresher', () => {
    // Same symptom, opposite fix. Getting this backwards sends somebody to look
    // at CI while their own store is the thing that is behind.
    const stale = [nightly(4 * DAY)];
    const { status, output } = deploy(repoWith(stale, stale));

    expectRefused(status, output);
    expect(output).toContain('actions/workflows/metrics.yml');
    expect(output).toContain('nightly');
  });

  it('leaves the question open when there is no branch to ask', () => {
    const { output } = deploy(repoWith([nightly(4 * DAY)]));

    expect(output).toContain('could not be reached');
  });
});

describe('G39 — the dated bootstrap', () => {
  it('prints that no record has ever arrived, and agrees with the judgement about today', () => {
    // The calendar cannot be planted through the script, so what is asserted is
    // that the script and `judgeRecord` say the same thing on the day this
    // runs. An assertion of *does not refuse* would be a green that expires
    // three days after the spine landed — the exact decay this rollout is about.
    const { status, output } = deploy(repoWith(undefined));
    const verdict = judgeRecord({ now: NOW, records: [] });

    expect(output).toContain(`no record yet (spine landed ${SPINE_LANDED})`);
    if (verdict.kind === 'bootstrap') expect(output).toContain(PAST_THE_CHECK);
    else expectRefused(status, output);
  });
});

describe('G39 — which flags clear it', () => {
  it('refuses under --dry-run, which is the honest way to watch it fail', () => {
    const { status, output } = deploy(repoWith([merge(600)]), ['--dry-run']);

    expectRefused(status, output);
    expect(output).toContain('the trend record is stale');
  });

  it('reports instead of refusing under --check-only, which uploads nothing', () => {
    const { output } = deploy(repoWith([merge(600)]), ['--check-only']);

    expect(output).toContain('the trend record is stale');
    expect(output, '--check-only must reach the check it reports on').toContain(PAST_THE_CHECK);
  });
});
