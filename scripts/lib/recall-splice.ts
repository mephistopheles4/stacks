/**
 * Re-captures a named subset of the lookup-recall corpus and splices it into
 * the committed one.
 *
 * G26 pins the ranking rule, not the providers' answers on one day (#395). A
 * full re-capture re-asks every provider and absorbs whatever they say now, so
 * when one provider's URL changes, only that provider's entries are refreshed.
 * `lookup()` still runs over the whole corpus, because its URLs are derived at
 * runtime; every URL not selected is answered from the committed corpus, so the
 * call graph follows the answers the gate already judges.
 *
 * ⚠️ **An unselected URL the committed corpus does not hold is refused**, never
 * fetched: going live for it would be the full capture by the back door. Widen
 * the selection to take it.
 */

import type { HttpGet } from '../../packages/core/src/index.ts';
import { stripKey } from '../../gates/recall-corpus.ts';

export interface SpliceInputs {
  /** The committed corpus, keyed by URL with the key stripped. */
  readonly committed: Readonly<Record<string, unknown>>;
  /** Whether a key-stripped URL is to be re-captured. */
  readonly selected: (url: string) => boolean;
  /** Where a selected URL is fetched: the cache, then the network. */
  readonly live: HttpGet;
  /** Drives the lookups through the fetch it is given. */
  readonly run: (get: HttpGet) => Promise<void>;
}

/**
 * The `--only` prefixes on a command line.
 *
 * ⚠️ **`--only=<prefix>` is refused, not ignored.** Ignoring it would select
 * nothing, which is the full capture — the one run the frozen corpus must not
 * get by accident.
 */
export function parseOnly(argv: readonly string[]): string[] {
  const prefixes: string[] = [];
  argv.forEach((arg, i) => {
    if (arg.startsWith('--only=')) {
      throw new Error('write `--only <url-prefix>`, with a space');
    }
    if (arg !== '--only') return;
    const prefix = argv[i + 1] ?? '';
    if (prefix.length === 0 || prefix.startsWith('--')) {
      throw new Error('--only takes a URL prefix');
    }
    prefixes.push(prefix);
  });
  return prefixes;
}

/** Selects a URL under any prefix; with no prefix, every URL. */
export function selectByPrefix(prefixes: readonly string[]): (url: string) => boolean {
  return (url) => prefixes.length === 0 || prefixes.some((prefix) => url.startsWith(prefix));
}

/** The new corpus, in the order the lookups asked for each URL. */
export async function spliceCapture(inputs: SpliceInputs): Promise<Record<string, unknown>> {
  const recorded: Record<string, unknown> = {};
  const get: HttpGet = async (url) => {
    const bare = stripKey(url);
    if (inputs.selected(bare)) {
      const body = await inputs.live(url);
      recorded[bare] = body ?? null;
      return body;
    }
    if (!Object.hasOwn(inputs.committed, bare)) {
      throw new Error(`not selected and not in the committed corpus: ${bare}`);
    }
    const body = inputs.committed[bare];
    recorded[bare] = body;
    return body ?? undefined;
  };
  await inputs.run(get);
  return recorded;
}
