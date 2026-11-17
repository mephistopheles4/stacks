/**
 * The 3D credits modal's rows (#621), made from a room's `inputs.json` and its `credits.json`.
 *
 * `inputs.json` names every file the bake reads, with its author, page and licence, and has
 * several files for one asset (a model, its textures, its buffer). A credit is per asset, so the
 * rows are the inputs grouped by page. Creator, link and licence are read from the inputs and are
 * never typed a second time; what an input cannot say (what the asset is called here, where it is
 * used, how the bake changed it) is `credits.json`'s, one entry per page.
 *
 * ⚠️ **It throws rather than skips.** An input with no entry would ship an asset uncredited, and
 * CC BY 4.0 requires the credit, so the build and `gates/room-inputs.test.ts` both stop on it, and
 * so does an entry for a page no input names (a credit for an asset that was dropped).
 *
 * Pure: no DOM, no fs. The page passes the two JSON files in.
 */

/** The parts of an `inputs.json` entry a credit reads. */
export interface CreditInput {
  readonly title: string;
  readonly author: string;
  readonly licence: string;
  readonly page: string;
  /** Present on a file made here from another input; its `author` is not a creator. */
  readonly derive?: unknown;
}

/** One `credits.json` entry. `modified: null` means used exactly as its author made it. */
export interface CreditNote {
  readonly name: string;
  readonly usedFor: string;
  readonly modified: string | null;
}

export interface CreditRow {
  readonly name: string;
  readonly creators: readonly string[];
  /** The creators as one line, for the list. */
  readonly creatorsText: string;
  /** Where the asset came from: an https URL. */
  readonly link: string;
  readonly licence: string;
  /** The licence's own page, where it has one. */
  readonly licenceLink: string | undefined;
  readonly usedFor: string;
  /** What the bake changed, or `undefined` when nothing. */
  readonly modified: string | undefined;
  /** CC BY asks for this credit; the rest are listed as a courtesy. */
  readonly required: boolean;
}

const LICENCE_LINKS: Readonly<Record<string, string>> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/** A licence that asks for credit: every CC BY version. */
const isRequired = (licence: string): boolean => licence.startsWith('CC BY');

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The inputs' pages, each with the inputs that name it, in the order they first appear. */
function byPage(inputs: readonly CreditInput[]): Map<string, CreditInput[]> {
  const pages = new Map<string, CreditInput[]>();
  for (const input of inputs) {
    const group = pages.get(input.page);
    if (group) group.push(input);
    else pages.set(input.page, [input]);
  }
  return pages;
}

function rowFor(page: string, group: readonly CreditInput[], note: CreditNote): CreditRow {
  const first = group[0];
  if (first === undefined) throw new Error(`credits: ${page} has no input`);
  if (!isHttps(page)) throw new Error(`credits: ${page} is not an https link`);
  if (note.name === '' || note.usedFor === '') {
    throw new Error(`credits: ${page} has an empty name or usedFor`);
  }
  if (note.modified === '') {
    throw new Error(`credits: ${page} has an empty \`modified\`; say what changed, or use null`);
  }
  const licences = new Set(group.map((i) => i.licence));
  if (licences.size !== 1) {
    throw new Error(`credits: ${page} is under more than one licence: ${[...licences].join(', ')}`);
  }
  const creators = [...new Set(group.filter((i) => i.derive === undefined).map((i) => i.author))];
  if (creators.length === 0) throw new Error(`credits: ${page} names no creator`);
  return {
    name: note.name,
    creators,
    creatorsText: creators.join(', '),
    link: page,
    licence: first.licence,
    licenceLink: LICENCE_LINKS[first.licence],
    usedFor: note.usedFor,
    modified: note.modified ?? undefined,
    required: isRequired(first.licence),
  };
}

/**
 * One row per asset, the CC BY ones first and each group in name order.
 *
 * @throws when an input's page has no note, a note's page has no input, or a row cannot be
 * credited (see `rowFor`).
 */
export function buildCredits(
  inputs: readonly CreditInput[],
  notes: Readonly<Record<string, CreditNote>>,
): CreditRow[] {
  const pages = byPage(inputs);
  const uncredited = [...pages.keys()].filter((page) => !Object.hasOwn(notes, page));
  if (uncredited.length > 0) {
    throw new Error(`credits: no entry in credits.json for ${uncredited.join(', ')}`);
  }
  const orphans = Object.keys(notes).filter((page) => !pages.has(page));
  if (orphans.length > 0) {
    throw new Error(`credits: credits.json credits a page no input names: ${orphans.join(', ')}`);
  }
  const rows = [...pages].map(([page, group]) => rowFor(page, group, notes[page] as CreditNote));
  return rows.sort(
    (a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name, 'en'),
  );
}

/** What `CreditList.astro` is given. */
export interface CreditListProps {
  readonly rows: readonly CreditRow[];
}

/** What `CreditsNotice.astro` is given: the modal's ids, the heading level and the way back. */
export interface CreditsNoticeProps {
  readonly headingId?: string;
  readonly tabindex?: number;
  readonly level?: 'h1' | 'h2';
  readonly back?: boolean;
}

/** The two sections of the credits: the rows that ask for credit, and the courtesy ones. */
export function creditSections(
  inputs: readonly CreditInput[],
  notes: Readonly<Record<string, CreditNote>>,
): { readonly required: CreditRow[]; readonly courtesy: CreditRow[] } {
  const rows = buildCredits(inputs, notes);
  return {
    required: rows.filter((row) => row.required),
    courtesy: rows.filter((row) => !row.required),
  };
}

/** The heading levels under a title of `level`: the notice's own title, then its two sections. */
export function headingLevels(level: 'h1' | 'h2'): { title: 'h1' | 'h2'; section: 'h2' | 'h3' } {
  return { title: level, section: level === 'h1' ? 'h2' : 'h3' };
}
