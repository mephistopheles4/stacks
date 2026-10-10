# Picking a book up — the split gate, the Thoughts extractor, and the motion

The output of [Map: picking a book up](https://github.com/mephistopheles4/stacks/issues/366)
— eight closed tickets, assembled into something an implementation session can
build **without reopening any of them**. Click a book: it slides out of the
shelf, turns in your hand, and opens to its `## Thoughts` section.

**This file is deliberately thin.** Every verdict below was reached on a ticket,
with its measurements and its corrections in the resolution comment. Restating
them here would put one decision in two places, which is what
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) exists to
prevent. So §2 links rather than retells. What this file adds is what no single
ticket holds: the decisions the map left to the spec (§3), the build order (§4),
the gate roster (§5), the contract edits (§6), the records (§7), what needs a
human (§8), and the residuals (§9).

⚠️ **The risk floor holds for every build step.** Step 2 publishes note-body
text and sanitises it, through a CommonMark parser and an allowlist over its
tokens (§3.1.1); step 3 publishes a larger copy of every cover.
Both are input validation and "anything published". Step 1 is the gate that
guards step 2. Step 4 changes what the page's Content Security Policy admits
and puts the published text on screen. So each runs on the **security route**:
the security pair on its diff, whatever tier its ticket carries.

⚠️ **Nothing here is built.** [`docs/notes-on-the-shelf.md`](../notes-on-the-shelf.md)
is the design this finishes; it now points here.

---

## 1. What ships

| | Value | Chosen on |
| --- | --- | --- |
| **The published section** | `## Thoughts`, exact, case-sensitive, trailing whitespace ignored | the map |
| **What reaches the site** | `notes/<id>.json`, `{ "paragraphs": string[] }`, plain text, one per book with a publishable section | §3.1, [#368](https://github.com/mephistopheles4/stacks/issues/368) |
| **Who reads the vault for it** | one new `VaultAdapter` method, called by the publisher only | the map, [ADR-0100](../adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md) |
| **What a click does** | picks the book up, for every book; the card overlay retires | the map, §3.4, [ADR-0102](../adr/0102-pickup-replaces-the-card.md) |
| **The motion** | the book comes to the camera in overlapping stages, about 1.3 s, played by GSAP from `gsap/gsap-core` | [#371](https://github.com/mephistopheles4/stacks/issues/371), [ADR-0103](../adr/0103-gsap-plays-the-pickup-motion.md) |
| **The text on the page** | a DOM element placed by three's `CSS3DRenderer`, updated in the same frame as the render | [#369](https://github.com/mephistopheles4/stacks/issues/369) |
| **The held cover** | a 1200 px copy of the vault cover, staged beside the 512 px one, named by `heldCover` in `library.json` | [#377](https://github.com/mephistopheles4/stacks/issues/377), §3.3, [ADR-0105](../adr/0105-a-cover-has-a-shelf-tier-and-a-held-tier.md) |
| **The tuner** | Tweakpane + `@tweakpane/plugin-essentials`, lazy, behind `?debug` on the live site | [#375](https://github.com/mephistopheles4/stacks/issues/375), [ADR-0104](../adr/0104-tweakpane-tunes-the-pickup-behind-debug.md) |

**Two new runtime dependencies reach a visitor or a `?debug` page**, and each
has a record: GSAP to every visitor (about 19.6 KB gzip, measured on #370), and
Tweakpane with essentials only to a page that asked for `?debug` (about 63 KB
gzip, lazy). `CSS3DRenderer` and `ImageBitmapLoader` come from three, which is
already here.

**One more runtime dependency runs at build time and reaches no visitor**:
`micromark` with its GFM table and GFM footnote extensions, in `core`, reading
the Thoughts section. Every package in its closure is already in the lockfile
through `markdownlint` (§3.1.2,
[ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md)).

---

## 2. The verdicts, and where each lives

| Verdict | Ticket |
| --- | --- |
| **The split gate lands first and arms itself**: G2 (`public-build`) gains the presence half as a vitest `test.fails`, which goes red by itself once the extractor makes it pass. No new row, no disarmed flag. A vacuity guard, an `orphan-note` inspector rule, planted cases in existing fixtures | [#367](https://github.com/mephistopheles4/stacks/issues/367) |
| **Plain text, stripped by hand** the way `remove-markdown` does; paragraphs as a list; `%%`, `<!--` or more than about 8,000 characters withholds the whole section; no rendering, ever. **Amended twice on [#411](https://github.com/mephistopheles4/stacks/issues/411)**: only plain prose ships ([ADR-0106](../adr/0106-thoughts-ship-only-plain-prose.md), which replaces rules 2 and 6), and the section is read by a CommonMark parser rather than stripped line by line (§3.1.1, [ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md)). Plain text, paragraphs, the cap and no rendering stand | [#368](https://github.com/mephistopheles4/stacks/issues/368) |
| **Page-mapped DOM text**, same-frame updates (0.3 px against 17 px one step late), fading in past about 95° of cover swing; the book settles square to the camera; a phone frames the right-hand page alone; pickup animates the shelf's own `THREE.Group` and reuses `?solo`'s build path | [#369](https://github.com/mephistopheles4/stacks/issues/369) |
| **GSAP plays, Tweakpane tunes, Theatre.js is out**; GSAP for the owner's fluency over a zero-byte option, with its licence a known trade | [#370](https://github.com/mephistopheles4/stacks/issues/370) |
| **The choreography, accepted as prototyped**: book to camera, a 55% veil over the shelf, reverse at 1.6× to put back, put-back-then-pick-up on a second click, a hard cut under reduced motion, the shadow map redrawn on leave and land. The open spread's alignment was left as polish; §3.6 promotes it to a done-criterion | [#371](https://github.com/mephistopheles4/stacks/issues/371) |
| **The pickup tuner moves to Tweakpane first**, behind `?debug` on the live site; the rest of the `?debug` page moves later. The spec locks the library, the CSS route, two gates and the honesty floor; the tuner's layout is shaped in use | [#375](https://github.com/mephistopheles4/stacks/issues/375) |
| **Tweakpane is blocked by the CSP as shipped and fixable without loosening it**: empty `<style data-tp-style>` placeholders, the CSS through a lazy `<link>` | [#376](https://github.com/mephistopheles4/stacks/issues/376) |
| **A 1200 px held copy from the vault only**, swapped in once decoded off the main thread, freed on put-down, staged by both builds through the shelf stage's own filter; no release of other covers until G15 (`cover-budget`) goes red; `gate:public` extended first | [#377](https://github.com/mephistopheles4/stacks/issues/377) |

**Settled while charting**, with no ticket, and carried as they stand on the
map: one extractor for both builds; the heading locked as `## Thoughts`, with
`stacks add` writing it above `## Notes`; the section boundary and its
fail-closed cases; embeds withhold the section and links flatten to their
text; the adapter method; pickup replacing the card; Escape, an empty-space
click and the back button putting a book back; reduced motion jumping straight
to open; tuned values as plain constants in `shelf-settings.ts`. The wording
lives in the map's [Notes](https://github.com/mephistopheles4/stacks/issues/366).

---

## 3. Decided in this spec

The map left these to the spec, as fog or as a choice a ticket handed on. Each
carries a recommendation the owner confirms at sign-off (§8).

### 3.1 The `notes/<id>.json` schema

```json
{ "paragraphs": ["First paragraph.", "Second paragraph,\nwith a kept line break."] }
```

- **One key, `paragraphs`, a non-empty array of non-empty strings.** Nothing
  else: no version field (#368: the page and the JSON ship in one deploy), no
  book id (the file name carries it, and `orphan-note` holds the name to
  `library.json`), no title (that is `library.json`'s).
- **`<id>` is the book's `LibraryBook.id`**, the slug-and-hash `idFor` already
  derives. It is never a vault path.
- **A withheld section emits no file**, exactly as a book with no section does.
  The page therefore never shows part of a section; it shows the book without
  Thoughts. The warning names the note and **never quotes the section**, so the
  owner finds out locally and the terminal holds no Thoughts text.
- **The two caps are numbers, not estimates.** The extractor withholds a
  section of more than **8,000** Unicode code points, counted on the raw
  section text before stripping (#368's "about 8,000"). The inspector refuses a
  notes file over **40,000** bytes: 8,000 code points at four bytes each in
  UTF-8, plus room for the JSON around them. The second cap exists so a bug that
  bypassed the first still fails the build.
- **A named-keys inspector rule holds it**, in the published folder: a file
  under `notes/` must parse as exactly this shape, stay under the byte cap, and
  contain no URL scheme (§5, `notes-shape`). #367 deferred this rule until the
  schema existed; it now does.
- **`library.json` says which books have a file**: `thoughts: true` on a book
  whose `notes/<id>.json` was written, absent otherwise. A path is not note-body
  text, and neither is this flag. It saves a 404 on most pickups and lets the
  page lay out the right-hand page before the fetch returns. `orphan-note`
  holds the two in both directions: every flagged book has a file, and every
  file a flagged book. `unknown-key` learns the key.
- **What the page shows while the fetch is out.** The fetch starts on the click.
  The right-hand page lays out the card's lines (§3.4) at once; Thoughts that
  arrive before the text fades in take their place above them. Thoughts that
  arrive later fade in at rest. A fetch that fails leaves the card's lines, with
  no error shown; the shelf degrades to what it shows today, as the map
  promised.
- **The folder is pruned on every build** to exactly the files this build
  wrote, under `pruneCovers`'s rule: files only, and only where a previous
  `library.json` marks the folder as one this tool stages into. Without it, a
  section the owner deleted or that became withheld would ship again from the
  last build: `idFor` is stable, so the stale file still names a listed book and
  passes `orphan-note`. `publish.ts` records the same leak, for covers, above
  `copyCovers`.

#### 3.1.1 How the section is read

**Amended on [#411](https://github.com/mephistopheles4/stacks/issues/411),
2026-10-10, after three rounds of review.** This replaces the line scan and
the withhold table this section carried until then. The owner's decision, from
chat: "Adopt the parser." The record is
[ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md), which
amends ADR-0101 and ADR-0106. ADR-0106's allowlist stands; it now applies to
the parser's tokens rather than to lines.

**The extractor parses the note body with `micromark`'s tokenizer** and reads
the event stream. The body is everything below the frontmatter block. The
extractor calls `preprocess`, `parse` and `postprocess` only. **It never
compiles to HTML**: no named import of `micromark` or `compile`, and no
extension whose name ends `Html`. The package's entry loads its compiler
module whatever is imported; the rule is about what the extractor calls, and a
grep of `packages/core/src` checks it.

**Only the default build runs.** `micromark` ships a `development` build that
can trace its whole parse to stderr, private remainder included, when `DEBUG`
names it. The adapter checks at load that `micromark` resolved to its default
entry, not `dev/`, and withholds every section otherwise. Vitest's resolve
conditions are set to match the CLI's, so the tests run the build that
publishes. The build session records both in `docs/progress.md`.

**The steps, in order.** Each one that fails withholds the whole section,
with a warning that names the note and the shape and never quotes the text.

1. **No frontmatter block:** absent, as before.
2. **Line endings and size.** A lone CR, a U+2028 or a U+2029 anywhere in the
   source, frontmatter included, withholds. This is a hand rule: CommonMark
   ends a line at a lone CR, and Obsidian may not. A body of more than
   **20,000** code points withholds **before it is parsed**, so no note, and
   no provider description written into one, can stall the build. That is
   seven times the longest real note body, 2,768 code points. **It was 200,000
   until round 4 of move 4 on #415 measured the tokenizer**: its cost grows with
   the square of some shapes, so a run of `*_` emphasis marks took 0.9 s at
   20,000 code points, 3.9 s at 40,000 and minutes near 200,000. The owner chose
   this number (D12). Round 5 timed seventeen more shapes at the cap; the
   slowest, a run of closing brackets, took 1.8 s.
3. **The start.** Only **root-level** headings count, never one inside a list
   item, a quote or a callout. The section starts at a root-level ATX heading
   of level 2 whose text, trimmed, is exactly `Thoughts`. With none, the
   section is absent. With two or more root-level level-2 headings reading
   `Thoughts`, ATX or setext, the section withholds.
4. **The end.** The section ends at the next root-level heading of level 1
   or 2, or at the end of the body. If that heading is a setext heading, the
   section withholds. A heading of level 3 or deeper stays inside.
5. **HTML above the section.** Any HTML token between the start of the body
   and the section's heading withholds: an HTML block, inline HTML or an HTML
   comment, closed or not. Raw HTML above can hide the section in reading view
   while it still ships. As a raw guard too, the hand version's rule stays:
   any `<` followed by a letter, `/`, `!` or `?` above the section withholds,
   whether or not the parse read it as HTML.
6. **Raw guards, from the start of the body to the section's end.** Any of
   these withholds: `%%`; a run of three or more backticks or three or more
   tildes, at any indent and behind any marker; `$$`. These are hand rules on
   raw text, and they exist because Obsidian may draw a block's extent
   differently from CommonMark. Where it does, the parse could take a heading
   that reading view shows as code or as a comment, which is round 3's leak.
   The cost: a code fence, a math block or a `%%` comment anywhere above the
   Thoughts withholds them. `stacks add` writes `## Thoughts` above
   `## Notes`, so the usual note keeps none of those above it.
7. **Raw guards in the section.** Any of these withholds:
   - more than **8,000** Unicode code points of section text, counted across
     line breaks and with trailing whitespace excluded;
   - two or more `$`, **whatever escapes them** (a single `$` ships);
   - `![`, in any form: an image, an embed or a bracket with no definition;
   - `^[`, an inline footnote;
   - `::`, a Dataview field;
   - a control character other than tab and line feed (C0, DEL or C1);
   - a Unicode tag character, U+E0000 to U+E007F, which encodes letters that
     draw as nothing and ship as readable text;
   - **a near-miss heading**: a line that, after any whitespace or invisible
     format characters, starts with one or two `#` followed by any whitespace
     or format character. A heading Obsidian may draw but CommonMark reads as
     text, through a no-break space after the hashes or a zero-width space or
     byte-order mark before them, would otherwise let the section run on into
     the private remainder. A real `##` heading never reaches this check,
     because it ends the section, and a `#tag` or a `###` does not match.
     **Bare hashes** behind such a character count too, and so does **a setext
     underline carrying one**: a line of only `-` or only `=` among
     whitespace and format characters, at least one of them neither a plain
     space nor a tab (round 4);
   - **an HTML comment marker**, `<!--`, `-->` or `--!>`, anywhere in the
     section's raw text, link addresses and titles included. The allowlist
     skips those whole, so step 10 never reads them, and Obsidian might pair
     two of them round words that ship (round 4).
8. **The token allowlist, inside the section.**
   - **Blocks that ship:** a paragraph; an ATX heading of level 3 to 6, whose
     text ships as its own paragraph; a thematic break, which ships as `---`;
     a bullet or ordered list one level deep, whose items each hold
     paragraphs only, with their marks kept; blank lines.
   - **Every other block withholds.** That includes a block quote (and with
     it every callout), fenced or indented code, HTML, a setext heading, a
     table, and a link or footnote definition. It also includes a list nested
     in a list, and any block other than a paragraph inside a list item, such
     as a heading, quote or fence behind a bullet.
   - **Inline tokens that ship:** text; a character escape, whose character
     ships; emphasis and strong, with the marks dropped and the words kept;
     hard breaks; line endings, kept as `\n`; and links with an address of
     their own, of which **only the label ships**. A link's destination and
     title never ship.
   - **Every other inline token withholds:** a code span, inline HTML, an
     image, an autolink, a character reference such as `&amp;`, and a footnote
     call.
   - **So does a reference link**, full, collapsed or shortcut. Its
     definition sits outside the section, since one inside withholds, so
     shipping its label bare would tell a reader the private part defines
     that name (round 5, D13).
   - **So does a tag start in a link's address or title**: those are skipped
     unread, so step 10 and the deploy's twin never see them (round 5).
9. **Obsidian's marks, on the text that ships.** These are hand rules, since
   no CommonMark parser knows them:
   - A wikilink flattens to its alias. With no alias, it flattens to its
     target without the `#heading` or `^block` part.
   - A block id at the end of a line is removed.
   - `==highlight==` and `~~strike~~` lose their marks and keep their words.
   - A `[[` or `]]` left after flattening withholds.
10. **The output check, on each paragraph that ships**, after every strip and
    every escape is applied. Each of these withholds:
    - a comment marker: `%%`, `<!--`, `-->` or `--!>`;
    - a tag start: `<` followed by a letter, `/`, `!` or `?`;
    - a URL scheme: `://`, `file:`, `obsidian:` or `mailto:`, in any case;
    - every pattern of step 7 except the cap.

    So an escaped mark that the strip restores, such as `\<div` or `\%%`,
    withholds at extraction. It can never reach the inspector and fail the
    deploy (round 3's adversarial F6).
11. **Nothing left:** absent.

**The inspector mirrors step 10 as a twin.** `notes-shape` refuses the same
set of marks, from its own pattern list beside `HIDDEN_MARKER`, never a shared
import (`DERIVED_KEYS`'s reason). A correct build therefore never writes a file
the inspector refuses, and an extractor regression on any of those marks still
fails the build (round 3's adversarial F7). A lone backtick, a single `$` and
`]:` in running text are **not** in it, because the parser ships them as
literal text when they open no code span and no definition.

**The `## About` writer reads through the same parse.** `insertBodySection`
finds `## Notes` as the first root-level level-2 ATX heading in the body that
reads `Notes`. That excludes the frontmatter, fenced lines and subheadings, so
the writer and the extractor cannot read `## Notes` differently.
`disarmBodyText` keeps its own hand predicates, which read wider than
CommonMark: for text being written, matching wider is the safe direction. It
gains these, so that provider text can neither open a section nor trip a
guard that would withhold the owner's. **Each reads a line at any indent**,
since in a list item a line indented four spaces or a tab is a paragraph, not
code (round 5, D14):

- **A setext underline**, only `=` or only `-` with trailing whitespace
  allowed, is escaped. Otherwise a
  description holding `Thoughts` over a line of dashes would be a second
  `Thoughts` heading, and step 3 would withhold the real section.
- **Every run of three or more backticks or tildes, anywhere in a line, every
  `$`, and every `[^`** become character references. Escaping only a
  line-start fence opener leaves the run in the raw text, where step 6 reads
  it on a note whose `## About` sits above its Thoughts; a provider's `[^x]:`
  would turn an owner's `[^x]` into a footnote call.
- **A `[` that opens a line**, after its indent and any list markers,
  becomes a character reference, so no description line reads as a link
  definition. A definition applies to the whole note, so one could turn the
  owner's bracketed words into links, or read a wikilink's inner brackets as
  one (round 4).
- **A heading behind list markers** is escaped too, so disarmed text parses
  to no heading even inside a list item (round 4).
- The one-off `## About` search of §8 counts these shapes too.

`insertBodySection` itself refuses three writes, each with a warning naming
the note and never quoting the text:

- **A description over 8,000 code points**, as the provider sent it: three
  times the longest real `## About`, 2,605 code points, so provider text
  cannot bring a shape the tokenizer is slow on (round 4, D12).
- **A write that leaves the note body over step 2's 20,000**, measured on the
  note as it would be written, after the disarm, which can make a text five
  times longer. That is what keeps provider text from carrying a note past
  step 2's cap (round 5, D16).
- **A write that changes what the Thoughts ship**, or why they withhold: the
  extractor reads the note before and after, so a shape the disarm misses
  still changes nothing the owner publishes (round 5, D16).

#### 3.1.2 The dependency

**Four packages, pinned exactly** in `packages/core/package.json`:
`micromark` 4.0.2, `micromark-extension-gfm-table` 2.1.1,
`micromark-extension-gfm-footnote` 2.1.0, and `micromark-util-types` 2.0.2,
which is type-only and names the event and token types the extractor reads
(`micromark`'s own types re-export none of them). Why each earns its place,
the full supply-chain list and the versions not taken are in
[ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md). In
short:

- **No new package version enters the lockfile.** All 32 packages in the
  closure are there already, through `markdownlint`. What changes is that they
  run at build time over the owner's vault.
- **They reach no visitor.** The site may only `import type` from `core`.
- **The tables extension** makes a table a token, which withholds. A table
  pattern by hand missed the one-column table in round 3.
- **The footnote extension** makes a call to a footnote defined elsewhere in
  the note a token, which withholds. Without it, the label ships as text.
- **The math extension is recommended out**, as a decision for the owner at
  sign-off (§3.1.3). Its entry point imports KaTeX at load, with no way to
  import the syntax alone. The `$` and `$$` rules of steps 6 and 7 withhold
  the same sections with no package.
- **pnpm's release-age quarantine is not a control here.** Nothing sets it
  ([#399](https://github.com/mephistopheles4/stacks/issues/399)), and an exact
  pin is not subject to it. Release age is checked by hand. Every version
  pinned here is over seven months old.
- **The CommonMark rules live below the pins.** `micromark` reaches
  `micromark-core-commonmark` and the other tokenizer packages by caret
  ranges, shared with `markdownlint`, so a lockfile refresh could move them
  with no pin changing. A unit test in `core` resolves every package of the
  closure from `core`'s location and compares each version with a committed
  list, so any move is red. **A bump of any package in that closure is its
  own change, on the security route.**
- **Dependabot is kept off the family.** `.github/dependabot.yml` ignores
  `micromark` and `micromark-*`, every update type, beside the entry it
  already has for `three`. A bump arrives only as that deliberate change;
  Dependabot's alerts still report an advisory.
- **What it costs in rules.** The design carries about 22 flat hand patterns,
  against the prototype's 11 and the hand module's 30 or so. None of the 22
  reads structure; that is the parser's, which is what changed.

#### 3.1.3 Decisions the parser forces

**The prototype on #411 differed from the hand extractor in 31 of the
existing tests**, all in `thoughts-section.test.ts`. 24 differ in a way that
publishes nothing new, so the build updates each test to the new answer:

- 19 give a different reason string;
- 3 group the same text into paragraphs differently;
- 2 publish nothing either way, swapping absent for withheld.

The other 7, and the open questions the build session left, take a
recommendation each. **The owner confirms or overrides them at sign-off**
(§8).

| # | The difference or question | Recommendation |
| --- | --- | --- |
| D1 | A heading indented under a list item: the hand version shipped the item; the parser withholds | **accept**: stricter |
| D2 | `$20, or \$5`: the hand version shipped it; the parser read math and withheld | **accept**: under step 7 any two `$` withhold, escaped or not, so the test "ships a single dollar sign, and escaped ones" flips. A single `$` still ships. The cost is a section that names two prices |
| D3 | A backtick run that opens no fence, such as three backticks before `a` and a backtick | **keep withholding**, through step 6's raw guard. A lone backtick that opens no code span ships as a literal character, which reading view shows |
| D4 | A list continuation, an indented line in an item's paragraph: the hand version withheld; the parser ships it as part of the item | **accept**: reading view shows it. Lazy continuation goes to the Obsidian check (§3.1.5) |
| D5 | A heading indented one to three spaces: the hand version withheld; the parser reads a heading | **accept**: `###` ships its text, and `##` ends the section |
| D6 | A closed HTML comment above the section: the hand version withheld; the parser ships | **keep withholding**, through step 5. Round 1 found raw HTML above hiding the section; #368 counted no HTML in the vault, so this costs nothing |
| D7 | `![x]` with no definition: the hand version withheld; the parser ships it as text | **keep withholding**, through step 7's `![`. Obsidian's reading is unverified, and the vault holds no images in Thoughts |
| D8 | The math extension, which the prototype used | **leave it out** (§3.1.2). The hand rules of steps 6 and 7 withhold the same sections, and KaTeX stays out of the runtime. Taking it instead pins `micromark-extension-math` 3.1.0, which brings `katex` 0.16.47 and `commander` 8.3.0, and makes math a token, which withholds. **The `$$` and two-`$` guards stay either way**: they exist because Obsidian may end a block where the parser does not, and that holds for the extension's math too |
| D9 | Whether the `## About` writer's `## Notes` lookup uses the parser too | **yes** (§3.1.1), with setext underlines added to the disarm |
| D10 | What carries over from round 3 | the inspector twin of step 10 (adversarial F7); integrity's gaps F4 and F10 to F12 as done-criteria; and every finding in round 3's [standards pair report](https://github.com/mephistopheles4/stacks/issues/411#issuecomment-6092778405) and [`unstated-lens` report](https://github.com/mephistopheles4/stacks/issues/411#issuecomment-6092745849), each fixed or given a disposition in round 3's Lens dispositions |
| D11 | A comment closer, `-->` or `--!>`, above the section with no opener: the hand version withheld; step 5 lets it through. Missed by the prototype's count, because the test holding it failed first on D6 | **ship it**: owner decision, from chat, on #411 (2026-10-10). An opener of any form above the section still withholds, and a lone closer hides nothing |
| D12 | Round 4 of move 4 measured the parse growing with the square of some shapes, under step 2's 200,000 | **owner decision, from chat (2026-10-10): option A** — the body cap is 20,000 code points, and `insertBodySection` writes no description over 8,000. A note body over 20,000 never ships its Thoughts; none does today |
| D13 | A reference link, full, collapsed or shortcut, whose definition sits outside the section: it shipped its label, and N51 said so. Round 5 found that shipping the label bare, and not in its brackets, tells a reader the private part defines that name | **withhold** (round 5, adversarial F2; the session's recommendation, taken as the default): N51 flips. A link with an address of its own still ships its label, and bracketed words matching no definition ship as written |
| D14 | The disarm read CommonMark's three spaces of indent, so a list item's continuation, indented four spaces or a tab, kept a definition or a heading live | **disarm at any indent** (round 5, behaviour F2): a heading indented four spaces outside a list is code, and now gains a backslash that shows in the private `## About`. One test's expected value moves with it |
| D15 | Two reason strings changed wording during the rebuild: two `Thoughts` headings now says "one of them perhaps underlined with `---`", and the development build adds "run without a `development` condition (check NODE_OPTIONS)" | **accept**: wording only, each changed with its code (round 5, integrity F11 and F12) |
| D16 | The 8,000 cap counts a description before the disarm, which can make it five times longer, so a description under it could carry a note past 20,000 and withhold its Thoughts for good | **check the note as it would be written** (round 5, behaviour F1 and adversarial F1): `insertBodySection` refuses a write that leaves the body over 20,000, and one that changes what the Thoughts ship, or why they withhold. The 8,000 cap stays as D12 set it. A note already over 20,000 gets no `## About`, since its `## Notes` cannot be found |

#### 3.1.4 The named cases

**Every shape the three review rounds found, the prototype's 20 shapes and 4
controls, and #367's and #368's cases each get an extractor unit test**, named
for its id below.

- **Each test asserts the result's kind, and for a withhold its exact reason**,
  so the rule that is meant to catch the shape is the one proven (round 3's
  integrity F9).
- **The canary sits where a misread would leak it.**
- **The existing tests stay unless §3.1.3 changes them.**
- **Inputs are string literals in the test source**, never committed fixture
  files: `.gitattributes` normalises line endings on checkout, which would
  erase the CR the line-ending cases need.
- **Red first, though the hand extractor passes most of them.** The cases are
  written against a new parser-backed export that starts as a stub, so each is
  observed red; the adapter switches to it once they are green.
- **"Not shipped" means absent or withheld**, and the canary appears in no
  result.

Sources are `R1`, `R2` and `R3` for move 4's rounds on #415, at 2e9e40f,
89f8f62 and 5688ea6. They are followed by the lens and finding, and `P` is
the prototype.

**The boundary and the start**

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N1 | The section between `## Thoughts` and the next `##`, the canary under `## Notes` | shipped, no canary | #367 |
| N2 | The section ends at a `#` heading | shipped, no canary | #367 |
| N3 | A `###` inside the section | its text ships as a paragraph | #367 |
| N4 | Trailing whitespace, and closing hashes, on the heading | found | #367 |
| N5 | `## thoughts`, `## Thoughts#`, `### Thoughts` | absent | #367; R2 integrity F2 |
| N6 | Two `## Thoughts` headings | withheld, neither ships | #367 |
| N7 | A setext `Thoughts` heading beside an ATX one | withheld (step 3) | step 3 |
| N8 | `## Thoughts` inside a fence, a quote or a list item | not a start | #367; step 3 |
| N9 | A `## Thoughts`-shaped line in the frontmatter, as a YAML comment | not a start | R1 integrity F3 |
| N10 | No frontmatter block | absent | — |
| N11 | A lone CR, U+2028 or U+2029: on `## Notes`, elsewhere in the body, and in the frontmatter | withheld (step 2) | R1 behaviour F1, adversarial F1, data F1; R3 integrity F4 |
| N12 | A CRLF note | read as LF | — |
| N13 | A setext heading ending the section, with `===` and with `---` followed by trailing spaces | withheld (step 4) | R2 integrity F3; R3 integrity F1 |
| N14 | `===` as the section's first line, with no paragraph above it | shipped as text, no crash | R3 integrity F2 |
| N15 | A thematic break after a blank line, and under a subheading | shipped as `---` | R1 integrity F9 |
| N16 | An `## About` the merge inserted after the Thoughts | none of `## About` ships | §4 |
| N17 | A description holding a `## Thoughts` line, a `Thoughts` setext pair and an unclosed fence, written through `insertBodySection` | none of it ships | §4; step 3 |

**Above the section**

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N18 | A fence behind a list marker holding an indented copy of the heading, the canary below | not shipped (step 6) | R3 adversarial F1(a); P |
| N19 | A two-space fence in a list item, then a margin fence line | not shipped (step 6) | R3 adversarial F1(b); P |
| N20 | A `$$` block holding a copy of the heading | not shipped (step 6) | R3 adversarial F1(c); P |
| N21 | A fence never closed | not shipped | #367 |
| N22 | Closer-shaped lines that close nothing: a run with an info string, text before or after the run, a shorter run, a backtick run in a tilde fence and the reverse, and a tilde fence whose info string holds a backtick | not shipped | R1 integrity F4 to F7; R2 integrity F1 |
| N23 | An HTML block with a blank line before the heading; inline HTML; an HTML comment, closed and open | withheld (step 5) | R1 data F4; D6 |
| N24 | `%%`, open or closed, and inside a fence | withheld (step 6) | #368 rule 4 |
| N25 | A cover embed `![[cover.jpg]]` above the heading | shipped: step 7 reads the section only | existing |
| N26 | A comment below the section's end | shipped | P control |

**Blocks in the section**

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N27 | Fenced code, backtick and tilde, bare, tagged `text` and tagged `dataview`, closed and not | withheld | R1 adversarial F4, data F3 |
| N28 | A fence swallowing `## Notes`, its closer below | withheld | existing |
| N29 | Indented code | withheld | — |
| N30 | A quote; a callout; a folded callout; a heading in a quote; a query fence in a callout | withheld | #368 rules 2 and 6, replaced by ADR-0106; R2 behaviour F2, data F2 |
| N31 | Behind a bullet: a `##` heading, a `#` heading, a quote, and a folded callout with a lazy line | withheld | R3 adversarial F2, data F1, behaviour F3; P |
| N32 | A nested list; a fence in a list item; a heading indented under a list item | withheld | R1 adversarial F3; D1 |
| N33 | A list continuation, indented inside an item's paragraph | shipped as part of the item | D4 |
| N34 | A `###` indented three spaces, and a `##` indented two spaces | the first ships its text; the second ends the section | D5 |
| N35 | Link definitions: plain, in a list item, in a quote, with a label over two lines, and a footnote definition | withheld | R2 behaviour F1, adversarial F1, data F4 |
| N36 | Tables: two columns with outer pipes, two without, one column, and alignment colons | withheld | R3 adversarial F2, data F3, behaviour F4, integrity F3 |
| N37 | HTML: a block, an inline tag, a tag split across lines, `<!x`, `<?x` and `<![CDATA[` | withheld | R1 adversarial F2 |
| N38 | A setext heading inside the section | withheld | — |

**Inline in the section**

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N39 | A code span; an inline query, a code span opening with `=` | withheld | R2 adversarial F4, data F3, unstated F3 |
| N40 | A backtick run that opens no fence | withheld (step 6) | D3 |
| N41 | A lone backtick | shipped as a literal character | D3 |
| N42 | An inline image, a reference-style image, `![x]` with no definition, and an embed | withheld | R1 behaviour F3; D7 |
| N43 | An autolink; a bare `https://` address; `file:`, `obsidian:` and `mailto:` text | withheld | §3.1 |
| N44 | A character reference: `&lt;` and `&amp;` | withheld | step 8 |
| N45 | A footnote call whose definition sits under `## Notes` | withheld | R3 data F4; P |
| N46 | An inline footnote, `^[…]` | withheld | R3 adversarial F5 |
| N47 | A Dataview field, bare, in square brackets and in round brackets | withheld | R3 adversarial F5, data F4 |
| N48 | Math: inline with a `%` comment; a `$$` block; a doubled backslash before either `$`; `$20, or \$5` | withheld | R2 data F4; R3 adversarial F4, data F2, behaviour F2; D2 |
| N49 | `It cost $20.` | shipped | D2 |
| N50 | Links: inline; text over two lines; a destination with balanced brackets or parentheses; a title in quotes and in parentheses | the label ships; the canary, in the destination or title, does not | R3 adversarial F3, data F3, behaviour F1; P |
| N51 | A reference link whose definition sits under `## Notes` | withheld since D13; its label shipped before round 5 | R3 integrity F6 |
| N52 | Escaped marks the strip restores: `\<div`, `\%%`, `<\!--` and `--\>` | withheld (step 10); a G20 build of such a note passes the inspector | R3 adversarial F6 |
| N53 | A control character, U+0001 | withheld (step 7) | R3 adversarial F6 |
| N54 | 8,000 code points ship and 8,001 withhold, counted across line breaks and in code points rather than UTF-16 units | as stated | #368 rule 7; R3 integrity F5 |

**Wikilinks**, outside a table because their bar is a table's cell separator:

- **N55** — `[[target]]` ships `target`. `[[target|alias]]` and
  `[[target#heading|alias]]` ship `alias`. `[[target\|alias]]`, with an
  escaped bar, ships `alias`. An alias with spaces round it is trimmed. A `[[`
  left over withholds. Sources: R3 data F3 and integrity F8; P.

**The strip, the controls and the writers**

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N56 | Emphasis, strong, strike and highlight lose their marks; `snake_case` keeps its underscore; a tag stays; a block id goes; list marks stay; trailing spaces are trimmed | as stated | #368 rules 1, 2 and 6; R3 integrity F7 |
| N57 | Plain prose; a list; a flattened link | shipped | P controls |
| N58 | `## About` lands above `## Notes` only when that is a root-level level-2 heading in the body: never one in the frontmatter, a fenced one, or a `###` | as stated | R1 adversarial F6; R2 integrity F4 |
| N59 | Disarmed text: lone CRs become LF; `<`, `>` and `%%` become entities; heading lines, fence openers and setext underlines are escaped. Parsed, it holds no heading, code fence or HTML token | as stated | R1 behaviour F2, data F2, adversarial F5; D9 |
| N60 | `notes-shape` refuses each mark of step 10, with one G20 plant each, as well as a non-canonical byte form | refused | R2 adversarial F5, data F5; R3 adversarial F7 |

**Added by the amendment's own review** (move 2 on #411, `plan-411`)

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N61 | `## Notes` with a no-break space after the hashes, and with a zero-width space or a byte-order mark before them, the canary below | withheld (step 7, near-miss heading); a `#tag` line and a `###` still ship | adversarial F1, data F1 |
| N62 | A run of Unicode tag characters in a paragraph | withheld (step 7) | data F4 |
| N63 | An incomplete tag, such as `a <b` with no `>`, above the heading | withheld (step 5's raw guard) | adversarial F7 |
| N64 | A body over the cap, 20,000 code points since D12 | withheld before it is parsed | adversarial F6 |
| N65 | `micromark` resolved to its `dev/` entry | every section withheld | adversarial F8, data F3 |
| N66 | A description holding a mid-line backtick run, `$$`, a `[^x]:` definition, and an indented setext underline under `Thoughts`, written onto a note whose `## About` sits above its Thoughts | the owner's section still ships | adversarial F5; unstated F2 |
| N67 | A package of `micromark`'s closure at a version other than the committed list's | the closure test is red | adversarial F3 |

**Added by round 4 of move 4 on #415**

| Id | Shape | Expected | Source |
| --- | --- | --- | --- |
| N68 | A wikilink whose label a reference definition elsewhere in the note matches, with an alias and without | withheld (a wikilink did not flatten): neither the brackets nor the target behind the alias ship | behaviour F2, adversarial F1 |
| N69 | An HTML comment marker in a link title or address, a pair round shipped words | withheld (step 7) | data F1 |
| N70 | Bare hashes behind a no-break or zero-width space; a setext underline carrying a no-break space, or behind a zero-width one | withheld (step 7, near-miss heading); a plain thematic break and dashes inside a line still ship | behaviour F4, adversarial F3 |
| N71 | A body of exactly 20,000 code points, and one more | the first is read, the second withheld before it is parsed | integrity F4; D12 |
| N72 | A description over 8,000 code points, and one of exactly 8,000 | the first is not written, with a warning naming the note and never quoting it, and the owner's Thoughts still ship; the second is written | adversarial F2, behaviour F1; D12 |
| N73 | A description whose lines open with link definitions, behind list markers too | written with each `[` as a character reference; the owner's wikilink and bracketed words ship unchanged | adversarial F1 |
| N74 | A description holding a heading behind list markers | the hashes escaped; parsed, it holds no heading token | behaviour F3 |

**Round 5 of move 4 added five**, each seen red before its fix:

| # | Case | Result | Round 5 finding |
| --- | --- | --- | --- |
| N75 | A description under 8,000 code points, dense in characters the disarm expands, onto a note it would carry past 20,000; a note body landing at exactly 20,000, and one more; a note already over 20,000 | not written, with a warning naming the note and never quoting it, and the owner's Thoughts still ship; exactly 20,000 is written | behaviour F1, adversarial F1; D16 |
| N76 | A description the disarm missed, which would open a section on a note with none or withhold the owner's | not written, with a warning naming the note; the test switches the disarm off to reach it | behaviour F1, adversarial F1; D16 |
| N77 | A description whose list item continues on lines indented four spaces or a tab, holding a definition, a heading and a setext pair | each disarmed; parsed, it holds no definition or heading token | behaviour F2; D14 |
| N78 | A tag start in a link's quoted or parenthesised title, or in its bare address | withheld (step 8): those parts are skipped unread, so step 10 and the deploy's twin never see them | data F1 |
| N79 | A full, collapsed or shortcut reference link whose definition sits under `## Notes` | withheld (step 8), so no reader learns whether the private part defines that name; bracketed words matching no definition still ship, and a wikilink matching one still withholds as N68 | adversarial F2; D13 |

**The non-extractor gaps carry over as done-criteria of step 2:**

- **Round 3's integrity F10:** the takedown branch's refusal is observed red.
- **Round 3's integrity F11 and F12:** inspector messages and the shared-id
  warning are asserted by their words.
- **The round-3 wording fixes** from the standards pair and `unstated-lens`.

#### 3.1.5 What CommonMark does not settle

**The parser decides structure as CommonMark does. Reading view is
Obsidian's, and the two are not the same.** These shapes are unverified in
Obsidian's reading view:

- lazy continuation in a list item;
- an escaped-bar wikilink outside a table;
- a footnote call with no definition;
- a heading indented one to three spaces;
- how `[[target#heading]]` displays;
- a `##` with a no-break space after it, and one with a zero-width space
  before it (N61 withholds both; the check says whether that rule is needed
  or merely cautious).

Shapes a hand rule already withholds whatever Obsidian shows are left out:
two `$`, `![x]` with no definition, and a fence inside a list item.

**The check is the owner's** (§8). The build session writes a scratch note of
invented text, never committed, holding each shape, **in a throwaway vault**:
a new folder the owner opens as its own vault, never the real one, so no real
build can read it. The folder is deleted afterwards. The owner opens the note
in reading view and says, for each shape, what shows. **It happens before move
4**, so any rule it adds is in the diff the security pair reads. If Obsidian
hides text the parser ships, that shape becomes a withhold rule with a named
case. If Obsidian shows text the parser withholds, nothing changes:
withholding more is the safe side.

### 3.2 Which books get a notes file

**Only a book a public build would publish, in both builds.** The notes stage
asks the predicate the public shelf filter asks today (shelved status, not
`private: true`), lifted out of `publish.ts` into one named function both
callers share, and asks it **whatever the build mode**.

So a local build carries a private book on the shelf, as it does today, and
picking it up shows the card's lines, not its Thoughts. That is #367's planted
case read as written ("a `private: true` book with Thoughts and a wishlist book
with Thoughts, for neither of which any `notes/<id>.json` may exist", asserted
in both modes) and the map's "you see what a visitor sees". The cost is that a
private book's Thoughts are visible to nobody, the owner included, outside
Obsidian. The alternative (a local build emits them too) makes G2's local half
assert the opposite of its public half, and a local staging folder then holds
the one kind of file the inspector cannot tell apart from a leak.

**Held copies follow the shelf covers, not the notes.** #377 has them staged
through the shelf stage's own filter, which keeps every book in a local build.
A larger copy of a cover a local shelf already shows exposes nothing new.

### 3.3 The held copy's field and path

- **Field:** `heldCover` on `LibraryBook`, present only when a held copy was
  staged, for example `"held-covers/<name>"`. Absent means the shelf texture
  stays (#377).
- **Path:** a **sibling** folder, `held-covers/`, beside `covers/`, never a
  subfolder of it. Four things read `covers/` and each would have to learn
  about a subfolder: G15 (`cover-budget`) measures what lands there and would
  count a 1200 px file against the shelf's budget; `pruneCovers` removes files
  only and would leave a stale subfolder forever; `withLocalCovers` rewrites
  `cover:` to `covers/<name>`; and `orphan-cover` reads that folder's listing.
  A sibling touches none of them.
- **Its own prune**, under `pruneCovers`'s rule: files only, and only where a
  previous `library.json` marks the folder as one this tool stages into.
- **The file name is `coverFileName`'s**, the basename rule G10
  (`cover-path`) already holds, so a vault path never decides where a held
  copy lands.
- **Every held copy is re-encoded through sharp, never copied byte for byte.**
  This **replaces #377's "copied byte for byte when already inside" the cap**.
  A cover the owner photographed can carry camera metadata, location included,
  and sharp drops it by default; a byte copy would ship it. The held-tier check
  in `gate:public` adds: no held file carries EXIF or XMP.
- **The inspector learns `heldCover` four ways:** `unknown-key` admits it;
  `foreign-cover` holds it to a one-segment same-origin `held-covers/<name>`
  shape, as it holds `cover`; `orphan-held`, `orphan-cover`'s twin, fails on a
  file under `held-covers/` that no book names; and the `headers` rule requires
  a `/held-covers/*` block in `_headers` that revalidates, so a cover taken down
  does not linger in browsers for the image cache's four hours. `_headers` is
  the fifth reader of the covers path, after the four above.
- **`notes/` gets the same revalidating `_headers` block**, for the same
  reason: a withdrawn section must not live on in a browser cache.

### 3.4 What replaces the card

**The card overlay retires, and its content moves onto the held book's pages.**
Pickup replaces the card for every book (the map); this says where each part
of the card goes.

| Part of the card | Where it goes |
| --- | --- |
| Title and author | the left-hand page, as prototyped ([#371](https://github.com/mephistopheles4/stacks/issues/371)'s screenshot). **On a phone**, which frames the right-hand page alone, they lead the right-hand page too |
| Reading line, object line, subjects, links row (`cardModel`) | the right-hand page: on their own for a book with no Thoughts (#369's C, as is); **below the Thoughts**, after a rule, for a book with them, so the links stay reachable for every book |
| The close control | a **put-back control** on the right-hand page. A phone fills the screen with the page, so there is no empty space to tap; this is how a touch reader without a back gesture puts the book down |
| The enlarged cover (`cover-viewer.ts`, [ADR-0052](../adr/0052-the-enlarged-cover-is-a-real-dialog.md)) | **kept**, opened from a control among the card's lines, showing the held copy when one exists (#377) |
| The announcer (`role="status"`) | **kept**: «Title» by «Author» on pickup, changed on a second book, empty after put-back |
| The bottom sheet and its drag ([ADR-0049](../adr/0049-the-card-is-a-non-modal-bottom-sheet.md)) | **retired**. Focus still never moves on pickup, for that record's reason: there is still no keyboard path to the shelf |

Long Thoughts scroll only at rest (#369). Every text node is set through
`textContent`; nothing on the page is built from HTML (#368, rule 8).

**A screen reader reaches what a sighted reader does.** The page's text and the
put-back control are ordinary DOM in reading order, the control a real
`<button>` with an accessible name. Until the text fades in it is hidden from
the accessibility tree as well as from sight (`visibility`, not opacity alone),
so nothing is read out that is not yet on screen. G35's moved checks include
one for each.

**A lost WebGL context while a book is held puts it back as a hard cut.** The
recovery of [ADR-0091](../adr/0091-a-lost-context-falls-back-to-painted-shadows.md)
rebuilds the shelf, painted, with nothing held, and the history entry is
dropped with `history.back()`. Nothing tries to resume a pickup across a
rebuild.

### 3.5 The Phase 2 click gate, and G35

The Phase 2 gate in `AGENTS.md` says "clicking a book … opens the card". It
becomes **clicking a book picks it up**: the shelf reports the held state for
the clicked book, and the page layer carries that book's title.

G35 (`enhanced-card`) checks nine things; each is kept, moved or retired.

| G35 check | Fate |
| --- | --- |
| 1. every block renders | **moves** to the page |
| 2. `read` is not suppressed | **moves** |
| 3. the collapse rules | **moves**; "no cover starts at the title" no longer applies, since the page shows no thumbnail |
| 4. the fallback link | **moves** |
| 5. link shape and accessible names | **moves** |
| 6. the announcer | **moves**, with put-back as the dismissal |
| 7. the close control survives a swap | **becomes** the put-back control surviving a pickup of a second book |
| 8. `published` rendering | **moves** |
| 9. the enlarged cover (`checkCoverViewer`) | **moves** to the new entry; its Escape-layering clause now reads "one Escape closes the viewer and leaves the book held" |
| `checkSheet` | **retires** with the sheet |

The row keeps its number and slug, and its wording changes in the step that
lands the page (§4, step 4).

### 3.6 The open spread at rest

**A done-criterion the owner set after playing with
[#371](https://github.com/mephistopheles4/stacks/issues/371)'s prototype**,
relayed to this spec by the map's lead session and confirmed at sign-off. At
rest, both pages of the open spread lie in one plane square to the camera, with
matching page heights, and the hinge meets the spine. In the prototype the
cover rested near 165°, drawn in perspective, while the Thoughts page was flat,
so the two did not line up. #371 named three causes; each becomes a check:

| Cause in the prototype | At rest, measured in the page's own pose |
| --- | --- |
| The cover rests at about 165° and leans toward the camera | the front board lies at **180°** to the page block, ±0.5° |
| The left page is drawn at 97% of the cover's height; the right page is the inset page block | the left page is a sheet the **page block's** height and width, ±1 px projected |
| The cover hinges at the spine's outside corner, so spine and head cap show between the pages | the left page's inner edge and the right page's inner edge meet at the gutter: **no gap wider than 1 px** projected |

**A standing check computed from the scene, never from pixels.** Owner
decision, from chat, 2026-10-09, settling the spec pair's disagreement on S9.
The pickup check in `scripts/smoke-render.ts` reads the held book's parts at
rest through `window.__shelf`: the board's angle to the page block, the two
pages' world sizes, and their inner edges projected through the camera at the
1280×800 desktop viewport. Step 4 builds it there; #369's prototype sweep is
the pattern, and it never merged. It is deterministic, so it adds no flake to a
page family that already has one, and a later geometry change goes red. It does
not judge the look: no pixel test, and the owner's screenshots at step 4 (§8)
do that. **Desktop only**: a phone frames the right page alone, so there is no
spread to align there. Part of the pickup row (§5).

### 3.7 The empty-string hash, pinned on purpose

#376's placeholders stay quiet only because the built `style-src` already
carries the hash of an empty string, `'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='`.
It is in the built page today (checked in a September build) and nothing says
why. So:

- **The placeholders go in the page template**, empty, so Astro hashes their
  content itself and the hash is there by construction, not by accident.
- **The styled-pane gate asserts it**: the built page's `style-src` carries the
  empty-string hash, a `?debug` page records zero `securitypolicyviolation`
  events, and a pane element's computed style is not the browser default.
- **No `'unsafe-inline'` and no Tweakpane content hashes**, for #376's reasons.

### 3.8 Types for the two libraries

**Declare the slice used, in the repo; add no package for types.** #371 found
that the type-aware lint cannot resolve the timeline type `gsap/gsap-core`
returns, and that Tweakpane's `Pane` extends a class from `@tweakpane/core`,
which pnpm's strict layout does not expose. A local declaration of the methods
called keeps the dependency count where #370 and #375 left it. The cost is that
a library upgrade can drift from the declaration silently; the type-checked
calls are few, and the split and styled-pane gates run the real code.

### 3.9 Who owns `history.state`

**Pickup owns its history entry.** It pushes one entry with its own state;
Escape and an empty-space click go through `history.back()` (#371). The
`replaceState(null, …)` in `writeSettings` (`shelf-url.ts`), which the `?debug`
panel calls, changes to pass the current `history.state` through, so it
rewrites the URL without erasing a held book's entry.

**The pushed entry keeps the current URL**: no path, query or hash names the
book. The edge injects a Cloudflare analytics beacon on every page, and
[ADR-0065](../adr/0065-the-csp-is-generated-not-written.md) admits it only as
carrying nothing derived from the shelf's reading; a book id in the address
would hand it which books visitors open. The pickup gate asserts `location.href`
is unchanged after a pickup. The book id lives in `history.state`, and is looked
up in `library.json`, never used to build a fetch path.

### 3.10 The painted pieces

**Repaint without the held book**, at the same two moments the shadow map is
redrawn: when the book leaves and when it lands. #371 found that a lifted book
leaves its painted contact root in the slot, and a face-out book its cover-shade
band. Repainting keeps one rule for every painted piece; hiding parts would need
a per-piece list.

### 3.11 Deferred, each with its trigger

- **Deep link** (`/#<book-id>` opening a held book). Deferred: nice, not needed
  to reach the destination (the map). **Trigger:** the owner wants to share one
  book. The history entry of §3.9 is where it would attach, and the work starts
  by re-reading ADR-0065, because a book in the address is the flow §3.9 keeps
  away from the beacon. An id read from the address is looked up in
  `library.json`, never used to build a fetch path.
- **Touch turn** (dragging a held book, `?solo`-style). Deferred: a tap picks
  up and the scripted turn plays. **Trigger:** the phone check in §8 finds the
  scripted turn unsatisfying on a touch screen.
- **The rest of the `?debug` page to Tweakpane.** A later ticket (#375).
  **Trigger:** tuning the motion is done.
- **Releasing the other covers on pickup.** **Trigger:** G15 (`cover-budget`)
  goes red (#377), or the held-state memory figure the phone session takes (§8)
  shows the held texture pushing the phone where the shelf alone does not.
  G15 cannot see the held tier, by design (§3.3), so the second trigger is the
  only one that can.

---

## 4. Build order

**Four steps, a chain.** The map fixed the first three in this order (the split
gate, then the extractor, then the motion); #377's held tier sits between the
extractor and the motion, because the motion swaps its texture in.

| | Step | Route | Blocked by |
| --- | --- | --- | --- |
| 1 | **The split gate.** The **ship phrase** (#367's must-ship marker: a literal planted inside a fixture's `## Thoughts` that a check requires to be present, the canary's opposite) as a constant beside `NOTE_BODY_CANARY`; `## Thoughts` sections added to existing fixtures; G2's vacuity guard and absence assertions armed; G2's presence assertions as `test.fails`, public and local; the `orphan-note` and `notes-shape` inspector rules with their G20 plants | security | — |
| 2 | **The extractor.** The adapter method, reading the section through the parser and the allowlist of §3.1.1, with every named case of §3.1.4; the four packages pinned (§3.1.2), after the owner approves the install (§8), with the closure test, the Dependabot ignore and vitest's resolve conditions; the `## About` writer's `## Notes` lookup through the same parse; `notes/<id>.json` staged by both builds under §3.2's predicate, and the folder's prune; `stacks add` writing `## Thoughts` above `## Notes`; the `## About` writer disarming heading-shaped lines (below); `packages/site/public/notes/` in `.gitignore` and in G5's build-output assertion; the `/notes/*` revalidate block; G2's `test.fails` flipped to `test`; `gate:public`'s presence and vacuity checks; G2's row text rewritten to the split | security | 1 |
| 3 | **The held tier.** `gate:public` extended first and proven red: no held file for a private or wishlist book, none above 1200 px, none carrying EXIF or XMP, `orphan-held`, `heldCover` in `unknown-key` and `foreign-cover`, the `/held-covers/*` block required by `headers`. Then the staging: the held stage re-encoding through sharp, its prune, `heldCover` in `library.json`, `packages/site/public/held-covers/` in `.gitignore` and G5, the card's cover viewer reading it | security | 2 |
| 4 | **The motion.** Pickup replacing the card (§3.4); GSAP stepped from the render loop; the CSS3D page; the held texture's off-thread decode and swap; the three-pass dim; the painted repaint; the pickup tuner on Tweakpane with its CSS route, the CSS extracted by reading the package file **as text**, never importing or evaluating it, and failing when the expected CSS is absent; the Phase 2 click gate and G35 moved (§3.5), with `location.href` unchanged after a pickup; G61 extended; the open spread (§3.6); the phone loop as a hook (below) | security | 3 |

**Where it runs.** The published site is static, on Cloudflare Pages, behind
`_headers` and the page's generated CSP, with the edge's analytics beacon
injected ([ADR-0065](../adr/0065-the-csp-is-generated-not-written.md)). It is
read on desktop browsers and on the Pixel 10 Pro XL. Every check in §5 runs
against a built site under that CSP, never against `pnpm dev`, which emits no
CSP at all (#376).

**Each step is done when** `pnpm test`, `pnpm lint` and `pnpm build` are green,
its rows in §5 have been observed red and then green, and the security pair has
read its diff. Step 4 is done only after the owner's first deploy of it (§8)
picks one book up on the live site with zero CSP violations in the console.

**Fixtures are invented, every word.** The Thoughts added to existing fixture
notes in step 1, and the provider description planted in step 2's `## About`
test, are written for this repo. Never a cached provider response, and never
copyrighted prose ([ADR-0004](../adr/0004-fixtures-invented.md)).

**Undoing a step.** Each step lands as its own pull request. **Steps 2 and 3
are undone by switching the stage off, never by a bare revert**, because a bare
revert removes the prune along with the stage. `deploy:site` stages into
`packages/site/public/`, which persists between runs, so the files the last
build staged would stay there, reach `dist/` and deploy again. So the undo of
step 2 keeps the `notes/` prune and the `/notes/*` revalidate block and stops
writing files; the prune then empties the folder at the next build, and the
next deploy takes every file off the site. Undoing step 3 does the same for
`held-covers/`. If a bare revert happens anyway, delete both folders from
`packages/site/public/` before the next deploy. Reverting step 4 restores the
card. Third-party caches and archives are beyond any of these (§9).

**When a step stops.** A build session stops and brings it to the owner when a
gate in §5 cannot be observed red, when the canary or anything from a private
remainder reaches a staged or built file, or when a gate cannot pass after
three distinct approaches (AGENTS.md: write it up in `docs/blockers.md`).
Step 2 also stops when the owner refuses the install, when the install adds a
new `name@version` key to the lockfile, or when the Obsidian check (§3.1.5)
adds a rule after move 4 has started; that rule then goes back to the security
pair.

**Step 2 after #411's amendment.** The amendment lands on #415's branch
before the build starts, so the build branch holds the amended spec and
ADR-0107. Done means green on the owner's Windows machine (`pnpm test`,
`pnpm lint`, `pnpm build` and `gate:public`) and in Linux CI. The CLI and
`gate:public` run `micromark`'s default build, and the tests are set to run
the same one (§3.1.1).

**Step 4 is the largest**, and the tuner gates the motion only (the map). If
step 4 is cut into tickets, cut the tuner's two gates and its CSS route first,
since tuning the motion needs them, then the pickup itself.

**What #367 put in steps 1 and 2 is carried as it stands.** Every other
boundary and sanitising case is an extractor unit test, listed on
[#367](https://github.com/mephistopheles4/stacks/issues/367) and
[#368](https://github.com/mephistopheles4/stacks/issues/368), and named
since #411's amendment in §3.1.4. One more joins
them here: **a note whose `## About` the merge inserted after the Thoughts**
must ship none of `## About`. `insertBodySection` places `## About` above
`## Notes`, so it lands between the two, and a `##` heading ends the section;
the test proves it, because invariant 2's warning says no allowlist may ever
pick `## About` up.

**The `## About` text is a provider's, and it must not be able to open a
section of its own.** `toPlainText` keeps a description's line breaks and
`insertBodySection` writes it verbatim, so a listing line reading `## Thoughts`
would land at column 0. On a note with no Thoughts it would ship a stranger's
words as the owner's; on one with Thoughts the duplicate would withhold the
owner's real section; followed by an unclosed fence it would carry `## Notes`
out. So step 2 makes the `## About` write path **disarm every heading-shaped
line and every fence opener** in provider text (a backslash before a heading,
and character references for a fence run, §3.1.1), and the test above gains a description carrying a
`## Thoughts` line and an unclosed fence: it must ship nothing. The `## About`
sections already in the vault were written before this rule; step 2 searches
them once for heading-shaped lines before the first real public build (§8).

**The phone loop is a hook, not an address switch.** #371's prototype looped
pickups with `?autoplay=5`. The build gives `scripts/phone-check.ts` a function
on `window.__shelf` to call instead, so no link a visitor is sent can start a
loop on their device.

---

## 5. The gate roster

Numbered against [`docs/gates.md`](../gates.md)'s tip **when each lands**, never
here. ⚠️ **Never pre-allocate a number**: this folder's README records four
corrections from a rollout that did. The labels below are this spec's names
until then.

| Label | What it asserts | Lands with | Row |
| --- | --- | --- | --- |
| **split** | The Thoughts text is present in its book's `notes/<id>.json` and the canary is present nowhere, in public and local builds; a private book, a wishlist book, an embed and **an unclosed fence with the canary in `## Notes` below it** emit no file; **a build after the section is withheld, and again after it is removed, leaves no file for that book** | steps 1–2 | G2 (`public-build`), extended |
| **orphan-note** | Every `notes/<id>.json` names a book in the `library.json` beside it, and from step 2, in both directions: a file exactly for each book carrying `thoughts: true` | step 1, widened in step 2 | an inspector rule, planted red under G20 (`public-build-artifact`) |
| **notes-shape** | Every file under `notes/` is exactly `{ "paragraphs": string[] }`, non-empty, under a byte cap, and free of any URL scheme; from step 2, free of every mark the extractor's output check refuses (§3.1.1, step 10), in its own pattern list | step 1, widened in step 2 | an inspector rule, planted red under G20 |
| **presence in `dist/`** | `gate:public` finds the ship phrase in `dist/notes/` and refuses to run without its fixture | step 2 | `gate:public`, extended |
| **build output out of git** | `packages/site/public/notes/` and `held-covers/` are ignored | steps 2–3 | G5 (`vault-is-truth`), extended |
| **held tier** | No held file for a private or wishlist book; none above 1200 px on its long edge; none carrying EXIF or XMP; no file in `held-covers/` that no book names; `heldCover` same-origin and one segment; a revalidating `/held-covers/*` block | step 3, **before** the staging | `gate:public` and inspector rules under G20 |
| **pickup** | Clicking a book reaches the held state with its page, and `location.href` is unchanged; the moved G35 checks; the open spread of §3.6 | step 4 | G35 (`enhanced-card`), reworded |
| **held reader** | With a book held, one program reads the shadow map in at most `BUDGET` draws | step 4 | G61 (`one-shadow-reader`), extended to a second page |
| **tuner split** | A page without `?debug` loads zero tuner bytes, JS or CSS | step 4 | a new row |
| **styled pane** | Under the built site's CSP, a `?debug` page's pane is styled, with zero violations and the empty-string hash in `style-src` | step 4 | a new row |

**Two new rows, the rest extensions.** #367 chose to extend G2 rather than mint
a row, and the inspector rules ride G20's existing plants. The two tuner rows
are new because nothing watches a lazy split or a CSS route today: #376
measured both failures as silent.

**Existing gates that move or must be honoured:** G5 (`vault-is-truth`), whose
build-output assertion learns the two folders; G1 (`adapter-boundary`), since
the new method lives under `adapters/`; G8 (`frontmatter-contract`) is
untouched, because the section is a body heading, not a key; G10 (`cover-path`)
holds the held file's name; G15 (`cover-budget`) must not see the held folder;
G13 (`no-third-party-material`) forbids committing screenshots; G21
(`no-live-network`); G19 (`constitution-scoreboard`) for the two new rows; G14
(`commands`) if a script is added for the CSS extraction.

---

## 6. Contract edits

Each lands **in the same commit as the code it describes**, never before it.
G8 already shows why: a contract edited ahead of the parser is a red build.

- **`AGENTS.md`, invariant 2.** "Nothing implements that yet" and "nothing below
  the frontmatter block is parsed or shipped at all" become the split as built:
  the adapter reads one section, the publisher ships it as `notes/<id>.json`,
  and `library.json` still carries none of it. The `## About` warning stays
  word for word. Step 2.
- **`AGENTS.md`, vault adapter contract.** A seventh method, shaped like
  `readPublicSection(sourcePath): Promise<readonly string[] | undefined>`. It is
  **the only method that reads below the frontmatter**, as `insertBodySection` is
  the only one that writes there, and it returns paragraphs, never the body.
  The block's `insertBodySection` line says `Promise<void>`; the code says
  `Promise<boolean>`, and the edit fixes that too. Its paragraph gains that the
  text it writes has every heading-shaped line and fence opener disarmed
  (§4). Step 2.
- **`AGENTS.md`, the parser**, from #411's amendment. Invariant 2 and the
  `readPublicSection` paragraph say the section is read through a CommonMark
  parser with an allowlist over its tokens, and link
  [ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md). The
  `insertBodySection` paragraph gains setext underlines among the lines it
  disarms. `packages/core/package.json` gains the four exact pins, `.github/dependabot.yml` ignores the `micromark` family, the vitest config sets its resolve conditions, and
  ADR-0107's status line moves from proposed to built. Step 2.
- **`.gitignore`.** `packages/site/public/notes/` (step 2) and
  `packages/site/public/held-covers/` (step 3), beside the `covers/` and
  `library.json` lines already there. A broad add after a real build would
  otherwise put the owner's Thoughts into public history, beyond retraction.
- **`_headers`.** Revalidating `/notes/*` (step 2) and `/held-covers/*` (step 3)
  blocks, with the `headers` inspector rule requiring both.
- **`AGENTS.md`, Phase 2 gate.** "Clicking a book … opens the card" becomes
  "picks it up" (§3.5). Step 4.
- **`AGENTS.md`, tech decisions.** "Book detail card = plain DOM overlay
  positioned from raycaster hits" becomes the held book's page, placed by
  `CSS3DRenderer`. Step 4.
- **`docs/gates.md`.** Two new rows (§5), and the rewording of G2, G35 and G61.
  G19 holds the rows.
- **`docs/progress.md`**, in the same commit as each gate.
- **`debug-panel.ts`, the rationale comment** that opens "Vanilla DOM,
  `createElement` and inline styles": "no React" is moot and "makes the
  lazy-load boundary pointless" is disproved; only "removable in one file"
  stands (#375). Step 4.
- **`docs/shelf-inspectors.md`.** The `?debug` section gains the pickup tuner,
  and its "a control must not lie" rule gains the tuner's floor (ADR-0104).
  Step 4.
- **`docs/commands.md`.** `scripts/phone-check.ts`'s section gains the shelf's
  loop hook (§4). Step 4.
- **`stryker.scopes.json`.** If a new module joins a declared scope, or
  `debug-panel.ts` is renamed or split, run `pnpm mutation:stamp` (G56,
  `config-hash`).

---

## 7. The records

Written with this spec, because the map's decisions were made here and the
records carry their reasoning. Each says it is not built yet. The numbers leave
room, per [`docs/adr/README.md`](../adr/README.md).

| Record | Decision |
| --- | --- |
| [ADR-0100](../adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md) | The Thoughts section is read by one adapter method, called only by the publisher, and both builds ship the same notes |
| [ADR-0101](../adr/0101-thoughts-ship-as-plain-text-and-withhold-whole.md) | Thoughts ship as plain paragraphs stripped by hand, and anything hidden withholds the whole section |
| [ADR-0102](../adr/0102-pickup-replaces-the-card.md) | Pickup replaces the card for every book |
| [ADR-0103](../adr/0103-gsap-plays-the-pickup-motion.md) | GSAP plays the pickup motion, for fluency over a zero-byte option |
| [ADR-0104](../adr/0104-tweakpane-tunes-the-pickup-behind-debug.md) | Tweakpane with essentials tunes the pickup, behind `?debug`, styled through placeholders and a lazy link |
| [ADR-0105](../adr/0105-a-cover-has-a-shelf-tier-and-a-held-tier.md) | A cover has a shelf tier and a held tier; amends ADR-0015 |
| [ADR-0106](../adr/0106-thoughts-ship-only-plain-prose.md) | Thoughts ship only plain prose, and any other shape withholds the section; amends ADR-0101. Written during step 2's build, on #411 |
| [ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md) | The Thoughts section is read by a CommonMark parser, and the allowlist applies to its tokens; amends ADR-0101 and ADR-0106. Written with #411's amendment to §3.1 |

No other decision on the map meets AGENTS.md's bar of hard to reverse,
surprising and a real trade-off. The choreography's numbers live in
`PICKUP_MOTION` and are tuned in use; the boundary rules are the map's and are
unit-tested.

---

## 8. Needs a human

| What | When | How |
| --- | --- | --- |
| Confirm §3's decisions: the schema and its two caps (8,000 code points, 40,000 bytes), the `thoughts` flag, which books get notes, the held path, what replaces the card, the G35 fates, the open-spread criterion, the type slices, history, the repaint, and the four deferrals. **Two of them replace a ticket's rule**, from the security review: any HTML tag withholds the section (#368's rule 5 stripped tags and kept the text), and every held copy is re-encoded (#377 copied one already inside the cap byte for byte) | **at sign-off** | the owner reads §3 and says proceed, fix or kill on the whole spec |
| **#411's amendment to §3.1**: the parser and its steps (§3.1.1), the four pins (§3.1.2), and the ten recommendations D1 to D10 (§3.1.3). D8 is the one place the amendment departs from the prototype the owner adopted: it leaves the math extension out. **ADR-0106 replaced two more of #368's rules**: a quote and a callout now withhold (rules 2 and 6) | **at sign-off** of the amendment, on #411 | the owner reads §3.1.1 to §3.1.5 and ADR-0107 with the review reports, and says proceed, fix or kill; a D-row the owner overrides is changed in §3.1 before the build starts |
| **Installing `micromark`, its two extensions and `micromark-util-types`** into `core` | **during the build**, step 2, before the install | the session names the four exact versions and their release dates; the owner approves the install. Afterwards the lockfile has **no new `name@version` key**; importer entries and peer-variant snapshots of versions already there may change |
| **The Obsidian check** of §3.1.5 | **during the build**, step 2, **before move 4** | the session hands the owner a scratch note of invented shapes in a throwaway vault, never the real one, and deletes the folder afterwards; the owner opens it in reading view and says what shows for each; any shape hiding text the parser ships becomes a withhold rule with a named case first |
| The open spread of §3.6 looks right | **during the build**, step 4 | the session posts desktop screenshots at rest on the step's ticket (never committed, G13); the owner judges. The numbers in §3.6 are necessary, not sufficient |
| **The Pixel check**, deferred from #371 and #375 | **during the build**, step 4, while polishing | the owner connects the Pixel 10 Pro XL; the session drives it through `scripts/phone-check.ts`, which calls the shelf's loop hook to pick up and put back books (§4); there is no address switch for it |
| **The existing `## About` sections**, searched once for heading-shaped lines and fence openers, and since #411's amendment for backtick and tilde runs, `$$` and `[^` | **during the build**, step 2, before the first real public build | the session runs the search against the owner's vault and reports counts only; the owner decides what to do with any hit, because those notes are the owner's to edit |
| **The swap frame on a phone**, from #377 | **during the build**, step 4, in the same phone session | the held texture's `initTexture` upload is timed on the device, and the GPU memory with a book held is read from the renderer's counters; nobody has measured either. The session reports both figures and what the swap looks like; **the owner judges** whether it stalls the motion. If it does, the swap moves to the moment the book comes to rest |
| **Installing GSAP, Tweakpane and `@tweakpane/plugin-essentials`** | **during the build**, step 4, before the install | the session names the exact versions it will pin, and their release dates against the seven-day quarantine; the owner approves the install. GSAP's licence trade is ADR-0103's |
| **The first deploy that publishes real Thoughts or held copies** | **after the build**, once steps 2 and 3 are on `main` | `pnpm deploy:site` is the owner's to run. Before it, the session reports the `## About` search's counts and how many real books would ship a notes file and a held copy; the owner approves the deploy, and the session that heard it records it on the step's issue as an owner decision, from chat. Published text cannot be taken back from a crawler |
| The tuner's layout | **during the build**, step 4 | shaped by the owner in use (#375); the spec locks only the floor |
| Accept each step | **at the end of each step** | move 4 of the owner's playbook, with the security pair on the diff of every step, 1 to 4. Pushing a step's commits to its draft pull request is routine; the merge is the owner's |

---

## 9. Residuals and follow-ups

- **A private book's Thoughts are visible to nobody outside Obsidian**, the
  owner included (§3.2). Accepted for a check that reads the same in both
  builds.
- **The type slices of §3.8 can drift from the libraries silently.**
- **Shelf-tier covers of 512 px or less are still copied byte for byte**, so
  they keep any camera metadata. That predates this map; the held tier no longer
  shares it (§3.3). Worth a follow-up that sends them through sharp too.
- **A withdrawn section can outlive the prune** in third-party caches and web
  archives. The prune and the revalidate block cover this site and browsers,
  nothing beyond.
- **GSAP's licence is not OSI open source** and can be terminated by Webflow for
  non-compliance (#370). Accepted; it does not bite a personal shelf.
- **The swap frame's cost on a phone is unmeasured** (#377); §8 measures it.
- **No gate counts the held texture's memory.** G15 counts the shelf tier only,
  and the held folder is kept out of its sight on purpose. One phone figure
  (§8) is the only reading, and nothing re-takes it.
- **One G61 flake is unexplained**: the `rest=none` page failed clause 1 once,
  at load, before any pickup, then passed twice (#371).
- **The `dist/` size the held tier adds is an estimate**, about 10 MB, not
  measured (#377).
- **The parser is CommonMark, and reading view is Obsidian's.** §3.1.5's check
  covers the shapes known to be in question, and it is taken once. A later
  Obsidian release that renders a shape differently is seen by nothing here.
- **The parse runs over the whole note body**, provider descriptions
  included, up to step 2's 20,000 code points. Below that, the worst shape
  measured costs under a second per note, in the owner's own build, and
  reaches nobody else.
- **Two builds of `micromark`** (ADR-0107): the `development` one traces the
  whole body, private remainder included, when `DEBUG` names `micromark`. The
  adapter's load check withholds every section if it is ever the one loaded.
- **Bidirectional and zero-width characters ship** when they are not part of a
  near-miss heading. They are the owner's own text and change how it displays,
  not what ships. Tag characters, which encode hidden letters, are refused.
- **Follow-ups:** the 16 small covers, [#408](https://github.com/mephistopheles4/stacks/issues/408);
  realism beyond the cover (finish maps, a Blender model), a future map that
  would reopen #369's reuse of `buildBook`; the rest of the `?debug` page
  (§3.11).

## 10. Out of scope

- **Highlights.** Imported highlights are someone else's text; whether they may
  be republished is a different question (the design's own list).
- **A draft state for a public section.** Presence is the signal; an override
  comes only if its absence bites.
