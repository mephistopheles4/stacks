# A provider's description lives in the note body, not in frontmatter

`stacks add` and `stacks enrich` write a provider's description into the note
under a `## About` heading, above `## Notes`. The `VaultAdapter` gained a
**sixth method** to do it — `insertBodySection` — and it is the only method in
this project that writes below the frontmatter.

## Why the body and not a property

**"Never published" becomes structural rather than a discipline.** A body
section is not a `BookRecord` field, so no build can carry it by any path —
`toLibraryBook` enumerates fields, and there is no field to enumerate. The
frontmatter alternative would have relied on somebody _not_ adding a
`keyIfPresent` line, which is a weaker guarantee than one the type system makes
impossible.

Two things it also avoids: 600–700 words of third-party marketing prose sitting
above every note forever, and a multi-thousand-character value fighting
`updateBook`'s line rewriter.

**The recommendation was to rule descriptions out of scope entirely**, and it
was overruled. Recorded because it is the counter-argument that would reopen
this: the field buys the least of the four the merge takes, and it is the one
that put a new method on the adapter.

## What it costs

⚠️ **The riskiest write this project owns.** Surgical insertion into a file the
owner hand-edits is exactly why `updateBook` rewrites lines rather than
re-serialising YAML, and this extends that promise to the half of the file it
never touched.

Two rules constrain it, both inherited rather than invented:

- **Written only when the heading is absent.** That is the absent-only rule
  ([ADR-0046](0046-absent-only-holds-unconditionally.md)) applied to a section,
  and it is the whole of its idempotence: no second `## About` is ever appended.
- **Markup is stripped to plain text** at the provider. Apple's descriptions
  carry `<b>`; O'Reilly's arrive wrapped in `<span><div><p>`.

⚠️ **It is invisible to the absent-only gate.** `missingFields` reads a
`BookRecord`, and a `BookRecord` has no body — invariant 2 by construction — so
**G32** is structurally blind to this write. **G33** (whole-pass idempotence) is
the only gate that reaches it, which is why that row exists at all.

⚠️ **Invariant 2's future allowlisted-section publishing must never name
`## About`.** The whole point of the owner's answer was note-local; an allowlist
that later picked this section up would publish third-party prose under their
name. CLAUDE.md now says so beside the invariant, because an allowlist is only
safe if what it must not contain is written down once.

## How this was decided

Map [#88](https://github.com/mephistopheles4/stacks/issues/88), ticket
[#97](https://github.com/mephistopheles4/stacks/issues/97). The container
question was settled after `updateBook`'s scalars-only behaviour (G4, red on
arrival) ruled out every list-shaped option independently.
