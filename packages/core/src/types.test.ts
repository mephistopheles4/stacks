import { describe, expect, it } from "vitest";
import { BOOK_STATUSES, DEFAULT_BOOK_STATUS, isBookStatus } from "./index.ts";

describe("book status", () => {
  it("accepts every status named in the frontmatter contract", () => {
    expect([...BOOK_STATUSES]).toEqual([
      "reading",
      "read",
      "abandoned",
      "wishlist",
    ]);
    for (const status of BOOK_STATUSES) {
      expect(isBookStatus(status)).toBe(true);
    }
  });

  it("rejects values outside the contract", () => {
    // 'finished' is a frontmatter *key*, never a status value — an easy thing
    // for a hand-edited note to get wrong.
    expect(isBookStatus("finished")).toBe(false);
    expect(isBookStatus("READ")).toBe(false);
    expect(isBookStatus(undefined)).toBe(false);
    expect(isBookStatus(null)).toBe(false);
    expect(isBookStatus(3)).toBe(false);
  });

  it("defaults a note with no status to read", () => {
    expect(DEFAULT_BOOK_STATUS).toBe("read");
    expect(isBookStatus(DEFAULT_BOOK_STATUS)).toBe(true);
  });
});
