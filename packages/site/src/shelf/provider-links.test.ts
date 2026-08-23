import { describe, expect, it } from "vitest";
import type { LibraryBook } from "@stacks/core";
import { providerLinks } from "./provider-links.ts";

function book(fields: Partial<LibraryBook> = {}): LibraryBook {
  return { id: "x", title: "A Book", status: "read", tags: [], ...fields };
}

describe("which marks a book gets", () => {
  it("ranks them in the merge’s own provider order", () => {
    const links = providerLinks(
      book({
        isbn: "9781603580557",
        googleVolumeId: "CpbLAgAAQBAJ",
        appleTrackId: "1384286945",
      }),
    );

    expect(links.map((link) => link.kind)).toEqual([
      "open-library",
      "google",
      "apple",
    ]);
  });

  it("never renders O’Reilly, however completely the note records it", () => {
    // Its id 307s to a 403 whether the book exists or not, so there is no link
    // to give it. Provenance without a link.
    const links = providerLinks(
      book({ oreillyOurn: "urn:orm:book:0642572352530" }),
    );

    expect(links.map((link) => link.kind)).toEqual(["search"]);
  });

  it("prefers the ISBN over the OLID, because only that URL lands softly", () => {
    const links = providerLinks(
      book({ isbn: "9781603580557", openLibraryOlid: "OL26445570M" }),
    );

    expect(links[0]?.href).toBe("https://openlibrary.org/isbn/9781603580557");
  });

  it("falls back to the OLID for a book with no ISBN", () => {
    const links = providerLinks(book({ openLibraryOlid: "OL26445570M" }));

    expect(links[0]?.href).toBe("https://openlibrary.org/books/OL26445570M");
  });

  it("builds Apple region-free", () => {
    // `/us/` would assert a storefront on the visitor's behalf, and the site
    // does not know theirs.
    expect(providerLinks(book({ appleTrackId: "1384286945" }))[0]?.href).toBe(
      "https://books.apple.com/book/id1384286945",
    );
  });
});

describe("the row always renders", () => {
  it("gives a book with no identifier one text search link, at Open Library", () => {
    const links = providerLinks(book({ title: "A Book", author: "An Author" }));

    expect(links).toHaveLength(1);
    expect(links[0]?.kind).toBe("search");
    expect(links[0]?.href).toBe(
      "https://openlibrary.org/search?q=A%20Book%20An%20Author",
    );
    // A text link: its visible text is its accessible name, so it carries no
    // `title` and no `aria-label` — overriding it would risk WCAG 2.5.3 from the
    // other direction.
    expect(links[0]?.text).toBe("Search Open Library");
  });

  it("searches on the title alone when there is no author", () => {
    // The contract permits a title-only note; no such note exists in the real
    // vault, so this pins a shape rather than a population.
    expect(providerLinks(book({ title: "A Book" }))[0]?.href).toBe(
      "https://openlibrary.org/search?q=A%20Book",
    );
  });

  it("never mixes marks and the fallback in one row", () => {
    const links = providerLinks(book({ isbn: "9781603580557" }));

    expect(links.some((link) => link.kind === "search")).toBe(false);
  });
});

describe("names", () => {
  it('calls Google’s mark "Google Preview", after its artwork', () => {
    // The one departure from the bare-destination rule, and it exists because
    // the granted asset is a button whose artwork carries those words: naming it
    // "Google Books" is a WCAG 2.5.3 (Label in Name) mismatch.
    expect(providerLinks(book({ googleVolumeId: "x123456" }))[0]?.name).toBe(
      "Google Preview",
    );
  });

  it("names every link something", () => {
    const links = providerLinks(
      book({
        isbn: "9781603580557",
        googleVolumeId: "CpbLAgAAQBAJ",
        appleTrackId: "1384286945",
      }),
    );

    expect(links.every((link) => link.name.length > 0)).toBe(true);
  });
});

describe("a vault string never reaches an href unencoded", () => {
  it("escapes an id a hand-edited note could carry", () => {
    // Ids are shape-checked at parse and dropped on mismatch, but that is a typo
    // guard rather than a guarantee — and `library.json` is read at runtime by a
    // browser. Encoding is the cheap half of the belt.
    const links = providerLinks(book({ isbn: "978 1603/580557" }));

    expect(links[0]?.href).toBe(
      "https://openlibrary.org/isbn/978%201603%2F580557",
    );
  });
});
