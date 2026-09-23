# Can Tweakpane render under the site's CSP?

Research for [#376](https://github.com/mephistopheles4/stacks/issues/376), a
child of map [#366](https://github.com/mephistopheles4/stacks/issues/366); it
blocks the panel decision in
[#375](https://github.com/mephistopheles4/stacks/issues/375). Nothing here is
implemented, and the throwaway integration that produced the measurements was
never committed. Checked 2026-09-22 against `tweakpane@4.0.5`,
`@tweakpane/plugin-essentials@0.2.1` and `astro@7.3.2`, in headless Chromium
through a real `pnpm build` served statically by `astro preview`.

Every claim is tagged: **measured** (run here), **sourced** (read in a primary
source, linked), or **inferred** (reasoned from the other two, not run).

## Verdict

**No, not as shipped — and yes, cheaply, without loosening the policy.**

- **Blocked in a build.** Tweakpane and essentials inject their whole
  stylesheet as runtime `<style>` elements. Under the built `style-src` both are
  refused, and the pane renders as unstyled raw controls. *(measured)*
- **Fine in `pnpm dev`.** Astro emits no CSP in dev at all, so the unmodified
  pane renders styled there. A dev-only tuner costs nothing. *(measured, sourced)*
- **The cheapest fix keeps `style-src` exactly as it is.** Pre-seat two empty
  `<style data-tp-style=…>` placeholders so Tweakpane skips injection, and supply
  the CSS lazily yourself: Vite `?inline` into `document.adoptedStyleSheets`, or
  `?url` into a runtime `<link>`. Both rendered fully styled with zero CSP
  violations and loaded nothing for a visitor without `?debug`. *(measured)*
- **The catch is that there is no CSS file to import.** Both packages ship their
  CSS only as a string literal baked into the JS bundle, so either fix needs a
  small build step that extracts it. *(sourced, measured)*
- **Watch out for the obvious fix.** A plain `import './x.css'` inside the
  lazily imported module is hoisted by Astro into every page's `<link>` list, so
  every visitor pays for it. *(measured)*
- **`'unsafe-inline'` is not a last resort — it is inert here.** Browsers
  ignore it while any hash is in the directive, and Astro always emits hashes.
  *(sourced, inferred)*
- **GSAP is unaffected.** It writes through `element.style`, which `style-src`
  does not govern, and pickup animates Three.js objects rather than DOM.
  *(sourced; inferred for pickup)*

## 1. What Tweakpane and essentials inject

**A `<style>` element per bundle, appended to `document.head`, with the CSS set
through `textContent`.** *(sourced, measured)*

- **The injector.** `embedStyle` in Tweakpane's pane:
  [`pane.ts` L31–39 at tag 4.0.5](https://github.com/cocopon/tweakpane/blob/4.0.5/packages/tweakpane/src/main/ts/pane/pane.ts#L31-L39).
  The installed build has the same function at `dist/tweakpane.js:7766–7773`:
  `doc.createElement('style')`, `dataset.tpStyle = id`, `textContent = css`,
  `doc.head.appendChild`.
- **Every bundle goes through it.** `registerPlugin` calls
  `embedStyle(this.document, \`plugin-${bundle.id}\`, bundle.css)`
  ([L102–104](https://github.com/cocopon/tweakpane/blob/4.0.5/packages/tweakpane/src/main/ts/pane/pane.ts#L102-L104)).
  Tweakpane registers its own CSS the same way in the constructor, as the
  bundle `default`
  ([L119–122](https://github.com/cocopon/tweakpane/blob/4.0.5/packages/tweakpane/src/main/ts/pane/pane.ts#L119-L122)).
  So the element ids are `plugin-default` and `plugin-essentials`.
- **Essentials is the same mechanism.** It exports `id = 'essentials'` and
  `css = '__css__'`
  ([`src/index.ts` L14–15 at tag 0.2.1](https://github.com/tweakpane/plugin-essentials/blob/0.2.1/src/index.ts#L14-L15)).
- **The CSS exists only as a string literal.** Both builds replace `'__css__'`
  with the compiled, minified CSS through Rollup. Neither package publishes a
  `.css` file: `dist/` holds only `.js`, `.min.js` and `types/`. *(sourced,
  measured)*
- **Sizes.** The injected texts are 24,459 characters (`plugin-default`,
  239 rules) and 5,060 (`plugin-essentials`, 70 rules). *(measured)*
- **No opt-out is documented.** There is no option to skip injection. The only
  related knob is `PaneConfig.document`, which chooses *which* document receives
  the `<style>`. Neither the
  [theming](https://tweakpane.github.io/docs/theming/) nor the
  [misc](https://tweakpane.github.io/docs/misc/) docs mention CSP, and no issue
  on either repository discusses `style-src`. The only CSP issue,
  [#361](https://github.com/cocopon/tweakpane/issues/361), fixed in
  [PR #437](https://github.com/cocopon/tweakpane/pull/437), was about
  `new Function` under `script-src`. *(sourced)*
- **The undocumented lever.** `embedStyle` returns early when
  `document.querySelector('style[data-tp-style=<id>]')` finds anything. It
  checks the element's *presence*, not whether its sheet applied. That is the
  seam every fix below uses. *(sourced, measured)*

## 2. Does the CSP block it?

### In a build: yes

The built policy on both pages is, for styles: *(measured)*

```text
style-src 'self' 'sha256-eZThLoRNDbx6YobQlsGZA8+qespsZfD/YQEGSwT5BvU=' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';
```

- `eZTh…` is the SHA-256 of `/attribution`'s inlined `<style>`, matched by
  hashing it. *(measured)*
- `47DEQ…` is the SHA-256 of the **empty string**. It is present on a clean
  `main` build too. Its origin in Astro is not traced; Astro's
  `trackStyleHashes` (`astro/dist/core/csp/common.js:65`) hashes every per-page
  inline sheet, and an empty one would produce exactly this. *(measured;
  origin inferred)*

Loading `/?debug` with a minimal pane lazily imported (a slider, colour,
checkbox, essentials `fpsgraph` and `buttongrid`): *(measured)*

- **Two console errors**, one per element: `Applying inline style violates the
  following Content Security Policy directive 'style-src …'`. Chromium names the
  hashes that would admit them: `sha256-WU+tMAooBGOdJsdyBqbrrPu4TVMhi7m8OLZ9L4tWidA=`
  (default) and `sha256-cOzEuwxKTJXf4k++XT1zfr2JFxu5nRUX6ammcWNLUSg=`
  (essentials).
- **Both `<style>` elements are in the DOM with their full text, but
  `element.sheet` is `null`.**
- **The pane is unstyled.** Its root has a transparent background, no border
  radius and the page font. The wrapper stretches to the full page width and
  sits behind the canvas. Brought forward, it shows full-width bare inputs
  strewn down the page with no layout.
- **`smoke:render` would not notice.** Nothing threw, and the controls exist
  and work. *(inferred from the above)*

### In `pnpm dev`: no CSP at all

- **Measured.** `astro dev` served `/?debug` with no `content-security-policy`
  meta tag and no header. The unmodified pane applied both sheets (239 and 70
  rules) and rendered styled, with no violations.
- **Sourced.** Astro's
  [`security.csp` reference](https://docs.astro.build/en/reference/configuration-reference/#securitycsp)
  says the feature "isn't supported while working in `dev` mode" and must be
  tested with `build` and `preview`.
- **Consequence.** A tuner that is only ever tested in dev will look right and
  ship broken under `?debug`. Any `?debug` tuner needs a built-and-served check.
  *(inferred)*

## 3. The options, ranked by how little they loosen the policy

| Rank | Option | Policy change | Result | Cost |
| --- | --- | --- | --- | --- |
| 1 | Dev-only tuner | none | styled *(measured)* | loses the tuner on the live site and on a phone |
| 2 | Placeholders + CSS via `?inline` → `adoptedStyleSheets` | none | styled, 0 violations *(measured)* | build-time CSS extraction |
| 2 | Placeholders + CSS via `?url` → runtime `<link>` | none | styled, 0 violations *(measured)* | build-time CSS extraction |
| 3 | Runtime `adoptedStyleSheets` from the blocked elements' text | none | styled, 2 violations logged *(measured)* | console noise on every `?debug` load |
| 4 | Pin the two hashes in `styleDirective.hashes` | two hashes | styled, unmodified pane *(measured)* | breaks silently on any version bump |
| 5 | Nonce | per-request token | not possible | a static site cannot mint one; Tweakpane sets none |
| 6 | `'unsafe-inline'` | would be total | inert while hashes exist *(sourced)* | see below |

### Rank 2: placeholders plus lazily supplied CSS

**The recommended route if the tuner must work under `?debug` on the live
site.** Before `new Pane()`, append two empty elements,
`<style data-tp-style="plugin-default">` and
`<style data-tp-style="plugin-essentials">`. Tweakpane then injects nothing.
Supply the CSS one of two ways. *(measured)*

- **`?inline` into `adoptedStyleSheets`.** `import css from './tweakpane.css?inline'`
  gives a string. `new CSSStyleSheet()`, `replaceSync(css)`, and append it to
  `document.adoptedStyleSheets`. The pane rendered styled (305 adopted rules).
  The CSS travels inside the lazy chunk. There were no violations.
- **`?url` into a runtime `<link>`.** `import href from './tweakpane.css?url'`
  gives a hashed `/_astro/*.css` path. Append a `<link rel="stylesheet">` to it.
  `style-src 'self'` already admits it. The pane rendered styled, with no
  violations. The file was fetched only under `?debug`.
- **Control.** The placeholders without any supplied CSS gave no violations and
  an unstyled pane. So the styling came from the supplied CSS, and the dedupe
  skip works. *(measured)*
- **A visitor without `?debug` loads none of it.** A plain load fetched only the
  site's own `index.*.css`. *(measured)*

**Why `adoptedStyleSheets` passes.** CSP governs `<style>` elements and `style`
attributes. Constructable stylesheets are not mentioned in the
[CSSOM spec](https://www.w3.org/TR/cssom-1/#the-cssstylesheet-interface) or in
[CSP Level 3](https://w3c.github.io/webappsec-csp/). MDN's
[`style-src` page](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src)
notes that no browser blocks the CSSOM parsing methods (`insertRule`,
`cssText`) that the spec would gate behind `'unsafe-eval'`. *(sourced)* It passed
in Chromium. **Firefox and Safari are unverified**; the `?url` route does not
depend on this and is the safer choice if that matters.

**The empty placeholders are silent only because of the empty-string hash.**
With `47DEQ…` stripped from the built policy, each empty placeholder raised its
own violation. The pane still rendered styled, because the dedupe checks
presence. *(measured)* So the hash affects console noise, not function.

- **Recommendation.** Pin `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`
  in `styleDirective.hashes` deliberately rather than relying on its untraced
  origin. It is the hash of the empty string, so it never changes, and it admits
  only a `<style>` with no content. Astro appends `hashes` to its own rather
  than replacing them
  ([reference](https://docs.astro.build/en/reference/configuration-reference/#securitycspstyledirectivehashes);
  `plugin-manifest.js:213–216`). *(sourced)*
- **Refuted: `type="text/plain"` placeholders.** The HTML "update a style
  block" algorithm suggested a non-CSS `type` would skip the CSP check. Chromium
  still reported both violations. Do not retry it. *(measured)*

**The extraction step.** There is no CSS file, so one has to be made. *(measured)*

- **How it was done here.** A 15-line Node script regex-extracted the two string
  literals from `dist/tweakpane.js` (the `id: 'default'` bundle) and
  `dist/tweakpane-plugin-essentials.js` (`const css = '…'`). The lengths matched
  the runtime `textContent` exactly: 24,459 and 5,060.
- **Vendor or generate.** A vendored `.css` file goes stale on a version bump,
  and the pane silently mis-styles. Generating it at build time (a tiny Vite
  plugin or a `prebuild` script) is true by construction, but the regex is
  coupled to the dist's shape. Either way, a test should assert that the
  extraction still finds both literals. *(inferred)*
- **Declarations.** The root `tsconfig.json` needs `*.css?inline` or
  `*.css?url` declared, like `packages/site/src/raw-assets.d.ts` does for SVG.
  *(measured: `pnpm typecheck` failed without it)*

**Do not use a plain side-effect import.** `import './tweakpane.css'` inside the
dynamically imported module was hoisted by Astro into
`<link rel="stylesheet" href="/_astro/…css">` in `index.html`. It was fetched on
every load, including loads that never entered the Tweakpane path: 28,788 bytes
raw, 5,231 gzip. *(measured)*

### Rank 3: adopt the text of the blocked elements

Let injection fail, then read each blocked element's `textContent` (it survives
the block) into a constructable stylesheet. It needs no build step and no
extraction, and it rendered styled. *(measured)*

- **Cost.** It logs the two CSP violations on every `?debug` load, which trains
  the reader to ignore CSP errors in exactly the console used for debugging.
- **Fragility.** It depends on the internal element ids `plugin-default` and
  `plugin-essentials`. *(inferred)*

### Rank 4: pin the two hashes

Adding `WU+t…` and `cOzE…` to `styleDirective.hashes` let the unmodified pane
render styled. *(measured)* It is the tightest policy change: it admits exactly
those two stylesheets.

- **The failure mode is the one the issue feared.** Any change to either CSS
  string changes its hash. The pane then unstyles silently under `?debug`, and no
  gate notices. *(inferred)*
- **Only with a freshness test.** Recommend it only paired with a test that
  re-hashes the literals in the installed `dist` against the config.

### Rank 5: a nonce

**Not possible here.** A nonce must be fresh per response. A static
`<meta http-equiv>` policy cannot carry a per-request value. Tweakpane also sets
no `nonce` attribute on the elements it creates. *(sourced, inferred)*

### Rank 6: `'unsafe-inline'`

**It would do nothing while any hash is present.** CSP Level 3's "Does a source
list allow all inline behavior for type?" (§ 6.7.3.2) returns false when the
list contains a hash or nonce source, so `'unsafe-inline'` is ignored
([CSP3](https://w3c.github.io/webappsec-csp/#allow-all-inline);
Firefox logs it as "ignoring unsafe-inline within style-src: nonce-source or
hash-source specified",
[Bugzilla 1004703](https://bugzilla.mozilla.org/show_bug.cgi?id=1004703)).
*(sourced)* Astro always emits at least the `/attribution` hash. *(measured)*
Adding `'unsafe-inline'` to `styleDirective.resources` would therefore have no
effect unless Astro's style hashing were also switched off. *(inferred; not
measured)*

- **What it would cost if it did take effect.** Every inline `<style>` and
  `style=""` attribute on the page would become allowed, including any injected
  by a future XSS. CSS injection can exfiltrate data through attribute
  selectors and `url()`, although `img-src 'self'` and `connect-src 'self'` would
  limit where it could send it. *(inferred)*

## 4. GSAP

**Not affected.** GSAP writes styles through `element.style`. MDN's
[`style-src` page](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src)
states that properties set directly on an element's `style` property are not
blocked. *(sourced)* The existing panel in
`packages/site/src/shelf/debug-panel.ts` already styles itself that way and
renders under the built policy. *(measured)* Pickup animates Three.js objects,
not DOM, so it never touches CSS at all. *(inferred)*

## 5. Other costs for #375

- **Bundle size.** Tweakpane plus essentials, lazily split under `?debug`,
  came to a 294,790-byte chunk: 61,587 bytes gzip. The current
  `debug-panel` chunk is 12,412 bytes raw. A visitor without `?debug` downloads
  neither. *(measured)*
- **Types.** Under the root `tsconfig.json`, `pnpm typecheck` could not see
  `Pane.addBinding` or `Pane.addBlade`: TS2339, because `Pane`'s methods come
  through `@tweakpane/core`, which is not resolvable from the root under pnpm's
  strict layout. The probe cast to `any`. An implementation needs
  `@tweakpane/core` as a direct dev dependency, or a local type. *(measured;
  remedy inferred)*
- **Layout.** The default wrapper is absolutely positioned top-right, exactly
  where the existing tuning panel's readout (`debug-panel.ts`) sits, and the two
  overlap. Pass `container` to place it. *(measured)*
- **Not run.** `pnpm lint` was not run on the probe. *(unverified)*
- **Process.** A new dependency needs an ADR under `docs/adr/` (AGENTS.md).

## How this was measured

- **Integration.** A throwaway branch added both packages to `@stacks/site`
  and made `boot.ts` lazily import a probe module when `?debug` was present,
  before `loadLibrary()`. A `tp=` query picked the mode. The probe recorded each
  `data-tp-style` element's text length, whether its `sheet` applied, the
  adopted sheets, and the pane root's computed background, radius, font and
  width. `library.json` was absent, so the page logged one 404; that does not
  affect any of the above.
- **Build and serve.** `pnpm build` (typecheck, `astro check`, `astro build`),
  then `astro preview` on the built `dist/`. The policy was read from the
  emitted meta tag.
- **Browser.** Each mode was loaded in a fresh tab so the console held only that
  load. Console errors were read directly, and screenshots were inspected by eye;
  none is committed, per G13.
- **Controls.** Placeholders without CSS (unstyled, proving the styling came
  from the supplied CSS); the empty-string hash stripped from the built HTML
  (placeholder violations appear); `type="text/plain"` placeholders (refuted).
- **Cleanup.** The throwaway branch was deleted and its dependency, lockfile and
  source changes were discarded.
