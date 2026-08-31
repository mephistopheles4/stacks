/**
 * G53 — a default page downloads exactly one woodwork sheet.
 *
 * ## Why this row exists only now
 *
 * ⚠️ **It has teeth because the species menu ships, and would have asserted
 * nothing before it.** While the woodwork wore one hard-coded sheet there was
 * structurally one download and no way to have two; the row would have been a
 * tautology dressed as a guarantee. With
 * [#306](https://github.com/mephistopheles4/stacks/issues/306)'s roster in
 * place, a fourth or fifth entry wired eagerly instead of lazily costs **every
 * visitor** a file they will never look at — and nothing else in the tree would
 * object, because the sheet would be committed, under both of G52's caps, and
 * served correctly.
 *
 * The cost is not the wire. It is **decode**, at `edge² × 4` bytes of RGBA
 * uploaded before the first frame beside every cover: 1.0 MB at 512 and 4.0 MB
 * at 1024, *per sheet held*. G15's own row records what that arithmetic did the
 * last time nobody was doing it — 8.4 MB of covers decoded to 314 MB, a
 * renderer killed on a phone, and a reload that hit a browser which then refused
 * a context at all.
 *
 * ## What is asserted, and on what
 *
 * ⚠️ **On the pure resolution function, never on the network.** G21
 * (`no-live-network`) records any request the suite makes and fails the test
 * that made it, so what is compared is the resolved URL and never the bytes.
 * That is the same rule G52's existence clause follows one file over.
 *
 * ⚠️ **The laziness is a property of the resolution, not of a comment.** A page
 * fetches what `resolveWoodwork` handed it and nothing else — `buildShelf` binds
 * the one sheet it was given — so *at most one* over the whole roster is the
 * machine-checkable form of "a menu entry nobody selects costs nothing".
 *
 * ## The vacuous green, and what closes it
 *
 * Every clause below is satisfied by an empty roster, which is the failure
 * `docs/gates.md` records under *a malformed identifier reads as no findings*.
 * Three things close it: the roster is floored, the default must be a **member**
 * of it rather than merely a string, and the default must resolve to a sheet
 * rather than to none — so a roster that quietly lost `rosewood` is a red naming
 * it and not a silent pass.
 *
 * See docs/gates.md, row G53 (one-sheet), and
 * [#306](https://github.com/mephistopheles4/stacks/issues/306).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../packages/site/src/shelf/shelf-settings.ts';
import {
  DEFAULT_SPECIES,
  SHIPPED_SHEETS,
  WOODWORK_SHEET,
  WOOD_SPECIES,
  resolveWoodwork,
  woodworkSheetUrls,
} from '../packages/site/src/shelf/woodwork.ts';
import { expectFound } from './repo.ts';

/**
 * Names that are not on the roster, including the ones an `in` check would have
 * accepted.
 *
 * ⚠️ **`__proto__` and `toString` are not decoration.** `requested in SHEETS`
 * answers `true` for every inherited key, which is a guard that passes on a
 * value nobody wrote — and a guard that passes resolves to *something*, which is
 * how a page ends up fetching a sheet no menu entry named.
 */
const OFF_ROSTER = ['walnut', 'koa', '', ' rosewood', 'ROSEWOOD', '__proto__', 'toString'];

describe('G53 — the roster is real, and the default is on it', () => {
  it('holds species to resolve', () => {
    // Floored, because every clause below passes perfectly over an empty list.
    expectFound(WOOD_SPECIES, 'woodwork species');
  });

  it('names a default that is a member of the roster', () => {
    // Not merely a string that reads like one. A default off the roster would
    // take the refusal path on every single page load, which renders correctly
    // and reports a refusal nobody asked for — the shape of a control that is
    // wrong from the first frame and says so in a place nobody reads.
    expect(
      WOOD_SPECIES,
      'the roster must contain the species a page with no opinion resolves to, or every ' +
        'default page takes the refusal path',
    ).toContain(DEFAULT_SPECIES);
    expect(DEFAULT_SETTINGS.materials.woodSpecies).toBe(DEFAULT_SPECIES);
  });
});

describe('G53 — a default page resolves to exactly one woodwork sheet', () => {
  it('resolves the default settings to one sheet, and names which', () => {
    const urls = woodworkSheetUrls(DEFAULT_SETTINGS.materials.woodSpecies);

    expect(
      urls,
      'woodwork sheet URLs a page with default settings fetches. Two is a file every ' +
        'visitor decodes for a menu they never open — 4.0 MB of RGBA at 1024, before the ' +
        'first frame, beside every cover; zero is a bookcase at its fallback colour, which ' +
        'looks exactly like a texture nobody bound',
    ).toEqual([WOODWORK_SHEET.url]);
  });

  it('never resolves more than one, for any entry on the roster', () => {
    // The laziness claim as arithmetic. The roster may grow to four species
    // again — #281 settled four and only two were ever rendered — and this is
    // what keeps that growth free for a visitor who never opens the panel.
    const greedy = WOOD_SPECIES.filter((name) => woodworkSheetUrls(name).length > 1);

    expect(
      greedy,
      'species that resolve to more than one woodwork sheet. A page binds the sheet it ' +
        'resolved to and no other, so more than one here is a download nobody decided: ' +
        `${greedy.join(', ')}`,
    ).toEqual([]);
  });

  it('never resolves more than one for a name that is not on the roster either', () => {
    // The fallback must not fetch two — its own and the one it fell back to.
    // `?tune=` carries arbitrary JSON, so this is a real arrival and not a
    // hypothetical.
    const greedy = OFF_ROSTER.filter((name) => woodworkSheetUrls(name).length > 1);

    expect(
      greedy,
      `off-roster names that resolve to more than one sheet: ${greedy.join(', ')}`,
    ).toEqual([]);
  });

  it('resolves the default to a sheet rather than to none', () => {
    // The other half of the vacuous green: `toEqual([])` above would be
    // perfectly satisfied by a resolution that binds nothing at all, which is
    // the flat arm shipped as the default by accident.
    expect(
      resolveWoodwork(DEFAULT_SPECIES).sheet,
      'the default species must bind a sheet. Resolving to none ships the mean-matched ' +
        'flat twin as the shelf, which is an arm and not the treatment #284 chose',
    ).toBeDefined();
  });
});

describe('G53 — the menu costs a default page nothing beyond that one sheet', () => {
  it('keeps every non-default species out of what a default page fetches', () => {
    // `SHIPPED_SHEETS` is what a default page costs and `ALL_SHEETS` is what the
    // module can name; the two are different sets on purpose, and this is the
    // clause that keeps them different. A menu entry that reaches this array is
    // an eager load wearing a lazy one's name.
    const shipped = expectFound(SHIPPED_SHEETS, 'shipped sheets', 2).map((sheet) => sheet.url);

    const eager = WOOD_SPECIES.filter((name) => name !== DEFAULT_SPECIES)
      .flatMap((name) => woodworkSheetUrls(name))
      .filter((url) => shipped.includes(url));

    expect(
      eager,
      'sheets belonging to a species nobody selected that a default page fetches anyway. ' +
        'The menu exists on the promise that it costs a visitor who never opens the panel ' +
        `nothing: ${eager.join(', ')}`,
    ).toEqual([]);
  });

  it('counts exactly one woodwork sheet among the two a default page fetches', () => {
    // The second is the backboard's, which is a constant with no menu behind it
    // — #297 measured all 41 veneers Poly Haven publishes and the darkness
    // constraint left one candidate. So a row counting *woodwork* sheets must
    // not count that one, and this states the split rather than assuming it.
    const woodwork = SHIPPED_SHEETS.filter((sheet) => sheet.url === WOODWORK_SHEET.url);

    expect(woodwork).toHaveLength(1);
    expect(SHIPPED_SHEETS).toHaveLength(2);
  });
});
