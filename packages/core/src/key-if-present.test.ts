import { describe, expect, it } from "vitest";
import { keyIfPresent } from "./key-if-present.ts";

/**
 * The one thing this helper does that `{ key: value }` does not.
 *
 * Every assertion below is a way of asking "is the key there", and the answer
 * has to be no — not "there, holding `undefined`". That distinction is the
 * whole reason six copies of this function existed rather than nobody
 * bothering: `Object.keys` lists a key set to `undefined`, `in` reports it
 * present, and spreading carries it forward into whatever it lands in.
 *
 * So this file is the spec that goes red the moment somebody "simplifies" the
 * helper into direct assignment. Nothing else would: assigning `undefined`
 * deep-equals omitting it under most matchers, which is exactly why the
 * simplification looks safe right up until `library.json` grows a column of
 * `"author": null` or a `FrontmatterChanges` deletes a key from a note. See
 * `CONTEXT.md`, **Removal**, for the second one.
 */

const BASE = { title: "The Tidal Engine" } as const;

describe("keyIfPresent", () => {
  it("contributes the key when the value is there", () => {
    expect(keyIfPresent("author", "M. Okonkwo")).toEqual({
      author: "M. Okonkwo",
    });
  });

  it("contributes nothing when the value is absent", () => {
    expect(keyIfPresent("author", undefined)).toEqual({});
  });

  describe("absent means the key is not there, not that it holds undefined", () => {
    it("is not listed by Object.keys", () => {
      expect(Object.keys(keyIfPresent("author", undefined))).toEqual([]);
    });

    it("is not reported present by `in`", () => {
      expect("author" in keyIfPresent("author", undefined)).toBe(false);
    });

    it("is not carried forward by a spread", () => {
      const spread = { ...BASE, ...keyIfPresent("author", undefined) };
      expect(spread).not.toHaveProperty("author");
      expect(Object.keys(spread)).toEqual(["title"]);
    });
  });

  it("does not disturb a key the target already has", () => {
    const spread = { ...BASE, ...keyIfPresent("title", undefined) };
    expect(spread.title).toBe("The Tidal Engine");
  });

  it("overwrites when the value is there, which is the point of spreading it last", () => {
    expect({ ...BASE, ...keyIfPresent("title", "Ember Protocol") }).toEqual({
      title: "Ember Protocol",
    });
  });

  /**
   * `0`, `''` and `false` are values. The guard is `=== undefined` and not a
   * truthiness check, which matters for `shelf_order: 0` — a real pin, and the
   * first one — and for `face_out: false`, which is a deliberate "no" rather
   * than a missing answer.
   */
  it.each([
    ["zero", "shelf_order", 0],
    ["the empty string", "author", ""],
    ["false", "face_out", false],
  ])("treats %s as present", (_label, key, value) => {
    expect(keyIfPresent(key, value)).toEqual({ [key]: value });
    expect(key in keyIfPresent(key, value)).toBe(true);
  });
});
