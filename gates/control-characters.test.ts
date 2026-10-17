/**
 * G66 — no tracked text file carries a C0 control character other than tab,
 * line feed and carriage return.
 *
 * PowerShell reads a backtick as an escape inside a double-quoted string, so
 * `` `a `` becomes U+0007 (BEL), `` `b `` a backspace and `` `f `` a form feed.
 * A Markdown code span written through one — `` `auditConfig` `` — loses its
 * opening backtick and its first letter to a character that draws as nothing.
 * It happened three times before this row existed: in `docs/gates.md` and
 * `pickup.ts`, both fixed in #417, and in `scripts/lib/ignore-ghsas.ts`, fixed
 * with this row (#426). Every gate was green over all three, because none of
 * them reads bytes a renderer hides.
 *
 * **Bytes, not characters.** A UTF-8 file can hold a byte below 0x20 only as
 * that ASCII character itself, so a byte sweep is exact and needs no decoding
 * — which also means a file that is not valid UTF-8 is still read.
 *
 * **Text is everything `BINARY` does not match**, read from what git tracks.
 * A binary with an extension nobody listed goes red here as well as in G13
 * (`no-third-party-material`), and the remedy for both is the same line.
 *
 * See docs/gates.md, row G66 (control-characters).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BINARY, expectFound, REPO_ROOT, trackedFiles } from './repo.ts';

const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;

/** One control character found, 1-based, with its column counted in bytes. */
interface Finding {
  readonly line: number;
  readonly column: number;
  readonly code: number;
}

/** Every C0 control character in `bytes` other than tab, LF and CR. */
function controlCharacters(bytes: Uint8Array): Finding[] {
  const found: Finding[] = [];
  let line = 1;
  let column = 0;
  for (const byte of bytes) {
    column += 1;
    if (byte === LF) {
      line += 1;
      column = 0;
      continue;
    }
    if (byte < 0x20 && byte !== TAB && byte !== CR) found.push({ line, column, code: byte });
  }
  return found;
}

function describeFinding(path: string, finding: Finding): string {
  const code = finding.code.toString(16).toUpperCase().padStart(4, '0');
  return `${path}:${finding.line}:${finding.column} U+${code}`;
}

/** The sweep the row runs, over named files, so a planted case runs it too. */
function sweep(paths: readonly string[], read: (path: string) => Uint8Array): string[] {
  return paths.flatMap((path) =>
    controlCharacters(read(path)).map((finding) => describeFinding(path, finding)),
  );
}

const text = (codes: readonly number[]): Uint8Array => Uint8Array.from(codes);
const ascii = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));

describe('G66 — no tracked text file carries a C0 control character', () => {
  it('finds none in any tracked text file', () => {
    const files = trackedFiles().filter((path) => !BINARY.test(path));
    // 500+ text files are tracked; a broken listing must not pass as clean.
    expectFound(files, 'tracked text files', 400);

    const offenders = sweep(files, (path) => readFileSync(join(REPO_ROOT, path)));
    expect(
      offenders,
      'C0 control characters in tracked text files. The usual source is a PowerShell ' +
        'double-quoted string, where a backtick escapes the next letter (`a is BEL). ' +
        `Write the file with a tool that does not interpret it: ${offenders.join('; ')}`,
    ).toEqual([]);
  });

  it('reports the BEL that a PowerShell `a leaves in a code span', () => {
    // The defect this row exists for, rebuilt from its code point.
    const planted = text([...ascii(' * the '), 0x07, ...ascii('uditConfig block'), LF]);
    expect(sweep(['planted.ts'], () => planted)).toEqual(['planted.ts:1:8 U+0007']);
  });

  it('counts lines and byte columns, and reports every character found', () => {
    const planted = text([...ascii('ok'), LF, ...ascii('a'), 0x08, 0x0c, LF, 0x1b, 0x00]);
    expect(sweep(['p'], () => planted)).toEqual([
      'p:2:2 U+0008',
      'p:2:3 U+000C',
      'p:3:1 U+001B',
      'p:3:2 U+0000',
    ]);
  });

  it('allows tab, LF and CR, and nothing at or above 0x20', () => {
    const allowed = text([TAB, ...ascii('x'), CR, LF, 0x20, 0x7e, 0xe2, 0x80, 0x94, LF]);
    expect(controlCharacters(allowed)).toEqual([]);
  });

  it('reads vertical tab as a control character', () => {
    // 0x0B sits between LF and CR, so an off-by-one on either bound admits it.
    expect(controlCharacters(text([0x0b]))).toEqual([{ line: 1, column: 1, code: 0x0b }]);
  });
});
