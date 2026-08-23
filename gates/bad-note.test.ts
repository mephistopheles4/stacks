/**
 * G3 — never crash on a bad note (invariant 3).
 *
 * "Malformed frontmatter → skip with a console warning listing the file. One
 * bad file must not break `stacks build`." The failure this guards against is
 * not a wrong answer, it is a *stopped build*: one hand-mangled note in a vault
 * of hundreds taking the whole library down, and the owner with no idea which
 * file did it.
 *
 * The corpus below is the set of things that have actually turned up in, or
 * plausibly turn up in, a real Obsidian vault — a note saved empty, a `.md`
 * that is really binary, a fence someone deleted half of, a key pasted twice.
 *
 * Every case states the `kind` it expects, not merely "did not throw". A gate
 * that only checked for the absence of an exception would stay green if
 * `parseNote` were rewritten to return `not-a-book` unconditionally, which
 * would empty the shelf in perfect silence — the exact shape of failure this
 * project keeps finding. The final test then asserts the corpus reaches all
 * three kinds, so the property survives someone pruning a case later.
 *
 * See docs/gates.md, row G3 (bad-note).
 */

import { describe, expect, it } from "vitest";
import {
  parseNote,
  type ParsedNote,
} from "../packages/core/src/frontmatter.ts";
import { expectFound } from "./repo.ts";

/**
 * A real PNG header put through `toString('utf8')` — how a `.md` that is
 * secretly an image arrives, since the adapter reads every file as UTF-8. Typed
 * escape soup would test an input the real path cannot produce.
 */
const BINARY = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff,
  0xfe, 0x00, 0x01,
]).toString("utf8");

interface Hostile {
  readonly name: string;
  readonly source: string;
  readonly expected: ParsedNote["kind"];
  readonly why: string;
}

const CORPUS: readonly Hostile[] = [
  {
    name: "an empty file",
    source: "",
    expected: "not-a-book",
    why: "no frontmatter, so it is an ordinary note and not a broken book",
  },
  {
    name: "raw binary bytes",
    source: BINARY,
    expected: "not-a-book",
    why: "nothing resembling a fence; must not reach the YAML parser at all",
  },
  {
    name: "a note with no frontmatter",
    source:
      "# Reading log\n\nSome prose, a [[wikilink]], and no fence in sight.\n",
    expected: "not-a-book",
    why: "the ordinary case — a vault is mostly these, and warning would cry wolf",
  },
  {
    name: "unterminated frontmatter",
    // NOTE: this reads as `not-a-book`, not `invalid`, because FRONTMATTER_BLOCK
    // requires a closing fence and so never matches. There is a defensible
    // argument that a file opening with `---` and `type: book` is a *malformed
    // book* and should be warned about by name rather than dropped in silence.
    // Asserted as it behaves, deliberately: G3's remit is crashes, and this is
    // not one. The asymmetry is a finding for the owner, not something to widen
    // the parser over from inside a gate.
    source:
      "---\ntype: book\ntitle: The Half-Closed Fence\nauthor: Marisol Vane\n\nBody text.\n",
    expected: "not-a-book",
    why: "no closing fence, so no frontmatter block matches",
  },
  {
    name: "frontmatter that is a YAML list, not a map",
    source:
      "---\n- type: book\n- title: A Sequence Where A Map Belongs\n---\n\nBody.\n",
    expected: "not-a-book",
    why: "parses fine as YAML but has no keys, so it cannot claim to be a book",
  },
  {
    name: "a duplicate frontmatter key",
    // yaml v2 refuses this outright ("Map keys must be unique"); parseNote
    // catches the throw and reports it. Measured, not assumed — last-wins would
    // have been an equally plausible library choice and a different expectation.
    source: "---\ntype: book\ntitle: First\ntitle: Second\n---\n\nBody.\n",
    expected: "invalid",
    why: "it claims to be a book and cannot be read, so it earns a warning by name",
  },
  {
    name: "a very long single line",
    source: `---\ntype: book\ntitle: ${"x".repeat(200_000)}\n---\n\nBody.\n`,
    expected: "book",
    // A pathological line is where a backtracking regex goes quadratic and the
    // build appears to hang. FRONTMATTER_BLOCK is lazy and linear, so this is
    // an ordinary book — and asserting `book` rather than "did not throw" is
    // what keeps this case from being satisfiable by a blanket `not-a-book`.
    why: "length is not malformity; it must still shelve",
  },
  {
    name: "a present but empty title",
    source: '---\ntype: book\ntitle: ""\n---\n\nBody.\n',
    expected: "invalid",
    why: "an untitled book has nothing to render on a spine",
  },
  {
    name: "type: book and nothing else",
    source: "---\ntype: book\n---\n\nBody.\n",
    expected: "invalid",
    why: "title is the only other required key; its absence is the canonical bad note",
  },
];

describe("G3 — never crash on a bad note", () => {
  for (const { name, source, expected, why } of CORPUS) {
    it(`returns ${expected} for ${name}`, () => {
      let parsed: ParsedNote;
      try {
        parsed = parseNote(source, `hostile/${name}.md`);
      } catch (error) {
        // Invariant 3 in one line: one bad file must not break `stacks build`.
        throw new Error(
          `parseNote threw on ${name} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      expect(parsed.kind, why).toBe(expected);

      if (parsed.kind === "invalid") {
        // "skip with a console warning listing the file" — the adapter builds
        // that warning out of `reason`, and an empty one is unactionable.
        expect(
          parsed.reason.length,
          "an invalid note must say why",
        ).toBeGreaterThan(0);
      }
    });
  }

  it("covers all three outcomes, so no single blanket answer satisfies the corpus", () => {
    // Without this the "state the kind explicitly" discipline is an accident of
    // which cases happen to be in the list: prune the two `invalid` rows and a
    // parser returning `not-a-book` for everything passes again.
    const kinds = new Set(CORPUS.map((entry) => entry.expected));
    expectFound(
      [...kinds],
      "distinct ParsedNote kinds exercised by the corpus",
      3,
    );
    expect([...kinds].sort()).toEqual(["book", "invalid", "not-a-book"]);
  });
});
