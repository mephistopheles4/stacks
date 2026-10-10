# ADR-0105 — A cover has a shelf tier and a held tier

**Date:** 2026-10-09
**Status:** accepted; the held stage and its gates built in [#412](https://github.com/mephistopheles4/stacks/issues/412), the pickup's swap not yet — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md)
**Issue:** [#377](https://github.com/mephistopheles4/stacks/issues/377)
**Amends:** [ADR-0015](0015-cover-texture-budget.md)

## Decision

ADR-0015's 512 px cap is the **shelf tier**, not a permanent policy. A second,
**held tier** exists for the one book in your hand.

| | Shelf tier | Held tier |
| --- | --- | --- |
| Cap | 512 px long edge (`MAX_COVER_EDGE`) | 1200 px long edge |
| Which books | every book with a cover | a book whose vault cover is larger than 512 px |
| When it uploads | before the first frame | on pickup, decoded off the main thread |
| Lifetime | the page | until put-down |
| Where it is staged | `covers/` | `held-covers/`, a sibling |
| How the page knows | `cover` | `heldCover`, absent when there is none |

- **The held copy comes from the vault file only.** A build never fetches a
  cover (invariant 1).
- **Every held copy is re-encoded through sharp**, even one already inside
  1200 px. #377 had that case copied byte for byte; the spec's security review
  replaced it, because a cover the owner photographed can carry camera metadata,
  location included, and sharp drops it by default. `gate:public` refuses a held
  file that carries EXIF or XMP.
- **The inspector holds `heldCover` as it holds `cover`**: same-origin, one
  segment under `held-covers/`, and no file there that no book names. A
  revalidating `_headers` block keeps a cover taken down from lingering in
  browsers.
- **No held copy is made for a cover of 512 px or less**: `stageCover`'s rule,
  never enlarge a small cover.
- **The shelf texture shows until the held copy has decoded**, then swaps in.
- **The other covers stay resident during a pickup.** Releasing them waits for
  G15 (`cover-budget`) to go red, which is where ADR-0015 already says lazy
  upload is the fix.
- **`gate:public` is extended before the staging code lands:** no held file for
  a private or wishlist book, and none above the cap.

## Why 1200 px

#369 measured a 342×512 cover drawn 1192 device pixels tall on a phone at the
shipped pixel-ratio cap of 2: a 2.33× upscale, with small type visibly soft.
About 1200 px draws 1:1 there. A vault original of up to 2400 px is about 30 MB
decoded, which no budget counts.

## Why release waits

ADR-0015's own log found that the covers were not the cause of the mobile
crash, and [ADR-0090](0090-real-time-shadows-are-the-default.md) traced the later
context loss to shadow-map sampling. One held texture adds about 5 MB to a
shelf of about 60 MB of covers. Building release now would answer a problem
nothing is showing.

## Why a sibling folder

G15 measures what lands in `covers/`, and would count every held copy against
the shelf's budget. `pruneCovers`, `withLocalCovers` and the `orphan-cover`
rule all read that folder too. A sibling touches none of them.

## Consequences

- A second published file per book with large art. `dist/` grows by an
  estimated 10 MB today, not measured.
- GPU memory for the held tier is one texture at any library size.
- The card's enlarged-cover viewer shows the held copy when one exists; a DOM
  image costs no GPU memory.
- Sixteen of the owner's 54 covers are 512 px or less and stay at shelf
  quality. A hand-run pass to find larger art is
  [#408](https://github.com/mephistopheles4/stacks/issues/408).
