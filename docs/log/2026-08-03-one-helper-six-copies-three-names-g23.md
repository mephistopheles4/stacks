# One helper, six copies, three names — G23

`keyIfPresent` existed six times with byte-identical bodies and three names:
`maybe` in four files, `optional` in `frontmatter.ts`, `pick` in `library.ts`
([#29](https://github.com/mephistopheles4/stacks/issues/29)). Consolidated into
`packages/core/src/key-if-present.ts`, 45 call sites, plus the three
`googleBooksKey` guards in the CLI — redundant twice over, since nothing tests
that key's presence and `withKey` already normalises both `undefined` and the
empty string. `pnpm test` went 323 → 339 — the 16 tests in the two new spec files. No existing spec changed.

**The three names are the finding, not the six copies.** Each author checked for
an existing helper, searched the one name they had in mind, found nothing, and
wrote it. Grepping `maybe` returns four of six, which reads like a small local
habit rather than a repo-wide rule with two aliases — and the architecture
review that produced six duplication candidates from this codebase missed this
one for exactly that reason. So G23 matches on what the body *returns*, never on
what the function is called; see [`gates.md`](../gates.md), which also carries
the two mutations that came back green before the gate was right.

**The issue's stated hazard turned out to have no live instance**, and that is
worth recording rather than quietly dropping. `FrontmatterChanges` really does
invert the rule — near `updateBook`, `undefined` *removes* a key from a note in
the owner's vault — but no code is positioned to trip over it: all three
`updateBook` callers build changes from literals or guarded assignment, and none
of the seventeen inline conditional spreads is anywhere near one. `enrich.ts` cannot
express a removal at all, since its accumulator is typed
`Record<string, string | number>` and needs a cast to widen at the call. That
protection reads as accidental and is now deliberate at least in the record.
Gating it would have been a rule nothing could fail on, so it is stated in
`CONTEXT.md` under **Removal** and gated nowhere.

The seventeen inline spreads were left alone, as filed. They share the same text and
are not copies of anything — each is one decision at one call site — and the
`return` in G23's anchor separates them without needing an exempt list.
