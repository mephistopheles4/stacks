# ADR-0103 — GSAP plays the pickup motion, for fluency over a zero-byte option

**Date:** 2026-10-09
**Status:** accepted; built in [#413](https://github.com/mephistopheles4/stacks/issues/413) — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md)
**Issue:** [#370](https://github.com/mephistopheles4/stacks/issues/370), [#371](https://github.com/mephistopheles4/stacks/issues/371)

## Decision

The pickup motion is played by **GSAP, imported from `gsap/gsap-core`**. It
reaches every visitor, at about 19.6 KB gzip (measured with Vite on #370).
`CustomEase` is added only if the tuned curves need it.

- **GSAP is stepped by the shelf's own frame**, not its own ticker:
  `gsap.ticker.remove(gsap.updateRoot)`, then `gsap.updateRoot(seconds)` inside
  the render loop. `seconds` is **seconds**, GSAP's root-timeline unit, counted
  from one origin the loop fixes; never a raw `requestAnimationFrame` timestamp,
  which is milliseconds and would throw the timeline a thousand times too far.
  The pose, the WebGL render and the CSS3D page then come from one
  instant, which is what keeps #369's text registration at 0.3 px.
- **`reverse()` with a `timeScale` puts a book back**, and `kill()` or an
  overwrite handles a click on another book mid-move.
- **The tuned values are plain constants**, `PICKUP_MOTION` in
  `shelf-settings.ts`. GSAP reads them; it never becomes where they live.

## Why GSAP over zero bytes

A hand-rolled timeline (about 0.4 KB) and three's own `AnimationMixer` (0 bytes,
with a Bezier interpolant since r183) were both judged capable on #370. The
owner chose GSAP for fluency. Tuning the feel fast was the point of the work,
and the owner knows GSAP well. That is the "reason" the map's rule asks of
anything shipped to visitors.

## The licence, a known trade

GSAP's "Standard no charge" licence is **not OSI open source**. It restricts use
in a product that competes with Webflow's no-code animation builder, and
Webflow may terminate it for non-compliance. None of that bites a personal
reading shelf. It is recorded so that a later change of use reads it.

## Alternatives rejected

- **Theatre.js.** Playback needs `@theatre/core` in production, its studio is
  AGPL-3.0, and it has not released since May 2024 (#370).
- **The plain `gsap` entry.** It pulls in CSSPlugin, which the shelf never
  uses, for about 8 KB more.
- **`@tweenjs/tween.js`, Motion, anime.js.** Compared on #370; none was the
  owner's tool.

## Consequences

- The first animation library on the page, and the first runtime dependency
  whose licence is not open source.
- GSAP writes styles through `element.style`, which the page's `style-src` does
  not govern (#376), so it needs no CSP change.
- The type-aware lint cannot resolve the timeline type `gsap-core` returns
  (#371). The repo declares the slice it calls rather than adding a package.
