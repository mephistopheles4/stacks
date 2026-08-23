/**
 * G10 — one cover-path rule, one implementation.
 *
 * Every case here is written so it asserts the same thing on Windows and on
 * Linux. That is the whole point: the defect this replaces was a guard that
 * happened to be correct on the platform CI would have run it on, and wrong on
 * the platform the owner uses. A test using the host's own separator would have
 * agreed with the bug.
 *
 * See docs/gates.md, row G10 (cover-path).
 */

import { describe, expect, it } from "vitest";
import { resolve, sep } from "node:path";
import { coverFileName, resolveCoverPath } from "./cover-path.ts";

const COVER_DIR = resolve("vault", "Library", "covers");

describe("coverFileName", () => {
  it("keeps a plain filename", () => {
    expect(coverFileName("the-tidal-engine.png")).toBe("the-tidal-engine.png");
  });

  it("takes the last segment of a posix path", () => {
    expect(coverFileName("covers/the-tidal-engine.png")).toBe(
      "the-tidal-engine.png",
    );
  });

  it("takes the last segment of a windows path", () => {
    // The case the old hand-rolled `split('/')` returned whole.
    expect(coverFileName("covers\\the-tidal-engine.png")).toBe(
      "the-tidal-engine.png",
    );
  });

  it("strips a traversal written with either separator", () => {
    expect(coverFileName("../../../secrets.png")).toBe("secrets.png");
    expect(coverFileName("..\\..\\..\\secrets.png")).toBe("secrets.png");
    expect(coverFileName("../mixed\\separators/secrets.png")).toBe(
      "secrets.png",
    );
  });

  it("refuses a value that is only a directory reference", () => {
    for (const value of [
      "",
      ".",
      "..",
      "   ",
      "covers/",
      "covers\\",
      "covers/..",
    ]) {
      expect(
        coverFileName(value),
        `\`cover: ${value}\` has no usable filename`,
      ).toBe("");
    }
  });
});

describe("resolveCoverPath", () => {
  it("resolves a normal cover into the covers directory", () => {
    expect(resolveCoverPath(COVER_DIR, "covers/the-tidal-engine.png")).toBe(
      `${COVER_DIR}${sep}the-tidal-engine.png`,
    );
  });

  it("never escapes the covers directory, whatever the separator", () => {
    const hostile = [
      "../../../secrets.png",
      "..\\..\\..\\secrets.png",
      "/etc/passwd",
      "C:\\Windows\\System32\\config\\SAM",
      "....//....//secrets.png",
      "../mixed\\separators/../../secrets.png",
    ];

    for (const cover of hostile) {
      const resolved = resolveCoverPath(COVER_DIR, cover);
      if (resolved === undefined) continue; // refused outright, which is fine
      expect(
        resolved.startsWith(COVER_DIR + sep),
        `\`cover: ${cover}\` escaped to ${resolved}`,
      ).toBe(true);
    }
  });

  it("refuses rather than returning the covers directory itself", () => {
    // Returning `coverDir` unchanged would hand sharp a directory to read; the
    // failure would be swallowed by a catch and look like a missing cover.
    expect(resolveCoverPath(COVER_DIR, ".")).toBeUndefined();
    expect(resolveCoverPath(COVER_DIR, "..")).toBeUndefined();
    expect(resolveCoverPath(COVER_DIR, "")).toBeUndefined();
  });
});
