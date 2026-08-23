import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDER,
  FIELD_ORDER,
  MERGED_FIELDS,
} from '../packages/core/src/metadata/precedence.ts';
import { SUBJECT_SEPARATOR } from '../packages/core/src/subjects.ts';
import { readRepoFile } from './repo.ts';

/**
 * G31 — the precedence table ↔ the merge, in both directions.
 *
 * **Precedence was gated by nothing.** The merge decides which provider wins
 * each field, and a change to that ordering is invisible: no test fails, no
 * count moves, and the vault fills up with a different provider's answers. The
 * table in `metadata/precedence.ts` is the code's half of a contract seam;
 * `docs/spec/metadata-merge.md` §1 is the document's half, and this row holds
 * them to each other — red when the code prefers a provider the document never
 * names, **and** red when the document names an order the code does not
 * implement.
 *
 * The same idiom as G8: read both, compare, and refuse to let either move alone.
 *
 * It also pins the **`; ` subjects separator**, which is a fact two packages
 * hold — core joins with it and the site splits on it — for the reason #91's
 * breakpoint is flagged: a value held in two places drifts, and this one drifts
 * silently into a genre nobody said.
 *
 * See docs/gates.md, row G31 (merge-precedence).
 */

const SPEC = readRepoFile('docs/spec/metadata-merge.md');

/**
 * The document's precedence table, as `field → [providers]`.
 *
 * Read out of the Markdown table rows rather than from prose, because a table is
 * the one shape in that document with a machine-checkable meaning. Provider
 * names are matched by their display names, which is what a human reads.
 */
const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  'Open Library': 'open-library',
  Google: 'google-books',
  "O'Reilly": 'oreilly',
  Apple: 'apple-books',
};

function documentedOrder(field: string): readonly string[] | undefined {
  const row = new RegExp(`^\\|\\s*\`${field}\`\\s*\\| ([^|]+)\\|`, 'm').exec(SPEC);
  if (row?.[1] === undefined) return undefined;

  return row[1]
    .split('→')
    .map((part) => part.replace(/`[^`]*`/g, '').trim())
    .map((part) => PROVIDER_NAMES[part])
    .filter((source): source is string => source !== undefined);
}

describe('G31 — the precedence table ↔ the merge', () => {
  it('documents every field the merge actually merges', () => {
    const undocumented = MERGED_FIELDS.filter((field) => !new RegExp(`\`${field}\``).test(SPEC));

    expect(
      undocumented,
      'the merge fills these fields and the spec never mentions them. A field that wins by ' +
        'a rule nobody wrote down is the drift this row exists for',
    ).toEqual([]);
  });

  it('implements the order each exception row documents', () => {
    for (const [field, order] of Object.entries(FIELD_ORDER)) {
      const documented = documentedOrder(field);

      expect(
        documented,
        `docs/spec/metadata-merge.md has no precedence row for \`${field}\`, which the code ` +
          'treats as an exception to the default order',
      ).toBeDefined();

      expect(
        order,
        `\`${field}\`: the code prefers ${(order ?? []).join(' → ')} and the spec says ` +
          `${(documented ?? []).join(' → ')}. One of them moved alone`,
      ).toEqual(documented);
    }
  });

  it('names the two exceptions that are mechanisms rather than orderings', () => {
    // `pages` re-asks Google for the volume it already chose; the cover queue is
    // assembled by the downloader. Both are exceptions to the default order and
    // neither is expressible as a ranking over gathered records — so the table
    // must *not* carry them, and the spec must say why. Without this assertion
    // "deliberately absent" and "forgotten" look identical.
    expect(Object.keys(FIELD_ORDER)).not.toContain('pages');
    expect(Object.keys(FIELD_ORDER)).not.toContain('cover');
    expect(SPEC).toMatch(/`pages` and `cover` are exceptions implemented as mechanisms/);
  });

  it('holds the default order to the one the spec states', () => {
    const stated = /\*\*Default order — ([^*]+)\.\*\*/.exec(SPEC)?.[1] ?? '';
    const documented = stated
      .split('→')
      .map((part) => PROVIDER_NAMES[part.trim()])
      .filter((source): source is string => source !== undefined);

    expect(documented, 'the spec states no default provider order').toHaveLength(4);
    expect(DEFAULT_ORDER).toEqual(documented);
  });

  it('keeps the subjects separator out of the site’s hands and the spec’s prose in step', () => {
    expect(SUBJECT_SEPARATOR).toBe('; ');
    // The comma is the failure, not a style preference: Apple's
    // "Health, Mind & Body" is in this repo's own G26 corpus.
    expect(SPEC).toContain('Health, Mind & Body');
  });
});
