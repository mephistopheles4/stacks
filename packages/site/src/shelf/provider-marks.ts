import appleBooks from "../assets/provider-marks/apple-books.svg?raw";
import googleBooks from "../assets/provider-marks/google-books.svg?raw";
import openLibrary from "../assets/provider-marks/open-library.svg?raw";
import type { ProviderLink } from "./provider-links.ts";

/**
 * The three monotone marks, from the files a designer would edit.
 *
 * Imported `?raw` rather than restated as path data here, so the `.svg` files in
 * `../assets/provider-marks/` are the single source — the same reason
 * `index.astro` inlines the site's own mark from its file instead of pasting a
 * copy into the template.
 *
 * ⚠️ **Redrawn silhouettes, not the providers' published artwork.** Read
 * `../assets/provider-marks/README.md` before changing any of this: going
 * monotone is a modification, which is a different question from the
 * redistribution one the map recorded, and the Apple glyph is the reason the
 * attribution route carries Apple's logo sentence.
 *
 * The search fallback deliberately has no mark. A book either has identifier
 * links or it has that one text link, which is what stops a row from ever being
 * a mix — and what carries the distinction in the *form*, where a tooltip could
 * not, because a tooltip never fires on touch.
 */
const MARKS: Readonly<Partial<Record<ProviderLink["kind"], string>>> = {
  "open-library": openLibrary,
  google: googleBooks,
  apple: appleBooks,
};

/**
 * Parsed once, cloned per card.
 *
 * `DOMParser` rather than `innerHTML`: these strings are build-time constants
 * and not vault data, so nothing here is a security question — but the card's
 * rule is that it never assigns markup, and a rule with one exception in it is a
 * rule somebody will extend to the next string that "is obviously fine".
 */
const parsed = new Map<string, SVGSVGElement>();

export function markFor(kind: ProviderLink["kind"]): SVGSVGElement | undefined {
  const source = MARKS[kind];
  if (source === undefined) return undefined;

  let template = parsed.get(kind);
  if (template === undefined) {
    const root = new DOMParser().parseFromString(
      source,
      "image/svg+xml",
    ).documentElement;
    if (!(root instanceof SVGSVGElement)) return undefined;
    // The anchor carries the accessible name, so the artwork is decorative —
    // and `focusable` is IE/Edge-era but still what keeps an inline SVG out of
    // the tab order in some engines.
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("focusable", "false");
    root.setAttribute("class", "card-mark");
    template = root;
    parsed.set(kind, template);
  }

  return template.cloneNode(true) as SVGSVGElement;
}
