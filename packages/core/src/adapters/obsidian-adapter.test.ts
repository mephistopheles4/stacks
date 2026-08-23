import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObsidianAdapter } from "./obsidian-adapter.ts";
import { FIXTURE_VAULT } from "../test-support.ts";

const vault = new ObsidianAdapter(FIXTURE_VAULT);

describe("listBooks against the fixture vault", () => {
  let warnings: string[];
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnings = [];
    warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.join(" "));
      });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns exactly the well-formed books", async () => {
    const books = await vault.listBooks();

    // The expected outcome is documented in fixtures/README.md; if this number
    // changes, that table is what should be updated first.
    expect(books).toHaveLength(9);
    expect(books.map((b) => b.title).sort()).toEqual([
      // Held back from public builds, but the adapter reads your whole vault —
      // `private` is about publishing, not about what you can see.
      "A Book Kept Back",
      "Compilers for the Impatient: A Field Guide to Fast Iteration",
      "Lantern Work: Notes on Craft",
      "Nine Ways of Seeing a Warehouse",
      "Signal and Sediment (Riverbend Studies in Applied Ecology)",
      "The Quiet Protocol",
      "The Salt Road Ledger",
      "The Salt Road Ledger",
      "The Tidal Engine",
    ]);
  });

  it("warns about each bad note BY NAME and keeps going (invariant 3)", async () => {
    await vault.listBooks();

    expect(warnings).toHaveLength(2);
    // "skip with a console warning listing the file" — the filename is the part
    // that makes the warning actionable, so assert on it, not just on a count.
    expect(warnings.join("\n")).toContain("The Undelivered Manuscript.md");
    expect(warnings.join("\n")).toContain("Untitled Import.md");
  });

  it("says nothing at all about a note that simply is not a book", async () => {
    await vault.listBooks();
    expect(warnings.join("\n")).not.toContain("On Reading Slowly");
  });

  it("never lets a note body through (invariant 2)", async () => {
    const books = await vault.listBooks();
    expect(JSON.stringify(books)).not.toContain("NOTE_BODY_CANARY_do_not_ship");
  });

  it("returns an empty list for a vault that does not exist, rather than throwing", async () => {
    const missing = new ObsidianAdapter(
      join(tmpdir(), "stacks-does-not-exist-" + Date.now()),
    );
    await expect(missing.listBooks()).resolves.toEqual([]);
  });
});

describe("bookExists — the two dedupe paths", () => {
  it("matches on ISBN, ignoring hyphenation", async () => {
    expect(await vault.bookExists("9781000000016", "nothing like this")).toBe(
      true,
    );
    expect(
      await vault.bookExists("978-1-00-000001-6", "nothing like this"),
    ).toBe(true);
  });

  it("matches on normalised title+author when there is no shared ISBN", async () => {
    // The audiobook edition carries only an ASIN, so ISBN matching cannot see
    // it — this is the pair the title+author path exists for.
    expect(
      await vault.bookExists("", "The Salt Road Ledger Beatrix Okonkwo"),
    ).toBe(true);
    expect(
      await vault.bookExists("", "Salt Road Ledger, The — Beatrix Okonkwo"),
    ).toBe(true);
    // Surname-first, extra whitespace, no punctuation — still the same book.
    expect(
      await vault.bookExists("", "salt road ledger  okonkwo, beatrix"),
    ).toBe(true);
  });

  it("does not match a book that is not there", async () => {
    expect(
      await vault.bookExists("9789999999999", "A Book That Does Not Exist"),
    ).toBe(false);
  });
});

describe("writeBook", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "stacks-vault-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a note that parses back into the same book", async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({
      title: "A Written Book",
      author: "Test Author",
      isbn: "9781000000016",
      status: "reading",
      rating: 4,
      spineColor: "#2f6d7a",
      pages: 123,
      tags: ["one", "two"],
    });

    const source = await readFile(path, "utf8");
    expect(source).toMatch(/^---\n/);
    // Contract key names, not camelCase — the file has to stay editable in Obsidian.
    expect(source).toContain("spine_color:");
    expect(source).not.toContain("spineColor");

    const [book] = await writable.listBooks();
    expect(book).toMatchObject({
      title: "A Written Book",
      author: "Test Author",
      status: "reading",
      rating: 4,
      spineColor: "#2f6d7a",
      pages: 123,
    });
  });

  it("embeds the cover so Obsidian shows it, without that reaching library.json", async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({
      title: "Covered",
      cover: "covers/covered.jpg",
    });

    const source = await readFile(path, "utf8");
    // The wikilink resolves by filename, so it survives the file being moved.
    expect(source).toContain("![[covered.jpg]]");
    expect(source.indexOf("![[covered.jpg]]")).toBeGreaterThan(
      source.lastIndexOf("---"),
    );

    // It lives in the body, and the body is never parsed back (invariant 2).
    const [book] = await writable.listBooks();
    expect(book?.cover).toBe("covers/covered.jpg");
    expect(JSON.stringify(book)).not.toContain("![[");
  });

  it("writes no embed for a book with no cover", async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({ title: "Bare" });
    expect(await readFile(path, "utf8")).not.toContain("![[");
  });

  it("never overwrites an existing note", async () => {
    // The filename comes from the title, so a second book of the same name used
    // to land on the same path and replace the first — losing its dates, its
    // rating and everything written in the body. `stacks add --force` did this
    // silently.
    const writable = new ObsidianAdapter(dir);

    const first = await writable.writeBook({
      title: "Thinking in Systems",
      author: "Donella H. Meadows",
      rating: 5,
    });
    const second = await writable.writeBook({ title: "Thinking in Systems" });

    expect(second).not.toBe(first);
    expect(basename(second)).toBe("Thinking in Systems (2).md");

    // The original is untouched, rating and all.
    expect(await readFile(first, "utf8")).toContain("rating: 5");
    expect(await writable.listBooks()).toHaveLength(2);
  });

  it("strips characters that Windows and Obsidian reject from the filename", async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({ title: "Who? What: Why*  <Yes>" });
    // basename only — the drive letter in an absolute Windows path has a colon.
    expect(basename(path)).toBe("Who What Why Yes.md");
    expect(await readFile(path, "utf8")).toContain("Who? What: Why*  <Yes>");
  });

  it("ends a truncated filename on a real character, not a dot or a space", async () => {
    // The 120-character cap used to run *after* trailing dots were stripped, so
    // the cut could land on one and put it back. Windows will not store a name
    // ending in `.` or ` ` faithfully — it silently drops them — which is the
    // whole reason the strip exists, defeated by doing it in the wrong order.
    //
    // Found by CodeQL's js/polynomial-redos on the same line: capping the input
    // before the anchored `+` fixes the backtracking, and fixes this.
    const writable = new ObsidianAdapter(dir);

    // A distinct leading letter per case: `writeBook` never overwrites, so two
    // titles truncating to the same name would collide and the second would
    // come back with a numeric suffix — passing or failing for the wrong reason.
    for (const [lead, boundary] of [
      ["a", "."],
      ["b", " "],
    ] as const) {
      const title = `${lead}${"x".repeat(118)}${boundary}and more text past the cut`;
      const name = basename(await writable.writeBook({ title }), ".md");

      expect(name.length).toBeLessThanOrEqual(120);
      expect(
        name.endsWith("."),
        `a "${boundary}" at the cut left a trailing dot`,
      ).toBe(false);
      expect(
        name.endsWith(" "),
        `a "${boundary}" at the cut left a trailing space`,
      ).toBe(false);
      expect(name).toBe(`${lead}${"x".repeat(118)}`);
    }
  });

  it("does not hang on a title that is mostly dots", async () => {
    // js/polynomial-redos, reproduced. The old `/\.+$/` is anchored, so on a
    // string of dots that does *not* end in one, `$` never matches and the
    // engine backtracks from every starting position — quadratic. Measured on
    // this machine, before the cap:
    //
    //    10k dots → 28ms · 50k → 715ms · 100k → 3.1s · 200k → 11.7s · 400k → 47s
    //
    // The size matters, and this test had it wrong first time round: at 60k it
    // costs about a second, passed under its own threshold, and was therefore
    // green against the very code it was written to catch. 200k is the smallest
    // round number that fails unmistakably. After the cap it is 0.2ms.
    //
    // Not a security boundary — a local CLI spending its own CPU — but a title
    // arrives from a hand-edited note or a provider response, and the ceiling
    // is free.
    const writable = new ObsidianAdapter(dir);
    const started = Date.now();
    const path = await writable.writeBook({ title: `${".".repeat(200_000)}x` });

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(basename(path, ".md")).toBe("Untitled");
  });
});

describe("coverDir", () => {
  it("points inside the vault, next to the notes", () => {
    expect(vault.coverDir()).toContain("Library");
    expect(vault.coverDir()).toContain("covers");
  });
});
