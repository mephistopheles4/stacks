# Provider marks

Three monotone glyphs, one per linkable provider, drawn to sit at ~22px in the
book card's links row.

## What these are, precisely

**Redrawn monotone silhouettes, not the providers' published artwork.** Each is
a single `<path>` on a 24×24 viewBox with `fill="currentColor"`, so the row
inherits the card's own colour and every mark weighs the same on the page.

That is a deliberate departure from what [ADR-0048](../../../../../docs/adr/0048-google-attribution-is-a-vendored-page-element.md)
and the mark research assumed, and it is worth being exact about which way it
cuts:

- **The published grants are for the artwork as published.** Apple's guidance is
  to use its approved asset unmodified; Google's says _"Do not change any of the
  Google marks in any way."_ A monotone recolour is a modification, so these do
  not sit inside those specific grants.
- **They are also not redistributions of anybody's file.** The unsettled
  question the map recorded — every grant found is permission to _use_ artwork
  and silent about _redistributing_ it — does not arise for a glyph drawn here.

So this trades a trademark-usage question for a trademark-_form_ question, on
the owner's instruction and with the reasoning on the record rather than in
somebody's memory. The fallback, if either provider ever objects, is the one
[#98](https://github.com/mephistopheles4/stacks/issues/98) already named: text
links, which discharge Google's per-result obligation just as well.

## One consequence that is not cosmetic

`apple-books.svg` is the **Apple logo silhouette**. [#106](https://github.com/mephistopheles4/stacks/issues/106)
dropped _"The Apple logo is a trademark of Apple Inc., registered in the U.S. and
other countries."_ from the attribution route on the grounds that §7.1 says to
list only the trademarks actually used, and the card had locked the _icon_ rather
than the badge — and it attached the condition in as many words: **"if the
vendored icon artwork turns out to carry the Apple logo, that sentence
returns."** It does, so it has.

## What was fetched, and what was not

|                                                              |                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `books.google.com/googlebooks/images/poweredby.png`          | **200, 62×30, 3441 bytes** — vendored **unaltered** at `packages/site/public/poweredby-google.png`. ⚠️ The spec assumed 144×26; that figure was a guess and this is the measurement. |
| `openlibrary.org/static/images/openlibrary-logo-tighter.svg` | 200, 7.7 KB — their full lockup at 4:1, a wordmark plus an illustration. Unusable as a 22px mark and not shipped.                                                                    |
| Apple Books icon                                             | **404** at every path tried. Apple publishes its assets behind a marketing-resources flow rather than at a stable URL.                                                               |

⚠️ **Google's powered-by image is dark on transparent** — 554 of its 613 opaque
pixels — so it is invisible on a page whose background is `#1a1613`, and no
light variant exists at `poweredby_lt.png` or its obvious siblings. It therefore
sits on a small light plate: the image is displayed unmodified, which is what
the terms ask, and the surface under it is ours to choose.
