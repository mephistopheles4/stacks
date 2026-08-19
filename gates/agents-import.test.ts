/**
 * G37 — the rules live in one file, and `CLAUDE.md` only points at it.
 *
 * `AGENTS.md` carries the invariants, the contracts and the commands. Claude
 * Code reads `CLAUDE.md` and not `AGENTS.md`, so `CLAUDE.md` is a stub whose
 * first content line is `@AGENTS.md` — a launch-time import the harness expands
 * before the session starts, not an instruction the model is asked to obey.
 *
 * **The rule this protects is ADR-0026's, mechanised.** That record refused a
 * second copy of the invariants and was right to; an import is not a copy. But
 * the arrangement it refused is now one careless paste away, because there are
 * two files where there was one, and the wrong half is the one Claude Code
 * opens by name. So the three sections other gates parse must not appear in
 * `CLAUDE.md`.
 *
 * **The positive control is G8, G14 and G19**, not a fourth assertion here.
 * Those three read `## Frontmatter contract`, `## Commands` and `## Invariants`
 * out of `AGENTS.md` and throw by name when a heading is gone. Re-asserting
 * their existence would put two gates red for one cause, which is the
 * duplication `docs/gates.md` opens by warning about. What is left over, and
 * what this gate therefore owns, is the import line: nothing else in the tree
 * mentions it, and it is also the control that stops the absences below from
 * passing against an empty or missing stub.
 *
 * ⚠️ **This gate holds the tree, not the harness.** Whether a given version of
 * Claude Code honours `@AGENTS.md`, and whether any other agent reads
 * `AGENTS.md` at all, are claims about tools. No gate here can hold them, and
 * pretending otherwise would be worse than the gap. The observation standing in
 * for them is dated, version-stamped, and in
 * `docs/log/2026-08-19-the-constitution-leaves-claude-md.md`.
 *
 * See docs/gates.md, row G37 (agents-import).
 */

import { describe, expect, it } from 'vitest';
import { AGENTS_DOC, readRepoFile } from './repo.ts';

/** The stub Claude Code opens by name. */
const STUB = 'CLAUDE.md';

/**
 * The import, alone on its line. Anchored both ends because `@AGENTS.md`
 * mentioned mid-sentence is prose, and prose is not a mechanism — the harness
 * expands a line, and a gate that accepted a mention would pass on a file that
 * imports nothing.
 */
const IMPORT_LINE = /^@AGENTS\.md$/m;

/**
 * The three headings other gates parse. A copy of any of them in the stub is
 * the start of the second constitution ADR-0026 refused.
 */
const PARSED_SECTIONS = ['Invariants', 'Commands', 'Frontmatter contract'];

/**
 * Fenced blocks and inline code blanked out, so a heading *quoted* in the
 * stub's prose does not read as a second copy of it. G29 earned both halves of
 * this the same way.
 */
function proseOf(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

describe('G37 — the constitution has one home', () => {
  it('imports AGENTS.md from CLAUDE.md, on its own line', () => {
    const stub = proseOf(readRepoFile(STUB));

    expect(
      IMPORT_LINE.test(stub),
      `${STUB} must contain "@AGENTS.md" alone on a line. Claude Code reads ` +
        `${STUB} and not ${AGENTS_DOC}, so without that line a Claude session ` +
        'gets none of the rules — silently, because nothing else would notice.',
    ).toBe(true);
  });

  it('keeps the parsed sections out of the stub', () => {
    const stub = proseOf(readRepoFile(STUB));
    const duplicated = PARSED_SECTIONS.filter((heading) =>
      new RegExp(`^## ${heading}`, 'm').test(stub),
    );

    expect(
      duplicated,
      `${STUB} carries sections that belong to ${AGENTS_DOC}: ${duplicated.join(', ')}. ` +
        'ADR-0026 refused a second copy of the invariants; one text, imported, is ' +
        'not a copy, and a heading here is where it stops being one.',
    ).toEqual([]);
  });
});
