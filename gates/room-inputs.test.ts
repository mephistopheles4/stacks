/**
 * G75 — every room bake input is named, licensed and credited.
 *
 * A room is baked from files that live outside git (spec #593 S4.12), and
 * `packages/site/rooms/<room>/inputs.json` is the only list of them. This holds
 * each entry to what the pipeline needs of it:
 *
 * - a **page URL** that a person can open: https, no query string, no fragment,
 *   and nothing in it that reads as a signed link. A signed download link
 *   expires, and a record that expires is no record;
 * - a **licence** of CC0, public domain or CC BY, the three the room may use;
 * - a 64-digit **SHA-256**, which `fetch_inputs.py` checks every file against;
 * - a **destination** inside the room's inputs folder: relative, with no `..`,
 *   `.`, empty segment, backslash, colon or `~`, the same names `fetch_inputs.py`
 *   refuses at run time;
 * - **either `manual: true` or a fetch `url` on a host `fetch_inputs.py` allows**;
 *   the allowed hosts are read from that script, so the list is in one place;
 * - and **a CC BY entry is credited in the room's `SOURCES.md`**, by its author
 *   and its page URL, because that is what the licence asks.
 *
 * ## What it does not say
 *
 * ⚠️ **It reads what the file claims, not what the host says.** A licence typed
 * wrongly into `inputs.json` passes. The audit that checked each against its
 * host's own API ran once, by hand, on 2026-11-16 (ADR-0161); nothing here
 * re-asks a host. And `fetch_inputs.py`'s checks run on the owner's machine at
 * fetch time, not in CI.
 *
 * ## The vacuous green
 *
 * A sweep over no entries passes everything. So at least one room must be found,
 * each with at least ten entries and at least one CC BY, and every rule is shown
 * red on a copy of a real entry in the same file.
 *
 * See docs/gates.md, row G75 (room-inputs).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, expectFound } from './repo.ts';

const ROOMS = 'packages/site/rooms';
const SERVED = 'packages/site/public/rooms';
const FETCH_SCRIPT = `${ROOMS}/shared/fetch_inputs.py`;

interface Entry {
  dest?: unknown;
  page?: unknown;
  licence?: unknown;
  author?: unknown;
  title?: unknown;
  sha256?: unknown;
  url?: unknown;
  manual?: unknown;
}

function roomIds(): string[] {
  return readdirSync(join(REPO_ROOT, ROOMS), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, ROOMS, e.name, 'inputs.json')))
    .map((e) => e.name)
    .sort();
}

/** The hosts `fetch_inputs.py` will fetch from: the one list, read where it is written. */
function fetchHosts(): ReadonlySet<string> {
  const source = readFileSync(join(REPO_ROOT, FETCH_SCRIPT), 'utf8');
  const block = /FETCH_HOSTS\s*=\s*frozenset\(\{([^}]*)\}\)/.exec(source)?.[1] ?? '';
  return new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string));
}

const LICENCE = /^(CC0|public domain|CC BY( \d\.\d)?)$/;
const SIGNED = /(signature|x-amz|token|expires|sig=)/i;

function destFault(dest: unknown): string | undefined {
  if (typeof dest !== 'string' || dest === '') return 'no destination';
  if (/[\\:~\0]/.test(dest) || dest.startsWith('/'))
    return `destination ${dest} escapes the inputs folder`;
  if (dest.split('/').some((p) => p === '' || p === '.' || p === '..')) {
    return `destination ${dest} escapes the inputs folder`;
  }
  return undefined;
}

function entryFaults(entry: Entry, hosts: ReadonlySet<string>, sources: string): string[] {
  const faults: string[] = [];
  const name = typeof entry.dest === 'string' ? entry.dest : '(no dest)';
  const bad = (what: string): number => faults.push(`${name}: ${what}`);

  const dest = destFault(entry.dest);
  if (dest) bad(dest);

  let page: URL | undefined;
  try {
    page = new URL(String(entry.page));
  } catch {
    bad('page is not a URL');
  }
  if (page) {
    if (page.protocol !== 'https:') bad('page is not https');
    if (page.search !== '' || page.hash !== '') bad('page carries a query string or a fragment');
    if (SIGNED.test(page.href)) bad('page reads as a signed link');
  }

  if (typeof entry.licence !== 'string' || !LICENCE.test(entry.licence)) {
    bad(`licence ${JSON.stringify(entry.licence)} is not CC0, public domain or CC BY`);
  }
  if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256))
    bad('sha256 is not 64 lowercase hex digits');
  if (typeof entry.author !== 'string' || entry.author === '') bad('no author');
  if (typeof entry.title !== 'string' || entry.title === '') bad('no title');

  if (entry.manual === true) {
    if (entry.url !== undefined) bad('is manual and also carries a fetch url');
  } else {
    let host = '';
    try {
      const u = new URL(String(entry.url));
      host = u.protocol === 'https:' ? u.hostname : '';
    } catch {
      /* host stays empty */
    }
    if (!hosts.has(host)) bad(`fetch url is not https on one of ${[...hosts].join(', ')}`);
  }

  if (typeof entry.licence === 'string' && entry.licence.startsWith('CC BY')) {
    if (typeof entry.author === 'string' && !sources.includes(entry.author))
      bad('is CC BY and SOURCES.md does not credit its author');
    if (typeof entry.page === 'string' && !sources.includes(entry.page))
      bad('is CC BY and SOURCES.md does not link its page');
  }
  return faults;
}

function load(room: string) {
  const doc = JSON.parse(readFileSync(join(REPO_ROOT, ROOMS, room, 'inputs.json'), 'utf8')) as {
    inputs: Entry[];
  };
  const sourcesPath = join(REPO_ROOT, SERVED, room, 'SOURCES.md');
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, 'utf8') : '';
  return { entries: doc.inputs, sources };
}

describe('G75 — every room bake input is named, licensed and credited', () => {
  const rooms = roomIds();
  const hosts = fetchHosts();

  it('reads the fetch hosts out of fetch_inputs.py', () => {
    expectFound([...hosts], 'fetch hosts', 3);
  });

  it('finds at least one room, with entries and at least one CC BY', () => {
    expectFound(rooms, 'rooms with an inputs.json', 1);
    for (const room of rooms) {
      const { entries } = load(room);
      expect(entries.length, `${room}: entries`).toBeGreaterThanOrEqual(10);
      expect(
        entries.filter((e) => String(e.licence).startsWith('CC BY')).length,
        `${room}: CC BY entries`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(rooms)('%s: every entry holds', (room) => {
    const { entries, sources } = load(room);
    const names = entries.map((e) => String(e.dest));
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `${room}: a destination named twice`).toEqual([]);
    expect(entries.flatMap((e) => entryFaults(e, hosts, sources))).toEqual([]);
  });

  describe('is shown red on a copy of a real entry', () => {
    const room = rooms[0] as string;
    const { entries, sources } = load(room);
    const fetched = entries.find((e) => e.manual !== true && e.licence === 'CC0') as Entry;
    const ccBy = entries.find((e) => String(e.licence).startsWith('CC BY')) as Entry;
    const faultsOf = (base: Entry, change: Partial<Entry>, text = sources) =>
      entryFaults({ ...base, ...change }, hosts, text).join('\n');

    it('passes the real ones', () => {
      expect(entryFaults(fetched, hosts, sources)).toEqual([]);
      expect(entryFaults(ccBy, hosts, sources)).toEqual([]);
    });

    it.each([
      ['http page', { page: 'http://polyhaven.com/a/x' }, /not https/],
      ['a query string', { page: 'https://polyhaven.com/a/x?download=1' }, /query string/],
      ['a signed link', { page: 'https://polyhaven.com/a/x/Signature-abc' }, /signed link/],
      ['no page', { page: undefined }, /not a URL/],
      ['a licence off the list', { licence: 'CC BY-NC 4.0' }, /not CC0, public domain or CC BY/],
      ['a short hash', { sha256: 'abc' }, /sha256/],
      ['an escaping destination', { dest: '../x.bin' }, /escapes/],
      ['an absolute destination', { dest: '/x.bin' }, /escapes/],
      ['a drive letter', { dest: 'C:/x.bin' }, /escapes/],
      ['a backslash', { dest: 'a\\b.bin' }, /escapes/],
      ['a fetch host off the list', { url: 'https://example.com/x.bin' }, /fetch url is not https/],
      [
        'a plain-http fetch url',
        { url: 'http://dl.polyhaven.org/x.bin' },
        /fetch url is not https/,
      ],
      ['a manual entry that also fetches', { manual: true }, /manual and also carries/],
    ] as [string, Partial<Entry>, RegExp][])('%s', (_name, change, pattern) => {
      expect(faultsOf(fetched, change)).toMatch(pattern);
    });

    it('a CC BY entry that SOURCES.md does not credit or link', () => {
      expect(faultsOf(ccBy, {}, '')).toMatch(/does not credit its author/);
      expect(faultsOf(ccBy, {}, '')).toMatch(/does not link its page/);
    });
  });
});
