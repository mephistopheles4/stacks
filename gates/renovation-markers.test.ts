/**
 * G57 — every stamp in a floors file is explained by an entry in `renovations.json`.
 *
 * A stamp records the rule a number was produced under. When one moves, the
 * calibration window restarts and the numbers either side stop being
 * comparable. Until [#227](https://github.com/mephistopheles4/stacks/issues/227)
 * nothing said **why** it moved, so a reader of the trend page met a step change
 * and supplied their own story, and the only surface that said anything was
 * dated prose inside the floors file — which marks the *file*, not the series.
 *
 * This row makes the reason **due at the moment the stamp changes**. Move a
 * stamp without an entry naming its new value and the pull request is red, with
 * a message naming the file and the shape of the entry to add.
 *
 * ## Why this runs at merge and not at the deploy
 *
 * ⚠️ **The deploy was the other candidate and it is the one #227 warns about.**
 * A refusal that a written sentence clears is an override wearing a reason, and
 * [ADR-0061](../docs/adr/0061-the-mutation-floor-refuses-deploy.md) and
 * [ADR-0068](../docs/adr/0068-the-complexity-cap-only-falls.md) provide none on
 * purpose. It also acts last, with a release in hand: a stale stamp blocked a
 * deploy for two days once already ([#292](https://github.com/mephistopheles4/stacks/issues/292)).
 * This reads the disk and needs no metrics record, which is what lets it run at
 * merge — G56's footing exactly.
 *
 * ## What it covers, and the one class it cannot
 *
 * All three stamps, and the third lives in the other file:
 * `configHash` and `fixtureHash` in `stryker.floors.json`, `duplicationHash` in
 * `jscpd.floors.json`. ⚠️ **Keyed on the stamp and never on the file**, because
 * those two files are separate for structural reasons that have nothing to do
 * with this record — and because #341 measured seven times over that a fix
 * landing on the instance somebody pointed at leaves the siblings alive.
 *
 * ⚠️ **A change that moves no stamp is uncheckable here, by construction.**
 * `renovations.json` accepts a free entry for one — a formatter adoption, a Node
 * upgrade — and nothing can force it, because forcing means a comparison and
 * there is no stamp to compare against. That is a property of the class rather
 * than a gap in this row, and
 * [ADR-0085](../docs/adr/0085-a-renovation-is-declared-and-the-window-may-survive.md)
 * states it rather than leaving it to be discovered.
 *
 * ⚠️ **And this row says nothing about whether the reason is any good.** It
 * asserts that one exists and that it names the value actually in the file — the
 * same relationship G41 has to the quality of a register entry.
 */

import { describe, expect, it } from 'vitest';

import { readDeclarations } from '../scripts/lib/duplication.ts';
import { FLOORS_FILE, readFloors } from '../scripts/lib/floors.ts';
import {
  RENOVATIONS_FILE,
  STAMP_NAMES,
  newestFor,
  readRenovations,
  type StampName,
} from '../scripts/lib/renovations.ts';
import { expectFound } from './repo.ts';

const JSCPD_FLOORS_FILE = 'jscpd.floors.json';

const renovations = readRenovations();
const floors = readFloors();
const declarations = readDeclarations();

/** `sha256:` and 64 hex digits — the one spelling `digest` writes. */
const SHA256 = /^sha256:[0-9a-f]{64}$/;

/** Each stamp, the value on disk, and the file that carries it. */
const ON_DISK: readonly { stamp: StampName; value: string; file: string }[] = [
  { stamp: 'configHash', value: floors.configHash, file: FLOORS_FILE },
  { stamp: 'fixtureHash', value: floors.fixtureHash, file: FLOORS_FILE },
  {
    stamp: 'duplicationHash',
    value: declarations.duplicationHash,
    file: JSCPD_FLOORS_FILE,
  },
];

describe('G57 — both sides of the comparison are real', () => {
  it('reads three stamps off the disk, none of them empty', () => {
    // ⚠️ **Two `undefined`s compare equal.** Every clause below is satisfied by
    // a floors file whose stamp was deleted and a marker file whose entry lost
    // its value, so both shapes are asserted before any equality is — G56's
    // reason, applied to three comparisons instead of one.
    for (const { stamp, value, file } of ON_DISK) {
      expect(value, `the \`${stamp}\` field of ${file}`).toMatch(SHA256);
    }
  });

  it('reads a marker file with entries in it', () => {
    // The population this row is *about*. An empty list satisfies "no entry
    // contradicts a stamp" vacuously, which is the shape that would let the
    // file be emptied and the row stay green.
    expectFound(renovations, `entries in ${RENOVATIONS_FILE}`, ON_DISK.length);
  });

  it('covers all three stamps and knows which three they are', () => {
    // Reverse-asserted against the module's own list, so a fourth stamp cannot
    // arrive with this row silently covering three.
    expect([...STAMP_NAMES].sort()).toEqual(ON_DISK.map(({ stamp }) => stamp).sort());
  });
});

describe('G57 — every stamp on disk is explained', () => {
  for (const { stamp, value, file } of ON_DISK) {
    it(`names a renovation for ${stamp}`, () => {
      const newest = newestFor(renovations, stamp);

      expect(
        newest,
        `${file} carries a \`${stamp}\` that ${RENOVATIONS_FILE} never explains. A stamp ` +
          'that moves restarts every calibration window derived under it, and a reader of ' +
          'the trend page then meets a step change with no story.\n\n' +
          `  The remedy: append an entry to ${RENOVATIONS_FILE} in the same commit —\n\n` +
          `    { "date": "YYYY-MM-DD", "stamp": "${stamp}", "value": "${value}",\n` +
          '      "reason": "what changed, and what you measured", "pr": <number>,\n' +
          '      "preserves": false }\n\n' +
          '  ⚠️ `preserves` is required and has no default. `false` means the window ' +
          'restarts here, which is what a stamp change has always meant. `true` carries ' +
          'the window across, and it asserts that the counts either side are comparable — ' +
          'claim it only when you measured that they are.',
      ).toBeDefined();
    });

    it(`explains the ${stamp} this checkout actually has`, () => {
      expect(
        newestFor(renovations, stamp)?.value,
        `the newest ${RENOVATIONS_FILE} entry for \`${stamp}\` explains a value ${file} ` +
          'does not carry. Either the stamp moved and its entry was not appended, or an ' +
          'entry was written for a value that never landed.\n\n' +
          `  The remedy: append an entry naming ${value}, or correct the newest one if it ` +
          'was written for this same change.\n\n' +
          '  ⚠️ Correct the newest entry only — the ones above it are history, and #328 ' +
          "set that rule for this file's sibling when it left the dated notes alone.",
      ).toBe(value);
    });
  }
});
