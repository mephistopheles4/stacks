# The shelf's two inspectors — `?solo` and `?debug`

Both are query-string instruments on the ordinary page, and neither exists for a
visitor who does not ask for it. They lived in [`AGENTS.md`](../AGENTS.md) until
that file's size became [#174](https://github.com/mephistopheles4/stacks/issues/174);
nothing here changed but where it sits, and `AGENTS.md` points at this file.

Read this before changing the renderer, the debug panel, or `shelf-settings.ts`.

## One book, alone — `?solo`

`?solo=N` mounts a single book on a turntable: no case, no neighbours, and an
orbit with **no polar clamp**, so you can go over the head and under the tail.
`?solo` on its own is the first book. It builds through `toRows`, `placeShelf`,
`buildBook` and `addLighting` — the shelf's own functions — because an inspector
with its own copy of the geometry would agree with the shelf right up until the
moment it mattered.

**It exists because the shelf is the worst place to look at a book.** Books
occlude each other, the case occludes the row, and the camera cannot get above or
below. Two defects at the head of every hardback survived two code reviews, a
479-test suite and a gate that reports every renderer counter — because they
moved none of them. `?solo` found both in one screenshot.

**Stand somewhere by number, not by dragging: `window.__solo.look()`.** It takes
`{ azimuth, elevation, distance, target }` — degrees, and distances in the book's
own heights — and it is the sibling of the `window.__shelf` that `smoke:render`
reads. The head corner was re-cut seven times before this existed, and every one
of those rounds was judged from a hand-dragged orbit, so no two before-and-afters
were the same picture and *"it looks better"* was never checkable. `distance` is
clamped by the inspector's own `minDistance`: it magnifies, it does not invent.

⚠️ **What you can see here, nobody can see at all — and that cuts two ways.**

- **Angle.** The shipped `maxPolarAngle` is `PI * 0.52`, so a visitor never gets
  more than 3.6° under the horizon — which is why
  [#56](https://github.com/mephistopheles4/stacks/issues/56) decided there is no
  tail cap and never will be.
- **Distance.** `?solo` sets `minDistance` to 0.4 of a book's height, about
  **four times closer than the shelf's 1.5**. So it magnifies; it does not
  invent.

⚠️ **It is still the right instrument, and "a visitor could never see that" is
not a disposal.** That sentence was written here once, about the case's assembly
seams, and the owner produced a shelf screenshot at the shelf's own `minDistance`
with the seam plainly in it. What had actually happened is that the claim was
made from a render the writer had already decided was clean. **Anything you want
to dismiss on visibility grounds gets a shelf render at `minDistance` first, and
somebody other than the person who wants it dismissed should look at it.**

## The debug panel — `?debug`

Loads a **black box** and a **tuning panel** onto the ordinary page. Neither
exists for a visitor who does not ask.

- **The black box** (`diagnostics.ts`) records a crash that leaves no error
  behind, and is a **static** import: it has to be running before the thing it
  measures fails. See [The mobile crash](log/2026-08-01-the-mobile-crash-g15.md).
- **The panel** (`debug-panel.ts`) is every setting the shelf has, live, and is
  **lazy**: its 8.8 KB is paid only by a page that asked for it.

Everything the shelf looks like is one object — `ShelfSettings` in
`shelf-settings.ts` — and the panel exports it as JSON you paste back into
`DEFAULT_SETTINGS`. `shelf-url.ts` owns the query string in both directions: the
ten historic probes keep their flat spellings because `docs/progress.md`
documents them with measured results, and everything else rides in `?tune=`.

**A control must not lie, and that is the whole design.** `applySettings`
returns an `ApplyReport` — `applied`, `needsRebuild`, `needsReload`, `refused` —
and the panel renders what the shelf reported rather than what it was asked for.
This is [`docs/progress.md`](progress.md)'s oldest rule about instruments,
*"a probe that silently did nothing would be worse than no probe"*, applied to a
slider. It caught seven real faults; they are listed there.

Decisions: [ADR-0032](adr/0032-shelf-settings-are-one-object.md),
[ADR-0033](adr/0033-painters-follow-the-light.md),
[ADR-0034](adr/0034-bloom-behind-a-composer.md). Research behind them is in
[`docs/research/`](research/).
