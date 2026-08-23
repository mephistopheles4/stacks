import { describe, expect, it } from "vitest";
import type { LibraryBook } from "@stacks/core";
import { announcement, cardModel, publicationYear } from "./card.ts";

/**
 * The card's content rules, at the seam that holds them.
 *
 * `cardModel` is a pure function of one `LibraryBook`, and the DOM builder adds
 * nothing to it — so every collapse rule is assertable with no browser and no
 * DOM shim, which this repo has neither of and prefers not to acquire. What the
 * *nodes* look like is **G35**'s question, in `scripts/smoke-render.ts`.
 *
 * Every rule below is a population in the real vault rather than a
 * hypothetical: 19 of 41 books are `read` with nothing else to say, 5 of 41 have
 * none of the five object facts, 0 of 41 carry a rating.
 */

function book(fields: Partial<LibraryBook> = {}): LibraryBook {
  return { id: "x", title: "A Book", status: "read", tags: [], ...fields };
}

describe("what always renders", () => {
  it("leads the reading line with the status word, even for `read`", () => {
    expect(cardModel(book({ status: "read" })).reading).toBe("read");
  });

  it("gives a book with no identifiers a links row anyway", () => {
    expect(cardModel(book()).links).toHaveLength(1);
  });

  it("surfaces wishlist and abandoned as words", () => {
    // A consequence of the uniform form, worth pinning: these reach local
    // builds, and a wishlist book never reaches a public one.
    expect(cardModel(book({ status: "wishlist" })).reading).toBe("wishlist");
  });
});

describe("the reading line", () => {
  it("prefers finished over started", () => {
    expect(
      cardModel(book({ started: "2026-01-02", finished: "2026-03-04" }))
        .reading,
    ).toBe("read · finished 2026-03-04");
  });

  it("falls back to started", () => {
    expect(
      cardModel(book({ status: "reading", started: "2026-01-02" })).reading,
    ).toBe("reading · started 2026-01-02");
  });

  it("renders stars with no denominator — a segment nothing has ever drawn", () => {
    // `rating` is on 0 of 41 real books, so this is the one piece of the card
    // with no picture behind it. Pinned here rather than left unexercised.
    expect(cardModel(book({ rating: 3 })).reading).toBe("read · ★★★");
  });
});

describe("what collapses", () => {
  it("starts at the title when there is no cover, with no placeholder", () => {
    expect(cardModel(book()).cover).toBeUndefined();
  });

  it("drops the object line whole when all five facts are absent", () => {
    const model = cardModel(book());

    expect(model.object).toBeUndefined();
    // The region does not vanish with it: the links row still renders.
    expect(model.links.length).toBeGreaterThan(0);
  });

  it("drops author, tags and subjects when absent", () => {
    const model = cardModel(book());

    expect(model.author).toBeUndefined();
    expect(model.tags).toBeUndefined();
    expect(model.subjects).toBeUndefined();
  });
});

describe("the object line", () => {
  it("takes catalogue order — publisher, published, pages, binding, isbn", () => {
    const model = cardModel(
      book({
        publisher: "Chelsea Green",
        published: "2008-12-05",
        pages: 240,
        binding: "paperback",
        isbn: "9781603580557",
      }),
    );

    expect(model.object).toBe(
      "Chelsea Green · 2008 · 240 pages · paperback · 9781603580557",
    );
  });

  it("shows the ISBN as a visible string in its own right", () => {
    expect(cardModel(book({ isbn: "9781603580557" })).object).toBe(
      "9781603580557",
    );
  });

  it("never invents a binding for a book that declares none", () => {
    // The shelf hashes a shape for an undeclared binding; the card must not
    // present that guess as a fact.
    expect(cardModel(book({ pages: 240 })).object).toBe("240 pages");
  });
});

describe("published is stored verbatim and rendered as a year", () => {
  it("takes the first four-digit run out of a timestamp", () => {
    expect(publicationYear("2019-03-05T07:00:00Z")).toBe("2019");
  });

  it("passes a bare year through", () => {
    expect(publicationYear("2008")).toBe("2008");
  });

  it("renders verbatim when there is no four-digit run, rather than vanishing", () => {
    // Fail open. A hand-editor who wrote `forthcoming` sees `forthcoming`: the
    // card must never hide what the note says.
    expect(publicationYear("forthcoming")).toBe("forthcoming");
  });
});

describe("subjects", () => {
  it("splits on the separator core joined with, not on a comma", () => {
    // A comma split would turn Apple's "Health, Mind & Body" into two subjects —
    // which is the whole reason core joins with a semicolon.
    expect(
      cardModel(book({ subjects: "Health, Mind & Body; Psychology" })).subjects,
    ).toBe("Health, Mind & Body · Psychology");
  });

  it("keeps owner tags and provider subjects apart", () => {
    const model = cardModel(
      book({ tags: ["fantasy"], subjects: "Fiction / Fantasy" }),
    );

    expect(model.tags).toBe("fantasy");
    expect(model.subjects).toBe("Fiction / Fantasy");
  });
});

/**
 * The tags strip is the owner's own vocabulary, and `audiobook` is not in it.
 *
 * `import/audible.ts` writes `['audiobook', ...categories]` onto every book it
 * imports, and says why in its own comment: "so the shelf can tell them apart
 * later". It is a machine's marker sitting in the one place on the card that is
 * supposed to be what *you* said about the book — and on this vault it leads 24
 * of the tag lines.
 *
 * ⚠️ Hidden, not deleted. The tag stays in the note, `library.json` still
 * carries it, and `identity.ts` still uses it to keep an audiobook from shelving
 * on top of its print edition.
 */
describe("the audiobook marker", () => {
  it("does not show on the card", () => {
    expect(cardModel(book({ tags: ["audiobook", "consulting"] })).tags).toBe(
      "consulting",
    );
  });

  it("collapses the line when it was the only tag, rather than leaving it empty", () => {
    expect(cardModel(book({ tags: ["audiobook"] })).tags).toBeUndefined();
  });

  it("leaves a tag that merely contains the word alone", () => {
    // `audiobook-club` is the owner's, whatever it starts with.
    expect(cardModel(book({ tags: ["audiobook-club"] })).tags).toBe(
      "audiobook-club",
    );
  });
});

describe("the announcement", () => {
  it("carries title and author, and nothing else", () => {
    // Short rather than complete, deliberately: the primary consumer is a touch
    // screen-reader user double-tapping a canvas with no accessible children,
    // for whom this is the only way to learn which book they hit.
    expect(announcement(book({ author: "An Author" }))).toBe(
      "A Book by An Author",
    );
    expect(announcement(book())).toBe("A Book");
  });
});
