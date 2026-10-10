# ADR-0101 — Thoughts ship as plain paragraphs stripped by hand, and anything hidden withholds the whole section

**Date:** 2026-10-09
**Status:** accepted, built in [#411](https://github.com/mephistopheles4/stacks/issues/411); amended by [ADR-0106](0106-thoughts-ship-only-plain-prose.md) and [ADR-0107](0107-thoughts-are-read-by-a-commonmark-parser.md) — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md)
**Issue:** [#368](https://github.com/mephistopheles4/stacks/issues/368)

## Decision

The extractor turns a `## Thoughts` section into a list of plain-text
paragraphs, written to `notes/<id>.json` as `{ "paragraphs": [...] }`. It
strips Markdown **by hand**, the way `remove-markdown` does, with no new
dependency and no HTML at any stage. The page sets every string through
`textContent`.

**It withholds the whole section, with a warning naming the note, when the
section holds anything Obsidian hides or the extractor cannot vouch for:**

- an embed, `![[…]]`;
- a `%%` or a `<!--` anywhere, fenced or not, closed or not, or a comment
  already open where the section starts;
- a second `## Thoughts` heading in the note;
- more than 8,000 Unicode code points of raw section text (#368 said "about
  8,000"; the spec pins it, and the published file's own cap at 40,000 bytes);
- any HTML tag-shaped sequence, or a link reference definition line;
- any URL scheme left after links flatten to their display text.

The full rule list, and the unit test each rule gets, is on
[#368](https://github.com/mephistopheles4/stacks/issues/368), with the
additions the spec's security review made in
[§3.1](../spec/picking-a-book-up.md#31-the-notesidjson-schema). **One of them
replaces a #368 rule:** #368 stripped HTML tags and kept the text between them;
raw HTML can hide text in reading view, so a tag now withholds. #368 counted no
HTML in the real vault, so this costs nothing today.

**A withheld section's earlier file does not survive.** The publisher prunes
`notes/` to exactly the files each build wrote, so withdrawing or withholding a
section takes it off the site at the next deploy.

## Why withhold rather than strip

Each of those is a place where a strip that is slightly wrong publishes text
the owner never saw on screen: a `%%comment%%` is invisible in Obsidian, and an
embed names a file in the vault. Withholding fails closed. A section that does
not appear is a gap the owner notices locally from the warning; a section that
appears with a private aside in it is on a URL that may already be shared.

The cap withholds rather than cuts for the same reason: a cut would publish
part of a thought without saying so.

## Why by hand

The adapter already scans lines by hand for the boundary and the code fences.
No Markdown library knows `%%`, callouts or block ids, so hand code is needed
for those regardless. And the owner prefers fewer dependencies, for a smaller
security surface.

## Alternatives rejected

- **Render to HTML and sanitise it.** A dependency and an `innerHTML`, which the
  card has avoided on purpose. If formatting ever earns its keep, it arrives as
  typed data built with `createElement`, never as HTML.
- **`remove-markdown` itself.** It handles none of Obsidian's extras.
- **Strip the hidden parts and ship the rest.** Publishes whatever the strip
  gets wrong.

## Consequences

- A section is all or nothing on the page. The page never shows part of one.
- The inspector's `notes-shape` rule holds the published file to exactly this
  shape and a byte cap, so a bug that bypassed the extractor's cap still fails
  the build.
