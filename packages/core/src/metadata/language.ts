/**
 * The reading language — which language's edition a title search should take.
 *
 * **One code, ISO 639-1**, because that is what a person types (`en`, `tr`) and
 * what Google reports in `volumeInfo.language`. Open Library tags its editions
 * with **ISO 639-2/B** instead — `eng`, `tur`, and the bibliographic forms
 * `fre`, `ger`, `chi`, `dut` rather than 639-2/T's `fra`, `deu`, `zho`, `nld`,
 * measured in a live response on 2026-09-26. This table is the one place the two
 * meet. See ADR-0094.
 *
 * ⚠️ **A `Map`, never an object literal, and that is a security property.** The
 * mapped value is interpolated into a Solr query, so the lookup must be
 * own-property only: `TABLE['constructor']` on a plain object answers with a
 * function, and a caller that skipped the CLI's check — an `as`-cast, a script
 * calling `lookup` directly — would reach the query with it. Core only ever
 * interpolates **this table's constant value**, never the string it was handed,
 * which is what makes injection structurally impossible rather than merely
 * checked.
 *
 * Deliberately small: the ~25 languages with meaningful book catalogues, zero
 * dependencies. A code missing from it is refused, never passed through.
 */
const OPEN_LIBRARY_CODES = [
  ['ar', 'ara'],
  ['ca', 'cat'],
  ['cs', 'cze'],
  ['da', 'dan'],
  ['de', 'ger'],
  ['el', 'gre'],
  ['en', 'eng'],
  ['es', 'spa'],
  ['fa', 'per'],
  ['fi', 'fin'],
  ['fr', 'fre'],
  ['he', 'heb'],
  ['hi', 'hin'],
  ['hu', 'hun'],
  ['id', 'ind'],
  ['it', 'ita'],
  ['ja', 'jpn'],
  ['ko', 'kor'],
  ['nl', 'dut'],
  ['no', 'nor'],
  ['pl', 'pol'],
  ['pt', 'por'],
  ['ro', 'rum'],
  ['ru', 'rus'],
  ['sv', 'swe'],
  ['tr', 'tur'],
  ['uk', 'ukr'],
  ['vi', 'vie'],
  ['zh', 'chi'],
] as const;

/** A reading language this project knows how to ask Open Library about. */
export type ReadingLanguage = (typeof OPEN_LIBRARY_CODES)[number][0];

const TABLE: ReadonlyMap<string, string> = new Map<string, string>(OPEN_LIBRARY_CODES);

/** Every accepted code, for a refusal message to list. */
export const READING_LANGUAGES: readonly ReadingLanguage[] = OPEN_LIBRARY_CODES.map(
  ([code]) => code,
);

/**
 * English, applied once — in the metadata layer's entry points — and nowhere
 * below them, so no provider can quietly supply a default of its own.
 */
export const DEFAULT_READING_LANGUAGE: ReadingLanguage = 'en';

/** Own-property membership, through the `Map`; see the table's comment. */
export function isReadingLanguage(code: string): code is ReadingLanguage {
  return TABLE.has(code);
}

/**
 * `code`, re-checked against the table — for the metadata layer's entry points.
 *
 * `MetadataOptions.language` is typed as a `ReadingLanguage`, and the type is
 * not relied on: an `as`-cast or a script calling `lookup` directly bypasses it.
 * **Throws on a miss**, like `openLibraryLanguage` and for its reason.
 */
export function checkedReadingLanguage(code: string): ReadingLanguage {
  if (!isReadingLanguage(code)) throw refusal(code);
  return code;
}

/**
 * The 639-2/B code Open Library tags an edition with, for a 639-1 code.
 *
 * **Throws on anything the table does not hold**, `constructor` and `eng`
 * included. A bad value here is a programming error — the CLI refuses a bad
 * `STACKS_LANGUAGE` before any command runs — and not the "an API had a bad
 * afternoon" case the metadata layer degrades on, so it is loud.
 *
 * ⚠️ **On the `import` path it is silent anyway**: the importer catches every
 * lookup error and falls back to the export's cover. The CLI's refusal is the
 * check that stops a bad value there, and the edition-language check in
 * `open-library.ts` is the backstop.
 */
export function openLibraryLanguage(code: string): string {
  const mapped = TABLE.get(code);
  if (mapped === undefined) throw refusal(code);
  return mapped;
}

function refusal(code: string): Error {
  return new Error(
    `unknown reading language ${JSON.stringify(code)} — expected one of: ${READING_LANGUAGES.join(', ')}`,
  );
}
