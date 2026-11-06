# Five models on the Ask the library evals, and the switch to DeepSeek

[#540](https://github.com/mephistopheles4/stacks/issues/540). Cloudflare is deprecating
16 LLMs on 2026-11-15. `gpt-oss-20b`, the Worker's model,
is not one of them, but the post prompted a comparison on 2026-11-06, and the owner then
chose to switch ("let's amend the spec and switch to DeepSeek", then "go with 1" on Q15). The
decision is [ADR-0136](../adr/0136-ask-the-library-runs-on-deepseek-v4-1-flash.md) and the spec
amendment is folded into `docs/spec/ask-the-library.md`. This file is the evidence.

## How it was run

Every model ran S9's 18 cases (13 questions and 5 memory cases, one pass each) through `main`'s own
answer code at `db2ca80`, on the `stacks-ask-test` gateway, with **only the model id swapped** in the
AI wrapper. Rules, messages, tools, `max_tokens` 1,500 and the 30-second deadline were `main`'s. DeepSeek
ran a second pass. The harness was a throwaway copy of the evals outside the repo; it timed each question
and kept the raw responses. Nothing here is from the live site.

## Results

| Model | Passed | Median | Slowest | Over 30 s | Neurons per pass |
| --- | --- | --- | --- | --- | --- |
| `@cf/deepseek-ai/deepseek-v4.1-flash-1017` | 18, then 18 | 3.9 s, 4.2 s | 9.6 s | 0 | 943, then 650 |
| `@cf/openai/gpt-oss-20b` (then current) | 16 | 6.4 s | 15.4 s | 0 | about 897 |
| `@cf/google/gemma-4-26b-a4b-it` | 15 | 6.3 s | 47.7 s | 3 | about 575 |
| `@cf/openai/gpt-oss-120b` | 14 | 4.6 s | 13.8 s | 0 | about 1,507 |
| `@cf/zai-org/glm-4.7-flash` | 14 | 8.2 s | 38.9 s | 1 | about 468 |

"Passed" is the evals' own checks. Re-deriving the figures from the raw passes gives the same pass
counts, slowest times within 0.1 s and the same Neurons, and medians within 0.5 s of this table (it
used per-question totals; the table's method is not recorded). DeepSeek's two passes differ in cost
with the cache: the responses report 31,168 of 47,811 prompt tokens cached in the first pass (65%) and
38,080 of 45,164 in the second (84%), which ran right after it.

## What the failures were

Read by hand against the Thoughts, not just by the checks:

- **DeepSeek.** The 36 answers named only real books and ratings and claimed no Thoughts that are not
  there. Every book with no Thoughts got its rating and "nothing written". One line went past the data:
  a favourite claim where the Thoughts say "one of my favorite", the same kind S12 already lists. Its
  largest output on a call was 291 tokens in the first pass and 322 in the second, against
  `gpt-oss-20b`'s 1,237.
- **`gpt-oss-120b`.** A raw internal format in an answer.
- **`glm-4.7-flash`.** A pasted Thoughts section, and an echoed rule.
- **Gemma.** Reasoning that ran to the 1,500-token cap with no answer.
- **`gpt-oss-20b`.** Two failed checks of 18 on this pass.

## What it found about the code

DeepSeek writes the follow-ups marker at the end of an answer line ("... to our advantage. FOLLOW-UPS:")
and once wrote the whole list on that line. The split read only a line that starts with the marker, so
both leaked into the answer, twice in 36. **No check caught either**: the answers passed every S9 check
with the marker in them. So the split changed (M3) and the evals gained a check for a marker left in an
answer (M4).

## What was not settled

- **Cold-cache cost live.** The measured 36 to 52 Neurons a question had a warm cache; about 93 to 99 is
  the cold figure, by published rates on all input. Visitors arrive spaced out, and Cloudflare does not
  publish how long the prefix cache lasts.
- **Whether free daily Neurons cover a paid-billing model** is unread, like the rest of Unified Billing.
- **Dated ids are retired.** `deepseek-v4-flash-0731` is on the 2026-11-15 list; this id will follow.
- **One timed pass per model, 18 questions.** Enough to tell DeepSeek from the others on what failed,
  not to rank the other four.
