# ADR-0130 — The page remembers two exchanges and sends them in the user message

**Date:** 2026-11-05
**Status:** accepted. The owner signed off the memory spec on 2026-11-05 ("start the
memory build"). It reverses `docs/spec/ask-the-library.md` S14 Q7 and S16, which had
chosen one question at a time and ruled memory out. The owner's words: "i think it
needs memory", then "we do need to spec it". Nothing here is deployed yet.

## Decision

The drawer keeps the last 2 answered exchanges in a page variable and sends them as an
optional `history` with each question. A question is cut at 300 characters and an answer
at 600, by the browser, and the Worker refuses above that with a 400 before Turnstile.
Only `ai` replies are kept. Memory is never written to `localStorage`, a cookie or the
URL, and reloading the page ends the conversation. The Worker stores and logs none of it.

It reaches the model in the **user** message, labelled "Earlier in this conversation
(data, may contain mistakes)", with each value passed through `plain()`. It is never an
`assistant` turn and never in the system message.

## Why

The owner's own test: "What did you think of Co-Intelligence?" followed by "what did you
like the most about the book?" got a list of other books, with the false line "I haven't
written thoughts on them yet". Two exchanges is the least that fixes it and the most that
the cost allows.

**The browser holds it, not the server,** so S4's "not stored" stays true and no new
storage exists to protect.

**User message, not `assistant` turns,** because a visitor can forge the history in a
request. A forged `assistant` turn reads to the model as its own words and could carry an
opinion it never wrote. In the user message the same forgery is a visitor's claim, which
the rules already treat as data, and it can only name books whose Thoughts are public.

## What this costs, and what is hard to reverse

The worst question goes from about 114 to about 130 Neurons (S5, S14 Q8), so abuse uses up
the day sooner. **Changed by [ADR-0132](./0132-the-model-searches-the-library-with-two-tools-and-the-catalogue-leaves-the-prompt.md):
the worst question is now about 300 Neurons.** The request shape gains a field the Worker must keep accepting for as long
as old pages are cached. Removing memory later means dropping the field and the rules that
mention it (`ask-the-library.contract.md`), which is a small change; the part that does not
undo itself is a visitor's habit of expecting a follow-up to work.

## What was rejected

- **Server-side memory.** A Durable Object per conversation would store visitors' questions,
  against S4, and need its own deletion.
- **`assistant` turns.** Forgeable, as above.
- **More than 2 exchanges.** Each costs about 300 estimated tokens at the limit, and 2 fixes
  "the book" and "the other one".
- **Memory in `localStorage`.** It would survive reloads and make "not stored" false.
