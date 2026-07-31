import { defineConfig } from 'astro/config';

// Static output only. The `--public` build has to be a plain deployable folder
// (GitHub Pages / Cloudflare Pages), so there is no adapter and no SSR here.
export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
});
