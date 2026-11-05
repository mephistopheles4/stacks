import { AiFailure, runModel } from './ai.ts';
import type { Env } from './env.ts';
import { DataError, type CatalogueBook, type LibrarySource } from './library.ts';
import { MAX_SEARCH_BOOKS } from './limits.ts';
import type { Outcome, OutcomeDetail } from './outcome.ts';
import { buildMessages, type ThoughtsEntry } from './prompt.ts';
import { search } from './search.ts';
import { pickLikelyBooks } from './select.ts';

export interface BookSummary {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly hasThoughts: boolean;
}

/** The reply's only fields (S6). Nothing else of a book or a note reaches the page. */
export interface Reply {
  readonly mode: 'ai' | 'search' | 'limited' | 'error';
  readonly answer: string;
  readonly books: readonly BookSummary[];
}

export const SEARCH_FOUND = 'AI answers are unavailable right now. These books match your words.';
export const SEARCH_NONE =
  'AI answers are unavailable right now, and no book matches your words. Try a title, author or subject.';

export type AiState = 'ok' | 'off' | 'spent' | 'failed';

export interface Answered {
  readonly reply: Reply;
  readonly outcome: Outcome;
  readonly detail: OutcomeDetail;
  readonly ai: AiState;
}

const summary = (book: CatalogueBook): BookSummary => ({
  id: book.id,
  title: book.title,
  author: book.author ?? null,
  hasThoughts: book.thoughts,
});

function searchReply(catalogue: readonly CatalogueBook[], question: string): Reply {
  const found = search(catalogue, question);
  return {
    mode: 'search',
    answer: found.length > 0 ? SEARCH_FOUND : SEARCH_NONE,
    books: found.map(summary),
  };
}

/**
 * The answer path, shared by the HTTP handler and the daily test: the AI answer
 * when AI is on and works, search results otherwise. Throws `DataError` when the
 * library cannot be read, which the caller turns into its own reply.
 */
export async function answerQuestion(
  env: Env,
  source: LibrarySource,
  question: string,
  clock: () => number = Date.now,
): Promise<Answered> {
  const catalogue = await source.catalogue();
  if (env.ASK_AI_ENABLED !== 'true') {
    return {
      reply: searchReply(catalogue, question),
      outcome: 'search-off',
      detail: {},
      ai: 'off',
    };
  }
  const started = clock();
  try {
    const picked = pickLikelyBooks(catalogue, question);
    const entries = await loadThoughts(source, picked);
    const { messages } = buildMessages(catalogue, entries, question);
    const result = await runModel(env, messages);
    return {
      reply: {
        mode: 'ai',
        answer: result.text,
        books: mentioned(catalogue, result.text).map(summary),
      },
      outcome: 'ai',
      detail: {
        ms: clock() - started,
        ...(result.tokensIn !== undefined && { tokensIn: result.tokensIn }),
        ...(result.tokensOut !== undefined && { tokensOut: result.tokensOut }),
      },
      ai: 'ok',
    };
  } catch (error) {
    if (error instanceof DataError) throw error;
    return {
      reply: searchReply(catalogue, question),
      outcome: 'search-ai-failed',
      detail: {
        ms: clock() - started,
        reason: error instanceof AiFailure && error.spent ? 'budget' : 'failed',
      },
      ai: error instanceof AiFailure && error.spent ? 'spent' : 'failed',
    };
  }
}

/** A note that cannot be read is left out; the rules still say the book has Thoughts. */
async function loadThoughts(
  source: LibrarySource,
  books: readonly CatalogueBook[],
): Promise<ThoughtsEntry[]> {
  const loaded = await Promise.all(
    books.map(async (book) => {
      try {
        const paragraphs = await source.thoughts(book);
        return paragraphs ? { title: book.title, paragraphs } : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return loaded.filter((entry): entry is ThoughtsEntry => entry !== undefined);
}

/** Catalogue books whose title (or the part before its colon) the answer names. */
function mentioned(catalogue: readonly CatalogueBook[], answer: string): CatalogueBook[] {
  const text = answer.toLowerCase();
  return catalogue
    .filter((book) => {
      const full = book.title.toLowerCase();
      const head = (book.title.split(':')[0] ?? book.title).toLowerCase();
      return text.includes(full) || (head.length >= 5 && text.includes(head));
    })
    .slice(0, MAX_SEARCH_BOOKS);
}
