import { defineConfig } from 'astro/config';

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
});
