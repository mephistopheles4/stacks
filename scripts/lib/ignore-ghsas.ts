/**
 * Every decision about `auditConfig.ignoreGhsas`, as pure functions.
 *
 * `pnpm audit` skips an ignored advisory id and says nothing more, so an entry
 * can outlive its reason without anything going red. Two guards close that, and
 * both judge here so the gate test and the CI step share one implementation:
 *
 * - **Expiry (G62).** Each entry carries a date in its trailing comment and
 *   expires {@link MAX_AGE_DAYS} days after it. Offline.
 * - **A published fix (G63).** An ignored advisory is red when npm lists a
 *   stable version of the affected package above the vulnerable ones and
 *   outside the vulnerable range. Judged from npm's version list and not from
 *   the advisory's `first_patched_version`, which is `null` for the one entry
 *   this was written for.
 *
 * **Nothing here does I/O.** The step that does — `scripts/check-ignored-advisories.ts`
 * — fetches the advisory and the version lists and hands them in, so the gate
 * test stays offline and G21 (`no-live-network`) is untouched.
 *
 * See docs/gates.md, rows G62 (ignore-expiry) and G63 (ignore-fix-published), and ADR-0095.
 */

/** Days after its date that an entry stops passing. Day 30 passes; day 31 fails. */
export const MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IgnoreEntry {
  readonly id: string;
  /** `YYYY-MM-DD`, as written. Whether it is a real date is {@link judgeExpiry}'s question. */
  readonly date: string;
  /** 1-based, so a red can point at the line. */
  readonly line: number;
}

export interface ReadResult {
  readonly entries: IgnoreEntry[];
  /** Fail-closed: a shape this reader does not recognise is a problem, never an empty list. */
  readonly problems: string[];
}

const GHSA_ITEM = /^(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})(\s+#.*)?$/;
const DATED_COMMENT = /^\s+#\s*(\d{4}-\d{2}-\d{2}),(?:\s|$)/;
const indentOf = (line: string): number => line.length - line.trimStart().length;
const isBlankOrComment = (line: string): boolean => /^\s*(#.*)?$/.test(line);

/**
 * The entries of the live `auditConfig.ignoreGhsas` block, read from raw lines.
 *
 * **Raw lines and not YAML**, because the date lives in a comment and a YAML
 * parser drops comments, and because nothing outside `packages/core` depends on
 * a YAML library. The price is a strict reader: only an uncommented top-level
 * `auditConfig:` is read, so the template at the foot of the file — every line
 * of it a comment — is never an entry. An absent or empty block passes.
 */
function readBlock(text: string): ReadResult {
  const lines = text.split(/\r?\n/);
  const entries: IgnoreEntry[] = [];
  const problems: string[] = [];

  const quoted = lines.flatMap((line, index) =>
    /^\s*(?:["'](?:auditConfig|ignoreGhsas)["']\s*|(?:auditConfig|ignoreGhsas)\s+):/.test(line)
      ? [index + 1]
      : [],
  );
  if (quoted.length > 0) {
    return {
      entries,
      problems: [
        `line ${quoted.join(', ')}: \`auditConfig\` or \`ignoreGhsas\` is written as a quoted key, ` +
          'which this reader does not read; write it unquoted',
      ],
    };
  }

  const configs = lines.flatMap((line, index) => (/^auditConfig:/.test(line) ? [index] : []));
  if (configs.length === 0) return { entries, problems };
  if (configs.length > 1) {
    return {
      entries,
      problems: ['pnpm-workspace.yaml has more than one top-level `auditConfig:` key'],
    };
  }

  const start = configs[0] ?? 0;
  const inline = (lines[start] ?? '')
    .replace(/^auditConfig:/, '')
    .replace(/\s+#.*$/, '')
    .trim();
  if (inline === '{}') return { entries, problems };
  if (inline !== '') {
    return {
      entries,
      problems: [
        `line ${start + 1}: \`auditConfig:\` has a value on its own line; only a block is read`,
      ],
    };
  }

  let end = start + 1;
  while (
    end < lines.length &&
    (isBlankOrComment(lines[end] ?? '') || indentOf(lines[end] ?? '') > 0)
  )
    end += 1;
  const block = lines.slice(start + 1, end);

  const keys = block.flatMap((line, index) => (/^\s+ignoreGhsas:/.test(line) ? [index] : []));
  if (keys.length === 0) return { entries, problems };
  if (keys.length > 1) {
    return { entries, problems: ['`auditConfig` has more than one `ignoreGhsas:` key'] };
  }

  const keyIndex = keys[0] ?? 0;
  const keyLine = block[keyIndex] ?? '';
  const keyIndent = indentOf(keyLine);
  const keyLineNumber = start + 1 + keyIndex + 1;
  const after = keyLine
    .replace(/^\s+ignoreGhsas:/, '')
    .replace(/\s+#.*$/, '')
    .trim();
  if (after === '[]') return { entries, problems };
  if (after !== '') {
    return {
      entries,
      problems: [
        `line ${keyLineNumber}: \`ignoreGhsas:\` has a value on its own line (\`${after}\`); ` +
          'write a block list, one `- GHSA-… # date, why` per line',
      ],
    };
  }

  for (let offset = keyIndex + 1; offset < block.length; offset += 1) {
    const line = block[offset] ?? '';
    if (isBlankOrComment(line)) continue;
    const item = /^\s*- (.*)$/.exec(line);
    if (indentOf(line) < keyIndent || (indentOf(line) === keyIndent && item === null)) break;
    const lineNumber = start + 1 + offset + 1;
    if (item === null) {
      problems.push(`line ${lineNumber}: not a list item under \`ignoreGhsas\``);
      continue;
    }
    const id = GHSA_ITEM.exec((item[1] ?? '').trim());
    if (id === null) {
      problems.push(`line ${lineNumber}: \`${(item[1] ?? '').trim()}\` is not an unquoted GHSA id`);
      continue;
    }
    const dated = DATED_COMMENT.exec(id[2] ?? '');
    if (dated === null) {
      problems.push(
        `line ${lineNumber}: ${id[1] ?? ''} has no date; the comment must start \`# YYYY-MM-DD, \` ` +
          'and an entry with no date is expired',
      );
      continue;
    }
    entries.push({ id: id[1] ?? '', date: dated[1] ?? '', line: lineNumber });
  }

  return { entries, problems };
}

const PLAIN_KEY_LINE = /^(?:auditConfig:\s*(?:\{\})?|\s+ignoreGhsas:\s*(?:\[\])?)\s*(?:#.*)?$/;

/**
 * {@link readBlock} plus a backstop over the whole file.
 *
 * **YAML has more ways to spell a key than a reader can list**: a tag, an
 * anchor, an explicit `?` key, an escape inside a double-quoted key. Each is the
 * same key to pnpm and an empty list to a reader that matches one spelling, so
 * patching them one at a time is a denylist that always leaves the next open.
 * Instead: any line that is not a comment and names either key or an advisory id
 * must be a line the reader actually consumed (a plain key line or an entry),
 * and a backslash outside a comment — the only way to spell a key without
 * writing it — is refused. A file this reader cannot account for is a red.
 */
export function readIgnoreEntries(text: string): ReadResult {
  const read = readBlock(text);
  if (read.problems.length > 0) return read;
  const consumed = new Set(read.entries.map((entry) => entry.line));
  const stray = text.split(/\r?\n/).flatMap((line, index) => {
    if (line.trim().startsWith('#')) return [];
    const content = line.replace(/\s+#.*$/, '');
    const suspect =
      /auditConfig|ignoreGhsas|GHSA-|^\s*<<\s*:/i.test(content) || content.includes('\\');
    return suspect && !consumed.has(index + 1) && !PLAIN_KEY_LINE.test(line) ? [index + 1] : [];
  });
  if (stray.length === 0) return read;
  return {
    entries: read.entries,
    problems: [
      `line ${stray.join(', ')}: names \`auditConfig\`, \`ignoreGhsas\` or an advisory id (or holds a ` +
        'backslash) in a form this reader does not consume; write the plain block ' +
        '`auditConfig:` / `ignoreGhsas:` / `- GHSA-… # date, why`',
    ],
  };
}
/** Midnight UTC of a `YYYY-MM-DD` that is a real calendar date, else `null`. */
function utcDay(date: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (parts === null) return null;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const at = Date.UTC(year, month - 1, day);
  const back = new Date(at);
  const real =
    back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day;
  return real ? at : null;
}

/**
 * One problem per entry that is dated in the future, not a real date, or more
 * than {@link MAX_AGE_DAYS} days old. `now` is injected so no test reads the
 * wall clock; only the hour is discarded — age is whole UTC calendar days.
 */
export function judgeExpiry(input: { entries: readonly IgnoreEntry[]; now: Date }): string[] {
  const today = Date.UTC(
    input.now.getUTCFullYear(),
    input.now.getUTCMonth(),
    input.now.getUTCDate(),
  );
  return input.entries.flatMap((entry) => {
    const at = utcDay(entry.date);
    const where = `line ${entry.line}: ${entry.id}`;
    if (at === null) return [`${where} is dated ${entry.date}, which is not a calendar date`];
    const age = Math.round((today - at) / DAY_MS);
    if (age < 0) return [`${where} is dated ${entry.date}, which is in the future`];
    if (age > MAX_AGE_DAYS) {
      return [
        `${where} was dated ${entry.date}, ${age} days ago (limit ${MAX_AGE_DAYS}); ` +
          'renew it with a new date and a fresh reason, or remove it',
      ];
    }
    return [];
  });
}

/** One npm package an advisory covers, with its vulnerable range as GitHub writes it. */
export interface NpmEntry {
  readonly name: string;
  readonly range: string;
}

/** An {@link NpmEntry} with what npm said about it. */
export interface FixLookup extends NpmEntry {
  /** Every published version, semver-sorted as `npm view <pkg> versions --json` returns it. */
  readonly all: readonly string[];
  /** The published versions inside {@link NpmEntry.range}, from `npm view <pkg>@<range> version --json`. */
  readonly affected: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * What a name and a range from the advisory record may look like before either
 * reaches a command line. The step spawns npm, through a shell on Windows, and
 * both strings come from outside (ADR-0030): a `"` or `%` in one would reach
 * that shell, and a leading `-` would read as an option. A value outside these
 * shapes is a lookup failure, so it fails closed.
 */
const NPM_NAME = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/;
const NPM_RANGE = /^[0-9A-Za-z.+*^~<>=| ][0-9A-Za-z.+*^~<>=| -]*$/;

/**
 * The npm packages in a GitHub advisory record (`GET /advisories/<id>`).
 *
 * Throws on a record it cannot read — the step turns that into a red, because
 * a lookup that fails must never read as "no fix". An advisory with no npm
 * entry returns an empty list, which {@link judgeFixPublished} also fails.
 */
export function npmEntriesOf(advisory: unknown): NpmEntry[] {
  if (!isRecord(advisory) || !Array.isArray(advisory['vulnerabilities'])) {
    throw new Error('the advisory record has no `vulnerabilities` list');
  }
  const found: NpmEntry[] = [];
  for (const entry of advisory['vulnerabilities'] as unknown[]) {
    const pkg = isRecord(entry) ? entry['package'] : undefined;
    if (!isRecord(entry) || !isRecord(pkg) || pkg['ecosystem'] !== 'npm') continue;
    const name = pkg['name'];
    const range = entry['vulnerable_version_range'];
    if (typeof name !== 'string' || name === '')
      throw new Error('an npm entry has no package name');
    if (typeof range !== 'string' || range.trim() === '') {
      throw new Error(`the npm entry for ${JSON.stringify(name)} has no vulnerable_version_range`);
    }
    if (!NPM_NAME.test(name))
      throw new Error(
        `the npm entry's package name is not a valid npm name: ${JSON.stringify(name)}`,
      );
    if (!NPM_RANGE.test(npmRange(range))) {
      throw new Error(
        `the npm entry for ${JSON.stringify(name)} has a vulnerable_version_range with unexpected characters`,
      );
    }
    found.push({ name, range });
  }
  return found;
}

/**
 * GitHub writes `>= 4.0.0, < 4.1.0`; npm's range parser wants the comparators
 * space-separated.
 */
export const npmRange = (githubRange: string): string =>
  githubRange.trim().replace(/\s*,\s*/g, ' ');

const isStable = (version: string): boolean => !version.includes('-');

/**
 * One problem per npm entry that is unreadable, or that has a fix published.
 *
 * **A fix is published** when a stable version comes after the highest
 * vulnerable version in npm's own list and is not itself inside the vulnerable
 * range. That clears correctly if the advisory is later amended to cover it.
 *
 * **Fails closed**, because a false "no fix" looks exactly like a true one: an
 * advisory with no npm entry, an affected range matching no published version
 * (a wrong package name, a broken registry read), and an affected version
 * missing from the full list.
 */
export function judgeFixPublished(id: string, lookups: readonly FixLookup[]): string[] {
  if (lookups.length === 0) {
    return [`${id}: the advisory has no npm entry, so no published fix can be ruled out`];
  }
  return lookups.flatMap((lookup) => {
    const where = `${id} (${lookup.name}, affected ${lookup.range})`;
    if (lookup.affected.length === 0) {
      return [
        `${where}: npm lists no published version of ${lookup.name} inside the affected range; ` +
          'the lookup cannot be trusted to mean "no fix"',
      ];
    }
    const positions = lookup.affected.map((version) => lookup.all.indexOf(version));
    if (positions.includes(-1)) {
      return [
        `${where}: an affected version is missing from npm's full version list; the lookup is incomplete`,
      ];
    }
    const highest = Math.max(...positions);
    const affected = new Set(lookup.affected);
    const fixed = lookup.all.find(
      (version, index) => index > highest && isStable(version) && !affected.has(version),
    );
    if (fixed === undefined) return [];
    return [
      `${where}: ${lookup.name}@${fixed} is published and outside the affected range. ` +
        'Upgrade to it and remove the ignoreGhsas entry.',
    ];
  });
}
