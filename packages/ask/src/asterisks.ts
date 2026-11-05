const LETTER = /\p{L}/u;

/**
 * Removes the `*` marks a model uses for markdown (S6), but keeps one with a letter
 * on both sides, which is part of a word: a book titled F*ck must stay itself in the
 * answer, in the follow-ups and in its pill.
 */
export function stripAsterisks(text: string): string {
  return text.replace(/\*+/g, (run, at: number, whole: string) =>
    run.length === 1 && LETTER.test(whole[at - 1] ?? '') && LETTER.test(whole[at + 1] ?? '')
      ? run
      : '',
  );
}
