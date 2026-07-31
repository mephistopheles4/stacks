import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { parseNote } from '../frontmatter.ts';
import { isProbablySameBook, normaliseTitleAuthor, toObsidianTag } from '../identity.ts';
import type { BookInput, BookRecord } from '../types.ts';
import type { VaultAdapter } from './vault-adapter.ts';

/** Where notes and cached covers live inside the vault. */
const LIBRARY_DIR = 'Library';
const COVERS_DIR = 'covers';

/**
 * The one and only adapter (CLAUDE.md forbids a second).
 *
 * Takes a vault path and nothing else — no options bag, no config plumbing.
 * The interface exists so a Logseq adapter stays possible later, not so that
 * adapters become a framework.
 */
export class ObsidianAdapter implements VaultAdapter {
  readonly #vaultPath: string;

  constructor(vaultPath: string) {
    this.#vaultPath = resolve(vaultPath);
  }

  /**
   * Every `type: book` note under `Library/`.
   *
   * Never throws because of one bad note (invariant 3): a note that claims to
   * be a book and cannot be used is warned about **by name** and skipped. A
   * note that simply isn't a book is skipped silently.
   */
  async listBooks(): Promise<BookRecord[]> {
    const books: BookRecord[] = [];

    for (const file of await this.#markdownFiles()) {
      const vaultRelative = relative(this.#vaultPath, file).split(sep).join('/');

      let source: string;
      try {
        source = await readFile(file, 'utf8');
      } catch (error) {
        warn(vaultRelative, `could not be read — ${describe(error)}`);
        continue;
      }

      const parsed = parseNote(source, vaultRelative);
      if (parsed.kind === 'book') {
        books.push(parsed.record);
      } else if (parsed.kind === 'invalid') {
        warn(vaultRelative, parsed.reason);
      }
    }

    return books;
  }

  /**
   * Creates a note and returns its path. Never overwrites one.
   *
   * The filename comes from the title, so adding a book that is already shelved
   * used to land on the same path and replace it — taking the reading dates, the
   * rating and the whole note body with it. `stacks add --force` did exactly
   * that, silently. A colliding name now gains a numeric suffix, which is what
   * "add it anyway" should mean, and leaves the original alone.
   */
  async writeBook(book: BookInput): Promise<string> {
    const dir = join(this.#vaultPath, LIBRARY_DIR);
    await mkdir(dir, { recursive: true });

    const base = safeFilename(book.title);
    let path = join(dir, `${base}.md`);
    for (let n = 2; await exists(path); n += 1) {
      path = join(dir, `${base} (${String(n)}).md`);
    }

    await writeFile(path, renderNote(book), 'utf8');
    return path;
  }

  /** ISBN first, then normalised title+author — the two dedupe paths. */
  async bookExists(isbn: string, titleAuthor: string): Promise<boolean> {
    const books = await this.listBooks();

    const wantedIsbn = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (wantedIsbn.length > 0) {
      const hit = books.some(
        (book) => book.isbn !== undefined && book.isbn.replace(/[^0-9Xx]/g, '').toUpperCase() === wantedIsbn,
      );
      if (hit) return true;
    }

    if (normaliseTitleAuthor(titleAuthor).length === 0) return false;

    return books.some((book) =>
      isProbablySameBook(titleAuthor, `${book.title} ${book.author ?? ''}`),
    );
  }

  coverDir(): string {
    return join(this.#vaultPath, LIBRARY_DIR, COVERS_DIR);
  }

  /**
   * Markdown under `Library/`, falling back to the vault root when a vault has
   * no `Library/` folder yet. Dot-directories are skipped — `.obsidian/` holds
   * config, not books.
   */
  async #markdownFiles(): Promise<string[]> {
    const libraryDir = join(this.#vaultPath, LIBRARY_DIR);
    const root = (await isDirectory(libraryDir)) ? libraryDir : this.#vaultPath;

    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          found.push(full);
        }
      }
    };

    await walk(root);
    return found.sort();
  }
}

/**
 * Frontmatter plus an empty notes heading — never a body.
 *
 * Keys use the frontmatter contract's names (`spine_color`, not `spineColor`)
 * because the file has to stay readable and editable in Obsidian.
 */
function renderNote(book: BookInput): string {
  const frontmatter: Record<string, unknown> = { type: 'book', title: book.title };

  if (book.author !== undefined) frontmatter['author'] = book.author;
  if (book.isbn !== undefined) frontmatter['isbn'] = book.isbn;
  frontmatter['status'] = book.status ?? 'read';
  if (book.started !== undefined) frontmatter['started'] = book.started;
  if (book.finished !== undefined) frontmatter['finished'] = book.finished;
  if (book.rating !== undefined) frontmatter['rating'] = book.rating;
  if (book.cover !== undefined) frontmatter['cover'] = book.cover;
  if (book.spineColor !== undefined) frontmatter['spine_color'] = book.spineColor;
  if (book.pages !== undefined) frontmatter['pages'] = book.pages;
  if (book.faceOut !== undefined) frontmatter['face_out'] = book.faceOut;
  // Normalised at the single write path, so no import can produce a tag
  // Obsidian will reject however carelessly it names its categories.
  const tags = [...new Set((book.tags ?? []).map(toObsidianTag).filter(isTag))];
  if (tags.length > 0) frontmatter['tags'] = tags;

  // Extras are written last and never overwrite a contract key, so an import
  // cannot smuggle in a different title or status through the side door.
  for (const [key, value] of Object.entries(book.extra ?? {})) {
    if (!(key in frontmatter)) frontmatter[key] = value;
  }

  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();

  // Embed the cover so Obsidian actually shows it. A `cover:` frontmatter value
  // is data the builder reads; it renders nothing in the note itself. The
  // wikilink embed resolves by filename anywhere in the vault, which is what
  // makes it survive the file being moved.
  //
  // This lives in the body, and the body is never parsed back (invariant 2) —
  // the embed is for the human reading the note, not for the build.
  const embed =
    book.cover === undefined ? '' : `![[${book.cover.split('/').pop() ?? book.cover}]]\n\n`;

  return `---\n${yaml}\n---\n\n${embed}## Notes\n\n`;
}

/** Conservative: strips what Windows, macOS and Obsidian each dislike. */
function safeFilename(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'Untitled';
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return Array.isArray(entries);
  } catch {
    return false;
  }
}

function isTag(value: string | undefined): value is string {
  return value !== undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(file: string, reason: string): void {
  // Naming the file is the point — invariant 3 says "skip with a console
  // warning listing the file", and a warning you cannot act on is noise.
  console.warn(`stacks: skipped ${file} — ${reason}`);
}
