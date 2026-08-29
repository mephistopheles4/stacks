/**
 * PROTOTYPE ONLY — wayfinder ticket #284, under map #280. Never merged to
 * `main`.
 *
 *     pnpm tsx scripts/prototype-coplanar.ts
 *
 * Counts the depth-buffer ties in the bookcase, before and after the inset.
 *
 * The owner reported a flicker at the plank ends, and then a second one at the
 * backboard after the first was fixed. **That is the shape of a class defect
 * being fixed one instance at a time**, so this enumerates the whole class
 * instead: every pair of member faces that shares a plane *and* overlaps in the
 * other two axes, which is exactly the condition for two fragments to arrive at
 * the same depth and let precision decide which wins.
 *
 * It is arithmetic on `SHELF`, not a render — no Three.js, no browser. The
 * numbers it prints are what `PLANK_INSET` is sized against, and the "after"
 * count is the assertion a gate would make if any of this shipped.
 *
 * ⚠️ **The ties are on `main` today and always have been.** A tie between two
 * faces of the *same* flat colour resolves to the same pixel either way, so the
 * woodwork's 46 pairs are invisible until something gives the two faces
 * different colours — which a texture does. The backboard's pairs are the
 * exception and flicker already: it is a second material in `woodDark`.
 */
import { SHELF } from '../packages/site/src/shelf/case.ts';
import { PLANK_INSET } from '../packages/site/src/shelf/prototype-wood.ts';

interface Member {
  readonly name: string;
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

/** Four rows, the fixture vault's own case. The count scales with rows; the fix does not. */
const ROWS = 4;

function bookcase(inset: number): Member[] {
  const outer = SHELF.width + SHELF.sideThickness * 2;
  const height = ROWS * SHELF.rowHeight;
  const span = (centre: number, size: number): [number, number] => [
    centre - size / 2,
    centre + size / 2,
  ];

  const members: Member[] = [
    {
      name: 'backboard',
      x: span(0, outer - inset * 4),
      y: span(height / 2, height - inset * 4),
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

  for (let row = 0; row <= ROWS; row += 1) {
    members.push({
      name: `plank${String(row)}`,
      x: span(0, outer - inset * 2),
      y: span(row * SHELF.rowHeight, SHELF.plankThickness),
      z: span(0, SHELF.depth - inset * 2),
    });
  }

  return members;
}

/** Face pairs that share a plane and overlap in the other two axes. */
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
            found.push(`${a.name} / ${b.name}  share ${axis} = ${planeA.toFixed(4)}`);
          }
        }
      }
    }
  }
  return found;
}

const before = ties(bookcase(0));
const after = ties(bookcase(PLANK_INSET));

console.log(`today's geometry — ${String(before.length)} coplanar, overlapping face pairs`);
for (const line of before) console.log(`  ${line}`);

console.log('');
console.log(
  `inset by ${PLANK_INSET.toFixed(3)} — ${String(after.length)} coplanar, overlapping face pairs`,
);
for (const line of after) console.log(`  ${line}`);

if (after.length > 0) {
  console.log('\nthe inset did not clear the class; see the pairs above');
  process.exitCode = 1;
}
