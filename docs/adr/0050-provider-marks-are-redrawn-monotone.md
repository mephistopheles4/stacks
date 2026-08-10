# The provider marks are redrawn monotone glyphs, not the providers' artwork

The card's links row draws three single-path SVGs on a 24×24 viewBox with
`fill="currentColor"`, in `packages/site/src/assets/provider-marks/`. Google's
*powered by Google* graphic is different and is vendored **unaltered**.

## What this trades away, and what it buys

The mark research found grants for two of the three, and both are grants for the
artwork **as published**: Apple's guidance is to use its approved asset
unmodified, and Google's says *"Do not change any of the Google marks in any
way."* A monotone recolour is a modification, so these glyphs do not sit inside
those specific grants. What they do sit inside is the general-tolerance argument
[#98](https://github.com/mephistopheles4/stacks/issues/98) already used for Open
Library, which publishes no guideline at all: an outbound row that sends traffic
*to* the mark's owner is an ordinary pattern, and published guidelines are
written to preserve options rather than to describe enforcement.

It also **disposes of a question rather than only moving one**. The residual the
map recorded — every grant found is permission to *use* artwork and silent about
*redistributing* it — does not arise for a glyph drawn here. So this is a
trademark-*form* question in place of a trademark-*redistribution* question, not
one stacked on the other.

**Owner's decision** — *"i dont see risk in using the logos. i want monotone
svgs"* — taken with the above put to them. The fallback if either provider ever
objects is the one #98 already named and costed: text links, which discharge
Google's per-result obligation just as well.

## Why monotone is also the better design here

Three provider logos in three brand palettes, at 22px, on a near-black card
whose whole palette is two creams and a brown, would be the loudest thing on the
card — and the row is meant to be its quietest. `currentColor` makes the marks
inherit the card's own colour and its hover state for free, and it is what the
row was measured at.

⚠️ **Neutral house glyphs remain rejected**, and this is not them: a generic
glyph cannot say *which* provider without a tooltip, and a tooltip never fires
on touch. These are recognisably the three providers.

## The consequence that is not cosmetic

`apple-books.svg` is the **Apple logo silhouette**.
[#106](https://github.com/mephistopheles4/stacks/issues/106) dropped *"The Apple
logo is a trademark of Apple Inc., registered in the U.S. and other
countries."* from `/attribution` because the card had locked the *icon*, and it
attached the condition in as many words: *"If the vendored icon artwork turns out
to carry the Apple logo, that sentence returns; that is a check on the asset, not
a reopened decision."* It does. The route carries both sentences.

## Google's graphic is the exception, and it needed a plate

Vendored byte-for-byte from `books.google.com/googlebooks/images/poweredby.png`,
because the clause says *graphic* and *"do not change any of the Google marks"*
is unambiguous for the one asset Google actually requires you to display.

Two measurements the spec had guessed at:

- **62×30**, not the assumed 144×26.
- **Dark on transparent** — 554 of its 613 opaque pixels — so it is invisible on
  a `#1a1613` page, and no light variant exists at `poweredby_lt.png` or its
  obvious siblings.

So it sits on a quiet cream plate. The image is displayed exactly as served,
which is what the terms ask; the surface beneath it is ours. ⚠️ It is also **not
`loading="lazy"`** — deferring a graphic whose premise is *always displayed* is a
smaller version of the hotlinking failure [ADR-0048](0048-google-attribution-is-a-vendored-page-element.md)
rejected.

## How this was decided

Instructed by the owner while reviewing [PR #107](https://github.com/mephistopheles4/stacks/pull/107),
after [ADR-0048](0048-google-attribution-is-a-vendored-page-element.md) had
shipped placeholders and named fetching the artwork as their call. Apple's icon
was **404 at every URL tried** — Apple publishes assets behind a marketing-resources
flow rather than at a stable one — and Open Library's own SVG is a 4:1 lockup of
wordmark plus illustration, unusable at 22px. Both are recorded in
`packages/site/src/assets/provider-marks/README.md`.
