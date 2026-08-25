/**
 * G7 — no logic in `.astro` files.
 *
 * ⚠️ **This row's warrant was replaced, not narrowed, when G47 (`astro-types`)
 * landed.** It opened: *"`.astro` files are not typechecked. `@astrojs/check`
 * cannot run under TypeScript 7 … So the mitigation is a rule instead of a
 * compiler."* Both halves are now false. `@astrojs/check@0.9.10` runs against
 * the 6.x pin ADR-0066 chose, and `astro check` runs inside `pnpm build`, so a
 * compiler reads these files. The old sentence was the entire reason this row
 * existed, which is why the register dispositioned its decay `gated` against a
 * remedy nobody built; landing the checker closed it the other way instead.
 *
 * **What holds now is coverage, not typechecking.** `.astro` sits outside
 * **one** scope list, which both counters read: all eight globs in
 * `stryker.scopes.json` end `*.ts`, and `scripts/lib/complexity.ts`'s
 * `populationOf` takes its population from those same globs minus
 * `*.test.ts`. So a function in an `.astro` file is typechecked and still
 * earns no mutation score and no complexity series — counted by nothing. The
 * rule is what stands in for that: markup, styles, and a `<script>` that
 * imports a `.ts` module and calls it. Nothing else.
 *
 * ⚠️ **And the two gates read different halves of the file, which is why both
 * exist.** This one reads `<script>` blocks as text; `astro check` typechecks
 * the frontmatter. Neither sees what the other sees.
 *
 * A rule with nothing enforcing it is a comment, which is what docs/gates.md
 * was written to stop. This is the enforcement.
 *
 * ## The shape that is allowed, and why
 *
 * A `<script>` block may be, in any order:
 *
 *   - `import` statements;
 *   - element lookups — `const canvas = document.getElementById('…')`;
 *   - a type guard on those lookups — `if (a instanceof X && b instanceof Y) {`;
 *   - a call handing off to the imported module — `void boot(canvas, card);`;
 *   - closing braces.
 *
 * That is the whole bootstrap: *find the elements, check they are what you
 * think, hand them to typechecked code*. Everything past the handoff belongs in
 * a `.ts` file. `instanceof` is permitted because the guard is the one place
 * the untypechecked file has to narrow a type by hand — `getElementById`
 * returns `HTMLElement | null`, and passing that straight in would push the
 * `null` into the typechecked module.
 *
 * Banned outright: `function`, `class`, `=>`, `for`, `while`, `switch`, `try`.
 * Each is a declaration or a control structure, and any of them means logic has
 * started living somewhere no compiler is looking.
 *
 * The statement cap is **6**, non-import lines, excluding bare braces. The
 * current block uses 4 (two lookups, one guard, one call), so the cap leaves
 * room for one more element without inviting a fifth idea. A cap rather than an
 * exact count because the honest boundary is "a bootstrap, not a program", and
 * a bootstrap that grows a third element is still a bootstrap.
 *
 * See docs/gates.md, row G7 (astro-no-logic).
 */

import { describe, expect, it } from 'vitest';
import { expectFound, filesUnder, readRepoFile } from './repo.ts';

/** `<script>`, `<script is:inline>`, `<script type="module">` — all of them. */
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/g;

/** A whole import statement, however many lines its binding list runs to. */
const IMPORT_STATEMENT = /^[ \t]*import\b[^;]*;?[ \t]*$/gm;

const BANNED = [
  { token: 'function', pattern: /\bfunction\b/ },
  { token: 'class', pattern: /\bclass\b/ },
  { token: '=>', pattern: /=>/ },
  { token: 'for', pattern: /\bfor[ \t]*\(/ },
  { token: 'while', pattern: /\bwhile[ \t]*\(/ },
  { token: 'switch', pattern: /\bswitch[ \t]*\(/ },
  { token: 'try', pattern: /\btry\b/ },
] as const;

/** An element lookup: `const card = document.getElementById('book-card');` */
const LOOKUP = /^(?:const|let)\s+\w+\s*=\s*document\.(?:getElementById|querySelector)\(/;

/** A guard opening a block: `if (canvas instanceof HTMLCanvasElement && …) {` */
const GUARD = /^if\s*\(.*\)\s*\{$/;

/** A handoff call, with or without `void`/`await`: `void boot(canvas, card);` */
const CALL = /^(?:void\s+|await\s+)?[\w.]+\(.*\);?$/;

/** Bare structural punctuation — `}`, `} else {`. Not a statement. */
const BRACE = /^\}(?:\s*else\s*\{)?$/;

const STATEMENT_CAP = 6;

/**
 * Comments are long and explanatory in this repo and would read as code —
 * and worse, they talk *about* the markup. Shelf.astro's frontmatter fence
 * opens with a comment containing the literal text `<script>`, which SCRIPT_BLOCK
 * duly matched, so the extracted "script" began at the top of the file and
 * swallowed the whole template. Hence: strip first, extract second.
 *
 * `//` is anchored to the start of a line, so a `https://` in markup survives.
 *
 * Line comments are removed **before** block comments, and the order is not
 * cosmetic. That same frontmatter comment says "all logic lives in
 * `../shelf/*.ts`" — the `/*` in that glob opens a block comment as far as a
 * regex is concerned, and the nearest closing delimiter is inside the CSS far
 * below, so stripping blocks first deleted the entire `<script>` and left the
 * gate with nothing to check.
 */
function stripComments(source: string): string {
  return source.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

interface Block {
  readonly file: string;
  readonly body: string;
  /** Everything that is not an import, not a comment and not blank. */
  readonly lines: readonly string[];
}

function scriptBlocks(): Block[] {
  const blocks: Block[] = [];

  for (const file of filesUnder('packages/site/src', ['.astro'])) {
    const source = stripComments(readRepoFile(file));
    for (const match of source.matchAll(SCRIPT_BLOCK)) {
      const body = match[1] ?? '';
      const withoutImports = body.replace(IMPORT_STATEMENT, '');
      blocks.push({
        file,
        body,
        lines: withoutImports
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      });
    }
  }

  return blocks;
}

describe('G7 — no logic in .astro files', () => {
  it('finds a plausible number of .astro files and script blocks', () => {
    // The sharpest vacuity mode of any gate here: if SCRIPT_BLOCK stopped
    // matching — an attribute layout it does not expect, a `</script>` inside a
    // string — there would be no blocks, every "each line is allowed" check
    // would pass over an empty set, and the rule would be unenforced forever
    // while the gate reported green.
    expectFound(filesUnder('packages/site/src', ['.astro']), '.astro files', 2);
    expectFound(scriptBlocks(), '<script> blocks in .astro files', 1);

    // Counting blocks is not enough: the *import stripper* can empty a block it
    // matched. `[^;]` spans newlines, so a script written without semicolons
    // lets IMPORT_STATEMENT swallow the whole body as one statement — after
    // which every check below passes over an empty line list. A bootstrap
    // always has at least a lookup and a handoff, so this is the symmetric
    // guard on the other end of the pipeline.
    for (const block of scriptBlocks()) {
      expectFound(block.lines, `non-import statements in ${block.file}`, 1);
    }
  });

  it('finds at least one import in each script block', () => {
    // A block with no import is not a bootstrap — whatever it does, it does
    // in place, where nothing typechecks it.
    for (const block of scriptBlocks()) {
      expect(
        /^[ \t]*import\b/m.test(stripComments(block.body)),
        `${block.file}: a <script> block with no import is not handing off to a .ts module`,
      ).toBe(true);
    }
  });

  it('declares no function, class, arrow or loop in a script block', () => {
    for (const block of scriptBlocks()) {
      for (const { token, pattern } of BANNED) {
        expect(
          pattern.test(stripComments(block.body)),
          `${block.file}: \`${token}\` in a <script> block. .astro is typechecked ` +
            '(G47 runs astro check inside pnpm build) and counted by nothing — every ' +
            'mutation scope and every complexity population globs *.ts — so logic here ' +
            'is logic no counter reads. Move it into packages/site/src/shelf/*.ts and ' +
            'call it from here.',
        ).toBe(false);
      }
    }
  });

  it('allows only bootstrap statements in a script block', () => {
    for (const block of scriptBlocks()) {
      const unexpected = block.lines.filter(
        (line) => !(LOOKUP.test(line) || GUARD.test(line) || CALL.test(line) || BRACE.test(line)),
      );

      expect(
        unexpected,
        `${block.file}: not a bootstrap statement: ${unexpected.join(' | ')}. A <script> may ` +
          'look elements up, guard their types, and hand them to an imported module — ' +
          'nothing else, because nothing else here is typechecked.',
      ).toEqual([]);
    }
  });

  it('keeps each script block under the statement cap', () => {
    for (const block of scriptBlocks()) {
      const statements = block.lines.filter((line) => !BRACE.test(line));
      expect(
        statements.length,
        `${block.file}: ${String(statements.length)} non-import statements (cap ` +
          `${String(STATEMENT_CAP)}). Individually each may be allowed; together they are a ` +
          'program living in an untypechecked file. Move the bootstrap into a .ts module.',
      ).toBeLessThanOrEqual(STATEMENT_CAP);
    }
  });
});
