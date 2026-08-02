# Notes on the shelf — a design, not a build

Picking a book up off the shelf and reading what you thought of it.

This is P2 in the brief — *architectural insurance: design for, don't build*.
Nothing here is implemented. It exists so that the decisions being made now, in
the renderer and in the publisher, don't quietly foreclose it, and so that the
reasoning survives the session it was worked out in.

Two separable pieces:

1. **Public and private notes** — a note body splits into a part that may be
   published and a part that never leaves the machine.
2. **Picking a book up** — the interaction that shows the published part.

The first is a privacy design and needs settling before any code. The second is
a rendering problem and rides on the lazy texture loader the shelf needs anyway.

---

## 1. Public and private notes

### The invariant this changes

Invariant 2 currently reads:

> **Note bodies are private.** Nothing below the frontmatter block is ever parsed
> into `library.json` or shipped in any build.

The brief is narrower — *"never parsed for the public build"* (line 80), *"notes
stay private **by default**"* (line 31). Two different rules, and this feature is
legal under one and illegal under the other. Nothing has noticed so far because
no code has ever wanted to read a note body.

The split: `library.json` never carries body text, and a `--public` build ships
only an explicitly allowlisted section. See CLAUDE.md for the revised wording.

### Allowlist, never denylist

Everything under a `## Thoughts` heading ships. Everything else in the body does
not.

The direction is the whole decision. An allowlist fails closed: misspell the
heading and nothing publishes, which you notice and fix. A denylist — *everything
except `## Private`* — fails open: forget the heading once and the entire note
ships. This project has already made that call for `private: yes`, for the same
asymmetry. Wrongly private is a gap you spot in a second; wrongly public is on a
URL that may already have been sent or crawled.

### No new frontmatter key

The presence of the section is the signal.

- No `## Thoughts` section → the book ships, with no notes. This is the default
  and needs no action from anyone.
- A `## Thoughts` section → that section ships with the book.
- `private: true` → the book does not ship at all, so neither do its notes.

An earlier draft of this design gave `private:` a third state for "publish the
book but not its notes". It isn't needed: that state is simply not writing a
public section, which is also what every existing note in every existing vault
already does.

### The extraction happens in the adapter

This is the load-bearing part, more than the choice of heading.

If `listBooks` returns the whole body and something downstream filters it, then a
bug anywhere in that chain is a leak. If the adapter returns **only** the matched
section and never hands the remainder to anything, there is nothing downstream to
leak — the rest of the body does not exist outside the adapter's own stack frame.

Same discipline as `updateBook`, which rewrites individual lines rather than
re-serialising a file it only partly owns.

### Sanitising, decided now rather than discovered

The allowlisted section is hand-written text from a private vault heading for a
public folder. It gets the same treatment as `cover:`, which is only ever used
for its basename because joining a vault-controlled path unchecked would stage
arbitrary files.

- **Embeds are rejected outright.** `![[private-diagram.png]]` inside a public
  section is that same bug with a wider reach: vault text naming any file in the
  vault, to code whose job is to copy files into a public folder.
- **Wikilinks are flattened to their display text.** `[[Some Other Book|that
  one]]` becomes `that one`. A live link points at a note that does not exist
  publicly, and the target itself is vault structure.
- **Plain text ships, not HTML.** Markdown → HTML means a dependency and
  `innerHTML`; the detail card is built with `textContent` deliberately, and one
  exception is how that stops being true. Rendering can come later if it earns
  its keep.

### On disk and in the build

One file per book — `notes/<id>.json` — fetched only when a book is picked up.
Never a field in `library.json`. Three things follow for free:

- a public build without notes simply does not emit the folder, and the shelf
  degrades to the card it shows today with no conditional rendering anywhere;
- `gate:public`'s canary grep keeps working unchanged, because there is no file
  for a canary to be in;
- privacy is a file that exists or doesn't, rather than a field inside a file
  that always ships. Much harder to leak by accident.

### `stacks add` has to agree

The writer currently emits `## Notes` as the body heading. If the allowlist is
`## Thoughts`, every new book gets a heading the publisher ignores and no section
it reads.

The writer should emit both, `## Thoughts` first and `## Notes` after it, so the
split is visible at the moment you start typing — which is the moment you are
deciding which side something belongs on.

### The gate has to change with it, or it goes vacuous

`gate:public` plants `NOTE_BODY_CANARY_do_not_ship` in fixture note bodies and
fails if the built folder contains it. The moment *some* body text legitimately
ships, that gate proves less than it did.

The specific way it rots: if the canary only ever lives in notes that have no
public section, the gate passes without exercising the new path at all. The
fixture needs a book carrying **both** — a real `## Thoughts` section and the
canary below it in the private remainder — so the assertion becomes "the split
held" rather than "no body text shipped".

Under the existing rule that a gate never observed failing is not yet a gate,
that fixture and that assertion land before any publishing code does.

---

## 2. Picking a book up

The interaction: click a book, it leaves the shelf and turns to face the camera,
the card becomes a readable page rather than a small overlay.

It is the same code path as the lazy texture loader the shelf needs regardless,
which is why the loader should be built as `load(book, quality)` rather than a
load-it / don't-load-it boolean:

- **shelf tier** — 512px, what `MAX_COVER_EDGE` caps today;
- **held tier** — the vault-quality original, one book at a time.

That cuts against the 512px decision as currently written in [`docs/adr/`](./adr/0015-cover-texture-budget.md).
The cap is not wrong; it is right for a spine on a shelf and wrong for a cover
filling a phone screen. It is the shelf tier of two tiers, not a permanent
policy — and a public build will eventually need to stage a full-size copy
alongside the capped one, fetched only on pickup.

Usefully, this helps rather than hurts the memory problem that caused the mobile
crash: picking one book up is the natural moment to release every other cover.

---

## Deliberately not decided

- **The heading name.** `## Thoughts` is a placeholder that reads well; nothing
  above depends on the word.
- **Highlights as distinct from thoughts.** The brief lists Readwise-style
  highlight import separately. Imported highlights are someone else's text —
  quoted from the book — and whether they may be republished is a different
  question from whether your own thoughts may be. Assume not, until decided.
- **Whether a public section can be drafted without publishing.** Presence is the
  signal today, which means no draft state. Add an override only if the lack of
  one actually bites.
