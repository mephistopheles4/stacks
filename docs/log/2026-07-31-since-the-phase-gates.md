# Since the phase gates

Ten commits of work driven by running against a real vault rather than fixtures.
Most of it was defects that only real data exposes:

- covers now carry their true aspect (audiobook art is square, print is ~0.65)
  and books lean in groups; spine titles are printed on the spines
- `face_out` joined the frontmatter contract
- `stacks build --watch` plus `pnpm dev:watch` for live editing from Obsidian
- Google Books works now a key is configured; Apple Books added purely for
  cover art, which is ~800x1200 against Google's ~128px
- matching learned to refuse summaries and study guides, which had put the
  wrong book's cover — and once the wrong book's *note* — into the vault
- covers that are Google's "image not available" card are refused
- tags are normalised to what Obsidian accepts
