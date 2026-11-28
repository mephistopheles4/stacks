# ADR-0198 — Long reference docs carry a generated table of contents

**Date:** 2026-11-28
**Status:** accepted.

## Decision

A tracked Markdown file of over 100 lines carries a table of contents that `scripts/toc.mjs` writes from its H2 and H3 headings, and CI fails on a stale or missing one (G76, `doc-toc`). The script is a copy of `docs/toc.mjs` in [the pact](https://github.com/mephistopheles4/the-pact), unchanged but for a `Source:` line naming the commit it came from. It is vendored and not fetched, so the check runs offline and nothing here depends on another repository at run time. Prettier and ESLint ignore that one file.

`scripts/toc.config.json` leaves out what is loaded whole (`AGENTS.md`, `CLAUDE.md`, skills, agents, commands), what is written for people (`README.md`), logs, ADRs and fixtures. It also leaves out `docs/threat-model.md`: a table would put the file over its 3,000-word cap (G72), raising that cap is a spec change, and the file is short and read before any security ruling.

The word budgets (G71, `doc-word-budget`) count a doc without its table. A table is written by the script, not by an author, and G76 turns red when anything else sits between its markers.

## Why

An agent often reads only the start of a long file. A table at the top shows it everything the file holds.

**What is given up:** the copy can fall behind the pact's, and nothing here says so. Each table costs words every time its doc is read. A contributor who changes a heading has one more command to run.

**Declined:** raising the five ceilings the tables would break, which G71's own header argues against, and leaving those five docs without a table, `docs/commands.md` among them.

## How this was decided

The owner, relayed on the pact's tracker (PACT-84), asked for the pact's tables on the owner's other repositories: "Please don't overcorrect this as if it's a blanket rule." Adoption is by choice, under the pact's spec 0004. The word-budget and threat-model picks were taken by the sessions building PACT-88, for the owner to review.
