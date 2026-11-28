/**
 * `import { stripToc } from '../scripts/toc.mjs'` — the one export a gate reads.
 *
 * `toc.mjs` is a vendored copy of the pact's script and is not edited here, so
 * its type is declared beside it: `pnpm typecheck` compiles only `.ts`. G71
 * (`doc-word-budget`) counts a doc without its generated table, by the same
 * function that writes the table.
 */

/** The text with its table of contents, and the one blank line after it, taken out. */
export function stripToc(text: string): string;
