# ADR-0151 — The open book reads in a flat layer

**Date:** 2026-11-15
**Status:** accepted, built in [#599](https://github.com/mephistopheles4/stacks/issues/599)
**Issue:** [#599](https://github.com/mephistopheles4/stacks/issues/599)
**Supersedes in part:** [ADR-0102](0102-pickup-replaces-the-card.md) — "the held book's pages … placed in the scene by three's `CSS3DRenderer`", at rest
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/599#issuecomment-6897605694)

## Decision

An open book's two pages are DOM placed by `CSS3DRenderer` **while the book
moves**, and **at rest they leave the 3D layer**: both move into a flat
`.held-flat` layer beside `.held-layer` and are placed there by a 2D `matrix()`
computed from the four projected corners of each page's slot
(`packages/site/src/shelf/flat-page.ts`, `held-flat.ts`). They go back into their
slots before the book moves again — on a close, on a put-back, on the back
button — and the scroll is reset to the top as they do. This happens on every
device, not only on iOS.

Each `CSS3DObject` now wraps an empty **slot** the size of the page, which takes
no pointer events; the renderer keeps re-appending the slot, and the page is in it
or in the flat layer. The paper sheets are **unlit** (`MeshBasicMaterial`, fog
off) so the page's colour no longer depends on a light that the DOM page, now
standing on its own layer, never shared.

## Why

On iOS a long Thoughts page does not scroll under a finger. iOS WebKit will not
start a native overflow scroll inside a subtree that is 3D (`CSS3DRenderer`'s
camera element is `preserve-3d` and carries a `matrix3d`). No desktop engine
shows it: G35's held-at-rest check sets `scrollTop` from script, which scrolls
even where a finger cannot, so the bug passed every gate.

**The premise was measured before anything was built.** On a BrowserStack iPhone
16 Pro (iOS 18, Safari), against the live site: the page cloned into a flat layer
scrolled `0 → 564` px under one swipe with 118 `scroll` events; the page as it is
scrolled `0 → 0` with none. The control and the premise are the same probe
(`scripts/ios-swipe-check.ts`, `docs/ios-swipe-check.md`), the only difference being
where the page stands.

## Alternatives considered

| Alternative | Why it was refused |
| --- | --- |
| Scroll the page by script | It loses the native momentum iOS gives a finger. |
| Flatten `preserve-3d` on the layer's ancestors | Untested, and it may not work: the premise run measured a page in a flat layer, not a page in a flattened 3D one. |
| Take the pages out only on iOS | The owner decided phone and desktop behave the same, with no user-agent test. One path on every device also lets Chromium test the path iOS needs. |

Chrome on iOS needs no run of its own: every iOS browser is WebKit, and the
owner reproduced the bug in Edge as well as Safari.

## What it costs

- A page is **re-placed every frame** from the scene's own matrices, written only
  when the matrix changed, so a resting book costs no style writes.
- A placement that is **not a similarity** (a page more than 1 px off a flat
  rectangle, `SKEW_LIMIT_PX`) is refused: the page stays in its slot, in 3D, and
  the shelf says so once on the console. A flat layer that drew a skewed page
  would be wrong and look right.
- **iOS touch scrolling is not gated**, and cannot be: it needs a real iPhone and
  the owner's BrowserStack account. `scripts/ios-swipe-check.ts` is its manual
  check, listed beside G35 as not gated in [`gates.md`](../gates.md).


## How this was decided

The owner's issue, [#599](https://github.com/mephistopheles4/stacks/issues/599):
the Thoughts page would not scroll with a finger on an iPhone. The spec's
first measurement was the premise above; the rest followed from it.
