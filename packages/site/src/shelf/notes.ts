/**
 * A held book's Thoughts, fetched from `notes/<id>.json` (spec §3.1).
 *
 * **Asked for only when `library.json` says the file exists** (`thoughts:
 * true`), so most pickups make no request at all. The path is built from the
 * `LibraryBook` the click resolved to, and only from an id of the slug-and-hash
 * shape `idFor` writes, so nothing a history entry or an address carries can
 * steer the fetch (§3.9).
 *
 * **Anything but the exact shape is no Thoughts.** A 404, a failed request, a
 * body that is not JSON or not `{ "paragraphs": string[] }` with every string
 * non-empty: each leaves the page showing the card's lines, with no error shown,
 * which is what the shelf showed before this existed (§3.1). The text is plain
 * and is put on the page with `textContent` (`held-page.ts`), never parsed as
 * markup.
 */

/** The fields of a `LibraryBook` this reads. */
export interface NotesBook {
  readonly id: string;
  readonly thoughts?: true;
}

/** `idFor`'s shape: lower-case slug words joined by single hyphens. */
const BOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function notesPath(id: string): string | undefined {
  return BOOK_ID.test(id) ? `/notes/${id}.json` : undefined;
}

export function parseNotes(value: unknown): readonly string[] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'paragraphs') return undefined;
  const paragraphs: unknown = (value as { paragraphs: unknown }).paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return undefined;
  const text: string[] = [];
  for (const paragraph of paragraphs as unknown[]) {
    if (typeof paragraph !== 'string' || paragraph.length === 0) return undefined;
    text.push(paragraph);
  }
  return text;
}

export async function loadThoughts(
  book: NotesBook,
  fetcher: (path: string) => Promise<Response> = (path) => fetch(path),
): Promise<readonly string[] | undefined> {
  if (book.thoughts !== true) return undefined;
  const path = notesPath(book.id);
  if (path === undefined) return undefined;
  try {
    const response = await fetcher(path);
    if (!response.ok) return undefined;
    return parseNotes(await response.json());
  } catch {
    return undefined;
  }
}
