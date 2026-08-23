# 2026-08-06 — the same command was also reporting on fewer books than it counted

[#67](https://github.com/mephistopheles4/stacks/issues/67), found while
re-resolving [#62](https://github.com/mephistopheles4/stacks/issues/62) on the
fixed lookup. G27 is the gate.

`stacks enrich --dry-run` printed `33 book(s) considered, 6 with gaps`, then five
lines, then `would fill 3 book(s), 2 left alone`. **Five books accounted for out
of six.** The sixth — `The Infinity Machine`, an `isbn` gap with nothing anywhere
to fill it — produced no line and entered no total.

**The cause is one overloaded outcome.** `enrichBook` returned `complete` both
when a book had _no gaps_ and when it had gaps it could not fill. The first is
genuinely nothing to say; the second is not. `case 'complete': break;` could only
treat them alike, and a `break` that reported neither looked exactly like one
that reported both.

Split into `complete` and `unfilled`, and the report lifted out of the command's
action callback into `packages/cli/src/enrich-report.ts`, where something can
call it. **The arithmetic is now held by shape rather than by care**:
`reportEntry` returns a book's printed line _and_ the total it belongs to
together, so there is no way to write one without the other, and the compiler
refuses a kind that is missed. Two paths reach `unfilled` — a lookup that offered
nothing, and a `spine_color` gap whose cover is not on disk — and they share a
kind deliberately, because the printed line must not claim a provider was asked
when none was.

**Why this one is worth a gate.** It had already changed an answer: #62's first
resolution read _"7 with gaps, would fill 1, 5 left alone"_ off this output and
concluded a seventh book had fallen through the lookup. Nothing had. G26 and G27
came out of the same investigation and are opposite failures — a tool that
returned the wrong answer, and a tool that returned a _true_ answer about a
smaller set than it claimed. The second is harder to notice, because every line
it prints is correct.

**Observed red** by folding `unfilled` back into `complete`: two of the gate's
five fixture books turn "nothing was missing", and the assertion names why.
