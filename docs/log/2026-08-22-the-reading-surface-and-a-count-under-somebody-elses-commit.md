# The reading surface, and a count printed under somebody else's commit

**2026-08-22.** The print block and the four panels for the complexity series
([#203](https://github.com/mephistopheles4/stacks/issues/203)), stacked on
[#202](https://github.com/mephistopheles4/stacks/issues/202)'s record. Nothing
here emits, caps or refuses. Two things are worth keeping: a defect the tests
did not find, and what the `trend:sync` observation actually covers.

---

## The defect the tests passed over

`renderComplexity` anchors on `deltaPair`'s newest **carrier**. Panel 1 names
the newest **scored** run. Those are the same record on a quiet week and
different records on a busy one, because a merge record carries the four counts
and no mutation score — so the print showed a merge's counts under a nightly's
commit, with nothing on the page saying so.

**Every spec written for the block passed while it did this.** They asserted on
substrings of the rendered lines, and the line that was wrong was the one
_above_ them. What found it was rendering the block against eight realistic
scopes and reading the output — the second of the three panels printed
`schedule` on its run line and `merge` on its complexity line, four lines apart.

The block now prints its own record:

```text
  complexity — four counts per scope, against the previous merge record
    counted  a1b2c3d4e5f6  merge  12 hours ago
```

_A score never appears without its run_ is [`trend-layer.md`](../spec/trend-layer.md)'s
rule; this is the same rule one level down, and it needed stating separately
because the two blocks do not anchor on the same record. Related: the same pass
found that `renderPanel`'s three-state label — `first run`, `new scope`, a
delta — had been written out verbatim in two functions, and it is now one
`movedLabel`. Two callers spelling a vocabulary independently is how the
refusal column came to run a series name into its own explanation three days
earlier.

## What the `trend:sync` observation covers, and what it does not

The dashboard was brought up against a store holding **30 records: 27 from the
`metrics` branch, and 3 emitted locally.** All four panels resolve — eight
scope-labelled series each, through Grafana's own provisioned datasource rather
than only against Prometheus, so the `uid` binding is covered too. The page
reports `provisioned: true` and eleven panels in the intended order, with the
instrument row reflowed from `y=31` to `y=47`.

⚠️ **The three complexity records were not written by CI.** They came from
`pnpm metrics:emit --out .trend/local`, so the counter ran over the real tree
and the numbers are real — `packages/site/src/shelf` at 394 functions and
`scripts` at mass 1133 — but the clock was chosen and no nightly produced them.
`.trend/` is gitignored and per-worktree; **the `metrics` branch was not
touched**, because a hand-made row in the shared store is a run that never
happened and would outlive whoever remembered making it.

So the half of the acceptance criterion that reads _renders the panels against
a real record_ is **covered for the rendering and open for the record**. It
closes when #202 merges and the first CI record carries the four families —
the same shape of deferral as #204's observed-red demonstration.

⚠️ **No screenshot.** The session was unattended, so the browser pane could not
composite and Grafana's panels never mounted. The API checks above are what
stands in, and they prove the panels provisioned and their queries answer —
not what the page looks like.

## The other half, against the real store

`pnpm deploy:site --check-only` ran against the 27-record branch store, which
today carries no complexity families at all. It printed:

```text
  complexity  no record read carries the four counts — absent is not zero
```

which is the _prints nothing and says so_ criterion met against real data
rather than a fixture — and the pre-#202 record and the zero-function failure
wear one face here, deliberately, because absent is not a `0` for `max`.
