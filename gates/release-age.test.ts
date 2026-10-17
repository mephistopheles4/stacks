/**
 * G66 — `minimumReleaseAge` is set, at seven days or more.
 *
 * For two months this repository's comments called pnpm's quarantine *seven
 * days by default*, and nothing set it. pnpm 11.18.0's own default resolved a
 * release two days old (#399), so the policy those comments relied on was
 * whatever pnpm happened to ship. This holds the stated policy to the file pnpm
 * actually reads: the key present, once, at the top level, as a plain integer
 * of at least 10080 minutes. And the hatch, `minimumReleaseAgeExclude`, may
 * name only exact versions: pnpm takes `'*'` there as every package, so one
 * wildcard would switch the window off with the key still at 10080.
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

const EXCLUDE = 'minimumReleaseAgeExclude';

/** One exact `name@version`: no range, no wildcard, no bare name. */
const EXACT = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Problems with the top-level `minimumReleaseAgeExclude` list, the hatch.
 * pnpm 11.18.0 takes `'*'` there and resolves inside the window, and a bare
 * name exempts every version of it, both measured on #399. So each entry must
 * name one exact version, and any form this reader does not know fails closed.
 */
const excludeProblems = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((line, i) =>
    /^(['"]?)minimumReleaseAgeExclude\1\s*:/.test(line) ? [i] : [],
  );
  const [start] = starts;
  if (start === undefined) return [];
  if (starts.length > 1) return [`${EXCLUDE} is set ${starts.length} times`];
  const inline = lines[start]
    ?.slice(lines[start].indexOf(':') + 1)
    .replace(/\s+#.*$/, '')
    .trim();
  if (inline !== '') return [`${EXCLUDE} is not a block list: ${inline}`];
  const problems: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const body = line.replace(/\s+#.*$/, '').trim();
    if (body === '' || body.startsWith('#')) continue;
    const item = /^-\s+(['"]?)(.*)\1$/.exec(body)?.[2];
    if (item === undefined)
      problems.push(`${EXCLUDE} holds a line that is not a list item: ${body}`);
    else if (!EXACT.test(item)) problems.push(`${EXCLUDE} entry is not one exact version: ${item}`);
  }
  return problems;
};

/**
 * Settings that switch the window off with the key still at 10080, each
 * measured on pnpm 11.18.0 in #399: `minimumReleaseAgeStrict: false` writes an
 * exclude entry itself and resolves inside the window, and `trustLockfile:
 * true` lets a frozen install take a young lockfile entry. Absent is safe for
 * both. Present, each must hold its safe value, written plainly.
 */
const SAFE_VALUES: Readonly<Record<string, string>> = {
  minimumReleaseAgeStrict: 'true',
  trustLockfile: 'false',
};

const switchProblems = (text: string): string[] =>
  text.split(/\r?\n/).flatMap((line) => {
    const key = /^(['"]?)(\w+)\1\s*:/.exec(line)?.[2];
    if (key === undefined || !Object.hasOwn(SAFE_VALUES, key)) return [];
    const value = line
      .slice(line.indexOf(':') + 1)
      .replace(/\s+#.*$/, '')
      .trim();
    return value === SAFE_VALUES[key] ? [] : [`${key} weakens the window: ${value}`];
  });

const problemOf = (text: string): string | undefined => {
  const reading = readReleaseAge(text);
  if ('problem' in reading) return reading.problem;
  if (reading.minutes < FLOOR) return `${KEY} is ${reading.minutes}, under ${FLOOR}`;
  return [...switchProblems(text), ...excludeProblems(text)][0];
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

describe('G66 — no neighbouring setting switches the window off', () => {
  const beside = (line: string): string => workspace('minimumReleaseAge: 10080', line);

  it('passes each switch absent, or set to its safe value', () => {
    expect(problemOf(beside('minimumReleaseAgeStrict: true'))).toBeUndefined();
    expect(problemOf(beside('trustLockfile: false  # verify every install'))).toBeUndefined();
  });

  it('fails strict mode turned off, which falls back inside the window', () => {
    expect(problemOf(beside('minimumReleaseAgeStrict: false'))).toMatch(
      /weakens the window: false/,
    );
  });

  it('fails a trusted lockfile, which skips the frozen-install check', () => {
    expect(problemOf(beside('trustLockfile: true'))).toMatch(/weakens the window: true/);
  });

  it('fails a value it cannot read as safe, rather than passing over it', () => {
    expect(problemOf(beside("trustLockfile: 'false'"))).toMatch(/weakens the window/);
    expect(problemOf(beside('minimumReleaseAgeStrict: yes'))).toMatch(/weakens the window/);
    expect(problemOf(beside('minimumReleaseAgeStrict:'))).toMatch(/weakens the window/);
  });

  it('reads a quoted key, which pnpm reads as the same setting', () => {
    expect(problemOf(beside("'trustLockfile': true"))).toMatch(/weakens the window: true/);
    expect(problemOf(beside('"minimumReleaseAgeStrict": false'))).toMatch(/weakens the window/);
    expect(problemOf(beside("'minimumReleaseAgeExclude':\n  - '*'"))).toMatch(
      /not one exact version/,
    );
  });
});

describe('G66 — the hatch names one exact version, never a pattern', () => {
  const withExclude = (...items: string[]): string =>
    workspace('minimumReleaseAge: 10080', 'minimumReleaseAgeExclude:', ...items);

  it('passes the hatch beside the key, and does not read it as the key', () => {
    expect(problemOf(withExclude("  - 'postcss@8.5.30'"))).toBeUndefined();
    expect(
      problemOf(withExclude('  - postcss@8.5.30  # GHSA fix, remove 2026-10-20')),
    ).toBeUndefined();
    expect(problemOf(withExclude('  - "@astrojs/compiler-rs@0.5.2"'))).toBeUndefined();
    expect(problemOf(withExclude('  - nanoid@3.3.18-beta.1'))).toBeUndefined();
  });

  it('fails a wildcard, which pnpm takes as every package', () => {
    expect(problemOf(withExclude("  - '*'"))).toMatch(/not one exact version: \*/);
    expect(problemOf(withExclude("  - '@astrojs/*'"))).toMatch(/not one exact version/);
  });

  it('fails a bare name or a range, which exempt more than one version', () => {
    expect(problemOf(withExclude('  - postcss'))).toMatch(/not one exact version/);
    expect(problemOf(withExclude('  - postcss@^8.5.30'))).toMatch(/not one exact version/);
    expect(problemOf(withExclude('  - postcss@8.5.30 || 8.5.31'))).toMatch(/not one exact version/);
  });

  it('fails a form the reader does not know, rather than passing over it', () => {
    expect(
      problemOf(workspace('minimumReleaseAge: 10080', "minimumReleaseAgeExclude: ['*']")),
    ).toMatch(/not a block list/);
    expect(problemOf(withExclude('  postcss@8.5.30'))).toMatch(/not a list item/);
    expect(
      problemOf(
        withExclude('  - postcss@8.5.30').concat('minimumReleaseAgeExclude:\n  - x@1.0.0\n'),
      ),
    ).toMatch(/set 2 times/);
  });

  it('reads only the hatch’s own block, and stops at the next top-level key', () => {
    expect(
      problemOf(withExclude('  - postcss@8.5.30', 'overrides:', "  postcss: '^8.5.30'")),
    ).toBeUndefined();
  });
});
