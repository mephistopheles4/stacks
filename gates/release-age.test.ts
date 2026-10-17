/**
 * G67 — `minimumReleaseAge` is set, at seven days or more, and its side doors
 * are shut.
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
 * #459 shut the four doors #449's review left open; the first three are held
 * here and the fourth is a diff check:
 *
 * 1. `minimumReleaseAgeIgnoreMissingTime: false`, required, and a lockfile
 *    whose every resolution is integrity-only. ⚠️ The key does **not** stop a
 *    git or tarball dependency (measured); the lockfile rule is what does.
 * 2. `trustPolicy: no-downgrade`, required, with `trustPolicyExclude` held to
 *    exact versions, each naming a package the lockfile holds, and
 *    chromium-bidi's following `puppeteer-core`'s snapshot. No
 *    `trustPolicyIgnoreAfter`, `configDependencies` or `pnpmfile`.
 * 3. wrangler an exact root devDependency, and `scripts/deploy.ts` running it
 *    through `pnpm exec` and no other way.
 * 4. The github-actions cooldown in `dependabot.yml` is **not** gated, matching
 *    the npm entry's.
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
 * See docs/gates.md, row G67 (release-age), and pnpm-workspace.yaml.
 */

import { readdirSync, readFileSync } from 'node:fs';
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
const TRUST_EXCLUDE = 'trustPolicyExclude';

/** One exact `name@version`: no range, no wildcard, no bare name. */
const EXACT = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** A list key's entries, and what is wrong with how it is written. */
interface ListReading {
  readonly problems: string[];
  readonly items: string[];
}

/**
 * Read a top-level block list, entry by entry.
 *
 * pnpm 11.18.0 takes `'*'` in the age hatch and resolves inside the window, and
 * a bare name exempts every version, both measured on #399; `trustPolicyExclude`
 * takes the same patterns (#459). So each entry must name one exact version,
 * and any form this reader does not know fails closed.
 */
const readList = (text: string, key: string): ListReading => {
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((line, i) =>
    new RegExp(`^(['"]?)${key}\\1\\s*:`).test(line) ? [i] : [],
  );
  const [start] = starts;
  if (start === undefined) return { problems: [], items: [] };
  if (starts.length > 1) return { problems: [`${key} is set ${starts.length} times`], items: [] };
  const inline = lines[start]
    ?.slice(lines[start].indexOf(':') + 1)
    .replace(/\s+#.*$/, '')
    .trim();
  if (inline !== '') return { problems: [`${key} is not a block list: ${inline}`], items: [] };
  const problems: string[] = [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const body = line.replace(/\s+#.*$/, '').trim();
    if (body === '' || body.startsWith('#')) continue;
    const item = /^-\s+(['"]?)(.*)\1$/.exec(body)?.[2];
    if (item === undefined) problems.push(`${key} holds a line that is not a list item: ${body}`);
    else if (!EXACT.test(item)) problems.push(`${key} entry is not one exact version: ${item}`);
    else items.push(item);
  }
  return { problems, items };
};

/** Problems with the top-level `minimumReleaseAgeExclude` list, the hatch. */
const excludeProblems = (text: string): string[] => readList(text, EXCLUDE).problems;

/**
 * Keys that must be present at one plain value, because pnpm's default for each
 * is the unsafe one. Unlike `SAFE_VALUES` below, absent fails.
 */
const REQUIRED_VALUES: Readonly<Record<string, string>> = {
  minimumReleaseAgeIgnoreMissingTime: 'false',
  trustPolicy: 'no-downgrade',
};

const requiredProblems = (text: string): string[] =>
  Object.entries(REQUIRED_VALUES).flatMap(([key, wanted]) => {
    const hits = text
      .split(/\r?\n/)
      .filter((line) => new RegExp(`^(['"]?)${key}\\1\\s*:`).test(line));
    const [hit] = hits;
    if (hit === undefined) return [`${key} is not set at the top level`];
    if (hits.length > 1) return [`${key} is set ${hits.length} times`];
    const value = hit
      .slice(hit.indexOf(':') + 1)
      .replace(/\s+#.*$/, '')
      .trim();
    return value === wanted ? [] : [`${key} must be ${wanted}, not ${value}`];
  });

/**
 * Keys that must not appear at all. `trustPolicyIgnoreAfter` narrows the trust
 * check for any value, and nothing here needs it. `configDependencies` and
 * `pnpmfile` change pnpm at runtime: pnpm's docs say their hooks can rewrite
 * settings, and that a pinned config dependency skips the window.
 */
const FORBIDDEN_KEYS = ['trustPolicyIgnoreAfter', 'configDependencies', 'pnpmfile'];

const forbiddenProblems = (text: string, rootFiles: readonly string[]): string[] => [
  ...text
    .split(/\r?\n/)
    .flatMap((line) => {
      const key = /^(['"]?)(\w+)\1\s*:/.exec(line)?.[2];
      return key !== undefined && FORBIDDEN_KEYS.includes(key) ? [key] : [];
    })
    .map((key) => `${key} is set, and it changes or narrows what pnpm checks`),
  ...rootFiles
    .filter((name) => name.startsWith('.pnpmfile.'))
    .map((name) => `${name} exists at the repository root, and a pnpmfile can rewrite settings`),
];

/** The `packages:` section's keys, as written. */
const lockPackageKeys = (lock: string): string[] => {
  const lines = lock.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) return [];
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (/^ {2}[^\s#]/.test(line)) keys.push(line.trim());
  }
  return keys;
};

const bareKey = (key: string): string => key.replace(/:.*$/, '').replace(/^'(.*)'$/, '$1');

/**
 * An exclude naming a version the lockfile no longer holds would let that exact
 * version back in, unreviewed, the day a later lockfile resolved it.
 */
const staleProblems = (text: string, lock: string): string[] => {
  const held = new Set(lockPackageKeys(lock).map(bareKey));
  return [EXCLUDE, TRUST_EXCLUDE].flatMap((key) =>
    readList(text, key)
      .items.filter((item) => !held.has(item))
      .map((item) => `${key} entry ${item} is not a package the lockfile holds`),
  );
};

/** The only resolution a package may carry: an integrity hash, and nothing else. */
const INTEGRITY_ONLY = /^\{\s*integrity:\s*sha512-[A-Za-z0-9+/]+={0,2}\s*\}$/;

/**
 * Door 1's real closer. `minimumReleaseAgeIgnoreMissingTime: false` does not
 * stop a git or tarball dependency (measured, #459), but pnpm writes those with
 * a `tarball:` or `gitHosted:` key in the resolution, so a lockfile whose every
 * resolution is integrity-only holds none. The count check catches a resolution
 * spelled some way the key reader misses.
 */
const lockProblems = (lock: string): string[] => {
  const problems: string[] = [];
  let integrityOnly = 0;
  lock.split(/\r?\n/).forEach((line, i) => {
    const match = /^\s*(['"]?)resolution\1\s*:(.*)$/.exec(line);
    if (match === null) return;
    const value = (match[2] ?? '').replace(/\s+#.*$/, '').trim();
    if (INTEGRITY_ONLY.test(value)) integrityOnly += 1;
    else
      problems.push(
        `pnpm-lock.yaml line ${i + 1} is not an integrity-only resolution: ${line.trim()}`,
      );
  });
  const keys = lockPackageKeys(lock).length;
  if (integrityOnly === 0) problems.push('pnpm-lock.yaml holds no integrity-only resolution');
  else if (keys !== integrityOnly) {
    problems.push(
      `pnpm-lock.yaml holds ${keys} package keys but ${integrityOnly} integrity-only resolutions`,
    );
  }
  return problems;
};

/**
 * chromium-bidi is token-published where its earlier releases carried
 * provenance, so its trust exclude may follow only a provenance-published
 * `puppeteer-core`, whose snapshot pins exactly one version of it. The
 * parenthesised peer suffix is stripped before comparing.
 */
const chromiumBidiProblems = (text: string, lock: string): string[] => {
  const entry = readList(text, TRUST_EXCLUDE).items.find((item) =>
    item.startsWith('chromium-bidi@'),
  );
  if (entry === undefined) return [];
  const dependents: { snapshot: string; version: string }[] = [];
  let section = '';
  let snapshot = '';
  for (const line of lock.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      section = line;
      continue;
    }
    // A workspace package depending on it directly sits under `importers:`.
    if (section.startsWith('importers:') && /^ {6}'?chromium-bidi'?:/.test(line)) {
      dependents.push({ snapshot: 'an importer', version: '' });
    }
    if (!section.startsWith('snapshots:')) continue;
    if (/^ {2}[^\s#]/.test(line)) snapshot = bareKey(line.trim());
    const dep = /^ {6}'?chromium-bidi'?:\s*(\S+)/.exec(line);
    if (dep?.[1] !== undefined) {
      dependents.push({ snapshot, version: dep[1].replace(/\(.*$/, '') });
    }
  }
  const [other] = dependents.filter((dep) => !dep.snapshot.startsWith('puppeteer-core@'));
  if (other !== undefined) {
    return [`${other.snapshot} depends on chromium-bidi, and only puppeteer-core may`];
  }
  const versions = new Set(dependents.map((dep) => `chromium-bidi@${dep.version}`));
  if (versions.size === 0) return [`no puppeteer-core snapshot depends on ${entry}`];
  return versions.size === 1 && versions.has(entry)
    ? []
    : [`${entry} is not the version puppeteer-core depends on: ${[...versions].join(', ')}`];
};

/** The root manifest must pin wrangler as one exact version. */
const pinProblems = (packageJson: string): string[] => {
  let pin: unknown;
  try {
    const manifest = JSON.parse(packageJson) as { devDependencies?: Record<string, unknown> };
    pin = manifest.devDependencies?.['wrangler'];
  } catch {
    return ['package.json is not readable JSON'];
  }
  return typeof pin === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pin)
    ? []
    : [
        `package.json must pin wrangler in devDependencies as one exact version, not ${String(pin)}`,
      ];
};

/**
 * `scripts/deploy.ts` runs at import, so G67 reads its source text. An
 * allowlist, as invariant 2 is: the upload's argument list starts
 * `'exec', 'wrangler'`, the printed command starts `pnpm exec wrangler`, and
 * every other way of naming a package runner fails closed.
 */
const deployProblems = (source: string): string[] => {
  const problems: string[] = [];
  const runner = /\b(?:dlx|npx|pnpx|bunx)\b|--package\b/.exec(source);
  if (runner !== null) problems.push(`deploy.ts names a package runner: ${runner[0]}`);
  if (source.includes('wrangler@')) problems.push('deploy.ts names a wrangler version of its own');
  // Whole-line comments talk about wrangler in backticks; code is what runs.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const named = (code.match(/['"`]wrangler\b/g) ?? []).length;
  const listed = (code.match(/(?<='exec',\s*)'wrangler'/g) ?? []).length;
  if (named !== 1 || listed !== 1) {
    problems.push("deploy.ts runs wrangler other than as 'exec', 'wrangler' in one upload call");
  }
  // The two lines that make the form safe: the refusal, and the narrowed env.
  for (const line of ['fail(wranglerRefusal)', 'uploadEnv(process.env, loadedEnvKeys)']) {
    if (!source.includes(line)) problems.push(`deploy.ts no longer holds ${line}`);
  }
  if ((source.match(/to publish: pnpm exec wrangler /g) ?? []).length !== 1) {
    problems.push('deploy.ts does not print exactly one `pnpm exec wrangler` command');
  }
  if (/\bpnpm\s+(?!exec\s+wrangler\b)[\w:-]+\s+wrangler\b/.test(source)) {
    problems.push('deploy.ts runs wrangler through a pnpm form other than exec');
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

/** What G67 reads beside the workspace text; each part is skipped when absent. */
interface Beside {
  readonly lock?: string;
  readonly rootFiles?: readonly string[];
}

const problemOf = (text: string, beside: Beside = {}): string | undefined => {
  const reading = readReleaseAge(text);
  if ('problem' in reading) return reading.problem;
  if (reading.minutes < FLOOR) return `${KEY} is ${reading.minutes}, under ${FLOOR}`;
  const { lock, rootFiles = [] } = beside;
  return [
    ...switchProblems(text),
    ...excludeProblems(text),
    ...requiredProblems(text),
    ...readList(text, TRUST_EXCLUDE).problems,
    ...forbiddenProblems(text, rootFiles),
    ...(lock === undefined
      ? []
      : [...lockProblems(lock), ...staleProblems(text, lock), ...chromiumBidiProblems(text, lock)]),
  ][0];
};

/** A workspace with the two keys pnpm defaults unsafely, unless a test removes them. */
const workspace = (...lines: string[]): string =>
  [
    'packages:',
    "  - 'packages/*'",
    '',
    'minimumReleaseAgeIgnoreMissingTime: false',
    'trustPolicy: no-downgrade',
    ...lines,
    '',
  ].join('\n');

/** A workspace with neither, for the tests that plant their own. */
const bare = (...lines: string[]): string =>
  ['packages:', "  - 'packages/*'", '', ...lines, ''].join('\n');

/** The smallest lockfile G67 reads as sound: two packages, integrity-only. */
const lockfile = (...extra: string[]): string =>
  [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    devDependencies:',
    '      puppeteer-core:',
    '        specifier: ^25.13.0',
    '        version: 25.13.0',
    '',
    'packages:',
    '',
    '  chromium-bidi@157.0.8090-0:',
    '    resolution: {integrity: sha512-AAAA+/bb==}',
    '',
    "  '@scope/bar@2.0.0':",
    '    resolution: {integrity: sha512-BBBB}',
    '',
    '  puppeteer-core@25.13.0:',
    '    resolution: {integrity: sha512-CCCC}',
    '',
    'snapshots:',
    '',
    "  '@scope/bar@2.0.0': {}",
    '',
    '  chromium-bidi@157.0.8090-0(devtools-protocol@0.0.1696802): {}',
    '',
    '  puppeteer-core@25.13.0:',
    '    dependencies:',
    '      chromium-bidi: 157.0.8090-0(devtools-protocol@0.0.1696802)',
    ...extra,
    '',
  ].join('\n');

const TRUSTED = ['trustPolicyExclude:', '  - chromium-bidi@157.0.8090-0'];

const read = (name: string): string => readFileSync(join(REPO_ROOT, name), 'utf8');

describe('G67 — the release-age window is stated, at seven days or more', () => {
  it('passes the repository’s own pnpm-workspace.yaml, lockfile, manifest and deploy script', () => {
    const rootFiles = readdirSync(REPO_ROOT);
    expect(
      problemOf(read('pnpm-workspace.yaml'), { lock: read('pnpm-lock.yaml'), rootFiles }),
    ).toBeUndefined();
    expect(pinProblems(read('package.json'))).toEqual([]);
    expect(deployProblems(read('scripts/deploy.ts'))).toEqual([]);
    // C3's first half: the list is these three and nothing else.
    expect(readList(read('pnpm-workspace.yaml'), TRUST_EXCLUDE).items).toEqual([
      'semver@6.3.1',
      'chokidar@4.0.3',
      'chromium-bidi@157.0.8090-0',
    ]);
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

describe('G67 — no neighbouring setting switches the window off', () => {
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

describe('G67 — the hatch names one exact version, never a pattern', () => {
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

describe('G67 — door 1: a publish time is required, and the lockfile holds no tarball', () => {
  const age = 'minimumReleaseAge: 10080';

  it('requires minimumReleaseAgeIgnoreMissingTime to be exactly false (C1)', () => {
    const missing = 'minimumReleaseAgeIgnoreMissingTime';
    expect(problemOf(bare(age, 'trustPolicy: no-downgrade'))).toMatch(
      new RegExp(`${missing} is not set`),
    );
    for (const line of [
      `${missing}: true`,
      `${missing}: 'false'`,
      `${missing}: "false"`,
      `${missing}:`,
      `# ${missing}: false`,
      `  ${missing}: false`,
    ]) {
      expect(problemOf(bare(age, line, 'trustPolicy: no-downgrade')), line).toMatch(
        new RegExp(missing),
      );
    }
    expect(
      problemOf(bare(age, `${missing}: false  # defence in depth`, 'trustPolicy: no-downgrade')),
    ).toBeUndefined();
  });

  it('holds every lockfile resolution to integrity-only (C5)', () => {
    const sound = lockfile();
    expect(problemOf(workspace(age), { lock: sound })).toBeUndefined();
    expect(problemOf(workspace(age), { lock: sound.replace(/\n/g, '\r\n') })).toBeUndefined();
    const real = read('pnpm-lock.yaml').replace(/\r\n/g, '\n');
    expect(lockProblems(real)).toEqual([]);
    expect(lockProblems(real.replace(/\n/g, '\r\n'))).toEqual([]);

    const planted: readonly (readonly [string, string])[] = [
      [
        'a tarball key',
        '    resolution: {integrity: sha512-AAAA, tarball: https://x.example/a.tgz}',
      ],
      [
        'a gitHosted key',
        '    resolution: {gitHosted: true, tarball: https://codeload.github.com/a/b}',
      ],
      ['a git resolution', '    resolution:\n      type: git\n      repo: https://github.com/a/b'],
      ['a sha1 integrity', '    resolution: {integrity: sha1-AAAA}'],
      ['a quoted key', "    'resolution': {tarball: https://x.example/a.tgz}"],
      ['an oddly spaced key', '    resolution  :{tarball: https://x.example/a.tgz}'],
    ];
    for (const [name, line] of planted) {
      const lock = sound.replace('    resolution: {integrity: sha512-BBBB}', line);
      expect(lockProblems(lock), name).not.toEqual([]);
    }
    const extraKey = sound.replace(
      '\nsnapshots:',
      "\n  extra@1.0.0:\n    engines: {node: '>=1'}\n\nsnapshots:",
    );
    expect(lockProblems(extraKey)).toEqual([expect.stringMatching(/4 package keys but 3/)]);
    expect(lockProblems(sound.replace(/ {4}resolution:.*\n/g, ''))).toEqual([
      expect.stringMatching(/no integrity-only/),
    ]);
  });
});

describe('G67 — door 2: the trust policy is on, and its excludes are held', () => {
  const age = 'minimumReleaseAge: 10080';

  it('requires trustPolicy to be exactly no-downgrade (C2)', () => {
    const missingIgnore = 'minimumReleaseAgeIgnoreMissingTime: false';
    expect(problemOf(bare(age, missingIgnore))).toMatch(/trustPolicy is not set/);
    for (const value of ['off', 'no-downgrade-ish', "'no-downgrade'"]) {
      expect(problemOf(bare(age, missingIgnore, `trustPolicy: ${value}`)), value).toMatch(
        /trustPolicy must be no-downgrade/,
      );
    }
    expect(problemOf(bare(age, missingIgnore, '# trustPolicy: no-downgrade'))).toMatch(/not set/);
    // A later line would win in most YAML readers, so a second one fails.
    expect(
      problemOf(bare(age, missingIgnore, 'trustPolicy: no-downgrade', 'trustPolicy: off')),
    ).toMatch(/trustPolicy is set 2 times/);
    expect(
      problemOf(
        bare(
          age,
          missingIgnore,
          'trustPolicy: no-downgrade',
          `${missingIgnore.replace('false', 'true')}`,
        ),
      ),
    ).toMatch(/minimumReleaseAgeIgnoreMissingTime is set 2 times/);
  });

  it('holds trustPolicyExclude to exact versions, and refuses trustPolicyIgnoreAfter (C3)', () => {
    expect(problemOf(workspace(age, ...TRUSTED))).toBeUndefined();
    for (const [name, lines] of [
      ['a wildcard', ['trustPolicyExclude:', "  - '*'"]],
      ['a bare name', ['trustPolicyExclude:', '  - chromium-bidi']],
      ['a range', ['trustPolicyExclude:', '  - chromium-bidi@^157.0.0']],
      ['a flow list', ["trustPolicyExclude: ['semver@6.3.1']"]],
      ['an ignore-after window', ['trustPolicyIgnoreAfter: 43200']],
    ] as const) {
      expect(problemOf(workspace(age, ...lines)), name).toBeDefined();
    }
  });

  it('refuses an exclude whose version the lockfile does not hold (C11)', () => {
    const lock = lockfile();
    const held = ['minimumReleaseAgeExclude:', '  - puppeteer-core@25.13.0', ...TRUSTED];
    expect(problemOf(workspace(age, ...held), { lock })).toBeUndefined();
    expect(
      problemOf(workspace(age, 'minimumReleaseAgeExclude:', '  - postcss@8.5.30'), { lock }),
    ).toMatch(/postcss@8.5.30 is not a package the lockfile holds/);
    expect(problemOf(workspace(age, 'trustPolicyExclude:', '  - semver@6.3.1'), { lock })).toMatch(
      /trustPolicyExclude entry semver@6.3.1/,
    );
    expect(
      problemOf(workspace(age, 'trustPolicyExclude:', "  - '@scope/bar@2.0.0'"), { lock }),
    ).toBeUndefined();
    expect(
      problemOf(workspace(age, 'trustPolicyExclude:', "  - '@scope/bar@2.0.1'"), { lock }),
    ).toMatch(/@scope\/bar@2.0.1/);
  });

  it('ties the chromium-bidi exclude to the version puppeteer-core depends on (C12)', () => {
    const lock = lockfile();
    expect(problemOf(workspace(age, ...TRUSTED), { lock })).toBeUndefined();

    const moved = lock.replace('chromium-bidi: 157.0.8090-0(', 'chromium-bidi: 158.0.1(');
    expect(problemOf(workspace(age, ...TRUSTED), { lock: moved })).toMatch(
      /not the version puppeteer-core depends on/,
    );

    const second = lock.concat(
      '  other@1.0.0:\n    dependencies:\n      chromium-bidi: 157.0.8090-0\n',
    );
    expect(problemOf(workspace(age, ...TRUSTED), { lock: second })).toMatch(
      /other@1.0.0 depends on chromium-bidi/,
    );

    const direct = lock.replace(
      '        version: 25.13.0\n',
      '        version: 25.13.0\n      chromium-bidi:\n        specifier: 157.0.8090-0\n        version: 157.0.8090-0\n',
    );
    expect(problemOf(workspace(age, ...TRUSTED), { lock: direct })).toMatch(
      /an importer depends on chromium-bidi/,
    );

    for (const line of ['configDependencies:', 'pnpmfile: ./pnpmfile.cjs', "'pnpmfile': x"]) {
      expect(problemOf(workspace(age, line)), line).toMatch(/changes or narrows/);
    }
    expect(problemOf(workspace(age), { rootFiles: ['.pnpmfile.cjs'] })).toMatch(/\.pnpmfile\.cjs/);
    expect(problemOf(workspace(age), { rootFiles: ['package.json'] })).toBeUndefined();
  });
});

describe('G67 — door 3: wrangler is an exact pin, run through pnpm exec', () => {
  const manifest = (wrangler: string | undefined): string =>
    JSON.stringify({ devDependencies: wrangler === undefined ? {} : { wrangler } });
  const upload = [
    'if (wranglerRefusal !== undefined) fail(wranglerRefusal);',
    "run('pnpm', [",
    "  'exec',",
    "  'wrangler',",
    "  'pages',",
    '], {}, uploadEnv(process.env, loadedEnvKeys));',
    'console.log(`to publish: pnpm exec wrangler pages deploy ${dist}`);',
  ].join('\n');

  it('requires an exact pin, and no package runner in the deploy script (C6)', () => {
    expect(pinProblems(manifest('4.149.0'))).toEqual([]);
    for (const pin of [
      '^4.149.0',
      '~4.149.0',
      '4',
      'latest',
      'workspace:*',
      'npm:wrangler@4',
      '>=4',
    ]) {
      expect(pinProblems(manifest(pin)), pin).not.toEqual([]);
    }
    expect(pinProblems(manifest(undefined))).not.toEqual([]);

    expect(deployProblems(upload)).toEqual([]);
    for (const [name, source] of [
      ['a dlx call', upload.replace("'exec',", "'dlx',")],
      ['npx', `${upload}\nrun('npx', ['wrangler']);`],
      ['a --package form', `${upload}\n// run('--package')`],
      ['a pinned fetch', upload.replace("'wrangler',", "'wrangler@4',")],
      ['a bare command string', `${upload}\nrun('wrangler pages deploy');`],
      ['wrangler without exec', upload.replace("  'exec',\n", '')],
      ['a pnpm run form', `${upload}\n// pnpm run wrangler pages`],
      [
        'no printed command',
        upload.replace('to publish: pnpm exec wrangler', 'to publish: wrangler'),
      ],
    ] as const) {
      expect(deployProblems(source), name).not.toEqual([]);
    }
  });
});
