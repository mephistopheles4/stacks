# Matching a book is fuzzy, not exact

`isProbablySameBook` requires high token containment one way and substantial overlap the other, rather than equality of a normalised form.

Found by running the tool for real: exact matching cannot tell "Thinking in Systems" from "Thinking in systems : a primer", and created a second note for a book already shelved.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **Dedupe by title+author is fuzzy, not exact.** Also found by running it: `stacks add "thinking in systems"` created a second note beside "Thinking in systems : a primer". Exact equality of the normal form cannot match a title carrying its subtitle against one that isn't. `isProbablySameBook` requires high token containment one way and substantial overlap the other, which still keeps two different books by the same author apart.

- **2026-07-31** — **Dedupe matches against an in-memory set, not by re-reading the vault per book.** `bookExists` re-parses every note on each call, so an import was a full vault scan per book; worse, in a dry run nothing is written, so a book duplicated *inside one export* would not be found and the run would claim it was adding both.
