# The staging resize chooses its encoder, and it is chosen per format

`publish.ts`'s `stageCover` now writes a shrunk cover with **quality 90, 4:4:4
chroma, mozjpeg** for a JPEG and `smartSubsample` for a WebP, and leaves a PNG
alone. It used to take whatever `sharp` defaults to, which is **quality 80 with
4:2:0 chroma subsampling**.

## The artifacts were ours

The owner reported that one cover "looks badly optimized with artifacts" and
asked for a replacement image. The source file was clean. The staged one was not.

4:2:0 stores colour at half resolution on both axes. That is the right default
for the thing JPEG was tuned on — a photograph — and the wrong one for what a
book cover actually is: hard-edged type over a large flat saturated field. _The
Five Dysfunctions of a Team_ is white serif on `#c8102e`, which is the worst case
in the format, and the staged copy fringed the letterforms pink. Side by side at
1:1 the difference is not subtle.

**Nothing had chosen those settings.** The resize was added for
[the mobile crash](../log/2026-08-01-the-mobile-crash-g15.md) and the whole
argument at the time was about _pixels_ — 314 MB of decoded texture, and how
many of them a phone can hold. The encoder was whatever came with the call.

**It reaches 33 of 43 covers**, because a cover already inside `MAX_COVER_EDGE`
is copied byte for byte and only the ones over it are re-encoded. So the
population that could be damaged is exactly the population that was.

## Quality 90, because this is the second generation

The vault already holds a provider's JPEG. Re-encoding a JPEG compounds its
existing artifacts rather than adding to a clean source, which is the argument
for spending here that would not apply to a first encode.

Measured across the owner's 43 covers, staged: **1.2 MB → 1.9 MB**, about 44 KB
per re-encoded cover. `TEXTURE_BUDGET_BYTES` cannot move, because it is counted
in _decoded_ pixels and the dimensions are unchanged — the only cost is bytes on
the wire, on a static site.

## ⚠️ Per format, and that is the whole trap

`sharp`'s `.jpeg()` **sets** the output format; it does not merely configure it.
An unconditional call writes JPEG bytes to a `.png` filename — and every browser
sniffs the bytes and renders it, so nothing downstream would ever report it. The
fixture vault's only oversized cover is `the-tidal-engine.png`, so this is not
hypothetical.

Two tests in `packages/core/src/publish.test.ts`, both observed red before the
fix and one of them written _for_ the trap: a JPEG over the cap comes out 4:4:4,
and a PNG over the cap comes out a PNG.

## What was not done

**No cover was replaced.** The one the owner asked about was correct in the
vault the whole time, and swapping it would have papered over a defect affecting
every large cover.

## How this was decided

The owner's report, then a 1:1 comparison of the source, the staged file, and
three candidate encoder settings — kept out of the repo, since the finding is in
the numbers above and in the test.
