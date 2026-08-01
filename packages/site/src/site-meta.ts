/**
 * Absolute URLs for the link preview.
 *
 * `og:image` was `/og.png` — a relative path. Every link-preview scraper
 * (Slack, iMessage, WhatsApp, Discord, Twitter) requires an absolute URL and
 * silently shows nothing for a relative one. So the OG image was generated,
 * validated by `gate:public`, rendered at 1200x630, and would not have appeared
 * when the shelf was actually shared — which is the project's whole success
 * metric: *"you send the link to at least one friend unprompted"*.
 *
 * The canonical origin comes from `SITE_URL` at build time, because a static
 * build has no other way to know where it will be served from. When it is unset
 * — a local `pnpm dev`, or a build nobody is deploying — these fall back to the
 * relative path, which is correct for viewing the page and merely useless for
 * sharing it.
 *
 * Lives in a `.ts` file rather than in the `.astro` frontmatter because
 * `.astro` files are not typechecked (`astro check` cannot run under TS 7), so
 * anything with a type or a branch belongs here. See "Site code layout" in
 * CLAUDE.md.
 */

/**
 * `path` resolved against the site origin, or left relative when there is none.
 *
 * `Astro.site` is the parsed `site` from astro.config.mjs — a `URL` when set,
 * `undefined` when not.
 */
export function absoluteUrl(path: string, site: URL | undefined): string {
  if (site === undefined) return path;
  return new URL(path, site).href;
}

/** True when this build carries an origin, and so can be shared usefully. */
export function isShareable(site: URL | undefined): boolean {
  return site !== undefined;
}
