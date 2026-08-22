# Coverage comes back as an ingredient, and the report wrote a null where a column should be

**2026-08-22.** [#205](https://github.com/mephistopheles4/stacks/issues/205) —
the last step of the complexity rollout, and the only one a contributor can
decline. `@vitest/coverage-v8` enters the repository, `coverage.include` is
derived from `stryker.scopes.json`, and an opt-in pre-commit hook prints CRAP
over the functions a commit touches. No floor, no threshold, no series, no
badge; the *Coverage percentage* row in `docs/gates.md` is untouched, which was
an acceptance criterion rather than an oversight.

The decision is [ADR-0069](../adr/0069-coverage-is-an-ingredient-not-a-goal.md).
This is what happened while building it.

---

## The defect the real report found, and the planted one that could not

The join is Istanbul's: intersect each `statementMap` entry against a `fnMap`
entry's `loc`, count hits over totals, and that is the coverage fraction the
formula needs. Twenty tests passed against planted reports before anything real
was run.

Then the first real report went past:

```json
"loc": { "start": { "line": 93, "column": 74 }, "end": { "line": 160, "column": null } }
```

**Every `loc.end` the V8 provider writes carries `"column": null`.** The range
check read a null column as `0` at both ends — correct for a start, and at an
end it means *this range stops at the beginning of its last line*. Every
statement sharing a function's closing line was dropped from that function's
total. Coverage reads low, CRAP reads high, and it does so worst for the longest
functions in the file — the ones the table is sorted to put at the top.

⚠️ **No planted fixture would have caught it, because every planted fixture was
written by the person who believed columns were always numbers.** The fix is one
`?? Number.POSITIVE_INFINITY`; the lesson is the ordering. Twenty green tests
were not evidence about Istanbul's shape — they were evidence about my model of
it. The test that catches it now exists and was shown red first, which is the
only reason it is worth keeping.

## Absent is not zero, and it is the property the whole print rests on

Three states look identical if you are careless and are not:

- **In the report, untouched** — a real 0%, a real maximal CRAP. This is the
  blind spot [#191](https://github.com/mephistopheles4/stacks/issues/191)
  disqualified CRAP over, closed by `include` and measured again here: a probe
  file no spec imports scored **CC 7, 0/7 statements, CRAP 56.0**.
- **In the report because nothing in-process can reach it** — `scene.ts`, 581
  statements, 0 hit, whose only oracle is a headless browser. Prints *no
  in-process oracle* and no number. This is the one place in the rollout that
  applies the mutation-scope exclusions; the four series never read them,
  because a function's complexity is a fact about the code whatever runs it.
- **Not in the report at all** — the plumbing broke. Prints *not in the coverage
  report*, and specifically **not 0%**, because inventing the worst number in
  the table out of a broken pipe is how an instrument starts lying.

## What the print cost, measured

| Run | Wall clock |
| --- | --- |
| `pnpm test` (unchanged, coverage off) | 12.1s |
| full suite `--coverage` | ~15s, 945/945 green |
| the hook on a 3-file commit | 3.0s |

`--passWithNoTests` turned out to be load-bearing rather than tidy. A commit
adding a file no spec imports selects no tests; without the flag Vitest exits 1,
the hook prints a diagnostic instead of a table, and **the maximal-CRAP case is
the one case that never prints.** Found by running it, not by reading it.

## G1 was waiting, and it was right

`scripts/crap.ts` imports `node:fs` to read one gitignored coverage report, and
G1 (`adapter-boundary`) failed it by name on the first full-suite run. That gate
exists for invariant 4 — all vault access goes through the adapter — and the
right answer is an allowlist entry with a justification, not a workaround. The
entry says what the file actually touches: `.coverage/`, written seconds earlier
by a run it spawned itself, and paths that came from `git diff --cached`, which
are repository files by construction.

## The stack

Branch `feat/205-coverage-crap-hook`, cut from `feat/201-complexity-counter`
rather than `main` — the counter's per-function output is the input to the join,
and `complexityOf(files)` exists because this hook asked for it while #201 was
still being written. Five sessions ran the six tickets in parallel with an
orchestrator relaying between them; the coordination that mattered was not the
merge order but a **contract agreed before either side was built**: an explicit
file list, structured per-function locations, and a `kind` discriminator naming
the two constructs Istanbul has no counterpart for. The alternative was
discovering the class-field-initialiser case in a join that silently attached a
neighbouring function's coverage to it.
