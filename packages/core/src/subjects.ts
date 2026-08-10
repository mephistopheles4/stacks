/**
 * Provider categories, as one frontmatter scalar.
 *
 * **A pure subpath — `@stacks/core/subjects` — and that is load-bearing.** The
 * card renders this field, so the site needs `parseSubjects` as a *runtime*
 * value, and the site may only `import type` from the package root (G6). The
 * precedent is `@stacks/core/shelf-order`: a module that imports nothing, so a
 * value import cannot drag `node:fs` and sharp into the browser bundle.
 *
 * Without it the site would keep its own copy of the separator, which is exactly
 * the drift the paragraph below exists to prevent — and the first version of
 * this change did precisely that while this comment claimed otherwise.
 *
 * **The separator is `; ` and not a comma, and that is not a style choice.**
 * Provider category values contain commas natively — Apple's
 * `"Health, Mind & Body"` sits in this repo's own G26 corpus, and Apple is
 * second in the subjects order, so it is a value the merge reaches on ordinary
 * books. Comma-joined and split back on `,`, one genre silently becomes two:
 * `Health` and `Mind & Body`. Nothing would go red. The field would just quietly
 * be wrong, on the provider most likely to supply it after Google.
 *
 * No `;` and no `|` appears in any category value in any fixture this repo
 * holds. The guard below exists because a provider can add one tomorrow and
 * nothing would notice.
 *
 * A scalar rather than a list because `updateBook` leaves a list value alone —
 * so a list-valued `subjects` could be written to a new note and never
 * maintained on an existing one, which is the exact asymmetry absent-only
 * exists to avoid.
 *
 * See docs/spec/metadata-merge.md §4.
 */

export const SUBJECT_SEPARATOR = '; ';

/**
 * Five, in the winning provider's own order.
 *
 * Open Library returns 34 subjects for one book on this shelf. A capped scalar
 * is a card line and a note property, not a taxonomy.
 */
export const MAX_SUBJECTS = 5;

/**
 * The written form, or nothing at all.
 *
 * ⚠️ **A value containing the separator is dropped, not escaped.** Fail closed,
 * the same reflex as `private:` and `cover_source`: a separator collision must
 * never invent a subject that no provider said. Dropping one of five capped
 * subjects is invisible; a phantom subject is a wrong fact in the vault, and the
 * vault is the source of truth.
 */
export function formatSubjects(values: readonly string[]): string | undefined {
  const kept = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !value.includes(';'))
    .slice(0, MAX_SUBJECTS);

  return kept.length === 0 ? undefined : kept.join(SUBJECT_SEPARATOR);
}

/**
 * Reading one back.
 *
 * Lives here rather than in the site so the split rule and the join rule cannot
 * drift apart — the card renders this field, which makes the separator a fact
 * two packages hold, and the precedence gate pins it.
 */
export function parseSubjects(value: string): readonly string[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
