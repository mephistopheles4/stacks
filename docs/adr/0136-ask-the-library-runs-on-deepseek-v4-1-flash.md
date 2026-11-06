# ADR-0136 — Ask the library runs on DeepSeek V4.1 Flash

**Date:** 2026-11-06
**Status:** accepted. The owner asked for it ("let's amend the spec and switch to DeepSeek") and signed
off the amendment on 2026-11-06 ("go with 1"), with Q15's option 1. **Changes** the Ask spec's S3 model
row, which the owner had chosen from nine models on 2026-11-04. Issue
[#540](https://github.com/mephistopheles4/stacks/issues/540). The evidence is in
[the log](../log/2026-11-06-model-comparison.md).

## Decision

The Ask the library Worker calls `@cf/deepseek-ai/deepseek-v4.1-flash-1017` in place of
`@cf/openai/gpt-oss-20b`. `MODEL` in `packages/ask/src/limits.ts` is the only place the code reads the
id, and the evals read it from there. Nothing else in the call changes: the same messages, tools,
`max_tokens` of 1,500, gateway option, `skipCache` and 30-second deadline. The rules text does not
change; the contract's **Built for** line and its changelog say so (version 0.5.1).

## Why

Cloudflare's announcement that it will deprecate 16 LLMs on 2026-11-15 (`gpt-oss-20b` is not one of
them) prompted a comparison of five models on S9's 18 cases, through the Worker's own answer code with
only the model id swapped:

| Model | Passed | Median | Slowest | Over 30 s | Neurons per pass |
| --- | --- | --- | --- | --- | --- |
| `@cf/deepseek-ai/deepseek-v4.1-flash-1017` | 18, then 18 | 3.9 s, 4.2 s | 9.6 s | 0 | 943, then 650 |
| `@cf/openai/gpt-oss-20b` | 16 | 6.4 s | 15.4 s | 0 | about 897 |
| `@cf/google/gemma-4-26b-a4b-it` | 15 | 6.3 s | 47.7 s | 3 | about 575 |
| `@cf/openai/gpt-oss-120b` | 14 | 4.6 s | 13.8 s | 0 | about 1,507 |
| `@cf/zai-org/glm-4.7-flash` | 14 | 8.2 s | 38.9 s | 1 | about 468 |

- **It answered best.** DeepSeek passed both passes, and read by hand its 36 answers named only real
  books and ratings and claimed no Thoughts that are not there. The others failed with a raw internal
  format in the answer (`gpt-oss-120b`), a pasted Thoughts section and an echoed rule (`glm-4.7-flash`),
  or reasoning that ran to the 1,500-token cap without an answer (Gemma).
- **It is the fastest with the shortest tail.** A median near 4 s and nothing past 9.6 s, while Gemma
  and `glm-4.7-flash` each had calls of 38.9 s or more, past the 30-second deadline.
- **It writes little.** Its largest output on any call was 291 tokens in the first pass and 322 in the second, against 1,237 for
  `gpt-oss-20b`, so the output rate, the dearest one, is rarely paid.

## What it costs, and what was accepted (Q15, option 1)

Published rates are $0.30 a million input tokens, $0.006 cached and $1.20 output (27,273, 545 and
109,091 Neurons). Cloudflare caches the shared prompt prefix on its own. Measured per question: 36 to
52 Neurons with the cache warm and about 93 to 99 cold. The worst case is about 750 Neurons, up from
about 300. At the $0.09 a day limit that is about 85 cold typical questions or about 11 worst-case
ones, against about 160 and 27, so **one visitor's 30 worst-case questions could use the whole day**.

**The bill stays capped; availability is worse.** The owner accepted that for launch, because the worst
case was never reached and the spend limit still bounds the bill. Q15's other options stay open: 15
questions a visitor a day, or a higher spend limit. Revisit on the live counts.

## Dependencies this adds

- **It needs a paid billing method.** Workers Paid already is one ([ADR-0133](./0133-the-ask-worker-runs-on-workers-paid-and-the-spend-limit-is-its-only-cap.md)).
  Whether free daily Neurons cover a paid-billing model is unread, like the rest of Unified Billing.
- **Dated model ids get retired.** `deepseek-v4-flash-0731`, a dated DeepSeek V4 Flash id, is on
  the 2026-11-15 deprecation list; this id should be expected to follow. The eval harness is what makes
  the next switch cheap. **A switch touches more than `MODEL`.** Every companion, each of which the
  last switch had to change by hand:
  - the model assertion in `packages/ask/src/ai.test.ts`;
  - the S3 Model row of `docs/spec/ask-the-library.md`;
  - the contract's **Built for** line and a row in the changelog, in `packages/ask/`;
  - the published rates in `scripts/lib/ask-evals.ts` (`NEURONS_PER_M_IN` and `NEURONS_PER_M_OUT`);
  - then run `pnpm evals:ask` and read the failures, because a model's habits (where it writes the
    follow-ups marker) are what the split and the evals' checks were fitted to.

## What changed with it

- **The follow-ups split** cuts at the last line that is a marker on its own (any case, as before).
  Failing that it cuts at a capitalised `FOLLOW-UPS` and a colon inside a line, only when what follows
  is nothing, "none" or the opening of a list item, so that prose saying "a follow-up: Homo Deus"
  stays whole. A list written on one line breaks at a dash after a question mark. DeepSeek ends an
  answer line with the marker, and once wrote the list on the same line; both leaked, twice in 36.
- **The evals** fail a case whose answer still holds the marker, read the response's own
  `usage.neurons` when every call reports it, and price the estimate at DeepSeek's rates. The Worker
  reads, logs and returns nothing new.

## What was rejected

- **Staying on `gpt-oss-20b`.** It passed 16 of 18 here, was slower, and wrote up to four times as
  many tokens. Its not being on the deprecation list was a reason to stay safe, not to stay.
- **The cheaper models.** Gemma and `glm-4.7-flash` cost less a pass and failed more, with calls past
  the 30-second deadline.
- **Lowering the per-visitor day or raising the spend limit now.** Both are open under Q15 and neither
  was needed by anything measured.
