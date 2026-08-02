# A public build ships exactly its own covers, and only books you own

`stacks build --public` stages a folder that is exactly what the build references — no additive leftovers — and `astro build` folds it into `dist/`. Only the basename of a `cover:` value is ever used, and every one is rewritten to `covers/<filename>`.

The staging was additive once, which was a leak rather than untidiness: building from a real vault and then running either gate replaced `library.json` while thirty-three real covers stayed behind, each filename a slug of a real title, with the gate reporting clean because it greps text files and those are JPEGs.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **The grep gate reads the built folder, not `library.json`.** The JSON is already covered by unit tests; what matters is what actually ships, including anything Astro inlined into HTML or a bundle. `pnpm gate:public` also fails if the canary is *absent from the fixture vault*, because a gate that greps for a string nobody planted passes no matter what the build contains.

- **2026-07-31** — **`stacks build --public` stages a folder; `astro build` folds it into `dist/`.** Two steps, so the CLI never needs to know how the site is built and the site never needs to know where the vault is.

- **2026-07-31** — **Only the basename of a `cover:` value is ever used.** `cover:` comes from a hand-edited note, and joining it to a path unchecked would let `../../..` stage arbitrary files into a public build. Tested.

- **2026-07-31** — **The OG image is an SVG rasterised by sharp, not a screenshot of the 3D scene.** A headless browser in the build path is a heavy dependency for one static image, and this way the preview regenerates from `library.json` alone. Only validated hex colours reach the SVG — `spine_color` is vault input landing in markup. The case always shows full height with books filling from the top: a part-filled bookcase is what a growing library looks like, and four shelves holding two books each reads as an empty room.

- **2026-07-31** — **Each gate stages its own input.** Both wrote `packages/site/public/library.json`, so whichever ran last decided what the other tested. Verified they now pass in either order, back to back.

- **2026-07-31** — **A public build ships exactly its own covers, and only books you own.** `copyCovers` was additive, which was a leak rather than untidiness: build from the real vault, then run either gate — both stage the *fixture* vault into the same folder — and `library.json` was replaced while thirty-three real covers stayed behind, each filename a slug of a real title, with the gate reporting the build clean because it greps text files and those are JPEGs. The staged folder is now exactly what the build references. That also settles the filename question generally: a cover named after a book in the index beside it reveals nothing the index does not. Wishlist books are filtered too — they were serialised into `library.json` although nothing displayed them — and every `cover:` is rewritten to `covers/<filename>`, so a hand-edited `//elsewhere.example/x.png` cannot make a visitor's browser fetch from a third party.

- **2026-08-01** — **The private fixture exists so the filter is testable.** An assertion that no private book ships passes trivially over a vault that never had one, which is the same trap `gate:public` closes by failing when its canary is missing. `fixtures/vault/Library/A Book Kept Back.md` carries `private: true` and no cover, so adding it moved the book count and left every cover assertion alone.

- **2026-07-31** — **Cover art: never in the repo, Open Library only in a public build.** The binding constraint is the providers' terms, not copyright in the abstract. Open Library's docs contemplate download and public display, ask that you not crawl, and appreciate a link back. Google's API terms bar permanent copies and public display of API content and require "powered by Google" plus a prominent per-result link. Apple conditions promotional content on placement beside a store badge linking to a purchase page — and book covers are not among the content types its terms enumerate at all. So Google and Apple stay metadata and lookup fallbacks; their art is hotlinked or omitted from `--public`. This needs cover **provenance** recorded at fetch time, which `cache-cover.ts` does not do today.
