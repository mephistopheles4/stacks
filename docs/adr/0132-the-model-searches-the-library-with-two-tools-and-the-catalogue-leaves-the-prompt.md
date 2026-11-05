# ADR-0132 — The model searches the library with two tools, and the catalogue leaves the prompt

**Date:** 2026-11-05
**Status:** accepted. The owner signed off the search-tool amendment on 2026-11-05
("Proceed") and approved contract v0.3.0 and its rules text. It changes
[ADR-0131](./0131-the-input-budget-is-6000-and-memory-is-never-dropped.md) and replaces
the Worker's choice of which Thoughts to send. Nothing here is deployed yet.

## Decision

The model gets two read-only tools and no catalogue. `search_library(query)` returns up to
6 books as marked catalogue lines and the owner's Thoughts for up to 3 of them.
`list_books` returns every title and rating, highest rated first, with the Thoughts mark.
The Worker runs both, and its plain results (no model) call the same search.

At most 2 tool calls of either kind per question; the call after them has no `tools` key,
so a question makes at most 3 model calls. One 30-second deadline covers the whole
question. A blank answer, the deadline, a spent limit or a tool call after the last falls back to
plain results; bad tool arguments and an unknown tool get a short guiding message instead
(narrowed from "any failed step" the same day). The system message ends with one
line of counts by status. The search reads title, author, subjects and Thoughts, with
field matches ranked above Thoughts matches and a query naming a whole title first. A
follow-up that names neither a catalogue title nor a subject word is dropped.
`pickLikelyBooks` and `select.ts` go.

## Why

The prompt carried the whole catalogue on every question, so every new book made each
question dearer and left less room for Thoughts. The Worker could only match words to
choose Thoughts. A throwaway Worker on a test gateway showed `gpt-oss-20b` calls the tool
(17 of 20 runs), that memory works without the Worker picking, that a mark on each result
line stopped false claims of Thoughts where a rule alone did not, and that a typical
question cost less than today's input alone. The owner's words: "I'll go with the tool to
replace the worker search", "2 searches", "start by titles and ratings only".

## What changes in ADR-0131

The budget stays 6,000 estimated tokens and memory is still never dropped, but it is now
checked before **every** call over the whole message list, and what drops is the Thoughts in
the newest result and then the whole result, not Thoughts chosen by the Worker. The reasoning
changes: 6,000 is no longer a ceiling that a growing catalogue squeezes, it is a worst case
that two results and the largest memory fit within (5,053 to 5,140 on the real build).

## What this costs, and what is hard to reverse

The worst question is about 300 Neurons, up from about 130, so one visitor's 30 worst-case
questions could use up a whole day of AI. A typical question is about 50, down from at least
56. The model no longer sees the catalogue unless it calls a tool, so a loose question depends on the search, and broad
questions are the known weak spot. A third model call can add up to 30 seconds. Going back is
a code change (put the catalogue back and restore the picker), not a data one.

## What was rejected

- **Keeping the catalogue in the prompt.** The cost it was growing with is what the owner
  wanted removed.
- **More tools or more than 2 calls.** The owner chose 2; a third tool is out of scope.
- **Search by meaning (embeddings) now.** Still the follow-up, and it would replace the search
  inside the tool.
- **Logging queries** to tune the search. The contract's record stays counts only.
