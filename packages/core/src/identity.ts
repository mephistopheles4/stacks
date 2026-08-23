/**
 * Identity and matching.
 *
 * Two books are "the same" if their ISBNs match, or failing that if their
 * normalised title+author match. Both paths need a normal form that survives
 * the things hand-edited notes and three different metadata APIs do to the same
 * book: diacritics, subtitles punctuated differently, leading articles,
 * "Surname, Firstname" vs "Firstname Surname".
 */

/** Digits only, uppercase X, so `978-1-00-000001-6` matches `9781000000016`. */
export function normaliseIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** A 10- or 13-digit ISBN with a correct check digit. */
export function isValidIsbn(value: string): boolean {
  const isbn = normaliseIsbn(value);
  if (isbn.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }
  if (isbn.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += Number(isbn[i]) * (10 - i);
    }
    const check = isbn[9] === "X" ? 10 : Number(isbn[9]);
    return (sum + check) % 11 === 0;
  }
  return false;
}

/**
 * Rewrites a label into something Obsidian accepts as a tag.
 *
 * Obsidian allows letters, digits, `_`, `-` and `/` and nothing else — no
 * spaces, no ampersands — and shows anything else as invalid in the properties
 * panel. Audible's categories arrive as "Business & Careers" and "Computer
 * Science", so an import produces broken tags unless they are rewritten.
 *
 * Returns `undefined` for a label with nothing usable left, and for an
 * all-numeric one, which Obsidian also rejects.
 */
export function toObsidianTag(raw: string): string | undefined {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");

  if (cleaned.length === 0) return undefined;
  // A tag of digits alone is not a valid Obsidian tag.
  return /[a-z_]/.test(cleaned) ? cleaned : undefined;
}

const LEADING_ARTICLE = /\b(?:a|an|the)\b/g;

/**
 * Lowercase, unaccented, punctuation-free, article-free, single-spaced.
 *
 * Deliberately lossy — it exists to make near-misses collide, so
 * "Iglesias, Tomás" and "Tomas Iglesias" reduce to the same string.
 */
export function normaliseTitleAuthor(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(LEADING_ARTICLE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Are these two "title author" strings the same book?
 *
 * Exact equality of the normal form is too strict for the commonest real case:
 * one source carries the subtitle and the other doesn't. "Thinking in Systems"
 * and "Thinking in Systems: A Primer" by the same author are one book, and
 * treating them as two produces a duplicate note on the very first `stacks add`.
 *
 * So: equal normal forms, or one string's tokens almost entirely contained in
 * the other's while still overlapping substantially the other way. The
 * second condition is what stops two different books by the same author —
 * where the author tokens match but the title tokens don't — from colliding.
 */
export function isProbablySameBook(a: string, b: string): boolean {
  const left = normaliseTitleAuthor(a);
  const right = normaliseTitleAuthor(b);
  if (left.length === 0 || right.length === 0) return false;
  if (left === right) return true;

  // "Summary of X" is not X. These words mark a derivative work, and a title
  // carrying one is a different book from the title that does not.
  if (DERIVATIVE.test(left) !== DERIVATIVE.test(right)) return false;

  const forward = titleMatchScore(left, right);
  const backward = titleMatchScore(right, left);
  if (Math.max(forward, backward) >= 0.9 && Math.min(forward, backward) >= 0.6)
    return true;

  return isContainedIn(left, right) || isContainedIn(right, left);
}

/**
 * Study guides, summaries, workbooks and journals that borrow a title wholesale.
 *
 * **`journal` is here because no threshold can separate it from a subtitle.**
 * *The Power of Now* against *The Power of Now Journal* scores 0.967 forward and
 * 0.833 back; *Thinking in Systems* against *Thinking in Systems: A Primer* —
 * one book, which must match — scores 0.971 and 0.857. The same shape, four
 * thousandths apart, and only one of them is the same book. Token overlap cannot
 * tell "subtitle added" from "companion volume sold beside it", so the word is
 * named rather than the score retuned.
 *
 * A denylist, and it grows only on evidence: every word added here silently
 * refuses some real book whose title happens to carry it. `journal` earned its
 * place from a book in the vault; the neighbours it suggests — notebook,
 * planner, diary — have not, and are deliberately absent.
 */
const DERIVATIVE =
  /\b(?:summary|summaries|workbook|study|guide|companion|analysis|takeaways|abridged|journal)\b/;

/**
 * Does this title look like a summary or study guide of another book?
 *
 * Search engines rank these level with the real thing, because they contain
 * every word of it. Asking for "Staff Engineer Will Larson" on Open Library
 * returns "Summary of Will Larson's Staff Engineer" first — and a search that
 * takes its top hit on trust then writes a note for the wrong book entirely.
 */
export function looksDerivative(title: string): boolean {
  return DERIVATIVE.test(normaliseTitleAuthor(title));
}

/**
 * Is the shorter string essentially spelled out inside the longer one?
 *
 * The scored rule above fails when a subtitle is *long*: an Audible export's
 * "Staff Engineer: Leadership Beyond the Management Track — Will Larson" shares
 * only half its tokens with the vault's "Staff Engineer — Will Larson", so the
 * weaker direction scores 0.5 and the pair is missed. It is plainly one book.
 *
 * Containment catches that without opening the door to false positives: two
 * different books by one author share the author tokens but not the title ones,
 * so the shorter side never reaches near-total containment. The three-token
 * floor stops a one-word title from matching everything it appears inside.
 */
const CONTAINMENT = 0.9;
const MIN_TOKENS = 3;

function isContainedIn(shorter: string, longer: string): boolean {
  const small = shorter.split(" ").filter(Boolean);
  const largeTokens = longer.split(" ").filter(Boolean);
  const large = new Set(largeTokens);
  if (small.length < MIN_TOKENS || small.length > large.size) return false;

  /**
   * The extra words must be a *subtitle*, not a prefix — so the shorter title
   * has to **begin** the longer one, at its very first token.
   *
   * Containment alone cannot tell "Staff Engineer: Leadership Beyond the
   * Management Track" from "Summary of Will Larson's Staff Engineer" — both
   * contain every word of "Staff Engineer — Will Larson". But the first begins
   * with the title and the second buries it, and only the first is the same
   * book. A subtitle extends a title at the end; words in front of it announce
   * a different book, which is what a reader sees at a glance.
   *
   * **This allowed a drift of two tokens and that was exactly two too many.**
   * "Beyond Order:" is two tokens, so *Beyond Order: 12 More Rules for Life*
   * contained a bare "12 Rules for Life" and the sequel was refused as a
   * duplicate of the original. Any vault note stored without its subtitle is
   * open to that, and several are.
   *
   * Tightening it changed **no verdict** across 2304 real pairs — every vault
   * label, every recall-corpus label, and eight adjacent real works — because
   * the live false positives run through the scored rule instead. So this is
   * hardening against a shape that has bitten once, not a fix for anything
   * currently observable. See ADR-0007.
   */
  const firstToken = small[0];
  if (firstToken === undefined || largeTokens[0] !== firstToken) return false;

  const shared = small.filter((token) => large.has(token)).length;
  return shared / small.length >= CONTAINMENT;
}

/**
 * How well a candidate title matches what was searched for, from 0 to 1.
 *
 * Token overlap rather than edit distance: search terms are usually a partial
 * title ("salt road" for "The Salt Road Ledger"), where token containment is
 * the signal and character-level distance is mostly noise.
 */
export function titleMatchScore(query: string, candidate: string): number {
  const wanted = normaliseTitleAuthor(query).split(" ").filter(Boolean);
  const found = new Set(
    normaliseTitleAuthor(candidate).split(" ").filter(Boolean),
  );
  if (wanted.length === 0 || found.size === 0) return 0;

  const hits = wanted.filter((token) => found.has(token)).length;
  const coverage = hits / wanted.length;

  // Penalise candidates padded with unrelated words, so an exact short title
  // beats a long one that merely contains the query.
  const brevity = wanted.length / Math.max(found.size, wanted.length);
  return coverage * (0.8 + 0.2 * brevity);
}

/**
 * How well a candidate matches a search term, for **ranking** rather than identity.
 *
 * One difference from `titleMatchScore`, and it decides which record reaches the
 * vault: the brevity penalty is measured over the candidate's **title alone**,
 * never over title and author run together.
 *
 * Scoring the concatenation made a record score *higher for lacking an author*,
 * because against a title-only query the author's tokens read as padding. Open
 * Library returns exactly that pair for "12 Rules for Life" — one record with
 * Jordan B. Peterson and 480 pages, one with neither — and the empty one won,
 * 2.0 against 1.914. The note went into the vault with no author while the
 * answer sat in the same response, and `enrich` could never recover it: it
 * re-queries by the ISBN that record carries, which is the sparse edition.
 *
 * Systematic, not a near-miss. Any authorless record beats its own richer
 * sibling on a bare title, which is precisely the record that produces the
 * thinnest note. `open-library.ts` already scored its own candidates on title
 * alone; this makes the second pass agree with the first instead of undoing it.
 *
 * The author still counts towards **coverage**, so naming one in the query still
 * favours that author's book. It simply no longer costs a record anything to
 * have one.
 */
export function rankingScore(
  query: string,
  title: string,
  author?: string,
): number {
  const wanted = normaliseTitleAuthor(query).split(" ").filter(Boolean);
  const found = new Set(
    normaliseTitleAuthor(`${title} ${author ?? ""}`)
      .split(" ")
      .filter(Boolean),
  );
  const titleTokens = new Set(
    normaliseTitleAuthor(title).split(" ").filter(Boolean),
  );
  if (wanted.length === 0 || found.size === 0) return 0;

  const hits = wanted.filter((token) => found.has(token)).length;
  const coverage = hits / wanted.length;
  const brevity = wanted.length / Math.max(titleTokens.size, wanted.length);
  return coverage * (0.8 + 0.2 * brevity);
}
