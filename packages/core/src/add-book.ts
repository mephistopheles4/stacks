import { cacheCover } from './covers/cache-cover.ts';
import { coverKeys } from './covers/cover-keys.ts';
import {
  isProbablySameBook,
  isValidIsbn,
  normaliseIsbn,
  normaliseTitleAuthor,
} from './identity.ts';
import { ABOUT_HEADING } from './enrich.ts';
import { coverUrls, lookup, type BookMetadata, type HttpGet } from './metadata/index.ts';
import { formatSubjects } from './subjects.ts';
import type { BookInput, BookRecord, BookStatus } from './types.ts';
import type { VaultAdapter } from './adapters/vault-adapter.ts';
import { keyIfPresent } from './key-if-present.ts';

export interface AddBookOptions {
  readonly status?: BookStatus;
  /** Skip the duplicate check. */
  readonly force?: boolean;
  /** Passed to the metadata providers; see MetadataOptions. */
  readonly googleBooksKey?: string;
}

export type AddBookResult =
  | { readonly kind: 'added'; readonly path: string; readonly metadata?: BookMetadata }
  | {
      readonly kind: 'duplicate';
      /** What was searched for, or what the providers resolved it to. */
      readonly title: string;
      /** The book already on the shelf — the one the user actually wants named. */
      readonly existing: string;
      /** True when the vault answered before any provider was asked. */
      readonly matchedBeforeLookup: boolean;
    }
  | { readonly kind: 'not-found'; readonly term: string }
  | {
      /** The providers answered, but with a different book. */
      readonly kind: 'mismatch';
      readonly term: string;
      /** What came back, so the reader can see the near-miss and judge it. */
      readonly found: string;
    };

/**
 * `stacks add` — the 30-second path from "I read this" to a note in the vault.
 *
 * Metadata, cover and spine colour are all best-effort. A book with no cover is
 * still a book: the shelf draws a generated spine for it. Only two things can
 * stop a note being written — an unresolvable search term, and an existing
 * duplicate.
 */
export async function addBook(
  term: string,
  vault: VaultAdapter,
  get: HttpGet,
  options: AddBookOptions = {},
): Promise<AddBookResult> {
  const shelved = options.force === true ? [] : await vault.listBooks();

  /**
   * Ask the shelf before asking the internet.
   *
   * Checking only *after* the lookup meant a book already in the vault that the
   * providers cannot find reported "nothing found" — technically true of the
   * APIs, and useless to someone who can see the book on their own shelf. It is
   * also a pointless round trip.
   */
  const alreadyShelved = findShelved(shelved, term, undefined, term);
  if (alreadyShelved !== undefined) {
    return {
      kind: 'duplicate',
      title: term,
      existing: alreadyShelved,
      matchedBeforeLookup: true,
    };
  }

  const [metadata] = await lookup(term, get, options);
  if (metadata === undefined) {
    return { kind: 'not-found', term };
  }

  // And again once the providers have said what the term actually resolves to,
  // since a partial title can name a book the first check could not recognise.
  const duplicate = findShelved(shelved, metadata.title, metadata.author, metadata.isbn ?? '');
  if (duplicate !== undefined) {
    return {
      kind: 'duplicate',
      title: metadata.title,
      existing: duplicate,
      matchedBeforeLookup: false,
    };
  }

  /**
   * Is this the book that was asked for?
   *
   * `lookup` ranks; it does not refuse. Nothing here ever checked its answer
   * against the question, so `stacks add "Learning AI-Native Software
   * Engineering"` — a title no provider holds — wrote a note for *AI-Powered
   * Software Engineering* by four different authors, silently. `enrich` has had
   * this check since it was written; only `add` went without, which is the path
   * that creates notes.
   *
   * **Last, after the duplicate checks.** A book already on the shelf is a
   * duplicate whatever the term looked like, and that is the more useful answer:
   * `"thinking in systems primer"` resolving to a shelved *Thinking in Systems*
   * must say which book it already is, not refuse the term.
   *
   * An ISBN is proof of identity and skips the check, exactly as in `enrich`.
   *
   * **`isProbablySameBook` alone cannot do this job**, and measuring said so
   * before this shipped: it refused *"staff engineer"*, *"the charisma myth"*
   * and *"Team Topologies"* — three of twelve realistic searches, all correct
   * results. Those titles are two tokens once articles are stripped, below
   * `MIN_TOKENS`, so containment never runs and the scored rule fails on the
   * weak direction. A guard that blocks a two-word title is worse than none.
   *
   * So identity is the first question and coverage is the second: **is what you
   * typed present in what came back?** That is the right question for a search
   * term, which is a fragment of a title rather than a rival name for it, and it
   * is asymmetric where identity is not.
   */
  if (options.force !== true && !isValidIsbn(term)) {
    const found = `${metadata.title} ${metadata.author ?? ''}`.trim();
    if (!isProbablySameBook(term, found) && termCoverage(term, found) < TERM_COVERAGE) {
      return { kind: 'mismatch', term, found };
    }
  }

  const cover = await cacheCover(coverUrls(metadata), metadata.title, vault);

  const book: BookInput = {
    title: metadata.title,
    status: options.status ?? 'read',
    ...keyIfPresent('author', metadata.author),
    ...keyIfPresent('isbn', metadata.isbn === undefined ? undefined : normaliseIsbn(metadata.isbn)),
    ...keyIfPresent('pages', metadata.pages),
    ...coverKeys(cover),
    // The merge revision's fields, written at creation. `BookInput` and
    // `FILLABLE` grow together or the merge is inert: both are closed lists, so
    // a field the merge starts carrying and neither of these knows about is
    // written into no note at all.
    ...keyIfPresent('publisher', metadata.publisher),
    ...keyIfPresent('published', metadata.published),
    ...keyIfPresent(
      'subjects',
      metadata.subjects === undefined ? undefined : formatSubjects(metadata.subjects),
    ),
    ...keyIfPresent('googleVolumeId', metadata.volumeId),
    ...keyIfPresent('appleTrackId', metadata.appleTrackId),
    ...keyIfPresent('openLibraryOlid', metadata.openLibraryOlid),
    ...keyIfPresent('oreillyOurn', metadata.oreillyOurn),
  };

  const path = await vault.writeBook(book);

  // The description goes into the body, never into a property — so it cannot
  // reach `library.json` by any path, which is what makes "never published"
  // structural rather than a discipline. Written after the note exists, by the
  // same heading-absent rule `enrich` uses, so the two paths cannot disagree.
  // `writeBook` hands back an absolute path; `insertBodySection` takes either
  // that or the vault-relative one `BookRecord.sourcePath` carries.
  if (metadata.description !== undefined) {
    await vault.insertBodySection(path, ABOUT_HEADING, metadata.description);
  }

  return { kind: 'added', path, metadata };
}

/**
 * How much of what was typed appears in what came back, from 0 to 1.
 *
 * Deliberately one-directional, and that is the whole point: a search term is a
 * *fragment* of a title, so the candidate is expected to carry words the term
 * does not. "nexus" against *Nexus: A Brief History of Information Networks*
 * scores 1.0. The reverse question — is the candidate covered by the term —
 * would refuse every partial search anyone actually types.
 *
 * **The boundary is measured, not derived, and it is narrow.** A term carrying
 * a subtitle word the provider's record drops — `"thinking in systems primer"`
 * against *Thinking in Systems* by Donella H. Meadows — scores **0.75** and is
 * a correct result. The near miss that prompted all this, *Learning AI-Native
 * Software Engineering* answered with *AI-Powered Software Engineering*, scores
 * **0.6**; adding the author to the term scores **0.571**. So the line sits
 * between 0.6 and 0.75, and anything stricter refuses real searches — 0.9 was
 * tried first and an existing test caught it.
 */
const TERM_COVERAGE = 0.7;

function termCoverage(term: string, candidate: string): number {
  const wanted = normaliseTitleAuthor(term).split(' ').filter(Boolean);
  const found = new Set(normaliseTitleAuthor(candidate).split(' ').filter(Boolean));
  if (wanted.length === 0) return 0;
  return wanted.filter((token) => found.has(token)).length / wanted.length;
}

/**
 * The title of the shelved book this describes, if any.
 *
 * Returns the *shelved* title rather than a boolean, because the useful thing
 * to tell someone is which of their books this already is. Reporting the search
 * result's title instead once produced "already in the vault: Yuval Noah Harari
 * Collection Set…" for a shelf holding plain Nexus — true of what the API
 * returned, unrecognisable to the reader.
 *
 * Matches on ISBN first, then normalised title+author, exactly as the adapter
 * and the importer do.
 */
function findShelved(
  shelved: readonly BookRecord[],
  title: string,
  author: string | undefined,
  isbn: string,
): string | undefined {
  const wanted = normaliseIsbn(isbn);
  if (wanted.length > 0) {
    const byIsbn = shelved.find(
      (book) => book.isbn !== undefined && normaliseIsbn(book.isbn) === wanted,
    );
    if (byIsbn !== undefined) return byIsbn.title;
  }

  const titleAuthor = `${title} ${author ?? ''}`;
  return shelved.find((book) =>
    isProbablySameBook(titleAuthor, `${book.title} ${book.author ?? ''}`),
  )?.title;
}
