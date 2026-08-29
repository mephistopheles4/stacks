# The woodwork baseline

⚠️ **This directory exists on `prototype/282-woodwork-baseline` only and never
reaches `main`.** G13 (`gates/repo-hygiene.test.ts`) pins `docs/images/` to
exactly `shelf.png`, so this branch is red on that row by construction — which
is the correct outcome for a `prototype/` branch, whose whole contract is that
it never becomes a commit on the trunk. The images live here rather than in the
gitignored `artifacts/` tree so the ticket can link them.

They answer [#282](https://github.com/mephistopheles4/stacks/issues/282) under
map [#280](https://github.com/mephistopheles4/stacks/issues/280): **the empty
bookcase, rendered at the four rungs of #54's distance ladder, as the baseline
every wood treatment is differenced against.**

Regenerate with:

```sh
pnpm tsx scripts/prototype-woodwork.ts
```

Difference a treatment against a rung with:

```sh
pnpm tsx scripts/prototype-woodwork-diff.ts empty-zoom10.png <your-arm>.png
```

## The rungs

`shelf` is the full-shelf framing `frameCamera` sets, `zoom10` and `zoom25` are
10 and 25 wheel notches in from it, and `near` is `minDistance` — 60 notches,
which overshoots the clamp so the rung is reproducible without hitting an exact
distance. **Every rung is level.** #54's own script bakes a ~20° orbit into each
of its zoomed shots; nothing here drags at all.

## The files

| Prefix | What it is |
|---|---|
| `empty-*` | **The baseline.** The bookcase with its books removed and its row count kept. |
| `books-*` | The populated twin, at the identical camera. #284 needs one of these for the painted-shadow question. |
| `clown-*` | The instrument, not a render: the woodwork painted magenta and the backboard green, so the frame's composition is counted rather than eyeballed. |

`empty-*` and `books-*` differ by exactly the books — same case, same row count,
same camera — because `window.__empty` empties the shelf rows instead of
shrinking the case.
