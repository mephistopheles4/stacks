# ADR-0127 — The Ask the library Worker is the site's first endpoint, and carries the first outbound flow of reading content

**Date:** 2026-11-05
**Status:** accepted. The owner approved the flows and the exception on
2026-11-04 (`docs/spec/ask-the-library.md` S14, Q1 to Q3: "we could go with your
picks"). Nothing here is deployed yet.

## Decision

A Cloudflare Worker, `packages/ask`, answers visitors' questions about the
library at `/api/chat`, on the site's own hostname, with Workers AI through an AI
Gateway and a spend limit. When AI is unavailable it returns plain word-search
results. It reads only public build output, `/library.json` and
`/notes/<id>.json`, over HTTPS from its own hostname, so it has no access to the
vault, the adapter or a note body: invariants 1, 2 and 4 hold by structure, not
by care. The Worker keeps no question or answer (S4), logs fixed outcome codes
only, and counts a visitor by an HMAC of the address and the day.

## The exception

`docs/spec/trend-layer.md` says the project "adds no new outbound flow carrying
anything derived from the owner's reading". This reverses it for one flow: a
question, the catalogue and some Thoughts go to Workers AI through AI Gateway,
and Turnstile sees a visitor's browser signals and address. The content is
already public and the owner asked for the feature. G20 cannot see the flow,
because it leaves from the server and not the page. The comment in
`packages/site/astro.config.mjs` that called the shelf's outbound record
same-origin is corrected to say so.

## Why a Worker and not a Pages Function

The zone's WAF rule must cover every address the endpoint answers on. A Pages
Function would likely answer on every old deployment address too, outside that
rule, so it is not equivalent (S8). The live probe (S12, 2026-11-05) proved an
exact Worker route on the zone's hostname reaches the Worker while Pages keeps
every other path.

## What was rejected

- **A third-party chat service.** It would send the questions to a company the
  owner has no account with and bill per message.
- **Sending all Thoughts every time.** It costs about 330 Neurons a question at
  60 sets and one fetch per note against Workers Free's 50. S4 first picked likely books
  instead (since changed: a search reads every note with Thoughts, ADR-0132, ADR-0133).
- **Workers Paid.** The free plan's 10,000-Neuron daily stop is a cap that
  belongs to the account; adding Paid for anything else removes it, so the spend
  limit would be the only cap (S5 step 6, S16). **Changed by
  [ADR-0133](./0133-the-ask-worker-runs-on-workers-paid-and-the-spend-limit-is-its-only-cap.md):
  the owner added Paid on 2026-11-04.**

## Consequences

- Availability is not guaranteed: about 5 addresses can spend a day's AI budget
  and about 7 could reach Workers Free's request limit (S5; Workers Paid has a larger allowance, ADR-0133). The bill stays capped
  on every path reviewed.
- `packages/ask` has no `@cloudflare/workers-types`: the few binding methods the
  Worker calls are declared in `env.ts`, so the package adds no dependency.
- G69 (`one-ai-call`) holds every model call to one function that passes the
  gateway and `skipCache`, because a call without the gateway option is not
  counted against the spend limit.
- Neurons per question are not in the reply or the log: Workers AI returns token
  counts, so the log carries those.
