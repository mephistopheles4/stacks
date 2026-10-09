# ADR-0104 — Tweakpane with essentials tunes the pickup, behind `?debug`, styled through placeholders and a lazy link

**Date:** 2026-10-09
**Status:** accepted; built in [#413](https://github.com/mephistopheles4/stacks/issues/413) — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md)
**Issue:** [#370](https://github.com/mephistopheles4/stacks/issues/370), [#375](https://github.com/mephistopheles4/stacks/issues/375), [#376](https://github.com/mephistopheles4/stacks/issues/376)

## Decision

The **pickup tuner** is built on **Tweakpane with
`@tweakpane/plugin-essentials`**, in a lazy chunk loaded only behind `?debug`,
**on the live site** as well as in development. It scrubs the GSAP timeline,
shapes the eases with the `cubicbezier` blade, and exports `PICKUP_MOTION` as
plain constants to paste back into `shelf-settings.ts`.

**Its CSS reaches the page without loosening the Content Security Policy:**

- empty `<style data-tp-style>` placeholders sit in the page template, so
  Tweakpane skips its own `<style>` injection, which the hash-pinned
  `style-src` refuses;
- the CSS loads lazily as a `<link>`, through Vite `?url`, from a file a build
  step extracts from the packages' JS, since neither ships a `.css` file. The
  step **reads the package file as text** and never imports or evaluates it, so
  a compromised release cannot run code on the machine that deploys; it fails
  when the expected CSS is not found;
- the empty-string hash those placeholders need is in `style-src` on purpose,
  because Astro hashes the placeholders, and a gate asserts it.

**The honesty floor:** each tuner control shows what the shelf applied, never
only what was asked. The code writes the applied state back and calls
`pane.refresh()`; the scrub reads the timeline's own progress back. Public API
and custom plugins only; no patching of Tweakpane's DOM.

The rest of the `?debug` page stays plain code until tuning the motion is done.

## Why on the live site

The phone that crashes is checked against the deployed shelf, which is why
`?debug` shipped in the first place (#47). A dev-only tuner would cost a visitor
nothing more, since the chunk is lazy either way, and it would not reach the
phone without a LAN dev server.

## Why Tweakpane

Only Tweakpane with essentials has a curve editor, which #370 chose to shape the
eases. lil-gui has none. Tweakpane alone has none either, and essentials bundles
its own copy of Tweakpane's core, about 63 KB gzip together, all lazy.

## Why this CSS route

- **`'unsafe-inline'`** does nothing while any hash is present (CSP Level 3).
- **Pinning Tweakpane's own content hashes** works, then silently unstyles the
  pane on the next version bump.
- **`?inline` into `adoptedStyleSheets`** is unverified in Firefox and Safari.
- **A plain CSS import** in the lazy module was hoisted onto every page by
  Astro, 5.2 KB gzip for every visitor (#376).

## Consequences

- Two packages enter the production artifact, reached only behind `?debug`.
  Both were far outside pnpm's seven-day quarantine when chosen; essentials'
  last release was in December 2023.
- Two new gates: a page without `?debug` loads zero tuner bytes, and the pane
  renders styled under the built site's CSP. #376 measured both failures as
  silent.
- `Pane`'s type extends a class from `@tweakpane/core`, which pnpm's strict
  layout does not expose. The repo declares the slice it calls rather than
  adding that package.
