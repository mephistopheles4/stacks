/**
 * G51 — the bookcase has no coplanar, overlapping face pair.
 *
 * Every member of the bookcase is a box. Two of their faces sharing a plane
 * *while overlapping in the other two axes* is exactly the condition for two
 * fragments to arrive at the same depth and let floating-point precision decide
 * which one wins — so the surfaces trade places frame by frame while the camera
 * moves, and settle into whichever won when it stops. The camera's near and far
 * are 0.1 and 100, which leaves the depth buffer nothing to separate them with.
 *
 * On a four-row case there were **46** such pairs, and they were on `main` from
 * the day the case was built. Almost all of them resolved to the same pixel
 * either way, because the planks and the uprights share one material in one flat
 * colour — a tie between two identical colours is not a defect anybody can see.
 * ⚠️ **The 16 pairs the backboard takes part in were the exception and
 * flickered**: it is a second material in `woodDark`, so its ties resolve to two
 * different colours. The other 30 did not. Anything that gives the woodwork a
 * texture makes all 46 visible at once. See
 * [#296](https://github.com/mephistopheles4/stacks/issues/296).
 *
 * ⚠️ **16 and 30, not 36** — 36 is `46 - 10`, what #284's x-only first pass left
 * behind, and both numbers appear in #296 and #301. This docblock carried the
 * wrong one until CodeRabbit caught it on #308.
 *
 * ## Why this is enumerated rather than eyeballed
 *
 * ⚠️ **Fixing the pair somebody points at leaves 36 of them, and that is not
 * hypothetical.** On [#284](https://github.com/mephistopheles4/stacks/issues/284)
 * a first pass shortened the planks in `x`, cleared 10, and left every backboard
 * pair *and* the plank front and back faces at `z = ±0.36` — which nobody had
 * pointed at and nobody had looked for. The second report arrived a few minutes
 * later. So this gate asserts about the **class**, from the case's own
 * constants, and the count it checks is derived from the row count rather than
 * written down.
 *
 * ⚠️ **#296's own pair table over-counts by two, and this is where that is
 * recorded.** It gives *backboard side / upright outer face* as 4; the
 * enumeration below finds 2 (one per upright), and its rows sum to 48 against
 * the 46 the same issue states everywhere else. The 46 is right — it is what the
 * arithmetic produces — and the table's fourth row is what is wrong. Left
 * uncorrected on the issue, because an issue is a record of what was believed
 * when it was written; corrected here, where something can go red.
 *
 * ## What this gate is, and the limit it has
 *
 * ⚠️ **It mirrors `buildShelf`'s arithmetic; it does not read the scene graph.**
 * A gate that built the real Three.js scene would need a WebGL context, and the
 * condition being asserted is geometric rather than visual — no render decides
 * it. So the third clause below binds the mirror to the renderer the only way a
 * text gate can: each `BoxGeometry` call in `buildShelf` must carry the inset
 * this file assumes it carries, **on the axes it assumes and on no others** —
 * uprights none, planks `x` and `z`, backboard `x` and `y`. That is G40's and
 * G44's stated limit reached again — **the condition is proven, the pixels are
 * not.**
 *
 * ⚠️ **The axis half of that clause is not decoration.** It first read *does
 * this call mention the constant*, which passes a plank inset in **height**:
 * the wrong axis, ends still on the uprights' planes, and indistinguishable
 * from a fix to anything that only greps. That is #284's first pass — cleared
 * `x`, left `z` — arriving inside the gate written to prevent it.
 *
 * See docs/gates.md, row G51 (coplanar-faces), and
 * [#301](https://github.com/mephistopheles4/stacks/issues/301).
 */

import { describe, expect, it } from 'vitest';
import { BACKBOARD_INSET, PLANK_INSET, SHELF } from '../packages/site/src/shelf/bookcase.ts';
import { codeOf, expectFound } from './repo.ts';

/** One box of the bookcase, as the half-open interval it occupies on each axis. */
interface Member {
  readonly name: string;
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

/**
 * Row counts to check.
 *
 * More than one, because *"46 on a four-row case"* is a fact about the fixture
 * and the defect is a fact about the case. `rowsForBookcase` grows the unit with the
 * library, so a real vault reaches every one of these.
 */
const ROW_COUNTS = [2, 3, 4, 5, 8] as const;

/**
 * How many ties a case of `rows` rows has with no inset at all.
 *
 * Derived rather than written down. Per row boundary there are `rows + 1`
 * planks, and each contributes 8 ties — one `x` plane against each upright, two
 * `z` planes against each upright, and two `x` planes against the backboard. The
 * backboard adds a further 6 that do not scale: one `x` plane against each
 * upright, and the top and bottom against each upright's. At four rows that is
 * 46, which is the number [#296](https://github.com/mephistopheles4/stacks/issues/296)
 * reports.
 */
function tiesWithoutInset(rows: number): number {
  return 8 * (rows + 1) + 6;
}

/**
 * The bookcase `buildShelf` builds, as intervals — the same arithmetic, without
 * Three.js.
 *
 * The two insets are arguments rather than constants so the clauses below can
 * ask what the geometry does at values it does not ship at: zero, which is the
 * defect, and equal, which is the trap.
 */
function bookcase(rows: number, plankInset: number, backboardInset: number): Member[] {
  const outer = SHELF.width + SHELF.sideThickness * 2;
  const height = rows * SHELF.rowHeight;
  const span = (centre: number, size: number): [number, number] => [
    centre - size / 2,
    centre + size / 2,
  ];

  const members: Member[] = [
    {
      name: 'backboard',
      x: span(0, outer - backboardInset * 2),
      y: span(height / 2, height - backboardInset * 2),
      z: span(-SHELF.depth / 2, SHELF.backThickness),
    },
  ];

  for (const side of [-1, 1]) {
    members.push({
      name: `upright${side < 0 ? 'L' : 'R'}`,
      x: span((side * (SHELF.width + SHELF.sideThickness)) / 2, SHELF.sideThickness),
      y: span(height / 2, height),
      z: span(0, SHELF.depth),
    });
  }

  for (let row = 0; row <= rows; row += 1) {
    members.push({
      name: `plank${String(row)}`,
      x: span(0, outer - plankInset * 2),
      y: span(row * SHELF.rowHeight, SHELF.plankThickness),
      z: span(0, SHELF.depth - plankInset * 2),
    });
  }

  return members;
}

/**
 * Every pair of member faces that shares a plane *and* overlaps in the other two
 * axes.
 *
 * The overlap test is what keeps this from reporting two boxes that merely touch
 * along an edge or a corner: a shared plane with no shared area draws no
 * fragments in common, so nothing can flicker. `1e-6` is the overlap floor and
 * `1e-9` the coincidence one — the inset is 0.004, three orders of magnitude
 * clear of either, so no tolerance here is deciding the verdict.
 */
function ties(members: readonly Member[]): string[] {
  const found: string[] = [];

  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i];
      const b = members[j];
      if (a === undefined || b === undefined) continue;

      for (const axis of AXES) {
        for (const edgeA of [0, 1] as const) {
          for (const edgeB of [0, 1] as const) {
            const planeA = a[axis][edgeA];
            const planeB = b[axis][edgeB];
            if (Math.abs(planeA - planeB) > 1e-9) continue;

            const others = AXES.filter((other): other is Axis => other !== axis);
            const overlaps = others.every(
              (other) =>
                Math.min(a[other][1], b[other][1]) - Math.max(a[other][0], b[other][0]) > 1e-6,
            );
            if (!overlaps) continue;

            found.push(`${a.name} / ${b.name} share ${axis} = ${planeA.toFixed(4)}`);
          }
        }
      }
    }
  }

  return found;
}

describe('G51 — the enumeration finds the defect it exists to clear', () => {
  it('counts the ties the un-inset case has, at every row count', () => {
    // The positive control, and it is the reason the clause below means
    // anything: an enumerator that has stopped matching reports zero ties on a
    // geometry riddled with them, and a gate asserting only "zero" would call
    // that a pass. Every count here is arithmetic on the same constants the
    // renderer builds from — change a dimension and both sides move together.
    const counted = ROW_COUNTS.map((rows) => ({
      rows,
      found: ties(bookcase(rows, 0, 0)).length,
      expected: tiesWithoutInset(rows),
    }));

    const wrong = counted
      .filter(({ found, expected }) => found !== expected)
      .map(({ rows, found, expected }) => `${rows} rows: ${found} ties, expected ${expected}`);

    expect(
      wrong,
      'the un-inset bookcase no longer has the tie count the class arithmetic predicts. ' +
        'Either a dimension changed and `tiesWithoutInset` was not re-derived, or the ' +
        `enumeration below has stopped seeing pairs it used to see: ${wrong.join('; ')}`,
    ).toEqual([]);

    expect(counted.find(({ rows }) => rows === 4)?.found, '#296 counts 46 on four rows').toBe(46);
  });
});

describe('G51 — the shipped case has no tie at all', () => {
  it('clears every pair at every row count', () => {
    const remaining = ROW_COUNTS.flatMap((rows) =>
      ties(bookcase(rows, PLANK_INSET, BACKBOARD_INSET)).map((tie) => `${rows} rows — ${tie}`),
    );

    expect(
      remaining,
      'coplanar, overlapping face pairs surviving the inset. Each one is two surfaces at ' +
        'the same depth with precision deciding which draws, which shimmers as the camera ' +
        `moves and is visible the moment the two carry different pixels: ${remaining.join('; ')}`,
    ).toEqual([]);
  });

  it('keeps the backboard on twice the plank inset, because equal creates a new tie', () => {
    // ⚠️ **Not tidiness.** Shrunk by the *same* amount, the backboard's sides and
    // the plank ends land on one **new** shared plane at ±1.786 — a tie the
    // uprights happen to hide, which is a worse thing to rely on than not
    // creating. Asserted rather than commented, so the doubling cannot be
    // "simplified" back out by someone who reads `BACKBOARD_INSET` as a
    // duplicate of `PLANK_INSET`.
    expect(BACKBOARD_INSET, 'the backboard takes twice the plank inset').toBe(PLANK_INSET * 2);

    const ifEqual = ties(bookcase(4, PLANK_INSET, PLANK_INSET));

    expect(
      ifEqual.length,
      'an equal inset was expected to re-create the backboard-side / plank-end tie, one ' +
        'per plank end. It did not, so the reason the doubling exists is no longer the ' +
        'reason stated here — re-derive it before flattening the two constants together',
    ).toBe(10);
  });
});

describe('G51 — the renderer carries the inset this gate assumes', () => {
  it('insets the planks and the backboard, and leaves the uprights alone', () => {
    // The mirror bound to the thing it mirrors. Everything above is arithmetic
    // on `case.ts` and would stay green if `buildShelf` never read either
    // constant — which is the vacuous green this clause closes. It reads the
    // three `BoxGeometry` calls rather than the whole function, because that is
    // where a member's size is decided and nowhere else.
    //
    // Comments are blanked by `codeOf` first: this file's own prose names both
    // constants, and so does `buildShelf`'s.
    const source = codeOf('packages/site/src/shelf/scene.ts');
    const build = /function buildShelf\([\s\S]*?\n}/.exec(source)?.[0] ?? '';
    const boxes = [...build.matchAll(/new THREE\.BoxGeometry\(([\s\S]*?)\),/g)].map(
      (match) => match[1] ?? '',
    );

    expectFound(boxes, 'BoxGeometry calls in buildShelf', 3);

    // ⚠️ **Which argument carries the inset *is* the axis, so presence alone is
    // not enough.** `BoxGeometry(width, height, depth)` is `(x, y, z)`, and a
    // clause asking only *does this call mention PLANK_INSET* passes a plank
    // inset in **height** — the wrong axis, ends still on the uprights' planes.
    // That is #284's first pass exactly, which cleared `x` and left `z`, one
    // file over. Raised by CodeRabbit on #308 against the weaker version.
    //
    // Members are identified by their own thickness constant rather than by
    // position in the list, so reordering `buildShelf` cannot make this clause
    // grade one member against another's rule.
    // The trailing comma Prettier writes after the last argument would otherwise
    // make every call read as four arguments, so the empty tail is dropped. No
    // argument here contains a comma of its own — the three are arithmetic on
    // single identifiers — and the length check below is what notices if that
    // ever stops being true rather than letting a mis-split pass quietly.
    const axesOf = (args: string): string[] =>
      args
        .split(',')
        .map((arg) => arg.trim())
        .filter((arg) => arg !== '');

    const EXPECTED: readonly { member: string; marker: string; inset: string; on: number[] }[] = [
      // The backboard: `x` and `y` inside the uprights, `z` untouched — it is
      // the one member whose depth nothing shares a plane with.
      { member: 'backboard', marker: 'SHELF.backThickness', inset: 'BACKBOARD_INSET', on: [0, 1] },
      // The uprights keep every plane they own, so they carry no inset at all.
      { member: 'upright', marker: 'SHELF.sideThickness', inset: '', on: [] },
      // The planks: `x` and `z`. The `z` half is the one that was missed.
      { member: 'plank', marker: 'SHELF.plankThickness', inset: 'PLANK_INSET', on: [0, 2] },
    ];

    const wrong: string[] = [];

    for (const { member, marker, inset, on } of EXPECTED) {
      const found = boxes.filter((args) => args.includes(marker));
      if (found.length !== 1) {
        wrong.push(`${member}: ${String(found.length)} calls name \`${marker}\`, expected 1`);
        continue;
      }

      const args = axesOf(found[0] ?? '');
      if (args.length !== 3) {
        wrong.push(`${member}: ${String(args.length)} arguments, expected width, height, depth`);
        continue;
      }

      for (const [axis, name] of ['x', 'y', 'z'].entries()) {
        const carries = inset !== '' && (args[axis] ?? '').includes(inset);
        const should = on.includes(axis);
        if (carries === should) continue;
        wrong.push(
          should
            ? `${member} must be inset in ${name} and is not`
            : `${member} must not be inset in ${name} and is`,
        );
      }
    }

    expect(
      wrong,
      'members of `buildShelf` sized off the wrong axis. The uprights keep every plane ' +
        'they own and carry no inset; the planks come off `x` and `z`; the backboard off ' +
        '`x` and `y`, at twice the amount. An inset on the wrong axis leaves a face on a ' +
        'shared plane while looking, to any check that only greps for the constant, exactly ' +
        `like a fix: ${wrong.join('; ')}`,
    ).toEqual([]);

    expect(boxes.length, 'buildShelf builds exactly three members').toBe(3);
  });
});
