// The formatter, over code only.
//
// Every value here was measured on `research/236-formatter-config` before it
// was chosen, and the measurements are on issue #236. The short version:
// Prettier at its defaults turns four gates red and rewrites 348 files. This
// configuration turns none red and rewrites about 100, because each override
// records what the tree already does instead of inventing a rule.
//
// See docs/commands.md, `pnpm format` — including the one hole this file
// cannot close.

/** @type {import('prettier').Config} */
export default {
  // The tree holds 9,490 single-quoted strings against 661 double — 93 percent
  // — so this records a convention rather than imposing one.
  //
  // It used to be load-bearing as well, and deliberately is not any more.
  // G14 (`commands`) and G45 (`deploy-flags`) both hardcoded a single quote in
  // their extraction regex, so flipping the tree to double quotes reduced both
  // to assertions over nothing — an accidental quote gate whose red read
  // *extraction found 0 CLI subcommands* and named no quote. #252 repaired it
  // (`fdd2be1`); both now match `['"]`.
  //
  // ⚠️ That ordering was the point. Setting this before the repair would have
  // *frozen* the trap rather than fixing it, which is why #256 was blocked on
  // #252 even though nothing here ever needed it to pass.
  singleQuote: true,

  // A measured minimum on today's tree, not a taste and not a derived number.
  // At `singleQuote` over the whole tree: 80 changes 330 files, 100 changes
  // 248, and 120 changes 284. 120 is *worse* than 100 because Prettier rejoins
  // lines somebody wrapped near 80 — this repository's comment blocks are
  // hand-wrapped, and a wider width unwraps them.
  printWidth: 100,

  // ⚠️ `.markdownlint.jsonc` is read by a hand-rolled parser, not a JSONC one.
  //
  // Prettier's default `trailingComma: 'all'` added one after the last key, and
  // markdownlint-cli2 accepted it — JSONC permits trailing commas, so
  // `pnpm lint:md` stayed green and the change looked safe. **G48's own gate
  // does not**: `enabledRules` in `scripts/lib/markdown-lint.ts` strips `//`
  // lines and hands the rest to `JSON.parse`, which rejects it outright.
  //
  // So the file has two readers that disagree about the same bytes, and the
  // stricter one is ours. Formatting it is still right — it is tracked code and
  // a green `format:check` should mean something about it — so the override is
  // narrowed to the one setting that broke it rather than excluding the file.
  overrides: [{ files: '*.jsonc', options: { trailingComma: 'none' } }],
};
