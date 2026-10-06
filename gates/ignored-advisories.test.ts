/**
 * G62 and G63 — an `auditConfig.ignoreGhsas` entry cannot outlive its reason.
 *
 * `pnpm audit` skips an ignored advisory id and says nothing more, so the only
 * thing holding an entry to its removal condition was a comment. Two guards,
 * each catching what the other cannot:
 *
 * - **G62 `ignore-expiry`** — offline. Every entry carries a date in its
 *   trailing comment and fails once it is more than 30 days old. The live
 *   assertion below reads the real `pnpm-workspace.yaml` against today's date,
 *   which makes this a test whose answer changes with the calendar *on
 *   purpose*: the renewal is the re-decision.
 * - **G63 `ignore-fix-published`** — a CI step in the `audit` job reads each
 *   ignored advisory from GitHub and its package's versions from npm, and
 *   fails when a fix is published. That step touches the network, so **this
 *   file drives only the pure judgement** (`scripts/lib/ignore-ghsas.ts`) with
 *   hand-written records, and asserts the step is *wired* — present, after
 *   `pnpm audit`, taking its token through `env:` — so deleting it goes red.
 *   The step's own I/O is verified by planting, recorded in
 *   docs/gate-register.md, G63.
 *
 * ⚠️ **A vacuous live green is the risk here**: with no entry in the workspace
 * file, G62's live assertion passes over nothing. The synthetic cases below
 * carry the proof; the register records a 31-day-old entry planted in the real
 * file going red.
 *
 * See docs/gates.md, rows G62 and G63, and ADR-0095.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_AGE_DAYS,
  judgeExpiry,
  judgeFixPublished,
  npmEntriesOf,
  npmRange,
  readIgnoreEntries,
  type FixLookup,
} from '../scripts/lib/ignore-ghsas.ts';
import { REPO_ROOT } from './repo.ts';

const BRACES = 'GHSA-vfj7-8cjw-p6xm';
const NANOID = 'GHSA-2v37-7h3g-55p8';

/** A workspace file with one live block, in the shape pnpm and #404 write. */
const workspace = (...items: string[]): string =>
  [
    'packages:',
    "  - 'packages/*'",
    '',
    'auditConfig:',
    '  ignoreGhsas:',
    ...items.map((i) => `    - ${i}`),
    '',
  ].join('\n');

const entryLine = (date: string, id = BRACES): string =>
  `${id}  # ${date}, bounded glob input, fix pending`;

const NOW = new Date('2026-10-06T15:30:00Z');

/** The date `days` before `NOW`, in UTC. */
const daysAgo = (days: number): string =>
  new Date(Date.UTC(2026, 9, 6 - days)).toISOString().slice(0, 10);

const problemsOf = (text: string, now: Date = NOW): string[] => {
  const read = readIgnoreEntries(text);
  return [...read.problems, ...judgeExpiry({ entries: read.entries, now })];
};

describe('G62 — an entry expires after 30 days, and no date means expired', () => {
  it('passes an entry dated today', () => {
    expect(problemsOf(workspace(entryLine(daysAgo(0))))).toEqual([]);
  });

  it('passes an entry exactly 30 days old', () => {
    expect(MAX_AGE_DAYS).toBe(30);
    expect(problemsOf(workspace(entryLine(daysAgo(30))))).toEqual([]);
  });

  it("reads #404's braces line verbatim — one space before the `#`, at either indent", () => {
    const line =
      "GHSA-vfj7-8cjw-p6xm # 2026-10-06, markdownlint-cli2's own globs only, fix pending";
    const at4 = `auditConfig:\n  ignoreGhsas:\n    - ${line}\n`;
    const at6 = `auditConfig:\n  ignoreGhsas:\n      - ${line}\n`;
    for (const text of [at4, at6]) {
      expect(readIgnoreEntries(text).entries).toMatchObject([{ id: BRACES, date: '2026-10-06' }]);
      expect(problemsOf(text)).toEqual([]);
    }
  });

  it('fails an entry 31 days old, naming the id, the date and the age', () => {
    const problems = problemsOf(workspace(entryLine(daysAgo(31))));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(BRACES);
    expect(problems[0]).toContain(daysAgo(31));
    expect(problems[0]).toContain('31 days');
  });

  it('fails an entry dated in the future', () => {
    const problems = problemsOf(workspace(entryLine('2026-10-07')));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('future');
  });

  it('fails an entry with no comment at all', () => {
    const problems = problemsOf(workspace(BRACES));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(BRACES);
  });

  it('fails an entry whose comment does not start with a date', () => {
    expect(problemsOf(workspace(`${BRACES}  # bounded glob input, fix pending`))).toHaveLength(1);
  });

  it('fails a date with no comma after it, or a time glued on', () => {
    expect(problemsOf(workspace(`${BRACES}  # 2026-10-06 fix pending`))).toHaveLength(1);
    expect(problemsOf(workspace(`${BRACES}  # 2026-10-06T00:00:00Z, why`))).toHaveLength(1);
  });

  it('fails a date that is not a calendar date', () => {
    const problems = problemsOf(workspace(entryLine('2026-02-30')));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('2026-02-30');
  });

  it('judges every entry, not the first', () => {
    const problems = problemsOf(
      workspace(
        entryLine(daysAgo(1)),
        entryLine(daysAgo(40), NANOID),
        entryLine(daysAgo(2), 'GHSA-aaaa-bbbb-cccc'),
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(NANOID);
  });

  it('measures in UTC calendar days, whatever the hour', () => {
    const lateOnDay30 = new Date('2026-10-06T23:59:59Z');
    const earlyOnDay31 = new Date('2026-10-07T00:00:01Z');
    const entries = readIgnoreEntries(workspace(entryLine('2026-09-06'))).entries;
    expect(judgeExpiry({ entries, now: lateOnDay30 })).toEqual([]);
    expect(judgeExpiry({ entries, now: earlyOnDay31 })).toHaveLength(1);
  });

  it('passes the commented template alone — it is not an entry', () => {
    const text = [
      'packages:',
      "  - 'packages/*'",
      '',
      '# auditConfig:',
      '#   ignoreGhsas:',
      '#     - GHSA-xxxx-xxxx-xxxx  # 2026-01-01, <why it cannot reach us>, fix pending',
      '',
    ].join('\n');
    expect(problemsOf(text)).toEqual([]);
  });

  it('passes a file with no block, an empty block, and the `{}` pnpm itself writes', () => {
    expect(problemsOf('packages:\n  - x\n')).toEqual([]);
    expect(problemsOf('auditConfig:\n  ignoreGhsas:\n')).toEqual([]);
    expect(problemsOf('auditConfig: {}\n')).toEqual([]);
    expect(problemsOf('auditConfig:\n  ignoreGhsas: []\n')).toEqual([]);
    expect(problemsOf('auditConfig:\n  ignoreCves:\n    - CVE-2026-0001\n')).toEqual([]);
  });

  it('reads CRLF line endings, as this checkout may carry on Windows', () => {
    const crlf = workspace(entryLine(daysAgo(31))).replaceAll('\n', '\r\n');
    expect(problemsOf(crlf)).toHaveLength(1);
    expect(problemsOf(workspace(entryLine(daysAgo(1))).replaceAll('\n', '\r\n'))).toEqual([]);
  });

  it('accepts a list indented level with its key, which YAML allows', () => {
    const level = `auditConfig:\n  ignoreGhsas:\n  - ${entryLine(daysAgo(31))}\n`;
    expect(problemsOf(level)).toHaveLength(1);
  });

  it('does not read past the block into a later list', () => {
    const text = `${workspace(entryLine(daysAgo(1)))}\noverrides:\n  nanoid: '^3.3.18'\nother:\n  - not-a-ghsa\n`;
    expect(problemsOf(text)).toEqual([]);
  });

  it('fails closed on a shape it does not recognise', () => {
    const shapes: Record<string, string> = {
      'a flow-style list': 'auditConfig:\n  ignoreGhsas: [GHSA-vfj7-8cjw-p6xm]\n',
      'a quoted id': `auditConfig:\n  ignoreGhsas:\n    - '${BRACES}'  # ${daysAgo(0)}, why\n`,
      'an item that is not an advisory id': `auditConfig:\n  ignoreGhsas:\n    - braces  # ${daysAgo(0)}, why\n`,
      'a second auditConfig key': `auditConfig:\n  ignoreGhsas:\n    - ${entryLine(daysAgo(0))}\nauditConfig:\n  ignoreGhsas:\n    - ${entryLine(daysAgo(0), NANOID)}\n`,
      'a second ignoreGhsas key': `auditConfig:\n  ignoreGhsas:\n    - ${entryLine(daysAgo(0))}\n  ignoreGhsas:\n    - ${entryLine(daysAgo(0), NANOID)}\n`,
      'a block-style key with a value on the same line': `auditConfig:\n  ignoreGhsas: ${BRACES}\n`,
    };
    for (const [name, text] of Object.entries(shapes)) {
      expect(problemsOf(text), name).not.toEqual([]);
    }
  });

  it('reads every entry in the real pnpm-workspace.yaml against today', () => {
    const text = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(problemsOf(text, new Date())).toEqual([]);
  });
});

/** A hand-written advisory in the shape GitHub's `/advisories/<id>` returns. */
const advisory = (...vulnerabilities: unknown[]): unknown => ({ ghsa_id: BRACES, vulnerabilities });

const bracesVulnerability = {
  package: { ecosystem: 'npm', name: 'braces' },
  vulnerable_version_range: '<= 3.0.3',
  first_patched_version: null,
};

const lookup = (
  name: string,
  all: string[],
  affected: string[],
  range = '<= 3.0.3',
): FixLookup => ({
  name,
  range,
  all,
  affected,
});

const BRACES_VERSIONS = ['3.0.1', '3.0.2', '3.0.3'];

describe('G63 — a published fix is read from npm, not from the advisory', () => {
  it('passes the braces shape: affected <= 3.0.3 and nothing above it', () => {
    expect(judgeFixPublished(BRACES, [lookup('braces', BRACES_VERSIONS, BRACES_VERSIONS)])).toEqual(
      [],
    );
  });

  it('fails the same shape once 3.0.4 is published, naming advisory, package and version', () => {
    const problems = judgeFixPublished(BRACES, [
      lookup('braces', [...BRACES_VERSIONS, '3.0.4'], BRACES_VERSIONS),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(BRACES);
    expect(problems[0]).toContain('braces');
    expect(problems[0]).toContain('3.0.4');
  });

  it('names the lowest fixed version when several are published', () => {
    const problems = judgeFixPublished(BRACES, [
      lookup('braces', [...BRACES_VERSIONS, '3.0.4', '3.1.0'], BRACES_VERSIONS),
    ]);
    expect(problems[0]).toContain('3.0.4');
  });

  it('does not count a pre-release above the range', () => {
    expect(
      judgeFixPublished(BRACES, [
        lookup('braces', [...BRACES_VERSIONS, '3.0.4-beta.1', '3.1.0-rc.0'], BRACES_VERSIONS),
      ]),
    ).toEqual([]);
  });

  it('fails closed when no published version falls inside the affected range', () => {
    const problems = judgeFixPublished(BRACES, [lookup('braces', BRACES_VERSIONS, [])]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('braces');
    expect(problems[0]).toContain('no published version');
  });

  it('fails closed when the version list is empty', () => {
    expect(judgeFixPublished(BRACES, [lookup('braces', [], [])])).toHaveLength(1);
  });

  it('fails closed when an affected version is missing from the version list', () => {
    expect(judgeFixPublished(BRACES, [lookup('braces', ['3.0.1'], ['3.0.3'])])).toHaveLength(1);
  });

  it('fails when any of several entries has a fix, and says which', () => {
    const problems = judgeFixPublished(BRACES, [
      lookup('braces', BRACES_VERSIONS, BRACES_VERSIONS),
      lookup('other-pkg', ['1.0.0', '1.0.1', '1.1.0'], ['1.0.0', '1.0.1'], '< 1.1.0'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('other-pkg');
    expect(problems[0]).toContain('1.1.0');
  });

  it('fails closed when the advisory has no npm entry', () => {
    const problems = judgeFixPublished(BRACES, []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no npm');
  });

  it('lists only npm entries, and skips an entry with no package or range', () => {
    expect(
      npmEntriesOf(
        advisory(bracesVulnerability, {
          package: { ecosystem: 'pip', name: 'braces' },
          vulnerable_version_range: '< 1',
        }),
      ),
    ).toEqual([{ name: 'braces', range: '<= 3.0.3' }]);
  });

  it('refuses an advisory record it cannot read', () => {
    expect(() => npmEntriesOf(null)).toThrow();
    expect(() => npmEntriesOf({ vulnerabilities: 'nope' })).toThrow();
    expect(() => npmEntriesOf(advisory({ package: { ecosystem: 'npm', name: 'x' } }))).toThrow(
      /range/,
    );
  });

  it('converts GitHub ranges, which separate comparators with commas, to npm ranges', () => {
    expect(npmRange('>= 4.0.0, < 4.1.0')).toBe('>= 4.0.0 < 4.1.0');
    expect(npmRange('<= 3.0.3')).toBe('<= 3.0.3');
    expect(npmRange('>=4.0.0,<4.1.0')).toBe('>=4.0.0 <4.1.0');
  });
});

describe('G63 — the step is wired into the `audit` job', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/gates.yml'), 'utf8');
  const auditJob = workflow.split(/^ {2}audit:\s*$/m)[1]?.split(/^ {2}[a-z][\w-]*:\s*$/m)[0] ?? '';

  it('runs the script after `pnpm audit`', () => {
    const audit = auditJob.indexOf('pnpm audit --audit-level=high');
    const guard = auditJob.indexOf('pnpm exec tsx scripts/check-ignored-advisories.ts');
    expect(audit, '`pnpm audit` is not in the audit job').toBeGreaterThan(-1);
    expect(guard, 'the ignoreGhsas guard step is not in the audit job').toBeGreaterThan(audit);
  });

  it('takes the workflow token through `env:`, never through a `${{ }}` in `run:`', () => {
    const step = auditJob.slice(auditJob.indexOf('- name: ignoreGhsas guard'));
    const stepBlock = step.split(/\n {6}- /)[0] ?? '';
    expect(stepBlock).toMatch(/env:\s*\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
    const run = stepBlock.split('\n').find((line) => line.trim().startsWith('run:')) ?? '';
    expect(run).not.toContain('${{');
  });
});
