/**
 * What the generated fixture vaults are made of, shared by the generator
 * (`scripts/make-50-book-fixture.ts`), the render gate and the iOS swipe probe.
 *
 * Every word is invented (ADR-0004). It lives here, away from the generator,
 * because the generator is a script that writes a vault the moment it is
 * imported, and the two readers need only the words:
 *
 * - **the title words**, so `isFixtureTitle` can say whether a title is one the
 *   generator could have written. The probe's `--check-served` refuses a build
 *   whose library holds any other title, which is how it knows a tunnel is not
 *   about to serve a real vault (#599, S8).
 * - **the long-Thoughts book**, written into every generated vault, so every
 *   test meets a page that really scrolls (#599, S6).
 */

export const FIRST = [
  'Tidal',
  'Quiet',
  'Salt',
  'Lantern',
  'Signal',
  'Warehouse',
  'Compiler',
  'Sediment',
  'Harbour',
  'Ember',
  'Glass',
  'Iron',
  'Paper',
  'River',
  'Northern',
] as const;

export const SECOND = [
  'Engine',
  'Protocol',
  'Ledger',
  'Work',
  'Road',
  'Atlas',
  'Notebook',
  'Almanac',
  'Machine',
  'Garden',
  'Archive',
  'Circuit',
] as const;

export const SUBTITLE = [
  'A Field Guide',
  'Notes on Craft',
  'An Investigation',
  'Essays',
  'A Primer',
  'Selected Writings',
] as const;

/** The book every generated vault carries: a long `## Thoughts` and nothing else unusual. */
export const LONG_BOOK_TITLE = 'Marginalia for a Long Winter';
export const LONG_BOOK_AUTHOR = 'Ingrid Lindqvist';

/** How many paragraphs the long-Thoughts book has. */
export const LONG_BOOK_PARAGRAPHS = 24;

/**
 * Twelve invented sentences, plain prose: no markup characters, no list or
 * heading shapes, nothing the Thoughts extractor would withhold the section
 * for (ADR-0106). Each paragraph strings three of them, from a rotating start,
 * so no two paragraphs are the same and none is a copy of anyone's writing.
 */
const SENTENCES = [
  'The lamp was low and the margins filled with small arrows pointing nowhere in particular.',
  'I read it across a wet week, a chapter a night, and kept losing my place on purpose.',
  'The argument improves wherever it stops trying to win and starts describing the weather.',
  'There is a long passage about mending nets that I could not stop reading aloud to the cat.',
  'Halfway through I noticed that I had been agreeing with the author out of politeness alone.',
  'The best pages are the ones about waiting, and the worst are the ones about being right.',
  'I lent it to a friend and bought a second copy before the first one had come home.',
  'Every few chapters the book changes its mind, and the change is always a relief.',
  'My notes in the margin grew shorter as the winter went on, which says something kind.',
  'The diagrams are better than the prose, which is the correct way round for this subject.',
  'I would start with the fourth chapter next time and read the rest as a reward.',
  'It ends where a patient person would end it, with the kettle on and nothing settled.',
] as const;

/** The long book's Thoughts: invented prose, far taller than a page at any viewport. */
export function longBookParagraphs(): readonly string[] {
  return Array.from({ length: LONG_BOOK_PARAGRAPHS }, (_, index) => {
    // The first twelve string sentences four apart, the rest three and four
    // apart, so no two of the twenty-four read the same.
    const offsets = index < SENTENCES.length ? [0, 4, 8] : [0, 3, 7];
    return offsets.map((offset) => SENTENCES[(index + offset) % SENTENCES.length]).join(' ');
  });
}

/**
 * Whether the generator could have written this title: two words, and a
 * subtitle on some, or the long-Thoughts book's own.
 */
export function isFixtureTitle(title: string): boolean {
  if (title === LONG_BOOK_TITLE) return true;
  const [name, subtitle, ...rest] = title.split(': ');
  if (name === undefined || rest.length > 0) return false;
  if (subtitle !== undefined && !(SUBTITLE as readonly string[]).includes(subtitle)) return false;
  const [first, second, ...more] = name.split(' ');
  return (
    more.length === 0 &&
    (FIRST as readonly string[]).includes(first ?? '') &&
    (SECOND as readonly string[]).includes(second ?? '')
  );
}
