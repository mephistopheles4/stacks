/**
 * G72 — `docs/threat-model.md` stays short enough to be read.
 *
 * A threat model a session skips protects nothing, and models given room fill
 * it. So the file is capped at 3,000 words, counted over the whole file with
 * its two diagrams included, by splitting on whitespace. **Raising the cap is a
 * spec change** (the-pact issue 542, S10), not an edit to `MAX_WORDS`.
 *
 * ## The vacuous green
 *
 * A cap is satisfied by an empty file, a renamed one and a misspelt path, so
 * the read is floored. The cap check is one function, `capFault`, and the second
 * test hands it the real text padded past the cap, so the check itself is seen
 * to fail and not only the counter.
 *
 * See docs/gates.md, row G72 (threat-model-cap), and docs/threat-model.md.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './repo.ts';

const THREAT_MODEL = 'docs/threat-model.md';

/** Words the file may hold, whole file, diagrams included. */
const MAX_WORDS = 3000;

/** A file shorter than this is not a threat model the cap is guarding. */
const MIN_WORDS = 500;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** What is wrong with a threat model's length, or `undefined` when nothing is. */
function capFault(text: string): string | undefined {
  const words = wordCount(text);
  if (words <= MIN_WORDS) {
    return `${THREAT_MODEL} holds ${words} words, too few to be the file this cap guards`;
  }
  if (words > MAX_WORDS) {
    return `${THREAT_MODEL} holds ${words} words, over the cap of ${MAX_WORDS}. Cut a line; raising the cap is a spec change`;
  }
  return undefined;
}

describe('G72 — the threat model is read, and held to its cap', () => {
  it('holds at most 3,000 words, and is not empty', () => {
    expect(capFault(readRepoFile(THREAT_MODEL))).toBeUndefined();
  });

  it('reports a padded copy as over the cap', () => {
    const padded = `${readRepoFile(THREAT_MODEL)}\n${'padding '.repeat(MAX_WORDS)}`;

    expect(capFault(padded)).toMatch(/over the cap of 3000/);
  });
});
