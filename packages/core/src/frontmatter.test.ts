import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNote } from "./frontmatter.ts";
import { FIXTURE_VAULT } from "./test-support.ts";

const note = (name: string): string =>
  readFileSync(join(FIXTURE_VAULT, "Library", name), "utf8");

describe("parseNote — the three outcomes", () => {
  it("parses a well-formed book", () => {
    const result = parseNote(
      note("The Tidal Engine.md"),
      "Library/The Tidal Engine.md",
    );

    expect(result.kind).toBe("book");
    if (result.kind !== "book") return;
    expect(result.record).toMatchObject({
      title: "The Tidal Engine",
      author: "Marisol Vane",
      isbn: "9781000000016",
      status: "read",
      finished: "2024-03-12",
      rating: 5,
      pages: 328,
      cover: "covers/the-tidal-engine.png",
    });
    expect(result.record.tags).toEqual(["engineering", "nonfiction"]);
  });

  it("flags unparseable YAML as invalid rather than throwing", () => {
    const result = parseNote(
      note("The Undelivered Manuscript.md"),
      "Library/The Undelivered Manuscript.md",
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.reason).toMatch(/unparseable frontmatter/);
  });

  it("flags a book with no title as invalid", () => {
    const result = parseNote(
      note("Untitled Import.md"),
      "Library/Untitled Import.md",
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.reason).toBe("missing required key: title");
  });

  it("treats a non-book note as not-a-book, NOT as invalid", () => {
    // The distinction is the whole point: `not-a-book` is silent, `invalid`
    // warns. Getting this wrong makes every ordinary note in a vault shout.
    expect(parseNote(note("On Reading Slowly.md"), "x").kind).toBe(
      "not-a-book",
    );
    expect(parseNote("no frontmatter here at all", "x").kind).toBe(
      "not-a-book",
    );
  });
});

describe("parseNote — hand-edited notes are first-class", () => {
  it("tolerates reordered keys and extra keys outside the contract", () => {
    const result = parseNote(
      note("Lantern Work.md"),
      "Library/Lantern Work.md",
    );

    expect(result.kind).toBe("book");
    if (result.kind !== "book") return;
    // `type` is the fourth key in this file and `title` the second.
    expect(result.record.title).toBe("Lantern Work: Notes on Craft");
    expect(result.record.status).toBe("reading");
    expect(result.record.finished).toBeUndefined();
  });

  it("keeps a book whose only identifier is an out-of-contract asin", () => {
    const result = parseNote(
      note("Nine Ways of Seeing a Warehouse.md"),
      "Library/Nine Ways of Seeing a Warehouse.md",
    );

    expect(result.kind).toBe("book");
    if (result.kind !== "book") return;
    expect(result.record.isbn).toBeUndefined();
    expect(result.record.author).toContain("Ada Whitlock");
  });

  it("defaults a missing status to read, and falls back on an unknown one", () => {
    const base = "---\ntype: book\ntitle: X\n";
    expect(pick(parseNote(`${base}---\n`, "x")).status).toBe("read");
    expect(pick(parseNote(`${base}status: half-read\n---\n`, "x")).status).toBe(
      "read",
    );
    expect(pick(parseNote(`${base}status: READING\n---\n`, "x")).status).toBe(
      "reading",
    );
  });

  it("accepts an unquoted numeric isbn, which YAML reads as a number", () => {
    const result = parseNote(
      "---\ntype: book\ntitle: X\nisbn: 9781000000016\n---\n",
      "x",
    );
    expect(pick(result).isbn).toBe("9781000000016");
  });

  it("reads face_out as a tri-state, so it can override status either way", () => {
    const base = "---\ntype: book\ntitle: X\n";
    // Unset means "decide from status" — the shelf, not the parser, owns that.
    expect(pick(parseNote(`${base}---\n`, "x")).faceOut).toBeUndefined();
    expect(pick(parseNote(`${base}face_out: true\n---\n`, "x")).faceOut).toBe(
      true,
    );
    expect(pick(parseNote(`${base}face_out: false\n---\n`, "x")).faceOut).toBe(
      false,
    );
    // Hand-typed quoting should not change the meaning.
    expect(pick(parseNote(`${base}face_out: "true"\n---\n`, "x")).faceOut).toBe(
      true,
    );
    expect(pick(parseNote(`${base}face_out: yes\n---\n`, "x")).faceOut).toBe(
      true,
    );
    expect(
      pick(parseNote(`${base}face_out: maybe\n---\n`, "x")).faceOut,
    ).toBeUndefined();
  });

  it("reads shelf_order, including negatives", () => {
    const base = "---\ntype: book\ntitle: X\n";
    expect(pick(parseNote(`${base}---\n`, "x")).shelfOrder).toBeUndefined();
    expect(
      pick(parseNote(`${base}shelf_order: 3\n---\n`, "x")).shelfOrder,
    ).toBe(3);
    // Negative is legitimate: it is how you push a book in front of everything.
    expect(
      pick(parseNote(`${base}shelf_order: -1\n---\n`, "x")).shelfOrder,
    ).toBe(-1);
    expect(
      pick(parseNote(`${base}shelf_order: "2"\n---\n`, "x")).shelfOrder,
    ).toBe(2);
    expect(
      pick(parseNote(`${base}shelf_order: soon\n---\n`, "x")).shelfOrder,
    ).toBeUndefined();
  });

  it("discards a rating outside 1–5 instead of rejecting the book", () => {
    expect(
      pick(parseNote("---\ntype: book\ntitle: X\nrating: 9\n---\n", "x"))
        .rating,
    ).toBeUndefined();
    expect(
      pick(parseNote("---\ntype: book\ntitle: X\nrating: 4\n---\n", "x"))
        .rating,
    ).toBe(4);
  });
});

describe("binding, which is declared or it is nothing", () => {
  const withBinding = (line: string): ReturnType<typeof parseNote> =>
    parseNote(
      `---\ntype: book\ntitle: A Book\n${line}\n---\n\nA body.\n`,
      "binding.md",
    );

  const bindingOf = (line: string): unknown => {
    const parsed = withBinding(line);
    return parsed.kind === "book" ? parsed.record.binding : "not a book";
  };

  it("reads both values, and is not case-sensitive about them", () => {
    expect(bindingOf("binding: paperback")).toBe("paperback");
    expect(bindingOf("binding: hardback")).toBe("hardback");
    expect(bindingOf("binding: Paperback")).toBe("paperback");
  });

  it("drops an unrecognised value rather than keeping it", () => {
    // `cover_source`'s rule: a typo must not read as a permission, and here it
    // must not read as a *declaration* either. Dropping routes the book back to
    // the shelf's hash, which is the honest answer — nobody has said.
    expect(bindingOf("binding: hardcover")).toBeUndefined();
    expect(bindingOf("binding: true")).toBeUndefined();
    expect(bindingOf('binding: ""')).toBeUndefined();
  });

  it("leaves the key absent rather than defaulting to a binding", () => {
    // The fail-closed property, and it is structural: there is no default value
    // for a missing key to fall into, so no absent key can flatten a shelf into
    // one format. A `?? 'hardback'` anywhere on this path would turn this green
    // test red, which is the point of asserting the *absence*.
    expect(bindingOf("author: Someone")).toBeUndefined();
  });

  it("does not reject the book over a bad binding", () => {
    // Invariant 3: one unreadable optional key is not worth losing a book for.
    expect(withBinding("binding: leatherbound").kind).toBe("book");
  });
});

describe("parseNote — note bodies never escape (invariant 2)", () => {
  it("has no field carrying body text, whatever the body contains", () => {
    const source = note("The Tidal Engine.md");
    expect(source).toContain("NOTE_BODY_CANARY_do_not_ship");

    const result = parseNote(source, "Library/The Tidal Engine.md");
    expect(JSON.stringify(result)).not.toContain(
      "NOTE_BODY_CANARY_do_not_ship",
    );
    expect(JSON.stringify(result)).not.toContain("estuary turbines");
  });

  it("does not treat a --- inside the body as a second frontmatter block", () => {
    const source =
      "---\ntype: book\ntitle: X\n---\n\nbody\n\n---\n\nsecret: leaked\n";
    const result = parseNote(source, "x");
    expect(JSON.stringify(result)).not.toContain("leaked");
  });
});

describe("private, which fails closed", () => {
  const withPrivate = (value: string): ReturnType<typeof parseNote> =>
    parseNote(
      `---\ntype: book\ntitle: A Book\nprivate: ${value}\n---\n\nbody\n`,
      "p.md",
    );

  it("holds a book back for anything that is not clearly a no", () => {
    // `yes` is a *string* under YAML 1.2, not a boolean. A strict boolean check
    // would drop it and publish the book — which is the one mistake someone
    // typing `yes` would never expect to be making.
    for (const value of ["true", "yes", "Yes", "on", "1", "please"]) {
      expect(pick(withPrivate(value)).private, `private: ${value}`).toBe(true);
    }
  });

  it("publishes only when the answer is clearly no, or the key is absent", () => {
    for (const value of ["false", "no", "off", "0", ""]) {
      expect(
        pick(withPrivate(value)).private,
        `private: ${value}`,
      ).toBeUndefined();
    }
    expect(
      pick(parseNote("---\ntype: book\ntitle: A Book\n---\n\nbody\n", "p.md"))
        .private,
    ).toBeUndefined();
  });

  it("never lets a malformed value publish a book by accident", () => {
    // The asymmetry stated as a property: wrongly private is a missing spine,
    // wrongly public is not undoable. So no input may turn a stated `private`
    // into a published book.
    for (const value of ["tru", "TRUE", "y", "  true  ", "[]", "{}"]) {
      expect(pick(withPrivate(value)).private, `private: ${value}`).toBe(true);
    }
  });
});

function pick(result: ReturnType<typeof parseNote>) {
  if (result.kind !== "book")
    throw new Error(`expected a book, got ${result.kind}`);
  return result.record;
}
