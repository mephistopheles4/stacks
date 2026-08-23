import { isProbablySameBook } from "../identity.ts";
import { keyIfPresent } from "../key-if-present.ts";
import type { HttpGet } from "./http.ts";
import {
  asPositiveInt,
  asRecord,
  firstString,
  toPlainText,
  type BookMetadata,
} from "./types.ts";

/**
 * Apple Books — best-in-class artwork, and a metadata contributor.
 *
 * It earns its place first on pictures: roughly 800x1200, correctly cropped to
 * the front cover, free and keyless, against Open Library's patchy community
 * scans and Google's ~128px `thumbnail`.
 *
 * **It used to return one URL and throw the rest away**, which is the whole of
 * what changed here. `isProbablySameBook` had already established that the
 * matched record *is* this book — the expensive part — and then everything but
 * `artworkUrl100` was discarded, including a description on every result, a
 * release date, genres, and the `trackId` that identifies the book. So Apple was
 * always a contributor in the sense that matters (docs/spec/provider-provenance.md
 * §1); only the return type was in the way.
 *
 * The catalogue is a store, so it is full of near-misses: searching "Staff
 * Engineer Will Larson" returns "Summary of Will Larson's Staff Engineer" as
 * the top hit. Every result is therefore checked against the book we already
 * have, and nothing is taken when the titles and authors disagree. Wrong art is
 * worse than none, and a wrong id is worse still — art is visible and gets
 * noticed, an id is invisible until a visitor clicks it.
 *
 * ⚠️ **There is no ISBN endpoint.** This is a term search for every book, so
 * `appleTrackId` is title-matched on the whole vault rather than only on the
 * books without an ISBN. Accepted knowingly; see docs/spec/metadata-merge.md §6.
 */

const SEARCH = "https://itunes.apple.com/search";

/**
 * Artwork comes back as a 100px URL with the size embedded in the path;
 * swapping it asks for a larger render of the same image.
 */
const ARTWORK_SIZE = /\/\d+x\d+bb?\.(jpg|png)$/;

/**
 * Apple's catch-all genre, dropped rather than recorded.
 *
 * Every ebook carries it, so it says nothing about the book and would spend one
 * of the five capped subject slots on every note that has any.
 */
const GENERIC_GENRE = "Books";

export async function findRecord(
  title: string,
  author: string | undefined,
  get: HttpGet,
): Promise<BookMetadata | undefined> {
  const term = `${title} ${author ?? ""}`.trim();
  if (term.length === 0) return undefined;

  const body = asRecord(
    await get(
      `${SEARCH}?term=${encodeURIComponent(term)}&entity=ebook&limit=5`,
    ),
  );
  const results = Array.isArray(body?.["results"]) ? body["results"] : [];

  /**
   * The first match wins — **but a match with no artwork does not end the
   * scan.**
   *
   * The old code `continue`d when `artworkUrl100` was missing, because artwork
   * was the only thing it wanted. Returning the first match outright would have
   * quietly lost a cover this function used to find: Apple's catalogue carries
   * editions of one book, and the first to pass `isProbablySameBook` is not
   * always the one with a picture.
   *
   * So identity settles the *record* on the first match, and the scan carries on
   * only to fill an artwork gap — which is the same absent-only shape as
   * everything else here.
   */
  let matched: BookMetadata | undefined;

  for (const entry of results) {
    const item = asRecord(entry);
    if (item === undefined) continue;

    const found = firstString(item["trackName"]);
    if (found === undefined) continue;

    const foundAuthor = firstString(item["artistName"]) ?? "";
    if (
      !isProbablySameBook(`${title} ${author ?? ""}`, `${found} ${foundAuthor}`)
    )
      continue;

    const artwork = firstString(item["artworkUrl100"])?.replace(
      ARTWORK_SIZE,
      "/1200x1200bb.$1",
    );

    if (matched !== undefined) {
      if (artwork === undefined) continue;
      return { ...matched, coverUrlLarge: artwork };
    }

    matched = {
      title: found,
      source: "apple-books",
      ...keyIfPresent("author", firstString(item["artistName"])),
      // Only ever a *candidate* cover, which is why it lands on `coverUrlLarge`
      // and never on `coverUrl`: the downloader keeps whichever of the queue is
      // cover-shaped, and this is the one worth trying first.
      ...keyIfPresent("coverUrlLarge", artwork),
      // A number in the response and a string in the note — the frontmatter
      // holds scalars and every other id is a string, so the shape check has one
      // rule to state rather than two.
      ...keyIfPresent("appleTrackId", trackIdOf(item["trackId"])),
      ...keyIfPresent("published", firstString(item["releaseDate"])),
      ...keyIfPresent("subjects", genresOf(item["genres"])),
      ...keyIfPresent("description", toPlainText(item["description"])),
    };

    if (artwork !== undefined) return matched;
  }

  return matched;
}

function trackIdOf(value: unknown): string | undefined {
  const id = asPositiveInt(value);
  return id === undefined ? undefined : String(id);
}

function genresOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .filter((genre): genre is string => typeof genre === "string")
    .filter((genre) => genre !== GENERIC_GENRE);
  return names.length === 0 ? undefined : names;
}
