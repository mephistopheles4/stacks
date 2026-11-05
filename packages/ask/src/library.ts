import { compareShelfPosition } from '@stacks/core/shelf-order';
import { CACHE_MS, DATA_TIMEOUT_MS } from './limits.ts';

/** What the Worker keeps of a `library.json` book: public fields only. */
export interface CatalogueBook {
  readonly id: string;
  readonly title: string;
  readonly author?: string;
  readonly status: string;
  readonly finished?: string;
  readonly started?: string;
  readonly subjects?: string;
  readonly rating?: number;
  readonly shelfOrder?: number;
  /** `library.json`'s own mark: a published `notes/<id>.json` exists. */
  readonly thoughts: boolean;
}

export class DataError extends Error {}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** Picks the public fields and drops a book with no usable id or title. */
export function toCatalogue(raw: unknown): CatalogueBook[] {
  const books = (raw as { books?: unknown } | null)?.books;
  if (!Array.isArray(books)) throw new DataError('library.json has no books');
  const out: CatalogueBook[] = [];
  for (const entry of books as unknown[]) {
    const b = (entry ?? {}) as Record<string, unknown>;
    // A public build carries none of these. A local build does: refuse it whole,
    // so private and wishlist books can never reach the model (invariant 2).
    if ('sourcePath' in b || 'private' in b || b.status === 'wishlist') {
      throw new DataError('library.json looks like a local build, not a public one');
    }
    const id = str(b.id);
    const title = str(b.title);
    if (id === undefined || title === undefined || !ID.test(id)) continue;
    const rating =
      typeof b.rating === 'number' && b.rating >= 1 && b.rating <= 5 ? b.rating : undefined;
    const shelfOrder = typeof b.shelfOrder === 'number' ? b.shelfOrder : undefined;
    out.push({
      id,
      title,
      status: str(b.status) ?? 'read',
      thoughts: b.thoughts === true,
      ...(str(b.author) !== undefined && { author: str(b.author)! }),
      ...(str(b.finished) !== undefined && { finished: str(b.finished)! }),
      ...(str(b.started) !== undefined && { started: str(b.started)! }),
      ...(str(b.subjects) !== undefined && { subjects: str(b.subjects)! }),
      ...(rating !== undefined && { rating }),
      ...(shelfOrder !== undefined && { shelfOrder }),
    });
  }
  return out.sort(compareShelfPosition);
}

interface Cached<T> {
  readonly value: T;
  readonly at: number;
}

export interface LibrarySource {
  catalogue(): Promise<readonly CatalogueBook[]>;
  /** The paragraphs of one book's Thoughts, or undefined when there are none. */
  thoughts(book: CatalogueBook): Promise<readonly string[] | undefined>;
}

/**
 * Reads public build output over HTTPS from the site's own hostname and nothing
 * else (S4). The catalogue is cached for at most 5 minutes, each note for at
 * most 5 minutes from its own fetch, and a note is used only while the current
 * catalogue marks the book as having Thoughts. After expiry a failed refresh
 * serves nothing old (C14).
 */
export function createLibrarySource(
  origin: string,
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
  timeoutMs: number = DATA_TIMEOUT_MS,
): LibrarySource {
  let library: Cached<readonly CatalogueBook[]> | undefined;
  const notes = new Map<string, Cached<readonly string[] | undefined>>();

  const fresh = (entry: Cached<unknown> | undefined): boolean =>
    entry !== undefined && now() - entry.at < CACHE_MS;

  async function catalogue(): Promise<readonly CatalogueBook[]> {
    if (library !== undefined && fresh(library)) return library.value;
    library = undefined;
    let response: Response;
    try {
      response = await fetchImpl(`${origin}/library.json`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new DataError('library.json could not be fetched');
    }
    if (!response.ok || !isJson(response)) throw new DataError('library.json is not JSON');
    let books: CatalogueBook[];
    try {
      books = toCatalogue(await response.json());
    } catch {
      throw new DataError('library.json is malformed');
    }
    library = { value: books, at: now() };
    return books;
  }

  async function thoughts(book: CatalogueBook): Promise<readonly string[] | undefined> {
    const current = (await catalogue()).find((b) => b.id === book.id);
    if (current === undefined || !current.thoughts) {
      notes.delete(book.id);
      return undefined;
    }
    const held = notes.get(book.id);
    if (held !== undefined && fresh(held)) return held.value;
    notes.delete(book.id);
    const read = await fetchNote(current.id);
    // A read that failed or timed out says nothing about the note, so it is not kept as "no
    // Thoughts" for five minutes (behaviour E1).
    if (read.settled) notes.set(book.id, { value: read.paragraphs, at: now() });
    return read.paragraphs;
  }

  async function fetchNote(
    id: string,
  ): Promise<{ settled: boolean; paragraphs: readonly string[] | undefined }> {
    try {
      const response = await fetchImpl(`${origin}/notes/${id}.json`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // A missing note is the home page with status 200 (S12 results).
      if (!response.ok) return { settled: false, paragraphs: undefined };
      if (!isJson(response)) return { settled: true, paragraphs: undefined };
      const body = (await response.json()) as { paragraphs?: unknown };
      if (!Array.isArray(body.paragraphs)) return { settled: true, paragraphs: undefined };
      const paragraphs = (body.paragraphs as unknown[]).filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      );
      return { settled: true, paragraphs: paragraphs.length > 0 ? paragraphs : undefined };
    } catch {
      return { settled: false, paragraphs: undefined };
    }
  }

  return { catalogue, thoughts };
}

function isJson(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('json');
}
