/**
 * Which provider a cached cover's bytes came from.
 *
 * Recorded because the providers do not permit the same things. Open
 * Library's own documentation contemplates downloading a cover and displaying
 * it on a public-facing page, asks that you not crawl, and appreciates a link
 * back. Google's API terms bar keeping permanent copies of API content and
 * require "powered by Google" plus a prominent per-result link. Apple conditions
 * promotional content on sitting beside a store badge that links to a purchase
 * page — and book covers are not among the content types its terms enumerate at
 * all. So a public build cannot treat all three alike, and until now it had no
 * way to tell them apart: `cacheCover` wrote `<slug>.<ext>` and forgot where the
 * bytes came from.
 *
 * Derived from the URL actually downloaded rather than from which provider
 * answered the metadata lookup. Those can differ — the metadata layer completes
 * one provider's record from another's, and Apple is consulted purely for
 * artwork — and it is the bytes whose terms apply.
 *
 * **This records provenance; it has never been a permission gate.** Nothing in
 * `publish.ts` reads it, and every cover is published whatever its source — 26
 * of Apple's among them, whose terms are the least clear of the four. So it is
 * worth being exact about what this key buys, because it is easy to mistake for
 * something it is not: if any provider ever asks for its art to come down, this
 * is what makes the answer *"those nine"* rather than *"all of them"*. An index
 * for acting precisely, not a licence check.
 */

/** `unknown` covers both an unrecognised host and a cover cached before this existed. */
export type CoverSource =
  "open-library" | "google-books" | "apple-books" | "oreilly" | "unknown";

/** Host suffixes, longest-lived part of each provider's URL shape. */
const HOSTS: readonly (readonly [suffix: string, source: CoverSource])[] = [
  ["covers.openlibrary.org", "open-library"],
  ["openlibrary.org", "open-library"],
  ["books.google.com", "google-books"],
  ["books.googleusercontent.com", "google-books"],
  ["googleapis.com", "google-books"],
  ["mzstatic.com", "apple-books"],
  ["itunes.apple.com", "apple-books"],
  ["learning.oreilly.com", "oreilly"],
];

/**
 * The provider behind a cover URL.
 *
 * Parses rather than pattern-matching the whole string: `?u=covers.openlibrary.org`
 * on some other host must not read as Open Library.
 */
export function coverSourceFor(url: string): CoverSource {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  for (const [suffix, source] of HOSTS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return source;
  }
  return "unknown";
}

/** Every value the frontmatter key may hold, for validation at the parse edge. */
export const COVER_SOURCES: readonly CoverSource[] = [
  "open-library",
  "google-books",
  "apple-books",
  "oreilly",
  "unknown",
];

export function isCoverSource(value: unknown): value is CoverSource {
  return (
    typeof value === "string" &&
    (COVER_SOURCES as readonly string[]).includes(value)
  );
}
