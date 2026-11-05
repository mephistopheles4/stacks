/**
 * The drawer's one network call: a question to the Worker at `/api/chat`
 * (docs/spec/ask-the-library.md S6). Same origin, so `connect-src 'self'` stays
 * as it is.
 *
 * Whatever comes back is read as untrusted: a WAF block page, a 1027 error and
 * a non-JSON 429 all become the one "unavailable" message, and a JSON reply
 * keeps only the fields S6 names. The text reaches the page through
 * `textContent` and never as markup.
 */

export interface AskBook {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly hasThoughts: boolean;
}

export type AskMode = 'ai' | 'search' | 'limited' | 'error' | 'unavailable';

export interface AskResult {
  readonly mode: AskMode;
  readonly answer: string;
  readonly books: readonly AskBook[];
}

export const UNAVAILABLE = 'Answers are unavailable right now. You can still browse the shelf.';

const MODES: ReadonlySet<string> = new Set(['ai', 'search', 'limited', 'error']);
const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
/** The Worker sends at most 6 books; a longer list is not from the Worker. */
const MAX_BOOKS = 6;

export const unavailable: AskResult = { mode: 'unavailable', answer: UNAVAILABLE, books: [] };

/** Keeps a reply only if it has the Worker's shape, and only the fields S6 names. */
export function readReply(value: unknown): AskResult {
  if (typeof value !== 'object' || value === null) return unavailable;
  const { mode, answer, books } = value as Record<string, unknown>;
  if (typeof mode !== 'string' || !MODES.has(mode)) return unavailable;
  if (typeof answer !== 'string' || answer === '' || answer.length > 4_000) return unavailable;
  if (!Array.isArray(books)) return unavailable;
  const kept: AskBook[] = [];
  for (const entry of (books as unknown[]).slice(0, MAX_BOOKS)) {
    const b = (entry ?? {}) as Record<string, unknown>;
    if (typeof b.id !== 'string' || !ID.test(b.id) || typeof b.title !== 'string') continue;
    kept.push({
      id: b.id,
      title: b.title,
      author: typeof b.author === 'string' ? b.author : null,
      hasThoughts: b.hasThoughts === true,
    });
  }
  return { mode: mode as AskMode, answer, books: kept };
}

export async function askLibrary(
  question: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AskResult> {
  try {
    const response = await fetchImpl('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, token }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLowerCase().includes('json')) return unavailable;
    return readReply(await response.json());
  } catch {
    return unavailable;
  }
}
