/**
 * G71 — `docs/threat-model.md` stays short enough to be read.
 *
 * A threat model a session skips protects nothing, and models given room fill
 * it. So the file is capped at 3,000 words, counted over the whole file with
 * its two diagrams included, by splitting on whitespace. **Raising the cap is a
 * spec change** (the-pact issue 542, S10), not an edit to `MAX_WORDS`.
 *
 * ## The vacuous green
 *
 * A cap is satisfied by an empty file, a renamed one and a misspelt path, so
 * the read is floored. The second test pads the real text past the cap and
 * checks the counter reports it over, which is how the cap is seen to fail.
 *
 * See docs/gates.md, row G71 (threat-model-cap), and docs/threat-model.md.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './repo.ts';

const THREAT_MODEL = 'docs/threat-model.md';

/** Words the file may hold, whole file, diagrams included. */
const MAX_WORDS = 3000;

/** A file shorter than this is not a threat model the cap is guarding. */
const MIN_WORDS = 500;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

describe('G71 — the threat model is read, and held to its cap', () => {
  it('holds at most 3,000 words, and is not empty', () => {
    const words = wordCount(readRepoFile(THREAT_MODEL));

    expect(words, `${THREAT_MODEL} is too short to be the file this cap guards`).toBeGreaterThan(
      MIN_WORDS,
    );
    expect(
      words,
      `${THREAT_MODEL} holds ${words} words, over the cap of ${MAX_WORDS}. Cut a line; ` +
        'raising the cap is a spec change',
    ).toBeLessThanOrEqual(MAX_WORDS);
  });

  it('reports a padded copy as over the cap', () => {
    const padded = `${readRepoFile(THREAT_MODEL)}\n${'padding '.repeat(MAX_WORDS)}`;

    expect(wordCount(padded)).toBeGreaterThan(MAX_WORDS);
  });
});
