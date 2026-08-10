# Absent-only holds unconditionally, so a merge change cannot rewrite a correct book

Every write to an existing note is `if (book.X === undefined)`. The merge
revision grew `FILLABLE` from four keys to eleven and `BookInput` to match, and
**relaxed nothing**.

## The premise this corrects

The ticket that opened the merge revision said a merge change "can silently
rewrite titles, authors and page counts on books that were fine". **Under this
project's write paths it cannot**, and noticing that is most of the decision:

| Surface | What it does | Guard |
|---|---|---|
| `lookup` / `fillGaps` | decides which provider's record wins | none — this *is* the merge |
| `addBook` | writes a **new** note | `BookInput`, a closed list |
| `enrichBook` | writes to an **existing** note | `FILLABLE`, plus `if (book.X === undefined)` on every write |

So a merge change alters what a brand-new `stacks add` records, and which value
fills an existing *gap*. A page count already present is never touched.

**The trap is the mirror image**, and it is why this is a decision rather than an
observation: taking a new field in the merge writes it **nowhere**, because
`BookInput` and `FILLABLE` are both closed lists. Fields and write-permission
move together or the decision is inert.

## What it costs

⚠️ **A book already carrying a wrong value keeps it forever**, and correcting it
stays a hand edit. That was taken knowingly over the alternative — relaxing
absent-only for a named set of keys — because the failure it prevents is
undetectable after the fact: the vault is the source of truth, so there is
nothing left to compare a silently rewritten note against.

⚠️ **`publisher` is mixed-provenance from day one.** It was hand-written on 17
of the 41 real notes before it was ever a contract key. Absent-only leaves all 17
alone, so 17 owner values and 24 provider values sit in one field,
indistinguishable in the note and in `library.json`. Nothing downstream may
assume a provider supplied it.

## Prevented structurally, then gated anyway

The characteristic failure of this effort is prevented by construction rather
than detected — which is the better arrangement, and also the one that rots
quietly. **G32** asserts the *claim* rather than the branch: a note carrying
every fillable key, handed a provider that disagrees about all of them, must come
back byte-identical. A test that checked the `if` would pass a refactor that
moved the `if`.

⚠️ That gate's first version **passed against the exact defect it exists for**.
Its fixture carried every fillable key, so `enrichBook` returned `complete`
before touching the network and the fill loop never ran. It now leaves exactly
one gap that nothing can fill, and its vacuity guard asserts *that shape* rather
than asserting there are no gaps — which was the thing causing the problem.

## How this was decided

Map [#88](https://github.com/mephistopheles4/stacks/issues/88), ticket
[#97](https://github.com/mephistopheles4/stacks/issues/97), with the pass that
runs it settled in [#99](https://github.com/mephistopheles4/stacks/issues/99).
