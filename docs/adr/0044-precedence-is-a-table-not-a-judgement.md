# Precedence is a table of fixed provider orders, never a rule about the value

The merge decides which provider wins each field by **one default order plus a
short list of named per-field exceptions**, each exception a fixed sequence of
providers. `packages/core/src/metadata/precedence.ts` holds it as data;
[`docs/spec/metadata-merge.md`](../spec/metadata-merge.md) §1 holds it as prose;
**G31** holds them to each other in both directions.

## Why not a rule about the value

The obvious alternative reads better: _prefer the most precise date_, _prefer the
description with no markup_, _prefer the longer author list_. Every one of them
was rejected, and for the same reason twice over.

**They are only approximating an ordering anyway.** "Prefer a full date" _is_
"put Open Library last for dates" — Open Library is the provider that answers
`"2008"` where the other three give `2008-12-05`. The rule is a paraphrase of the
table with the provider names removed, and the paraphrase is what makes it feel
principled.

**A quality judgement cannot be gated cheaply.** A fixed table is testable with
one fixture per field and states itself in a line, so a gate can read it and
compare. A rule embedded in the merge would have to be _re-encoded_ in the gate
to check it — at which point the gate is asserting a second implementation of the
same judgement, and the two drift exactly where the judgement is subtle.

## What it costs, and this is accepted rather than solved

⚠️ **When a provider's data quality changes, the table is wrong until a human
notices and edits it.** Nothing detects that. A value rule would have adapted;
this will not.

The trade is made knowingly: a rule that silently adapts is also a rule that
silently changes what your vault says, and the vault is the source of truth.

## Two exceptions that are mechanisms, and are named as such

`pages` and `cover` are exceptions to the default order and are **deliberately
absent from the table**: `completePages` re-asks Google for the volume it already
chose, and the cover queue is assembled by the downloader from `coverUrlLarge`
before `coverUrl`. Neither is expressible as a ranking over gathered records.

G31 asserts their _absence_, which is the part worth writing down — otherwise
"deliberately not there" and "forgotten" look identical, which is the same
failure mode the named-exclusion set in **G30** exists to prevent.

## How this was decided

Map [#88](https://github.com/mephistopheles4/stacks/issues/88), ticket
[#97](https://github.com/mephistopheles4/stacks/issues/97) — _"Which providers
contribute which fields, and which one wins?"_, resolved against the field audit
in [#95](https://github.com/mephistopheles4/stacks/issues/95).

That ticket also corrected its own premise, which is the part most worth keeping:
it opened by saying a merge change "can silently rewrite titles, authors and page
counts on books that were fine", and under this project's write paths it cannot —
every write is `if (book.X === undefined)`. See
[ADR-0046](0046-absent-only-holds-unconditionally.md).
