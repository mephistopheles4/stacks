# ADR-0140 — Stay on Pages until the hostname switch is tried

**Date:** 2026-11-08
**Status:** accepted on 2026-11-08, relayed to this session by the lead session from the owner's decision. The way back (the hostname switch) stays open, and [#535](https://github.com/mephistopheles4/stacks/issues/535) stays open for it.

## Decision

Stay on Cloudflare Pages for now, and revisit after the Ask the library launch ([#532](https://github.com/mephistopheles4/stacks/issues/532)) with one step done first: try the hostname switch, both ways, on a spare hostname in the `aymandiab.com` zone. A move needs a spec after that; this record does not write one.

## Why

#535 asked four questions, and [the probe's log](../log/2026-11-08-pages-or-workers-probe.md) holds the evidence. The request question came out neutral, the old-versions question leans towards moving, what a move touches is listed, and the way back is not answered:

- **Requests (measured).** A static file does not run the Worker, so shelf traffic does not draw on the Ask Worker's request allowance, and the account is on Workers Paid anyway. One cost: a path matching no file runs the Worker unless `not_found_handling` is set.
- **Old versions (measured).** Workers keeps every old version's files at a public address by default, as Pages does. `"preview_urls": false` closes them in one line, where Pages needs each earlier deployment deleted by hand, or its per-deployment addresses put behind Cloudflare Access (`docs/commands.md` records that as unchecked for a production deployment's own address). That is the one measured gain for the private-book caveat in `AGENTS.md`.
- **The way back (unanswered).** Cloudflare's documents give no procedure for moving a hostname between Pages and a Worker, and only one project can hold the domain. A move whose way back is unknown, on the live hostname, is hard to reverse, and the launch is the wrong time to find that out.
- **Nothing forces it.** The Cloudflare documents read give no Pages shutdown date.
- **What a move touches (read, not run).** The deploy script, its live checks, the `_headers` blocks and the gates that assert them, the two-deploy order, and the Ask Worker's routes on the same hostname.

## What would change this

- The hostname switch works both ways on a spare hostname, with the downtime measured.
- Or Cloudflare announces a Pages end date.

## What was rejected

- **Move now.** It would put a second cause beside any failure in the launch, which is the reason #535 was filed instead of done.
- **Close #535 as "stay".** The measured gain on old versions is real and the unanswered question is cheap to answer; closing would lose both.
