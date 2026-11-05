# ADR-0131 — The input budget is 6,000 estimated tokens, and memory is never dropped

**Date:** 2026-11-05
**Status:** accepted. The owner signed off the memory spec on 2026-11-05 (D6 and D7).
It changes `MAX_INPUT_TOKENS` from 4,000, which `docs/spec/ask-the-library.md` S4 had
set. **Changed by [ADR-0132](./0132-the-model-searches-the-library-with-two-tools-and-the-catalogue-leaves-the-prompt.md):**
the catalogue has left the prompt, the budget is checked before every call, and what drops is
the Thoughts in the newest tool result; the 6,000 and memory-first rules stand. The figures
below describe the build before that change. Nothing here is deployed yet.

## Decision

`MAX_INPUT_TOKENS` is 6,000, counted with the same 3-characters-a-token estimate as
before. The user message, memory included, counts before any Thoughts. Thoughts are still
dropped first, a whole book at a time, so a full-length question costs Thoughts and never
the rules, the catalogue or the memory. Thoughts for the next question are chosen: books
named in the question; then books named in memory, newest first, at most 2; then search
matches over the question alone; then the existing fallback. At most 3 sets, as before.

## Why

Measured on the real public build (61 books, 11 sets of Thoughts) with no model call, the
budget was already full: rules 494, catalogue 2,974, leaving 532 of 4,000, and a set of
Thoughts is 264 to 507. At most about one set fit, whatever S4 said about 3. The draft
rules (799 estimated tokens) leave 227, so none fit. Memory adds up to about 600.

At 6,000, rules 799, catalogue 2,974, memory 600, a typical question and the 3 largest sets
(1,410) fit. Measured on the real code and catalogue: all 3 sets of Thoughts go with the
largest memory and a typical question, and with a 1,500-character question Thoughts drop
and memory stays, with the input never over 6,000.

**Memory counts first (D7)** because a follow-up with no memory is the failure being fixed.
**Search does not read memory,** so an old topic cannot outrank the new question, while
books memory names get up to 2 places so "the book" keeps its Thoughts.

## What this costs

The estimate runs high (about 0.82 real tokens to each estimated one), so a full input is
about 4,900 real tokens, or 89 Neurons, up from about 60. Roughly 4 more books on the
shelf stop the 3 largest sets fitting together, and Thoughts drop one book at a time when
that happens, with nothing failing. Reverting the number is one line, but the evals and S5's
cost figures were rewritten for it.

## What was rejected

- **A smaller catalogue line,** such as dropping finished dates. It reduces what the bot can
  answer and only delays the same problem.
- **Dropping memory to fit Thoughts.** It reintroduces the failure.
