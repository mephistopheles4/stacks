import { defineConfig } from "astro/config";

// Static output only. The `--public` build has to be a plain deployable folder
// (GitHub Pages / Cloudflare Pages), so there is no adapter and no SSR here.
export default defineConfig({
  // Where this build will be served from. A static build cannot discover its
  // own origin, and link-preview scrapers reject relative og:image URLs — so
  // without this, sharing the shelf shows no preview at all. Unset for a local
  // `pnpm dev`, where there is nothing to share; the deploy sets it.
  site: process.env.SITE_URL,
  output: "static",
  devToolbar: { enabled: false },

  // The shelf's outbound record, stated so it can stop being true by accident.
  //
  // `connect-src 'self'` is the directive carrying the argument: the only
  // request this site makes is `fetch('/library.json')` in boot.ts, and that was
  // a property measured once by grep rather than one anything preserved. The
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
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
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
        resources: ["'self'", "https://static.cloudflareinsights.com"],
      },
    },
  },
});
