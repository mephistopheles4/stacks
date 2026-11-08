import { defineConfig } from 'astro/config';
import { tunerCssPlugin } from '../../scripts/lib/tuner-css-plugin.ts';
import { readSwitch } from './src/analytics/switch.ts';

// The analytics switch (docs/spec/optional-plausible.md S3), decided once, here.
// Read from `process.env` only: a value in packages/site/.env* is ignored, so the
// config and the page cannot disagree. A malformed value throws and fails the
// build, with a message that never echoes it.
const analytics = readSwitch(process.env.PUBLIC_PLAUSIBLE_DOMAIN);

// ADR-0138 amends ADR-0065 and ADR-0128, which kept `connect-src 'self'`. There
// are exactly two policy shapes. Off is today's policy. On adds
// `https://plausible.io` to `connect-src` and nothing else, because the tracker
// is bundled from npm and served from 'self'. The on shape admits every Plausible
// account, not only the owner's; the owner accepted that (S16 Q2). G20 holds the
// two shapes and refuses anything else.
const connectSrc = analytics.on ? "connect-src 'self' https://plausible.io" : "connect-src 'self'";

// Static output only. The `--public` build has to be a plain deployable folder
// (GitHub Pages / Cloudflare Pages), so there is no adapter and no SSR here.
export default defineConfig({
  // Where this build will be served from. A static build cannot discover its
  // own origin, and link-preview scrapers reject relative og:image URLs — so
  // without this, sharing the shelf shows no preview at all. Unset for a local
  // `pnpm dev`, where there is nothing to share; the deploy sets it.
  site: process.env.SITE_URL,
  output: 'static',
  devToolbar: { enabled: false },

  // The debug pane's stylesheet, extracted from Tweakpane's JavaScript as
  // text and written where `debug-pane.ts` imports it with `?url`. Neither
  // package ships a `.css` file; see `scripts/lib/tuner-css-plugin.ts`.
  //
  // `server.proxy` is the dev server only: it sends the drawer's /api/chat to a
  // local Worker (`wrangler dev` in packages/ask), the way the zone's route does
  // in production. A build has no server, so it carries none of this.
  vite: {
    plugins: [tunerCssPlugin()],
    // A string literal, `""` when off. Site code branches on it and Rollup folds
    // the branch, so an off build carries no tracker chunk.
    define: { __PLAUSIBLE_DOMAIN__: JSON.stringify(analytics.on ? analytics.domain : '') },
    server: { proxy: { '/api/chat': 'http://localhost:8787' } },
  },

  // The shelf's outbound record, stated so it can stop being true by accident.
  //
  // ⚠️ **Corrected for the Ask the library drawer (#532, ADR-0127).** The page's
  // own requests are still all same-origin, which `connect-src 'self'` holds.
  // But the drawer's question now leaves the site, from the Worker, to Workers AI
  // and Turnstile, and no CSP can see that: it is a flow out of the server. The
  // sentence that follows describes the page and nothing else.
  //
  //
  // `connect-src 'self'` is the directive carrying the argument: the requests
  // this site makes are `fetch('/library.json')` in boot.ts, and since #413 a
  // held book's Thoughts, `/notes/<id>.json`, fetched in notes.ts, and its held
  // cover copy, `/held-covers/<name>`, fetched by `ImageBitmapLoader` in
  // pickup.ts — all three same-origin. That was once a property measured by grep
  // rather than one anything preserved. The
  // rest of the policy is decided here in one pass rather than in two.
  //
  // **Astro emits this as a `<meta http-equiv>`, not in `_headers`**, and that
  // is the whole reason it can be tight. `style-src` is hash-pinned from what
  // each page actually contains — /attribution ships an inline `<style>`,
  // because Astro inlines a stylesheet under 4kB, and hand-writing that hash in
  // `_headers` would mean an Astro upgrade silently unstyling the page. Hashes
  // computed from the build are true by construction. `frame-ancestors` is the
  // one directive a meta CSP cannot carry, so `_headers` denies framing with
  // `X-Frame-Options` instead — a division of labour, not a workaround.
  security: {
    csp: {
      directives: [
        // Deny by default and name every exception. The shelf loads covers, an
        // island bundle, its own stylesheet and one JSON file; there are no
        // fonts, no `data:` URIs, no workers, no forms and no frames.
        "default-src 'none'",
        "img-src 'self'",
        connectSrc,
        "base-uri 'none'",
        "form-action 'none'",
        // Turnstile's challenge frame, for the Ask the library drawer
        // (docs/spec/ask-the-library.md S8, approved by the owner in S14 Q2).
        // The one frame origin this site admits. The drawer loads Turnstile's
        // script only when it is first opened, so a visitor who never opens it
        // makes no request here; the policy is site-wide because Astro emits
        // one.
        'frame-src https://challenges.cloudflare.com',
      ],
      scriptDirective: {
        // static.cloudflareinsights.com is Cloudflare Web Analytics, injected
        // at the edge and present in no file in this repo. #119 rejected a
        // client beacon *stacks would build* to count an invariant, and its own
        // correction accepts that edge-injected markup is observed by nothing —
        // this policy constrains what such script may do, it does not detect it.
        //
        // Naming it is a choice, not a no-op: omitting the origin would make the
        // browser refuse the script and the analytics would genuinely stop. It is
        // named because blocking would be a policy file overriding a zone setting
        // for no privacy gain — the beacon reports same-origin to /cdn-cgi/rum
        // and carries nothing derived from the owner's reading. The dashboard is
        // where Web Analytics is turned off, and doing it there also removes the
        // injection. See ADR-0065.
        //
        // **The origin, never the exact file.** The beacon loads from a
        // versioned path (`/beacon.min.js/v4513226c…`) that changes with every
        // Cloudflare release, so the exact-file URL in Cloudflare's own CSP
        // documentation stops matching, and the failure is silent: the page
        // renders and analytics records nothing.
        //
        // ⚠️ `'self'` must be listed. `resources` REPLACES Astro's defaults
        // rather than appending to them, and dropping it blocks the shelf's own
        // /_astro/*.js — a black canvas with the page otherwise intact.
        //
        // `challenges.cloudflare.com` is the second named origin: Turnstile's
        // script (S8 of the Ask the library spec). It is the first origin this
        // project chose to add rather than one Cloudflare injects.
        resources: [
          "'self'",
          'https://static.cloudflareinsights.com',
          'https://challenges.cloudflare.com',
        ],
      },
    },
  },
});
