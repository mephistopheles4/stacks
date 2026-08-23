# The artifacts were ours, and the cover finally has somewhere to be looked at

_2026-08-10. Five follow-ups from one annotated screenshot of the shelf._

The owner sent a picture of the live site with a circle drawn round the card's
close control, and five things to fix. Four were small. The second one was not
what it looked like.

## "Can we find a new one?" — no, because the source was fine

The report: _"the cover of the five dysfunctions of a team looks badly optimized
with artifacts, can we find a new one?"_ The obvious reading is that the provider
served a bad file, and the obvious fix is to go and find a better one.

The vault file was clean. **The staged one was not**, and the difference between
them is a line of ours.

`stageCover` copies a cover byte for byte when it is already inside
`MAX_COVER_EDGE` and re-encodes it when it is not — and the re-encode ran under
`sharp`'s defaults, **quality 80 with 4:2:0 chroma subsampling**, because nobody
had ever chosen anything else. The resize was added for the mobile crash and the
whole argument then was about _pixels_; the encoder came with the call.

4:2:0 keeps colour at half resolution on both axes. That is invisible on a
photograph, which is what the default is tuned for, and very visible on what a
book cover actually is — hard-edged type over a large flat saturated field.
_Five Dysfunctions_ is white serif on `#c8102e`, the worst case in the format,
and the staged copy fringed every letterform pink.

**It was not one cover.** 33 of the owner's 43 are over the cap, so 33 were
being re-encoded this way; the other 10 were copied untouched and nobody had
anything to say about them. Naming quality 90 / 4:4:4 / mozjpeg costs **1.2 MB →
1.9 MB** across the whole library — about 44 KB a cover, wire bytes only. The
texture budget is counted in _decoded_ pixels and cannot move.

⚠️ The trap in the fix is that `sharp`'s `.jpeg()` **sets** the output format
rather than configuring it, so an unconditional call writes JPEG bytes under a
`.png` name — which browsers sniff and render, so nothing downstream would report
it. The fixture vault's one oversized cover is a PNG. Both tests were observed
red first, and the second exists only for that trap. See
[ADR-0051](../adr/0051-the-staging-resize-chooses-its-encoder.md).

**No cover was replaced.** Swapping the image would have hidden a defect on 33 of
them.

## The cover that really was wrong

The other cover report was the opposite case and genuinely a bad file: _The
Business of Expertise_ was carrying **2400×2400 square** Apple audiobook art
where the book has a portrait jacket. The owner dropped a 1048×1500 replacement
in their Downloads folder and asked for the swap.

Two things a straight file copy would have left lying:

- **`spine_color` is derived from the cover bytes.** Left alone, the shelf paints
  a colour extracted from a file that no longer exists. It moved `#f03524` →
  `#f1463c`.
- **`cover_source: apple-books` became false.** The whole documented purpose of
  that key is that if a provider ever asks for its art down the answer can be
  _those nine_ rather than _all of them_ — and a hand-placed file still claiming
  Apple corrupts exactly that. It is `unknown` now, which is the contract's own
  words for _"somebody looked and did not recognise the host"_.

Done through the adapter, and the note diffs to two changed lines out of 35.

## Four small ones

- **The `×` overlapped long titles.** It is absolutely positioned, so it is
  invisible to the flow the title wraps in, and it reaches 1.25rem into the
  content box. `padding-right` on the `h2` alone — reset below the breakpoint,
  where the control becomes a full-width grabber above the content and there is
  nothing to clear.
- **`audiobook` is off the card.** `import/audible.ts` writes it onto every book
  it imports, by its own comment _"so the shelf can tell them apart later"_ — a
  machine's marker leading the one line that is supposed to be the owner's own
  vocabulary, on 24 of 41 books. Hidden on the card and nowhere else: the note
  keeps it and `identity.ts` still reads it. ⚠️ The consequence is that nothing
  on the card now says a book is an audiobook.
- **Clicking the cover opens it larger.** A native `<dialog>` —
  [ADR-0052](../adr/0052-the-enlarged-cover-is-a-real-dialog.md) — which is the
  opposite call from the card beside it, for the same reason: say what the
  surface does. ⚠️ One Escape closed the viewer _and_ the card underneath it
  until `boot.ts` guarded it, and that is the part no unit test could see.
- **`?debug`, `?solo` and the sheet are untouched.**

## The two questions, answered rather than built

**"Any alternatives for the powered by Google image?"** No. Google's branding
page references exactly one file, `books.google.com/googlebooks/images/poweredby.png`
(3441 bytes, the vendored copy byte for byte), and eight guessed variants —
`_white`, `_light`, `_dark`, `.gif`, `@2x` among them — all 404. The page says
_"Do not change any of the Google marks in any way"_ and _"never altered or
partially covered"_, and separately that it must not be **the most prominent
element on the page**. So the graphic is fixed and the _plate under it_ is the
only thing that was ever ours — which is what
[ADR-0048](../adr/0048-google-attribution-is-a-vendored-page-element.md) already
said. Recorded here because the variants had been asserted to 404 without anyone
listing which ones were tried.

**"Did we find any way to link back to the O'Reilly platform?"** Still no, and
now measured from a browser rather than from `fetch`. `learning.oreilly.com/search/?q=<isbn>`
302s to `www.oreilly.com/search/?` and returns **Access Denied** from Akamai;
`www.oreilly.com/library/view/-/<isbn>/` does too, and so does a canonical
`/library/view/<slug>/<isbn>/` URL for a book that certainly exists.
`www.oreilly.com/` itself loads fine from the same client, so the refusal is
path-specific rather than this environment being blocked.

⚠️ Stated as _refused_, not as _proven impossible_ — this repo already has
[ADR-0027](../adr/0027-deploy-check-reports-refusal.md)'s lesson about reading a
bot-protection page as content. But the design answer does not depend on the URL
check: `provider-links.ts` decided the search fallback is **card-level, never
per-provider**, because a mark pointing at a search page is visually identical to
one pointing at a book. An O'Reilly mark among Google and Apple _identifier_
marks is the mixed row that rule exists to prevent — for 2 of 41 books.
