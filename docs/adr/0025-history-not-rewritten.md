# The git history was checked by inspection, and not rewritten

Going public exposes every reachable commit, so the history was settled against the bytes rather than by inference: no secrets, no `.env`, no real vault path, no real `library.json`, and no personal email. `git filter-repo` was **not** run.

The one commit that looks like a leak untracks seven binaries, and all seven are fixture-derived. Rewriting for a condition that is false would have cost the `phase-0`...`phase-4` tags and the remote for nothing.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-08-01** — **The history was checked by inspection, not by inference, and it is clean — no rewrite.** Going public exposes every reachable commit, so the question was settled against the bytes: no secrets, tokens or keys anywhere in 63 commits, no `.env`, no real vault path, no personal email (commits carry the GitHub `noreply` address), and no real `library.json`. The one commit that looks like a leak — `3d7aa6d`, untracking seven binaries from `packages/site/public/` — is not one. Five of the six covers hash-match today's fixture covers; the sixth matched the fixture _as it stood at that commit_, having been regenerated later in `1e6029d`, which is why a naive comparison against the current tree shows one mismatch and it means nothing. The `og.png` was opened and looked at rather than reasoned about: it reads "8 books", the fixture vault's exact count, with no titles. **So `git filter-repo` is not run.** The tags `phase-0`…`phase-4` and the remote both point into that history, and rewriting it for a condition that is false would cost all of them for nothing.
