# ADR-0133 — The Ask Worker runs on Workers Paid, and the spend limit is its only cap

**Date:** 2026-11-05
**Status:** accepted. The owner added Workers Paid on 2026-11-04 and says billing moves to
Unified Billing with budgets. It reverses the "What was rejected" entry on Workers Paid in
[ADR-0127](./0127-the-ask-worker-is-the-sites-first-endpoint-and-its-first-outbound-flow.md),
which kept the free plan's 10,000-Neuron daily stop as a second cap. Nothing is deployed yet.

## Decision

The Ask the library Worker is built and sized for **Workers Paid**. Workers Free's daily stop at
10,000 Neurons no longer protects anything, so **the AI Gateway spend limit is the only hard cap on
calls that go through the gateway**, and G69 (`one-ai-call`) is what keeps every call going through it.

## Why

Another need of the owner's put the account on Paid, and a plan belongs to the account, not to one
feature. ADR-0127 had named exactly this as the reason to refuse it; the owner chose it anyway.

## What changes

- **Limits.** A search reads every note with Thoughts (ADR-0132), 11 today, one fetch each, which
  Workers Free's 50 subrequests per request would have allowed only for a few more books. Paid's
  subrequest and CPU limits are far larger, so the "at most 3 notes" design is no longer needed
  to fit them.
- **Cost, not availability, is what the spend limit now bounds.** Without Free's stop, the day's
  AI spend is the gateway rule alone ($0.09 a day, about 8,000 Neurons). It is in beta, an
  estimate, and can overshoot in a burst; budget alerts only notify (S16).
- **Availability bullets in S5** that cite Workers Free's 100,000 requests a day are out of date:
  Paid's allowance and cost still need reading from Cloudflare's current pricing.
- **Unified Billing is not yet read:** whether free daily Neurons still apply, the Terraform field
  that pays Workers AI from prepaid credits, and the error when credits run out. S12 records them
  as open. The Worker treats 2045 as `spent`, and will treat the out-of-credits error the same once
  its code is known.
- **The `stacks-ask` gateway's billing setting** stays the owner's decision.

## What was rejected

- **Keeping Free for the Worker.** A plan applies to the account.
- **A second spend cap in code.** The gateway rule is the cap; a counter in the Worker would be a
  second, softer one.
