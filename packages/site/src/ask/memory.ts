import type { AskResult } from './client.ts';

/**
 * What the page remembers of the conversation (docs/spec/ask-the-library.md S4, S5, S7;
 * memory spec D1 to D4).
 *
 * It lives in a closure and nowhere else: no `localStorage`, no cookie, no URL. Reloading
 * the page ends the conversation, and "not stored" stays true. Only an AI answer is kept,
 * because a fallback line is not something the owner said. The last 2 exchanges are sent
 * with each question, each side cut to the length the Worker will accept.
 */
export interface Exchange {
  readonly question: string;
  readonly answer: string;
}

export const MAX_EXCHANGES = 2;
export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_CHARS = 600;

export interface Memory {
  /** Keeps the exchange if it was answered by the model; otherwise leaves memory as it was. */
  remember(question: string, result: AskResult): void;
  /** The exchanges to send with the next question, oldest first. */
  recent(): readonly Exchange[];
}

export function createMemory(): Memory {
  let kept: Exchange[] = [];
  return {
    remember(question, result) {
      if (result.mode !== 'ai') return;
      kept = [
        ...kept,
        {
          question: question.trim().slice(0, MAX_QUESTION_CHARS),
          answer: result.answer.slice(0, MAX_ANSWER_CHARS),
        },
      ].slice(-MAX_EXCHANGES);
    },
    recent: () => [...kept],
  };
}
