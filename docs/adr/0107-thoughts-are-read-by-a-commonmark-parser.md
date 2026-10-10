# ADR-0107 — The Thoughts section is read by a CommonMark parser, and the allowlist applies to its tokens

**Date:** 2026-10-10
**Status:** accepted at the owner's sign-off on [#411](https://github.com/mephistopheles4/stacks/issues/411), 2026-10-10; built in [#415](https://github.com/mephistopheles4/stacks/pull/415)
**Issue:** [#411](https://github.com/mephistopheles4/stacks/issues/411)
**Amends:** [ADR-0101](0101-thoughts-ship-as-plain-text-and-withhold-whole.md), [ADR-0106](0106-thoughts-ship-only-plain-prose.md)

## Decision

The `## Thoughts` extractor reads the note body with **`micromark`'s
tokenizer**, and ADR-0106's allowlist applies to the parser's tokens rather
than to lines of text. Where the section starts and ends, and which blocks and
inline shapes it holds, are the parser's answers. Any token outside the
allowlist withholds the whole section, as before. The full rule list, and the
named case each rule gets, is in
[spec §3.1.1](../spec/picking-a-book-up.md#311-how-the-section-is-read).

**The packages, pinned exactly in `packages/core/package.json`:**

| Package | Version | Published |
| --- | --- | --- |
| `micromark` | 4.0.2 | 2025-02-27 |
| `micromark-extension-gfm-table` | 2.1.1 | 2025-01-20 |
| `micromark-extension-gfm-footnote` | 2.1.0 | 2024-07-05 |
| `micromark-util-types`, type-only | 2.0.2 | 2025-02-27 |

The fourth names the event and token types the extractor reads, since
`micromark`'s own types re-export none of them.

The extractor calls `parse`, `preprocess` and `postprocess` and reads the
event stream. **It never compiles to HTML**: no named import of `micromark`
or `compile`, and no extension whose name ends `Html`. The package's entry
loads its compiler module whatever is imported, so the rule is about what the
extractor calls.

**Hand rules stay where no CommonMark parser can see.** They cover `%%`
comments, embeds, inline footnotes, Dataview fields, odd line endings,
wikilinks and block ids. They also cover a few raw-text guards for places
where Obsidian may draw a block's extent differently from CommonMark. An
output check runs on the shipped text after every strip and escape. The
inspector's `notes-shape` rule mirrors that check as a twin, never a shared
import.

**The math extension is recommended out, and the owner decides at sign-off.**
The prototype used `micromark-extension-math` 3.1.0 as well. Its entry point
re-exports `mathHtml`, whose module imports KaTeX at load. Its exports map
offers no path to the syntax half alone. Taking it would load
`katex` 0.16.47 (and `commander` 8.3.0 under it) into the CLI on every build,
with no call ever made to it. A hand rule does the same job with no package:
two `$` anywhere in the section withhold it, whatever escapes them, and `$$`
anywhere from the start of the body to the section's end withholds it. That
is the round-3 escape-parity leak closed by ignoring escapes, rather than by
counting backslashes. **Those two guards stay whichever way the owner
decides**: they exist because Obsidian may end a block where the parser does
not, and that holds for the extension's math too.

## Why a parser

A line scan cannot see the structure CommonMark builds inside containers:
list items, quotes and callouts. Three rounds of #411's review each found a
shape the scan misread. Round 1 found a lone carriage return hiding
`## Notes`. Round 2 found a link definition inside a quote or a list item.
Round 3 found a fence inside a list item faking the heading, and a heading
behind a bullet.

ADR-0106's allowlist closed the shapes inside the section. Round 3 then found
13 more leaks in the allowlist's own reading of lines. The owner asked for a
prototype. It ran the same 20 invented leak shapes and 4 controls through
both extractors:

- **Hand extractor:** 13 leaks.
- **Parser:** 0 leaks.
- **Controls:** every one shipped under both.

Swapped into the whole suite, the parser passed every public-build gate. Its
31 differences, all in the extractor's own tests, are each decided in
spec §3.1.3.

**The size is the same, and the growth is not.** The prototype's extraction
code was about as long as the hand module. The amended design carries about
22 flat hand patterns, against the prototype's 11 and the hand module's 30 or
so, and none of the 22 reads structure. A new Markdown shape, though, is
an unknown token to the parser. So it withholds by default, and nobody has to
write a rule for it first. That is invariant 2's "an allowlist and never a
denylist", applied to Markdown structure instead of to lines.

## What it costs, against the owner's preference for fewer dependencies

ADR-0101 chose hand code partly because the owner prefers fewer dependencies,
for a smaller security surface. This record keeps that preference as far as a
parser allows:

- **No new package version enters the lockfile.** The four packages and
  their whole runtime closure are already in `pnpm-lock.yaml`, through
  `markdownlint` as a dev dependency. That is 32 packages, 4 of them
  type-only. What changes is where the code runs: at build time, in the CLI
  process, over the owner's vault.
- **Nothing reaches a visitor.** The site may only `import type` from `core`
  ([ADR-0003](0003-site-import-type-only.md)), and the parser runs in the
  publisher's adapter only.
- **The math extension stays out**, as above, so KaTeX does not join the
  runtime.
- **No new install scripts.** pnpm blocks them, and `allowBuilds` names only
  `esbuild` and `sharp`.

**The supply-chain checks that apply, and one that does not:**

- **Exact pins**, the lockfile's integrity hashes, and CI's frozen install.
- **`pnpm audit --audit-level=high`** in CI already reads all 32 packages.
  It passes a moderate advisory by design. Dependabot's alerts are the
  instrument that sees those.
- **Release age is checked by hand.** pnpm's `minimumReleaseAge` is **not** a
  control here, for two reasons. First, nothing in this repository sets it:
  [#399](https://github.com/mephistopheles4/stacks/issues/399) is open, and
  pnpm 11.18's default measured under two days, not seven. Second, an exact
  pin is not subject to the window anyway. Every pinned version is over seven
  months old.
- **Not the newest versions, on purpose.** `micromark` 4.0.3 (2026-09-26) and
  `micromark-extension-gfm-table` 2.1.2 (2026-09-11) are out. The prototype
  measured the versions pinned here, and the lockfile already holds them.
- **A bump of any package in the closure is its own change, on the security
  route**, not only a bump of a pin. The CommonMark rules live in
  `micromark-core-commonmark` and its siblings, which `micromark` reaches by
  caret ranges shared with `markdownlint`, so a lockfile refresh could move
  them with no pin changing. A unit test in `core` compares every closure
  package's resolved version with a committed list, so any move is red. The
  named cases in spec §3.1.4 and G2 (`public-build`) must pass, and the new
  version must be at least seven days old, checked by hand until #399 lands.
- **Dependabot is kept off the family**: `.github/dependabot.yml` ignores
  `micromark` and `micromark-*`, as it already ignores `three`. Its alerts
  still report an advisory.
- **Licences:** all MIT.

**Two builds of one package.** `micromark` ships a `development` build,
which carries `debug` traces and assertions, and a default build. The
development build writes its parse to stderr when `DEBUG` names `micromark`,
and the parse is the **whole note body**, private remainder included. Node
and tsx load the default build unless a `development` condition is set, for
example through an inherited `NODE_OPTIONS`, and the deploy's build child
inherits the deploy's environment. So nothing rests on that assumption:

- the adapter checks at load that `micromark` resolved to its default entry,
  and withholds every section otherwise;
- vitest's resolve conditions are set to match the CLI's, so the tests run
  the build that publishes;
- the build session records both in `docs/progress.md`.

## Alternatives rejected

- **Keep the hand allowlist and patch round 3's shapes.** That is the
  denylist ADR-0106 rejected, one level down. Each round found a nesting rule
  the scan had to reproduce by hand.
- **Take the math extension as prototyped.** KaTeX would load with every
  build and is never called. A hand rule that ignores escapes withholds the
  same sections. This is a recommendation; the owner may still choose it at
  sign-off (spec §8).
- **Render to HTML and compare it with what ships.** That needs an HTML
  pipeline in the build, which ADR-0101 rejected for the page. A token
  allowlist needs none.
- **A different parser,** such as `markdown-it` or `commonmark.js`. Neither
  is in the lockfile, so either would add new package versions. The prototype
  measured `micromark`.

## Consequences

- `packages/core/src/adapters/thoughts-section.ts` is rebuilt test-first.
  Its line predicates leave the extractor. `disarmBodyText` keeps its own,
  which read wider than CommonMark, the safe direction for text being
  written.
- `insertBodySection` finds `## Notes` through the same parse, so the writer
  and the extractor cannot read a heading differently. That promise is the
  one the module's header makes today about its shared predicates.
- ADR-0101's decisions stand: plain paragraphs, withheld whole, no HTML at
  any stage. Its "stripped by hand" and "no new dependency" are replaced by
  this record.
- ADR-0106's allowlist stands, read from tokens. Its rejected alternative,
  "parse with a real CommonMark library", is reversed. Its prediction holds:
  the comparison still needs hand rules for Obsidian's extras, and spec
  §3.1.1 lists them.
- **What CommonMark does not settle stays unverified until the owner checks
  it in Obsidian's reading view** (spec §3.1.5, §8). Examples are lazy
  continuation, fences inside list items, `![x]` with no definition, and an
  escaped-bar wikilink. Any shape found to hide text that the parser ships
  becomes a withhold rule before #415 leaves draft.

## How this was decided

On #411, after round 3 of move 4 stopped, in the owner's words, from chat:

> prototype it, sounds like we are overengineering it

After the prototype's three results were posted on #411:

> Adopt the parser.

The pins, the math recommendation and the supply-chain checks are the plan
session's (`plan-411`), for the owner to confirm at sign-off.
