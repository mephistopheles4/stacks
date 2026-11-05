import type { ToolCall, ToolDefinition, WireCall } from './ai.ts';
import type { CatalogueBook, LibrarySource } from './library.ts';
import {
  MAX_QUERY_CHARS,
  MAX_SEARCH_BOOKS,
  MAX_THOUGHT_BOOKS,
  MAX_THOUGHT_TOKENS,
} from './limits.ts';
import { catalogueLine, estimateTokens, plain } from './prompt.ts';
import { rankLibrary } from './search.ts';

/**
 * The two read-only tools the model has (docs/spec/ask-the-library.md S5, S6; T1, T14).
 * Both read public build output only, and the Worker runs them: the model asks, the
 * Worker answers, and every result goes back as data.
 */
export const SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_library',
    description:
      "Search the owner's library by title, author, subject or words in the owner's Thoughts. " +
      "Returns up to 6 books, with the owner's Thoughts for up to 3. Each book is marked as having Thoughts or not.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A title or a few key words' } },
      required: ['query'],
    },
  },
};

export const LIST_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_books',
    description:
      "List every book in the owner's library by title and rating, highest rated first, " +
      'marking the books that have Thoughts. Use it for broad questions, then search a title to read the Thoughts.',
    parameters: { type: 'object', properties: {} },
  },
};

export const TOOLS: readonly ToolDefinition[] = [SEARCH_TOOL, LIST_TOOL];

const TRY_OTHER = 'Try other words, or call list_books.';
export const NO_MATCH = `No books matched. ${TRY_OTHER}`;
export const NO_OTHER_MATCH = `No other books matched. ${TRY_OTHER}`;
export const NO_ROOM = 'No result could be returned.';

/**
 * What a bad tool call gets back instead of failing the question: a short message naming the
 * right input and nothing of what was sent (C32). The model may fix it with a call it has left.
 */
export const BAD_ARGUMENTS =
  'search_library needs {"query": "a title or a few key words"}. Call it again with a query, or call list_books.';
export const UNKNOWN_TOOL =
  'No such tool. Use search_library with {"query": "a title or a few key words"}, or list_books with no input.';

/** What a result says when it shows fewer books than matched (T5). */
export const showing = (shown: number, matched: number): string =>
  `Showing ${String(shown)} of ${String(matched)} matches. Search with more specific words to narrow this down.`;

/** What one question's tool calls share: the library, and the books already returned (T6). */
export interface ToolSession {
  readonly catalogue: readonly CatalogueBook[];
  readonly source: LibrarySource;
  /** Books a search has returned. `list_books` adds none, so a title can still be searched. */
  readonly returned: Set<string>;
}

export interface ToolRun {
  readonly wire: WireCall;
  readonly content: string;
  /** True when the call was bad and `content` is the guidance for it, not a result. */
  readonly error?: true;
}

/** The query out of untrusted arguments: a string, one line, at most 200 characters; else none. */
function readQuery(args: unknown): string | undefined {
  let value: unknown = args;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const query = (value as { query?: unknown } | null)?.query;
  if (typeof query !== 'string') return undefined;
  const clean = plain(query, MAX_QUERY_CHARS);
  return clean === '' ? undefined : clean;
}

const wireFor = (call: ToolCall, name: string, args: unknown): WireCall => ({
  id: call.id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

/**
 * Runs one tool call. `room` is how many estimated tokens the result may take so the
 * next call stays inside the input budget (T8). An unknown tool or bad arguments do not
 * fail the question: they come back as a short message naming the right input, and the
 * call still counts against the model's two. The name and arguments the model sent are
 * never echoed, so what goes back to it is always one of this file's own sentences.
 */
export async function runTool(
  call: ToolCall,
  session: ToolSession,
  room: number,
): Promise<ToolRun> {
  if (call.name === 'list_books') {
    return { wire: wireFor(call, 'list_books', {}), content: listBooks(session.catalogue, room) };
  }
  if (call.name !== 'search_library') {
    return { wire: wireFor(call, 'unknown_tool', {}), content: UNKNOWN_TOOL, error: true };
  }
  const query = readQuery(call.arguments);
  if (query === undefined) {
    return { wire: wireFor(call, 'search_library', {}), content: BAD_ARGUMENTS, error: true };
  }
  return {
    wire: wireFor(call, 'search_library', { query }),
    content: await searchBooks(session, query, room),
  };
}

const rating = (book: CatalogueBook): string =>
  book.rating === undefined ? 'unrated' : `${String(book.rating)}/5`;

/** Every book, highest rated first then shelf order, with the Thoughts mark (T14, C33). */
function listBooks(catalogue: readonly CatalogueBook[], room: number): string {
  const text = catalogue
    .map((book, position) => ({ book, position }))
    .sort((a, b) => (b.book.rating ?? 0) - (a.book.rating ?? 0) || a.position - b.position)
    .map(
      ({ book }) =>
        `"${plain(book.title)}" | ${rating(book)} | ` +
        (book.thoughts ? 'has written Thoughts' : 'no Thoughts written'),
    )
    .join('\n');
  return estimateTokens(text) > room ? NO_ROOM : text;
}

/**
 * A search result (T5, T6, T8): up to 6 books as catalogue lines, each marked, then the
 * owner's Thoughts for up to 3 of them within 1,500 estimated tokens. Past `room`, Thoughts
 * drop a whole book at a time, from the last, and then the whole result.
 */
async function searchBooks(session: ToolSession, query: string, room: number): Promise<string> {
  const matches = await rankLibrary(session.catalogue, session.source, query, session.returned);
  const hits = matches.slice(0, MAX_SEARCH_BOOKS);
  if (hits.length === 0) return session.returned.size > 0 ? NO_OTHER_MATCH : NO_MATCH;
  const shown = hits.map((h) => catalogueLine(h.book));
  if (matches.length > hits.length) shown.push(showing(hits.length, matches.length));
  const lines = shown.join('\n');
  const base = estimateTokens(lines);
  if (base > room) return NO_ROOM;
  for (const h of hits) session.returned.add(h.book.id);

  const blocks: string[] = [];
  let used = 0;
  for (const h of hits.filter((x) => x.thoughts !== undefined).slice(0, MAX_THOUGHT_BOOKS)) {
    const block = `Your Thoughts on "${plain(h.book.title)}": ${(h.thoughts ?? []).join(' ')}`;
    const cost = estimateTokens(block);
    if (used + cost > MAX_THOUGHT_TOKENS || base + used + cost > room) break;
    blocks.push(block);
    used += cost;
  }
  return blocks.length > 0 ? `${lines}\n\n${blocks.join('\n\n')}` : lines;
}
