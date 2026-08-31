# The shelf's inspectors — `?solo`, `?debug` and `?woodSeed`

All three are query-string instruments on the ordinary page, and none exists for
a visitor who does not ask for it. They lived in [`AGENTS.md`](../AGENTS.md) until
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

## The dice, held still — `?woodSeed`

`?woodSeed=<token>` pins the root every member of the bookcase draws its figure
off, so two renders differ by the arm under test and not by the dice.

**A member of the bookcase has no identity.** The root is drawn fresh on every
page load and the promise is *one page load only* — two loads give two different
bookcases, which is
[#287](https://github.com/mephistopheles4/stacks/issues/287)'s decision and not
an accident. A book-derived seed was declined on arithmetic as well as on taste:
the plank loop runs `row <= rowCount`, so the top plank is a lid that never holds
a book, `rowsForCase` keeps one empty row ahead, and an empty vault gives three
planks and no books at all.

That is exactly what defeats a differ. [#282](https://github.com/mephistopheles4/stacks/issues/282)'s
harness compares two renders of one scene, so with a per-load draw the two frames
differ by the dice as well as by the treatment and a count of just-noticeable
pixels stops meaning anything. Forced, the dice are equal and the difference is
the arm.

⚠️ **Byte identical is a property of the renderer as well as of the seed.**
Two shots at one seed are byte identical under **SwiftShader**, which is what
`pnpm smoke:render` selects when `CI=true` — 0 of 3,888,000 samples, worst Δ 0.
On the same machine's **GPU** path the identical pair differs on **6 samples of
207,000 at worst Δ 1**, and tripling the settle does not shrink it. That residual
is rasterisation, not the dice: it is measured with the dice held fixed, and
against it two seeds move 507,396 samples at worst Δ 99. A harness asserting
byte identity has to say which renderer it means, or it will read a GPU's noise
floor as a seed that did not hold.

⚠️ **No default, and never in `?tune=`.** A default would quietly make every
render reproducible while the shipped shelf was not, so the refusal lives in the
harness rather than in the page. And a shareable settings link that froze the
dice would be a control that lies about a shelf which is supposed to be alive —
so the seed is a **flat spelling** beside `?solo` and `?debug`, and is not a
member of `ShelfSettings` at any depth.

⚠️ **Absent and empty both fall through to a fresh draw**, and the last of a
repeated key wins. Three of this shelf's measured false zeros came from a query
string nobody had proved: `URLSearchParams.get` returning the *first* of a
duplicated key, so an arm asking for 512 rendered 1024 and differenced to a
perfect 0.000%; and `Number(null)` being `0` rather than `NaN`, so an absent
`?woodVary=` passed a `>= 0` guard and disarmed the whole variation. A seed that
dropped out of a query must not silently agree with another shot whose seed also
dropped out.

Read in `shelf-url.ts`; the keys are built in `woodwork.ts`'s `woodKeys`, which
is where the backboard's is held to carrying the root.

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
