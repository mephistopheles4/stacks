/**
 * G66 — `minimumReleaseAge` is set, at seven days or more.
 *
 * For two months this repository's comments called pnpm's quarantine *seven
 * days by default*, and nothing set it. pnpm 11.18.0's own default resolved a
 * release two days old (#399), so the policy those comments relied on was
 * whatever pnpm happened to ship. This holds the stated policy to the file pnpm
 * actually reads: the key present, once, at the top level, as a plain integer
 * of at least 10080 minutes.
 *
 * ⚠️ **No YAML parser, on purpose.** The root has none, and adding a
 * dependency to read one key is the trade this repository declines. The reader
 * works on raw lines and reads **only a top-level mapping key**: a line starting
 * at column 0 that is not a comment. A value in a comment, nested under another
 * key, quoted, or written twice fails closed, like `private:`. A form it does
 * not recognise is a red build, not a pass.
 *
 * What this cannot see: whether pnpm honours the key. That was measured on
 * #399 — `pnpm config get minimumReleaseAge` reads 10080, and a frozen install
 * of a lockfile carrying a four-day-old entry fails under it.
 *
 * See docs/gates.md, row G66 (release-age), and pnpm-workspace.yaml.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './repo.ts';

/** Seven days, in the minutes pnpm reads. */
const FLOOR = 7 * 24 * 60;
const KEY = 'minimumReleaseAge';

type Reading = { readonly minutes: number } | { readonly problem: string };

/** Read the top-level `minimumReleaseAge` from a workspace file's text. */
const readReleaseAge = (text: string): Reading => {
  const lines = text.split(/\r?\n/);
  const hits = lines.filter((line) => /^minimumReleaseAge\s*:/.test(line));
  const [hit] = hits;
  if (hit === undefined) return { problem: `${KEY} is not set at the top level` };
  if (hits.length > 1) return { problem: `${KEY} is set ${hits.length} times` };
  const value = hit
    .slice(hit.indexOf(':') + 1)
    .replace(/\s+#.*$/, '')
    .trim();
  if (!/^\d+$/.test(value)) return { problem: `${KEY} is not a plain integer: ${value}` };
  return { minutes: Number(value) };
};

const problemOf = (text: string): string | undefined => {
  const reading = readReleaseAge(text);
  if ('problem' in reading) return reading.problem;
  return reading.minutes < FLOOR ? `${KEY} is ${reading.minutes}, under ${FLOOR}` : undefined;
};

const workspace = (...lines: string[]): string =>
  ['packages:', "  - 'packages/*'", '', ...lines, ''].join('\n');

describe('G66 — the release-age window is stated, at seven days or more', () => {
  it('passes the repository’s own pnpm-workspace.yaml', () => {
    const text = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(problemOf(text)).toBeUndefined();
  });

  it('passes seven days exactly, and longer', () => {
    expect(problemOf(workspace('minimumReleaseAge: 10080'))).toBeUndefined();
    expect(problemOf(workspace('minimumReleaseAge: 20160  # two weeks'))).toBeUndefined();
    expect(problemOf(workspace('minimumReleaseAge: 10080').replace(/\n/g, '\r\n'))).toBeUndefined();
  });

  it('fails when the key is absent — pnpm’s own default then decides', () => {
    expect(problemOf(workspace())).toMatch(/not set/);
  });

  it('fails one minute under seven days, and at a one-day window', () => {
    expect(problemOf(workspace('minimumReleaseAge: 10079'))).toMatch(/under 10080/);
    expect(problemOf(workspace('minimumReleaseAge: 1440'))).toMatch(/under 10080/);
    expect(problemOf(workspace('minimumReleaseAge: 0'))).toMatch(/under 10080/);
  });

  it('fails when the key appears only in a comment', () => {
    expect(problemOf(workspace('# minimumReleaseAge: 10080'))).toMatch(/not set/);
    expect(problemOf(workspace('#minimumReleaseAge: 10080'))).toMatch(/not set/);
  });

  it('fails when the key is nested under another key', () => {
    expect(problemOf(workspace('settings:', '  minimumReleaseAge: 10080'))).toMatch(/not set/);
  });

  it('fails a value that is not a plain integer', () => {
    expect(problemOf(workspace("minimumReleaseAge: '10080'"))).toMatch(/plain integer/);
    expect(problemOf(workspace('minimumReleaseAge: 7d'))).toMatch(/plain integer/);
    expect(problemOf(workspace('minimumReleaseAge:'))).toMatch(/plain integer/);
    expect(problemOf(workspace('minimumReleaseAge: -10080'))).toMatch(/plain integer/);
  });

  it('fails a key written twice, whichever value comes last', () => {
    expect(problemOf(workspace('minimumReleaseAge: 10080', 'minimumReleaseAge: 1440'))).toMatch(
      /set 2 times/,
    );
  });
});
