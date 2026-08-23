import { describe, expect, it } from "vitest";
import { CAPTURED_ISBN, fixtureHttpGet } from "../test-support.ts";
import * as appleBooks from "./apple-books.ts";
import type { HttpGet } from "./http.ts";
import * as openLibrary from "./open-library.ts";
import * as oreilly from "./oreilly.ts";

/**
 * The fields the providers were always sending and the code threw away.
 *
 * Every assertion below reads a **real captured response** already in
 * `fixtures/api/` — these fields were sitting in those files the whole time,
 * which is the point: nothing new had to be fetched to prove the parser was
 * discarding them. See `docs/spec/metadata-merge.md` §3.
 */

const openLibraryHit = fixtureHttpGet({
  "/api/books": "open-library-isbn-hit.json",
});

const oreillyIsbnHit = fixtureHttpGet({
  "learning.oreilly.com": "oreilly-isbn-hit.json",
});

const appleHit = fixtureHttpGet({
  "itunes.apple.com": "apple-search-hit.json",
});
const appleNearMiss = fixtureHttpGet({
  "itunes.apple.com": "apple-search-near-miss.json",
});

describe("Open Library keeps what it always sent", () => {
  it("takes publisher, publication date, subjects and the OLID from the ISBN response", async () => {
    const result = await openLibrary.lookupByIsbn(
      CAPTURED_ISBN,
      openLibraryHit,
    );

    expect(result?.publisher).toBe("Chelsea");
    // Bare `"2008"` — the field that puts Open Library last in the `published`
    // order, and the reason the note stores whatever it is given rather than a
    // normalised shape.
    expect(result?.published).toBe("2008");
    expect(result?.subjects?.slice(0, 3)).toEqual([
      "critical thinking",
      "systems thinking",
      "systems dynamics",
    ]);
    // `"key": "/books/OL26445570M"` — in the response the ISBN path already
    // fetches, and simply unread until now.
    expect(result?.openLibraryOlid).toBe("OL26445570M");
  });
});

describe("O'Reilly keeps what it always sent", () => {
  it("takes publisher, issue date, topics, description and the ourn", async () => {
    const result = await oreilly.lookupByIsbn("9798341674738", oreillyIsbnHit);

    expect(result?.publisher).toBe("O'Reilly Media, Inc.");
    // **Verbatim, timestamp and all.** The note keeps what the provider said and
    // the card renders the first four-digit run — #102 over #97, and this is the
    // exact value that made the difference.
    expect(result?.published).toBe("2027-02-25T00:00:00Z");
    // `topics` is a list of UUIDs; the names live in `topics_payload`.
    expect(result?.subjects).toEqual(["Engineering"]);
    expect(result?.description).toContain("engineers");
    // The URN verbatim, not re-derived — and note it wraps `archive_id`, the
    // identifier CLAUDE.md documents as a trap, **not** the ISBN. That is why
    // the key is named `oreilly_ourn` and not `oreilly_id`.
    expect(result?.oreillyOurn).toBe("urn:orm:book:0642572352530");
  });

  it("strips markup out of a description rather than storing tags", async () => {
    const result = await oreilly.lookupByIsbn("9798341674738", oreillyIsbnHit);

    expect(result?.description).not.toMatch(/<[a-z/]/i);
  });
});

describe("stripping tags takes more than one pass", () => {
  const withDescription =
    (description: string): HttpGet =>
    async () => ({ results: [{ title: "A Book", description }] });

  it.each([
    ["<p>plain</p>", "plain"],
    // The case CodeQL named (`js/incomplete-multi-character-sanitization`): a
    // single pass removes `<x>` and *creates* the tag it was meant to remove.
    ["<scr<x>ipt>alert(1)</scr<x>ipt>", "alert(1)"],
    ["<<b>b>bold<</b>/b>", "bold"],
    // Nothing that could open a tag survives at all, which is a stronger claim
    // than "no tags survive" and a much easier one to be sure of.
    ["a < b and c > d", "a b and c d"],
  ])("reduces %j to text", async (input, expected) => {
    const result = await oreilly.lookupByIsbn(
      "9798341674738",
      withDescription(input),
    );

    expect(result?.description).toBe(expected);
  });
});

describe("Apple stops throwing its match away", () => {
  it("returns the matched record, not one artwork URL", async () => {
    const result = await appleBooks.findRecord(
      "Atomic Habits",
      "James Clear",
      appleHit,
    );

    expect(result?.appleTrackId).toBe("1384286945");
    expect(result?.published).toBe("2018-10-16T07:00:00Z");
    expect(result?.description).toBeDefined();
    // Still a *candidate* cover, at the size the artwork path is rewritten to.
    expect(result?.coverUrlLarge).toContain("/1200x1200bb.");
  });

  it("drops Apple's catch-all Books genre and keeps the rest in its own order", async () => {
    const result = await appleBooks.findRecord(
      "Atomic Habits",
      "James Clear",
      appleHit,
    );

    expect(result?.subjects).not.toContain("Books");
    expect(result?.subjects?.[0]).toBe("Management & Leadership");
    // The value that decided the `; ` separator: split a `, `-joined scalar back
    // on a comma and this one genre becomes two.
    expect(result?.subjects).toContain("Health, Mind & Body");
  });

  it("refuses six confident near-misses rather than taking the first", async () => {
    // Apple has no English *Thinking in Systems*: two summaries, a study guide,
    // a different Meadows title and two translations. Wrong art is worse than
    // none, and a wrong id is worse still — it is invisible until a visitor
    // clicks it.
    const result = await appleBooks.findRecord(
      "Thinking in Systems",
      "Donella H. Meadows",
      appleNearMiss,
    );

    expect(result).toBeUndefined();
  });
});
