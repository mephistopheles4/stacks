/**
 * G68 — the debug pane has one door, and one file that holds the library.
 *
 * `boot.ts` reaches the `?debug` instruments through `debug-pane.ts`, by one
 * dynamic import, and `debug-pane.ts` is the only file in the site that imports
 * `tweakpane`, its essentials plugin or the stylesheet as a value (ADR-0119).
 * Both halves can break with every other gate green: G64 asks only that a page
 * without `?debug` fetches no Tweakpane byte, and a second lazy import of an
 * instrument, or a view that imports `Pane` itself, stays lazy behind `?debug`
 * either way. Neither reaches a visitor, so nothing there goes red, and what
 * goes is the shape the next instrument is copied from: views thin, models
 * measurable, one pane.
 *
 * Two clauses:
 *
 *   - `boot.ts` makes exactly one import of `./debug-pane.ts`, and names no
 *     instrument — a file `debug-pane.ts` itself imports, other than the pane's
 *     own bookkeeping. `boot.ts` has other lazy imports (the inspector, the
 *     tuning panel until it joins the pane); those are not this row's concern.
 *   - no file under `packages/site/src` other than `debug-pane.ts` imports
 *     `tweakpane`, `@tweakpane/*` or a `.css?url` as a value, statically or by
 *     `import()`. A statement-level `import type` is erased and passes, as in G6.
 *
 * See docs/gates.md, row G68 (debug-pane-imports).
 */

import { describe, expect, it } from 'vitest';
import { expectFound, filesUnder, readRepoFile } from './repo.ts';

const SHELL = 'packages/site/src/shelf/debug-pane.ts';
const BOOT = 'packages/site/src/shelf/boot.ts';
/** The pane's own bookkeeping: imported by the shell and by every view. */
const BOOKKEEPING = './pane-slots.ts';

/** The specifiers only the shell may reach as values. */
const LIBRARY = /^(tweakpane|@tweakpane\/.+|.*\.css\?url)$/;

interface Reach {
  readonly specifier: string;
  readonly kind: 'static' | 'type' | 'dynamic';
}

/**
 * Every specifier a source reaches, across line breaks. A bare `import 'x'` and
 * `export … from 'x'` are statics; `import()` is dynamic; a statement whose
 * clause opens with `type` is the erased kind. As in G6, the clause admits no
 * quote and no semicolon, so a match cannot start at an earlier statement.
 */
function reaches(source: string): Reach[] {
  const found: Reach[] = [];
  for (const m of source.matchAll(
    /(?:^|\n)[ \t]*(import|export)\b([^;'"]*?)from\s*['"]([^'"]+)['"]/g,
  )) {
    const typeOnly = m[1] === 'import' && /^\s*type\b/.test(m[2] ?? '');
    found.push({ specifier: m[3] ?? '', kind: typeOnly ? 'type' : 'static' });
  }
  for (const m of source.matchAll(/(?:^|\n)[ \t]*import\s*['"]([^'"]+)['"]/g)) {
    found.push({ specifier: m[1] ?? '', kind: 'static' });
  }
  for (const m of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.push({ specifier: m[1] ?? '', kind: 'dynamic' });
  }
  return found;
}

/** The files `source` reaches by a relative specifier, instruments being those it imports as values. */
function instrumentsOf(shell: string): string[] {
  return reaches(shell)
    .filter((r) => r.kind !== 'type' && r.specifier.startsWith('./') && r.specifier !== BOOKKEEPING)
    .map((r) => r.specifier);
}

/** What `boot` does wrong: its imports of the shell other than one, and any of an instrument. */
function bootFaults(boot: string, instruments: readonly string[]): string[] {
  const all = reaches(boot);
  const shell = all.filter((r) => r.specifier === './debug-pane.ts');
  const faults: string[] = [];
  if (shell.length !== 1 || shell[0]?.kind !== 'dynamic') {
    faults.push(
      `imports ./debug-pane.ts ${String(shell.length)} time(s), and it must be once, by import()`,
    );
  }
  for (const r of all) {
    if (instruments.includes(r.specifier))
      faults.push(`reaches the instrument ${r.specifier} on its own`);
  }
  return faults;
}

/** The library reaches in `source` that are values. */
function libraryValueReaches(source: string): string[] {
  return reaches(source)
    .filter((r) => r.kind !== 'type' && LIBRARY.test(r.specifier))
    .map((r) => r.specifier);
}

describe('G68 — the debug pane has one door and one library holder', () => {
  it('finds the shell, its instruments and the files it scans', () => {
    // An empty set would make "no other file imports it" true of nothing.
    expectFound(instrumentsOf(readRepoFile(SHELL)), 'instruments the shell imports');
    expectFound(libraryValueReaches(readRepoFile(SHELL)), 'library imports in the shell', 3);
    expectFound(filesUnder('packages/site/src', ['.ts']), 'site TypeScript files', 20);
  });

  it('has boot.ts import the shell once, and no instrument on its own', () => {
    expect(bootFaults(readRepoFile(BOOT), instrumentsOf(readRepoFile(SHELL)))).toEqual([]);
  });

  it('has no file but the shell import Tweakpane, a plugin or a stylesheet as a value', () => {
    const offenders = filesUnder('packages/site/src', ['.ts'])
      .filter((file) => file !== SHELL)
      .flatMap((file) =>
        libraryValueReaches(readRepoFile(file)).map((specifier) => `${file} → ${specifier}`),
      );
    expect(offenders).toEqual([]);
  });

  describe('the judgement, on planted sources', () => {
    const instruments = ['./pickup-tuner.ts'];
    const good = `const { mountDebugPane } = await import('./debug-pane.ts');`;

    it('passes a boot that imports the shell once', () => {
      expect(bootFaults(good, instruments)).toEqual([]);
    });

    it('fails a boot that also imports an instrument lazily', () => {
      expect(bootFaults(`${good}\nawait import('./pickup-tuner.ts');`, instruments)).not.toEqual(
        [],
      );
    });

    it('fails a boot that imports an instrument statically', () => {
      expect(
        bootFaults(`import { pickupTuner } from './pickup-tuner.ts';\n${good}`, instruments),
      ).not.toEqual([]);
    });

    it('fails a boot that imports the shell twice, or not at all, or statically', () => {
      expect(bootFaults(`${good}\n${good}`, instruments)).not.toEqual([]);
      expect(bootFaults('const x = 1;', instruments)).not.toEqual([]);
      expect(
        bootFaults(`import { mountDebugPane } from './debug-pane.ts';`, instruments),
      ).not.toEqual([]);
    });

    it('fails a value import of the library, in each form, and passes a type import', () => {
      for (const source of [
        `import { Pane } from 'tweakpane';`,
        `import * as Essentials from '@tweakpane/plugin-essentials';`,
        `import css from '../generated/tuner.css?url';`,
        `import {\n  Pane,\n} from 'tweakpane';`,
        `const { Pane } = await import('tweakpane');`,
        `import 'tweakpane';`,
        `export { Pane } from 'tweakpane';`,
        `import { type Pane } from 'tweakpane';`,
      ]) {
        expect(libraryValueReaches(source), source).not.toEqual([]);
      }
      expect(libraryValueReaches(`import type { Pane } from 'tweakpane';`)).toEqual([]);
      expect(libraryValueReaches(`import { exportMotion } from './pickup-motion.ts';`)).toEqual([]);
    });
  });
});
