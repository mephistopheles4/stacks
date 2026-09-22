# ADR-0086 — G29 slugs headings with `github-slugger`, not an imitation of it

**Date:** 2026-09-22
**Status:** accepted
**Ticket:** [#361](https://github.com/mephistopheles4/stacks/issues/361)

## Decision

`github-slugger` is added as an exact-pinned root devDependency, at `2.0.0`, and
G29 (`gates/doc-links.test.ts`) uses it to turn a heading into its anchor — one
slugger per document, so a repeated heading gets GitHub's `-1`, `-2` suffix.

The gate keeps one step of its own: turning a Markdown heading into the text
GitHub renders before slugging it. A link keeps its text; a code span loses its
backticks and keeps its content.

## Why a dependency and not a corrected copy

**The copy was wrong where it looked right.** The hand-kept slug collapsed runs
of spaces, trimmed, and stripped `_`. Run over every heading in the tracked
Markdown, it disagreed with `github-slugger` on **228 of 1241**. Six links in
`docs/spec/README.md` were green under G29 and dead on GitHub.

**The character class cannot be copied by hand.** `github-slugger` drops
characters by a generated regular expression over Unicode categories. The
nearest hand-written class, `[^\p{L}\p{M}\p{Nd}\p{Pc} -]`, still disagrees with
it on 254 code points — code points newer than the library's Unicode table. None
occurs in this repository, but a copy that is exact today is exact only until
somebody writes the next heading.

**It adds no new code to the install.** Astro already resolves
`github-slugger@2.0.0`, so declaring it adds three lockfile lines and no tarball.
It is declared anyway: pnpm does not let `gates/` import a package it does not
declare.

## Cost

- **The version is Astro's today and ours from now on.** If Astro moves to a
  new major, two versions can sit in the tree until this pin follows it. That is
  a visible lockfile entry, not a silent failure.
- **`github-slugger` is the library that defines GitHub's anchors, not GitHub
  itself.** If github.com diverges from it, G29 follows the library. That is the
  best reference available without a network call, which G21 forbids.
