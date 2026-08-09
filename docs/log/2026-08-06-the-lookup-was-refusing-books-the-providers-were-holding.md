# 2026-08-06 — the lookup was refusing books the providers were holding

[#63](https://github.com/mephistopheles4/stacks/issues/63). Five books in the
real vault had no page count and `enrich` refused all five as "not the same
book". Google had three of them. G26 is the gate; `docs/gates.md` carries what
building it taught.

**Two of the issue's three named causes were real, and the emphasis was wrong on
both.**

- **Open Library short-circuited Google** — `if (primary.length > 0) return
  primary`, so any result at all ended the search. Real, and **it fixes none of
  these five**: Open Library returns *nothing* for all of them, so it was never
  the thing standing in the way. "Fallback" now means *when the primary has no
  good answer* rather than *when it is silent*, which is what CLAUDE.md always
  said. Google is still not asked when Open Library has actually found the book,
  so the working path costs no extra requests against a shared quota.
- **`enrich` looked only at candidate `[0]`** — the real cause, and the fix is
  not "look at all of them". Four candidates pass the matcher for *The Subtle
  Art of Not Giving a F\*ck*: a box set, a censored-title edition at 206 pages, a
  16pt large-print at 320, and the true one at 262. **Taking the first
  *matching* candidate silently picks 206.** So `lookup` now ranks — matching the
  query dominates, `titleMatchScore` separates editions within that — and the
  ranking lives there rather than in `enrich`, because `stacks add` had the same
  defect through the same function.
- **Google's two endpoints disagree.** Volume `An8Q0QEACAAJ` reports
  `pageCount: 0` in a search response and `368` from `/volumes/An8Q0QEACAAJ`.
  Ranking alone finds that book and still leaves it with no pages, so the chosen
  volume is re-asked by id — once, after the match is settled. `printedPageCount`
  was considered and dropped: it disagrees with `pageCount` in *both* directions,
  so it is not reliably the truer number and choosing per book would be guessing.

**The fourth cause did not exist.** The issue reported something reordering or
dropping Google's first candidate for *Beyond Vibe Coding* and asked for a trace
rather than a guess — correctly, because the trace found no such thing. Google
simply ranks a different Vibe Coding book first, and the only filter that fired
removed a genuine study guide. The issue reached that hypothesis by probing the
API with a **shorter query than the code sends**, which returns a different
order. The most specific-sounding item in the report was the one that was not
real.

**Result: 3 of 5 filled — 255, 368 and 262, all correct editions.** The other
two are genuinely absent from both providers and are still refused, which is the
right answer and is now pinned by two of G26's five corpus entries. Nothing was
written to the vault; `enrich` was only ever run with `--dry-run`.
