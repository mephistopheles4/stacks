# ADR-0078 — A tool rewrites prose before it reaches GitHub

**Date:** 2026-08-26
**Status:** accepted
**Ticket:** [#220](https://github.com/mephistopheles4/stacks/issues/220)

## Context

Every agent session that posts prose to GitHub — an issue body, a pull request
body, a comment, a review, a reply into a review thread — hand-rolled the `gh`
invocation, and the invocation has more failure modes than it has correct forms.
Six are recorded on #220 and **three of them return HTTP 200**: `-f
body=@reply.md` posts the literal filename, `Set-Content -NoNewline` concatenates
every line of a read-back, and `.Length` on one is a line count wearing a
character count's clothes.

The sixth is different in kind, and it is the reason this record exists rather
than a note beside the code. Prose hard-wrapped at 80 columns — which is this
repository's house style, correct in every file under `docs/` — posts perfectly,
round-trips **byte-identical**, and still renders as ragged broken lines, because
an issue body renders as GFM with hard line breaks enabled. Fourteen issues were
filed that way before anyone noticed, and all fourteen verified as identical
against their local files. Repository-relative links have the same shape of
problem: correct inside a `docs/` file, dead inside a body.

So the two conventions are opposite, and the natural move — author prose the way
every file here is authored — is the defect.

## Decision

**A tool edits the author's words before posting them.**
[`scripts/lib/github-body.ts`](../../scripts/lib/github-body.ts) reflows each
prose paragraph onto one line, joins a wrapped list item onto its marker, joins a
run of blockquote lines into one, and rewrites repository-relative link targets
to absolute URLs. [`scripts/lib/github-post.ts`](../../scripts/lib/github-post.ts)
then posts the **transformed** text and reads it back, comparing against the
transformed text and never against what the author wrote.

## The trade-off, stated

**What you type is not what gets posted.** That is a real cost and it is the
whole of this record. Three things bound it:

1. **Code is never rewritten.** Fenced blocks and inline code spans come out byte
   for byte. The required first fixture is a document *explaining* the
   relative-link rule surviving the tool that enforces it — a throwaway script
   doing this reflow rewrote the example inside that paragraph, turning
   "`../blob/main/x` is broken, use the full URL" into "the full URL is broken,
   use the full URL", and a transform that silently edits prose about the thing
   it fixes is its own silent failure mode.
2. **`--dry-run` prints the transformed body and posts nothing.** The rewrite is
   inspectable before it is published.
3. **A sweep over all 166 tracked Markdown files** confirms the transform loses
   and invents nothing: word for word identical either side, allowing only a
   blockquote marker a join removes and a link target it absolutises.

## The alternative, and why it was refused

**Author GitHub prose unwrapped by hand.** It needs no tool, and it is what the
repository was already failing to do — fourteen times, by people who knew the
rule, because the wrapping habit is correct everywhere else in the tree. A
convention that is the opposite of the surrounding convention is not a
convention; it is a thing to forget. #220's own body carries four dead relative
links for exactly this reason.

**Change how `docs/` files are authored instead.** Refused explicitly in #220's
out-of-scope list. Hard wrapping at 80 columns is correct inside the repository
and stays correct; the two conventions are opposite on purpose.

## Consequences

- **Nothing is gated**, and nothing can be. The risk lives entirely in bodies
  that never touch the repository — measured during triage:
  `.github/pull_request_template.md` is 2722 characters of which 473 render, and
  what renders is six headings and four checkbox items with no prose paragraph.
  See [`docs/gates.md`](../gates.md#not-gated-deliberately).
- **Discoverability is a pointer in [`AGENTS.md`](../../AGENTS.md), not a `pnpm`
  script.** A `pnpm` name serving no part of the product would be the first of
  its kind here, which is a separate decision owing its own record.
- **The tool creates and never edits.** All five surfaces are creates; changing a
  body that already exists is still hand-rolled.
- **A mismatch exits non-zero.** A warning is how the 26KB one-line body stayed
  unnoticed.
