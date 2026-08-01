/**
 * G6 — the site may only `import type` from `@stacks/core`.
 *
 * The package root re-exports the adapter, sharp and the metadata layer. A
 * *value* import from it therefore drags `node:fs` and a native image library
 * into the browser bundle, and the failure mode is the worst kind: no build
 * error, no console message anyone reads, **the shelf silently never boots**.
 * A blank page that compiled cleanly.
 *
 * Two things pass:
 *
 *   - a statement-level `import type ... from '@stacks/core'`, which is erased
 *     wholesale before it can pull anything in;
 *   - the pure subpath `@stacks/core/shelf-order`, which exists precisely so
 *     that the ordering rules can be shared as *values* with the browser. It
 *     imports nothing.
 *
 * `import { type Library } from '@stacks/core'` does **not** pass, and that is
 * the non-obvious half. Inline type modifiers erase the bindings but leave the
 * statement standing, so under bundler resolution the module can still be
 * pulled in for its side effects. Statement-level `import type` is the bar
 * because it is the form that cannot survive.
 *
 * See docs/gates.md, row G6.
 */

import { describe, expect, it } from 'vitest';
import { expectFound, filesUnder, readRepoFile } from './repo.ts';

/**
 * Any `import`/`export … from '@stacks/core…'`, across line breaks — the
 * multi-line brace list is the common shape and anything anchored to a single
 * line would skip straight past it. `export … from` is caught too: a value
 * re-export is the same hazard wearing a different keyword.
 *
 * The clause admits no quote and no semicolon, which is what stops a lazy match
 * from starting at some *earlier* import and swallowing everything up to this
 * one — it did exactly that on `scene.ts` and reported the `three` import as a
 * value import of core. A binding list never contains either character; a
 * preceding statement always contains both.
 */
const CORE_STATEMENT = /(?:^|\n)[ \t]*(import|export)\b([^;'"]*?)from\s*['"](@stacks\/core[^'"]*)['"]/g;

/** Every mention of the specifier, however it is reached — the vacuity guard. */
const CORE_SPECIFIER = /['"](@stacks\/core[^'"]*)['"]/g;

/** The one subpath that imports nothing and may therefore be imported for value. */
const PURE_SUBPATH = '@stacks/core/shelf-order';

interface CoreImport {
  readonly file: string;
  readonly statement: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

function siteFiles(): string[] {
  return filesUnder('packages/site/src', ['.ts']);
}

function coreImports(): CoreImport[] {
  const found: CoreImport[] = [];

  for (const file of siteFiles()) {
    const source = readRepoFile(file);
    for (const match of source.matchAll(CORE_STATEMENT)) {
      const keyword = match[1] ?? '';
      const clause = match[2] ?? '';
      const specifier = match[3] ?? '';
      found.push({
        file,
        statement: `${keyword}${clause}from '${specifier}'`.replace(/\s+/g, ' ').trim(),
        specifier,
        // Statement-level only: `import type {` passes, `import { type X }`
        // does not, for the reason in the header.
        typeOnly: keyword === 'import' && /^\s*type\b/.test(clause),
      });
    }
  }

  return found;
}

/** Every `@stacks/core` specifier in the file, matched by a statement or not. */
function specifierMentions(): number {
  return siteFiles().reduce(
    (total, file) => total + [...readRepoFile(file).matchAll(CORE_SPECIFIER)].length,
    0,
  );
}

describe('G6 — site → @stacks/core', () => {
  it('scans a plausible number of site files and imports', () => {
    // If either the glob or the statement pattern stopped matching, "every
    // import is type-only" would hold over an empty set and this gate would
    // guard nothing while reporting green — the failure it exists to prevent,
    // committed by the gate itself.
    expectFound(siteFiles(), 'TypeScript files under packages/site/src', 3);
    expectFound(coreImports(), 'imports of @stacks/core in the site', 3);
  });

  it('accounts for every mention of the specifier', () => {
    // Closes the gap between "matched a statement" and "appears in the file".
    // A bare `import '@stacks/core'` or a dynamic `await import('@stacks/core')`
    // never matches CORE_STATEMENT, so without this it would slip through
    // unexamined — and both pull the whole module in.
    expect(
      coreImports().length,
      'a reference to @stacks/core is present that is not a plain import/export … from. ' +
        'A bare side-effect import or a dynamic import() pulls in node:fs and sharp just ' +
        'as surely as a named value import does.',
    ).toBe(specifierMentions());
  });

  it('keeps every import either type-only or on the pure subpath', () => {
    const offenders = coreImports()
      .filter((entry) => !entry.typeOnly && entry.specifier !== PURE_SUBPATH)
      .map((entry) => `${entry.file}: ${entry.statement}`);

    expect(
      offenders,
      `value imports of @stacks/core in the site: ${offenders.join(' | ')}. Use ` +
        `\`import type\` at statement level, or move the runtime value into ${PURE_SUBPATH}. ` +
        'A value import drags node:fs and sharp into the browser bundle and the shelf ' +
        'silently never boots.',
    ).toEqual([]);
  });

  it('still imports something for value from the pure subpath', () => {
    // The control. Every assertion above is satisfied by a site that imports
    // nothing at all from core, which would also mean the subpath escape hatch
    // had quietly stopped being exercised.
    const fromSubpath = coreImports().filter((entry) => entry.specifier === PURE_SUBPATH);
    expect(fromSubpath.length).toBeGreaterThan(0);
    expect(fromSubpath.every((entry) => !entry.typeOnly)).toBe(true);
  });
});
