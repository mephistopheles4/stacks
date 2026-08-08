# Matching a book is fuzzy, not exact

`isProbablySameBook` requires high token containment one way and substantial overlap the other, rather than equality of a normalised form.

Found by running the tool for real: exact matching cannot tell "Thinking in Systems" from "Thinking in systems : a primer", and created a second note for a book already shelved.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **Dedupe by title+author is fuzzy, not exact.** Also found by running it: `stacks add "thinking in systems"` created a second note beside "Thinking in systems : a primer". Exact equality of the normal form cannot match a title carrying its subtitle against one that isn't. `isProbablySameBook` requires high token containment one way and substantial overlap the other, which still keeps two different books by the same author apart.

- **2026-07-31** — **Dedupe matches against an in-memory set, not by re-reading the vault per book.** `bookExists` re-parses every note on each call, so an import was a full vault scan per book; worse, in a dry run nothing is written, so a book duplicated *inside one export* would not be found and the run would claim it was adding both.

- **2026-08-08** — **A companion volume is named, not scored, because no threshold can separate it from a subtitle.** *The Power of Now* against *The Power of Now Journal* — two real Eckhart Tolle books, one of them in the vault — scores 0.967 forward and 0.833 back, and passes the 0.9/0.6 rule above. *Thinking in Systems* against *Thinking in Systems: A Primer*, which is one book and **must** match, scores 0.971 and 0.857. Four thousandths apart, opposite right answers: token overlap cannot tell "subtitle added" from "companion volume sold beside it", so no retuning of the thresholds is available. `journal` joins `workbook` and `companion` in `DERIVATIVE` instead. That list is a denylist and grows only on evidence — each word silently refuses a real book whose title carries it — so `notebook`, `planner` and `diary` are deliberately left out until one of them costs something.

- **2026-08-08** — **`MAX_PREFIX_DRIFT` was suspected first and was not the cause.** The containment rule does produce this shape — a bare vault title of "12 Rules for Life" matched *Beyond Order: 12 More Rules for Life*, because `Beyond Order:` is two tokens and the drift allowance is two. But measured over 2304 real pairs (every vault label, every recall-corpus label, and eight adjacent real works), tightening the allowance to 1 or to 0 changes **no verdict at all**: the live false positives run through the scored rule, not containment, and the one containment case stopped mattering once that note was given its subtitle. Recorded because the wrong diagnosis was stated confidently before it was measured.
