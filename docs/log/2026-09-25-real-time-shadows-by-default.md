# Real-time shadows by default

**2026-09-25** — [#381](https://github.com/mephistopheles4/stacks/issues/381)'s
fifth change and its last: real-time shadows are on for every visitor, and a
new gate, G60 (`one-shadow-reader`), counts on the default page the programs
that read the shadow map and the draws they make. The decision is
[ADR-0090](../adr/0090-real-time-shadows-are-the-default.md). The four changes
before it made this safe, in order: [the woodwork is one mesh](./2026-09-24-the-woodwork-is-one-mesh.md),
[only the bookcase reads the shadow map](./2026-09-24-only-the-bookcase-reads-the-shadow-map.md),
[the cover shade](./2026-09-24-the-cover-shade.md) and
[a lost context falls back to painted](./2026-09-25-a-lost-context-falls-back-to-painted.md).

## The answer first

- **A bare URL now gets the shadow map**, with only the bookcase reading it, in
  2 draws from 1 program at every library size. `?shadows=0` shows the painted
  path, which is what a device falls back to after a lost context.
- **G60 is green at both sizes and its control is red.** One program and 2
  sampling draws a steady frame at the 50-book fixture and at a generated
  300-book one, 17 shelves tall; `?receivers=all` reads 5 programs and 302 draws
  and fails, as it must. The same on a local GPU and under SwiftShader.
- **Five plants each turned it red**, and the first one found a defect in the
  gate's own hook before it could ship: frame 0, where the shadow pass lives,
  was dropped from a long page's record.
- **The phone was not run on this build.** Its default page is the
  configuration `?shadows=1` ran on the previous build, which held 120 s at
  60 fps.

## The device, and what it measured

A Pixel 10 Pro XL: PowerVR D-Series DXT-48-1536, driver `25.3@6908880`, Android
17, Chrome 153, ANGLE on the GLES backend. About 230 runs over USB remote
debugging, 2026-09-24. The tables are in
[only the bookcase reads the shadow map](./2026-09-24-only-the-bookcase-reads-the-shadow-map.md);
this is the thread through them.

- **It counts draws, not time.** The live site died at frame 8 ± 1 after about
  3,474 draws whose program samples the shadow map, and throttled to 1.9 fps it
  died at the same frame with the same count.
- **Not vertex colours.** Google issue 541322087 files the same driver build
  against a shadow-receiving material that reads a vertex colour. Its own test
  case survived on this phone; a site-shaped page with no vertex colours died
  three of three. Whatever that issue's trigger is, it is not this one.
- **Not the sampler type.** `?shadowtype=basic` reads the map through a plain
  `sampler2D` and died too.
- **Not a flush.** `gl.flush()` after every shadow draw, after every draw, or
  once a frame: no effect.
- **Not `receiveShadow = false`.** three keys the fetch on the renderer, so the
  sampler stays compiled into every program; sending the uniform as `0` died at
  frames 8 and 9 like the unmodified page.
- **One program survives.** With the fetch taken out of every book program at
  compile time, only the bookcase's program read the map, and the page ran 30 of
  30 runs, up to 300 s, with swipes.
- **And it has a ceiling.** 11 sampling draws a frame survived every run; 12
  survived three of three, one of them 300 s; 13 died two of two, at frame 134.
  Above that it dies sooner — 14 at frame 113, 30 at 58, 60 at 30. A second
  sampling program lowers the line: a 6 + 5 split died at frame 292.
- **The edge is not a margin.** A hook that capped the draws at 12 by skipping
  the rest died twice, where the uncapped 12 lived, on a draw stream identical
  after frame 3.
- **The bookcase would have crossed it on its own.** It drew `max(usedRows +
  5, 6)` times: 11 on the live library, 13 at about 66 books, about 27 at the
  brief's 200. That is why the woodwork was joined before anything else.
- **The empty case survives now**, where ADR-0016 records it dying in August.
  The driver moved in between.
- **The Vulkan check was not run.** Setting ANGLE's backend to Vulkan on the
  phone was prepared and dry-run, and stopped there: a flag on the owner's
  browser needs the owner's own yes, and a browser flag is no part of a fix
  (ADR-0090, item 6). It stays an informative experiment, not a remedy.

## What shipped here

- `DEFAULT_SETTINGS.shadows.enabled` is `true`. `receivers` stays `bookcase`,
  `painted` stays on, so the painted shading and the map both shade what they
  agree about — ADR-0016 recorded the double darkening in August, and ADR-0090
  accepts it for now.
- The probe docs say what the flip changed: `?shadows=0` is the painted
  fallback, `?shadows=1` is the default and overrides a remembered fallback for
  one load, and `?receivers=all` is the reproduction and G60's control. One test
  had gone vacuous — a tune blob plus `&shadows=1` expected shadows on, which a
  bare page now gives anyway — and asks for `&shadows=0` instead.
- **`?solo` never enables a shadow map.** `book-inspector.ts` builds a renderer
  of its own and never touches `shadowMap`, so the turntable is the painted
  shelf, as it was.
- The handle and `window.__shelf` carry `rowCount`, so the gate can tell its
  large page is large.

## The gate

G60 runs inside `pnpm smoke:render`. Three pages, each in a browser context of
its own at 480×640, each with a counting hook installed before any page script:

| page | steady frames | sampling programs | sampling draws a frame | casting draws | verdict |
| --- | --- | --- | --- | --- | --- |
| default, 50 books | 112 | 1 | 2 | 42 | ok |
| default, 300 books, 17 shelves | 2,782 | 1 | 2 | 274 | ok |
| `?receivers=all`, 50 books | 112 | 5 | 302 | 42 | red, as it must be |

On a local GPU. Under SwiftShader, as CI renders, the same programs and draws
over 32, 31 and 31 steady frames. Before the gate the whole render gate took
42 s locally; with it, 63 s locally and 78 s under SwiftShader.

**Why a desktop can see the phone's programs.** three builds every program in
JavaScript — prefix, chunks, defines, which materials share a program — so the
GPU compiles what it is handed. The one thing a driver decides is whether a
declared sampler is *active*, so every program is classified twice, by GL and
by the source three handed GL, and a disagreement is red.

**Observed red**, each planted, run through `pnpm smoke:render` and reverted,
with the file's hash checked against its backup:

1. **Every book reading the map again** — the `receiveShadows` call in
   `buildBook` removed. 5 programs; 302 sampling draws a frame at 50 books and
   1,979 at 300. It also showed the gate wrong: the 300-book page ran past the
   hook's 4,000-frame cap before it was read, the cap dropped frames from the
   front, and frame 0 — the shadow pass — went with them, so the page read as
   books that had stopped casting. The hook now keeps its first ten frames and
   records the last link frame outright; a spec pins both.
2. **A mesh per plank again** — one extra woodwork mesh per shelf. 1 program,
   7 sampling draws at 50 books and 20 at 300: red on the budget alone, and
   growing with the library, which is the defect the join removed.
3. **Real-time shadows off by default** — the tree before the flip. 0 programs
   on both default pages, and the control red for the wrong reason, which the
   gate also refuses.
4. **A blind classifier** — the hook reporting no program as a reader. The
   default pages read 0 programs, and the control failed the gate for reading
   none. A second plant, a source reading that ignored the `#undef`, went red on
   the classifiers disagreeing about six programs while the control still came
   back red — so the agreement clause catches what the control cannot.
5. **A verdict before the program set settled** — the settle wait cut to 1 ms,
   under SwiftShader. 12 and 19 steady frames against the 30 a verdict needs.

**`tsx` rewrites the hook.** It compiles with esbuild's `keepNames`, which turns
every named function inside the hook's body into a call to a module-level
`__name` helper. Serialised for a page, the body still calls it and the page has
none: measured, the bare body throws `__name is not defined`. The source the
page gets defines the helper in a block of its own.

## What is still not known

- **Whether the phone holds the default page.** It resolves to the same
  settings `?shadows=1` did on the build the phone held for 120 s, so it
  compiles the same programs — an argument, not a run. `scripts/phone-check.ts`
  is the check.
- **Any other GPU's edge.** G60 pins the configuration that survived on one
  driver, not survival. The Galaxy S25 and the iOS simulator held the old
  `?shadows=1`, with five programs reading the map; neither has run this build.
- **The look.** Painted plus real shading, the band the cover shade paints back
  and the join's speckle are the owner's to judge against a screenshot. The
  README's image still shows the painted shelf.
