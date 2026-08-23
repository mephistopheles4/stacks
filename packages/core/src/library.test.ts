import { describe, expect, it } from "vitest";
import { ObsidianAdapter } from "./adapters/obsidian-adapter.ts";
import { buildLibrary } from "./library.ts";
import { FIXTURE_VAULT } from "./test-support.ts";

const NOW = new Date("2026-07-31T00:00:00.000Z");

async function fixtureLibrary(isPublic: boolean) {
  const books = await new ObsidianAdapter(FIXTURE_VAULT).listBooks();
  return buildLibrary(books, { isPublic, now: NOW });
}

describe("buildLibrary", () => {
  it("contains exactly the well-formed books", async () => {
    const library = await fixtureLibrary(false);
    expect(library.version).toBe(1);
    // Nine, including the `private: true` one — a local build shows you
    // everything on your own machine; only `--public` holds it back.
    expect(library.bookCount).toBe(9);
    expect(library.books).toHaveLength(9);
    expect(library.generatedAt).toBe(NOW.toISOString());
  });

  it("gives the print and audiobook editions distinct ids", async () => {
    const library = await fixtureLibrary(false);
    const editions = library.books.filter(
      (b) => b.title === "The Salt Road Ledger",
    );

    expect(editions).toHaveLength(2);
    expect(editions[0]?.id).not.toBe(editions[1]?.id);
  });

  it("sorts newest-finished first, with unfinished books last", async () => {
    const library = await fixtureLibrary(false);
    const finished = library.books
      .filter((b) => b.finished !== undefined)
      .map((b) => b.finished);

    expect([...finished]).toEqual([...finished].sort().reverse());
    // Reading / wishlist / abandoned-without-a-finish-date go to the back.
    expect(library.books.at(-1)?.finished).toBeUndefined();
  });

  it("is deterministic — same vault, same output", async () => {
    expect(JSON.stringify(await fixtureLibrary(false))).toBe(
      JSON.stringify(await fixtureLibrary(false)),
    );
  });
});

describe("the public build leaks nothing (invariants 1 and 2)", () => {
  it("carries no note body text", async () => {
    const json = JSON.stringify(await fixtureLibrary(true));
    expect(json).not.toContain("NOTE_BODY_CANARY_do_not_ship");
  });

  it("carries no vault paths", async () => {
    const library = await fixtureLibrary(true);
    expect(library.books.every((book) => book.sourcePath === undefined)).toBe(
      true,
    );
    expect(JSON.stringify(library)).not.toContain("Library/");
    expect(JSON.stringify(library)).not.toContain(".md");
  });

  it("still keeps the local build’s source paths, which are useful for debugging", async () => {
    const library = await fixtureLibrary(false);
    expect(library.books.every((book) => book.sourcePath !== undefined)).toBe(
      true,
    );
  });
});
