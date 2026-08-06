/**
 * PROTOTYPE — throwaway, for wayfinder ticket #66.
 *
 *     pnpm tsx scripts/proto-cap-paired.ts <log>
 *
 * Reads `proto-corners-stress.ts`'s per-pass lines and compares arms **within a
 * pass**, which is the analysis that rig actually supports.
 *
 * The summary table in the stress script compares each arm's best across passes,
 * which is #56's estimator kept for comparability — and on this machine it is
 * the wrong one. Whole passes drift together: pass 6 came back with every arm
 * between 47 and 81 fps and pass 4 with every arm between 72 and 99. A
 * best-of-N across passes measures which arm caught the quietest minute; a
 * *paired* comparison cancels the drift, because both arms of a pair sat in the
 * same minute.
 *
 * Reported as the **sign count** first and the median delta second. With seven
 * passes a consistent direction is worth more than a magnitude: 7 of 7 in one
 * direction is p = 1/128 under the null that the arms are identical, whereas a
 * large median that flips sign across passes is drift wearing a result's
 * clothes.
 */
import { readFileSync } from 'node:fs';

const LINE = /^pass (\d+) .*cpu {2}(.+?) +(\d+) draws +(\d+) tri +([\d.]+) fps/;

interface Row {
  readonly pass: number;
  readonly arm: string;
  readonly fps: number;
}

/** Every pair worth naming, as `[reference, candidate]` — read as "does B beat A". */
const PAIRS: readonly (readonly [string, string, string])[] = [
  ['cap 1x10 (20 tri)', 'cap 1x10 again', 'the floor — the same arm twice'],
  ['cap 1x10 (20 tri)', 'cap 64x20 (2560 tri)', 'geometry — 128x the triangles'],
  ['cap 1x10 (20 tri)', 'cap 1x2 (4 tri)', 'geometry — 5x fewer triangles'],
  ['cap 1x10 (20 tri)', 'cap 1x10, 1 material', 'materials — 20 of them down to 1'],
  ['no cap', 'cap 1x2 (4 tri)', "the cap's presence, at 4 triangles"],
  ['no cap', 'cap 1x10 (20 tri)', "the cap's presence, at 20 triangles"],
  ['no cap', 'cap 32x10 (640 tri)', '#56 as built, at 640 triangles'],
  ['no cap', 'cap 1x10, 1 material', 'the cap with one shared material'],
];

function main(): void {
  const path = process.argv[2];
  if (path === undefined) throw new Error('usage: proto-cap-paired.ts <stress log>');

  const rows: Row[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match === null) continue;
    rows.push({
      pass: Number(match[1]),
      arm: (match[2] ?? '').trim(),
      fps: Number(match[5]),
    });
  }
  const passes = [...new Set(rows.map((r) => r.pass))].sort((a, b) => a - b);
  const fps = (pass: number, arm: string): number | undefined =>
    rows.find((r) => r.pass === pass && r.arm === arm)?.fps;

  console.log(`\n${String(passes.length)} passes, compared within each pass\n`);
  console.log(
    'comparison                            slower  faster   median    worst    best',
  );
  for (const [reference, candidate, caption] of PAIRS) {
    const deltas: number[] = [];
    for (const pass of passes) {
      const a = fps(pass, reference);
      const b = fps(pass, candidate);
      if (a === undefined || b === undefined || a === 0) continue;
      deltas.push(((b - a) / a) * 100);
    }
    if (deltas.length === 0) continue;
    const sorted = [...deltas].sort((x, y) => x - y);
    const slower = deltas.filter((d) => d < 0).length;
    const faster = deltas.filter((d) => d > 0).length;
    const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    console.log(
      `${caption.padEnd(38)} ${String(slower).padStart(4)}/${String(deltas.length)} ` +
        `${String(faster).padStart(4)}/${String(deltas.length)} ` +
        `${signed(sorted[Math.floor(sorted.length / 2)] ?? 0).padStart(8)} ` +
        `${signed(sorted[0] ?? 0).padStart(8)} ${signed(sorted[sorted.length - 1] ?? 0).padStart(7)}`,
    );
  }
  console.log(
    '\nRead the sign columns before the medians. An arm that is slower in every\n' +
      'pass is a result at p = 1/2^n under the null; a big median that flips sign\n' +
      'between passes is this rig drifting, which the best-of-N table cannot see.\n',
  );
}

main();
