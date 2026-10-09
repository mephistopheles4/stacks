# ADR-0100 — The Thoughts section is read by one adapter method, and both builds ship the same notes

**Date:** 2026-10-09
**Status:** accepted, not built — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md)
**Issue:** [#366](https://github.com/mephistopheles4/stacks/issues/366), [#372](https://github.com/mephistopheles4/stacks/issues/372)

## Decision

`VaultAdapter` gains a seventh method, shaped like
`readPublicSection(sourcePath)`. It reads one note, finds its `## Thoughts`
section, and returns that section as plain paragraphs, or nothing. **It is the
only method that reads below the frontmatter**, as `insertBodySection` is the
only one that writes there.

- **Only the publisher calls it.** It is never a `BookRecord` field, so
  `library.json` cannot carry the text by construction: the type has nowhere
  to put it.
- **The rest of the body never leaves the adapter.** The method returns the
  matched section and nothing else, so no code downstream ever holds the
  private remainder.
- **One extractor, both builds.** A local build emits the same
  `notes/<id>.json` files as a public one, for the same books: those a public
  build would publish. You see what a visitor sees.
- **The section boundary fails closed.** Exact, case-sensitive `## Thoughts`;
  it ends at the next `#` or `##` heading or the end of the file; a `#` inside a
  code fence is not a heading; two `## Thoughts` headings ship nothing.
  Headings are recognised as broadly as CommonMark's ATX rule allows, and fence
  and comment state are computed from the start of the body, so matching wide
  can only end a section early. A fence still open at the section's end, a
  setext heading, or a comment open across the heading withholds the section:
  each is a shape where the boundary could otherwise run on into the private
  remainder.

## Why in the adapter

[ADR-0014](0014-invariant-2-splits.md) already said the extraction happens in
the adapter, and why: a filter applied downstream makes any bug in the chain a
leak, while an adapter that never returns the remainder leaves nothing to leak.
This record makes that a contract: a named method with one caller.

## Why both builds ship the same notes

A local build that showed more than a public one would let the owner judge the
shelf on text a visitor never sees. It would also make the split gate assert
opposite things in its two halves, and leave a local staging folder holding the
one kind of file the inspector cannot tell apart from a leak.

**The cost:** a `private: true` book's Thoughts appear on no shelf, the
owner's own included. Private still means "not published", and the book still
stands on a local shelf; picking it up shows its card's lines.

## Alternatives rejected

- **Return the body from `listBooks` and filter it in the publisher.** The
  leak-anywhere-in-the-chain shape ADR-0014 rejected.
- **A frontmatter key or a `BookRecord` field.** Puts note text one
  `keyIfPresent` away from `library.json`.
- **A local build that ships every book's Thoughts, private ones included.**
  See above.

## Consequences

- AGENTS.md's adapter contract block gains the method in the commit that
  builds it, never before.
- G1 (`adapter-boundary`) keeps holding the rule that only `adapters/` reads the
  vault.
- G2 (`public-build`) asserts the split in both build modes.
