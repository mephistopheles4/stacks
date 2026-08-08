/**
 * Captures the responses the lookup-recall gate replays.
 *
 *     pnpm tsx scripts/capture-lookup-recall.ts [--cache <dir>]
 *
 * Sibling of `capture-api-fixtures.ts`, and a different shape for a reason.
 * That one pins a handful of URLs written out by hand. This one records whatever
 * `lookup()` *actually asks for* across a corpus of real titles — two providers,
 * a conditional fallback, a detail re-fetch and an artwork search, with every URL
 * derived at runtime. Listing them by hand would be transcribing a call graph,
 * and it would go stale the moment the call graph changed.
 *
 * Goes through the on-disk cache, so a re-run costs nothing for anything already
 * fetched and only reaches the network for genuinely new requests.
 *
 * What is captured is bibliographic fact — titles, authors, identifiers, page
 * counts. No cover binaries, no book text. The API key is stripped from every
 * recorded URL, and the gate's reader strips it the same way before matching.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import { createCachedHttpGet, lookup, type HttpGet } from '../packages/core/src/index.ts';
// The corpus lives with the gate that owns it: this script exists to feed that
// gate, so the list of books belongs there and is imported here, not copied.
import { RECALL_CORPUS, stripKey } from '../gates/recall-corpus.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

const cacheFlag = process.argv.indexOf('--cache');
const cacheDir = resolve(cacheFlag < 0 ? join(REPO_ROOT, '.cache') : (process.argv[cacheFlag + 1] ?? ''));

// The same loader the CLI and the deploy use. Without it this script read only
// a real environment variable, so the invocation in its own header — with the
// key sitting in `.env` where every other command finds it — printed the
// warning below and recorded a corpus of quota errors.
loadEnv();

const key = process.env['GOOGLE_BOOKS_API_KEY'];
if (key === undefined || key.length === 0) {
  console.warn('warning: no GOOGLE_BOOKS_API_KEY — Google will 429 and the corpus will be wrong');
}

const cached = createCachedHttpGet(cacheDir);
const recorded: Record<string, unknown> = {};

const recording: HttpGet = async (url) => {
  const body = await cached(url);
  recorded[stripKey(url)] = body ?? null;
  return body;
};

for (const entry of RECALL_CORPUS) {
  await lookup(entry.term, recording, key === undefined ? {} : { googleBooksKey: key });
}

/**
 * Drops the bulky branches nothing parses — blurbs, sale terms, snippets.
 *
 * Pruned by *removal* rather than by allowlist, so everything left is exactly as
 * the provider sent it and a field the parser starts reading tomorrow is still
 * there. Only these five names are ever removed, and they take the file from
 * 175 KB to under 80 — against 1–5 KB for every other fixture in the folder.
 */
const BULK = new Set(['description', 'searchInfo', 'accessInfo', 'saleInfo', 'layerInfo']);

function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([name]) => !BULK.has(name))
      .map(([name, child]) => [name, prune(child)]),
  );
}

const out = join(REPO_ROOT, 'fixtures', 'api');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'lookup-recall.json'), `${JSON.stringify(prune(recorded), null, 1)}\n`, 'utf8');

console.log(`${Object.keys(recorded).length} responses from ${RECALL_CORPUS.length} lookups`);
