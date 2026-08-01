# Progress

**Read this first.** It is the only file that says where the project actually is.

This is an **index, not a narrative**. One line per event, newest phase last.
Gists and links — never restate the plan. If you find yourself explaining *what*
a phase does here, it belongs in [`plan.md`](./plan.md) instead.

Update it in the **same commit** as the gate it describes.

---

## Current state

| | |
| --- | --- |
| **Last green gate** | G15 — cover budget, after the live site crashed phones |
| **Now working on** | the mobile crash, which is **not** fixed — see below |
| **Blocked on** | nothing |
| **Deployed** | https://stacks.aymandiab.com — Cloudflare Pages, `pnpm deploy:site` |
| **Running against** | the owner's real vault, 31 books, all with covers |

## Gate log

| Phase | Gate | Status | Commit |
| --- | --- | --- | --- |
| 0 — scaffold | `stacks --help` lists commands · empty shelf renders · fixtures committed | ✅ green | tag `phase-0` |
| 1 — data layer | `stacks build` → valid `library.json` · malformed skipped · 4 test cases | ✅ green | tag `phase-1` |
| 2 — shelf | `pnpm smoke:render` → non-blank `artifacts/shelf.png` · 50 books · click opens card | ✅ green | tag `phase-2` |
| 3 — public build | `--public` output has zero canary hits · OG image generated | ✅ green | tag `phase-3` |
| 4 — import | dedupe by ISBN then title+author · re-running is idempotent | ✅ green | tag `phase-4` |

Every phase additionally requires `pnpm test && pnpm build` green.

### Phase 1 evidence

- `pnpm test` → 7 files, **62 tests** passed · `pnpm build` clean
- `pnpm stacks build --vault fixtures/vault` → **8 books**, 2 warnings naming
  `The Undelivered Manuscript.md` and `Untitled Import.md`, silent on
  `On Reading Slowly.md`, exit 0 — matching `fixtures/README.md` exactly
- Gate's four cases covered against **real captured** responses: ISBN hit,
  fuzzy title, API miss, malformed frontmatter. No test touches the network.
- End-to-end `stacks add 9781603580557` into a scratch vault: note written,
  real cover downloaded, spine colour extracted, re-running deduped correctly.

### Phase 2 evidence

`pnpm smoke:render` green: 49 of 50 fixture books shelved (wishlist excluded),
715 distinct colours, 40.1% non-background, and a click on a real book opened
its card ("Ember Protocol: Notes on Craft"). Screenshot at `artifacts/shelf.png`.

Aesthetics review came back with three directions, all applied: real bookcase
feel (continuous fill at real proportions, not one sparse row per year),
wishlist books stay off, and spine colour sampled from the cover's binding edge
so it matches the real spine. See the Decision Log for each.

### Phase 3 evidence

`pnpm gate:public` green: builds for real, then greps every text file that
shipped for the canary, for vault note paths, and for `sourcePath` — 0 hits. It
also fails if the canary is missing from the fixture vault, so it cannot pass
vacuously. OG image 24.8 KB at 1200x630. 71 tests pass.

Both gates were made to stage their own input: they previously fought over
`packages/site/public/library.json`, so whichever ran last decided what the
other tested. Verified passing back to back in either order.

### Phase 4 evidence

`stacks import audible <export>` against a real Libation export: 22 records, 17
added, 5 correctly matched against books already shelved — two of them separated
only by a *long* subtitle, which needed a dedupe fix first. Re-running added 0
and skipped 22, so the import is idempotent. The vault now holds 25 books, every
one with cover art.

The source is Audible/Libation rather than the brief's Audiobookshelf; see the
Decision Log for why. `importBooks` is source-agnostic — an ABS importer would
need only a new mapper.

## Environment findings

| Finding | Status |
| --- | --- |
| Node / pnpm / git | ✅ Node 24.14.1, pnpm 11.18.0, git 2.55.0 (Windows) |
| `@stacks/core` resolves under tsx + vitest + astro/tsc | ✅ verified |
| Headless Chrome for Phase 2 | ✅ system Chrome present; use `channel: 'chrome'`, no download |
| `.astro` files are NOT typechecked | ⚠️ `astro check` can't run under TS 7 — keep logic in `.ts` |
| **`node -e` with ESM top-level await exits silently** | ⚠️ prints nothing, exit 0. Put scripts in a file and run with `pnpm tsx` |
| **Bash tool sandbox blocks network** | ⚠️ outbound `fetch` needs `dangerouslyDisableSandbox` |
| Google Books unauthenticated | ⚠️ 429s on a shared quota — a bonus, never a dependable fallback |
| Resolved versions | TS 7.0.2 · Vitest 4 · Astro 7.1.6 · three 0.185.1 · sharp 0.35 |

## Since the phase gates

Ten commits of work driven by running against a real vault rather than fixtures.
Most of it was defects that only real data exposes:

- covers now carry their true aspect (audiobook art is square, print is ~0.65)
  and books lean in groups; spine titles are printed on the spines
- `face_out` joined the frontmatter contract
- `stacks build --watch` plus `pnpm dev:watch` for live editing from Obsidian
- Google Books works now a key is configured; Apple Books added purely for
  cover art, which is ~800x1200 against Google's ~128px
- matching learned to refuse summaries and study guides, which had put the
  wrong book's cover — and once the wrong book's *note* — into the vault
- covers that are Google's "image not available" card are refused
- tags are normalised to what Obsidian accepts

## Phase A — invariant scoreboard

Every rule in CLAUDE.md now has a named gate that can go red. The scoreboard is
[`gates.md`](./gates.md); it records which rows were red on arrival and what each
caught. `pnpm test` went 133 → 211.

Six defects, all of them documented rules that had quietly stopped being true:

| | Found by |
| --- | --- |
| `updateBook` overwrote an inline list — `author: [A, B]` — losing an author. Reachable: an array parses as *authorless*, which is what sends `enrich` to look one up | G4 |
| `enrich` re-implemented the cover-path rule and got it wrong on Windows, under a comment saying it could not | G10 |
| a third copy of that rule in the wikilink embed, resolving to nothing for a backslash path | G10 |
| the public staging folder was additive: real covers survived a fixture-vault gate run, filenames slugged from real titles, gate green | G2 |
| wishlist books shipped in `library.json` though nothing displayed them | G2 |
| `shelf_order` collided with "reading first" — one `--renumber` and the next book you picked up sorted last | G12 |

Plus `shelf_order` missing from the documented key list (G8) and `PORT` from
`.env.example` (G9).

**Still open**

- **Cover provenance backfill.** `cover_source` is recorded going forward, but
  every cover already in the vault has none, so the provider policy (re-host
  Open Library only) cannot be enforced without emptying the shelf. Decide the
  backfill before enforcing.
- **Unterminated frontmatter is dropped silently** — a note opening `---` with
  `type: book` and no closing fence returns `not-a-book`, so no warning names
  it. Invariant 3 arguably wants `invalid`. G3 pins current behaviour with the
  competing reading in a comment.
- **`applyChange` mis-handles a YAML block scalar** (`description: |` plus
  indented lines). Unreachable from any current call site; flagged, not fixed.
- **No `.gitattributes`.** Every commit warns about CRLF→LF. Harmless today,
  but CI is Linux and the repo is about to take contributions.

## The mobile crash — G15

The first defect a **user** found rather than a gate, and the only one so far
that took the live site down.

Reported as: the shelf loads on a phone, draws, then the page goes blank with a
sad face; reloading shows nothing at all. Two symptoms, two different causes.

**The crash.** Covers shipped at whatever size the provider supplied. On disk
that is 8.4 MB, which looks fine. But the shelf is WebGL, so each cover is
decoded into an *uncompressed* GPU texture and every one is uploaded before the
first frame — **314 MB**, with a single 2400×2400 audiobook cover accounting for
30 MB by itself. A desktop GPU has room not to notice. A phone kills the
renderer.

**The blank reload.** Not the same bug. After a renderer crash the browser
refuses a new context, `new WebGLRenderer` throws, `boot()` rejects, and nothing
catches it — the `.astro` script may not, under the "no logic in `.astro`" rule.
So the page rendered as nothing, with no indication anything was meant to be
there.

| | before | after |
| --- | --- | --- |
| covers on disk | 8.4 MB | 1.1 MB |
| decoded GPU texture | 314 MB | 30.2 MB |
| largest single cover | 2400×2400 | 512×512 |

Both halves are gated: `gates/cover-budget.test.ts` was observed red on the
per-cover cap before the fix, and its total-budget assertion was observed red
separately by temporarily lowering the budget — the fixture vault is too small to
breach 96 MB on its own, so without that second check one of the two assertions
would never have been seen failing.

Everything else about the deploy is unchanged and was re-verified live: 31/31
covers 200, no private or wishlist books, `noindex` served as both a meta tag and
an `X-Robots-Tag` header, `og:image` absolute.

### It still crashes — the covers were not the cause

**Necessary, not sufficient.** The owner has since reproduced the crash on
multiple phones, in private tabs, having confirmed in desktop devtools that the
covers now arrive compressed and under 2 MB. The 314 MB was real and shipping it
was wrong; it was not what kills the tab.

So the cause is unmeasured, and the temptation is to keep tuning the things that
were deferred — pixel ratio, antialiasing, the 2048² shadow map — without
knowing whether any of them matters. Two instruments were built instead, both
behind a query parameter and both inert for an ordinary visitor:

- **`?debug`** mounts a black box (`packages/site/src/shelf/diagnostics.ts`). A
  renderer OOM kill destroys the process, so there is no exception, nothing
  reaches `onerror`, and a USB debugging session disconnects at exactly the
  moment the data matters — a console can show a clean log and then nothing. The
  black box writes a snapshot to `localStorage` every second and shows it back on
  the next load. `pagehide` fires on an ordinary navigation and does *not* fire
  when the process is killed, so **a stored record with no `clean` flag is a
  record of a crash**, and its counters are the last thing the page knew.
- **`?books=N`** renders only the first N. If five books kill a phone, the fixed
  cost is the problem and the library size is irrelevant; if five survive and
  twenty-five do not, the cost is cumulative and N is the threshold. One reload
  on the device that actually crashes, no cable, and either answer halves the
  search.

Both paths were observed working, in both directions: a normal navigation
records `ended cleanly`, and a record without the flag renders as
`PREVIOUS SESSION DIED`.

### The bisect answered on the first try: five books

Run on the owner's Pixel 10 Pro against the live site, `?debug&books=5`:

```
books    5
textures 11  geom 8  prog 3
draws    61  tris 632
buffer   1054x1926  dpr 2.00
screen   527x962 @2.549999952316284
heap     10 / 2222 MB
ram      8 GB
gpu      PowerVR D-Series DXT-48-1536
uptime   12s
```

…and the canvas was gone, replaced by the context-lost notice.

**Five books. 632 triangles. Eleven textures. Sixty-one draw calls.** Whatever
kills the shelf is paid *before a book is drawn*, so library size is not the
variable, and every plan that starts "upload fewer covers" is a fix for a cause
that is not this one. The lazy loader is not the answer to this bug.

**And it is not the tab being killed.** The reload reported
`— previous session ended cleanly —`, which can only happen if `pagehide` fired,
which can only happen if the page survived. So the *context* went away while the
document lived. The original report — a blank page and a sad face — was a tab
death, and that is a different failure from this one; the 314 MB fix plausibly
did resolve it, and this was underneath all along.

That leaves the fixed cost, which is four settings — and rather than bundle them
into a "mobile profile" that would very likely make the crash vanish while
leaving nobody able to say which knob did it, each is now its own probe:

| probe | what it changes | why it is ranked here |
| --- | --- | --- |
| `?aa=0` | `antialias: false` | 4× MSAA colour+depth at 1054×1926 is ~65 MB — by far the largest allocation, on a brand-new tile-based PowerVR driver where the resolve is the expensive path |
| `?dpr=1` | caps `devicePixelRatio` | sets the size everything else is a multiple of |
| `?shadows=0` | no shadow map, no casting light | the 2048² depth target is 16 MB |
| `?guard=1` | skip `setSize` when unchanged | assigning `canvas.width` reallocates even when identical, so an unguarded `ResizeObserver` churns the whole framebuffer on every layout event — still plausible because the failure is delayed (12s, 19s), not at first paint |

`?books=0` renders an empty case that still pays the entire fixed cost, which
isolates renderer setup with no ambiguity from book content at all.

Each probe was verified to have a *real* effect before shipping, not merely a
label: `aa=0` flips `gl.getContextAttributes().antialias`, `dpr=1` takes the
drawing buffer from 1000×1800 to 500×900, `shadows=0` drops the renderer from 13
textures and 3 programs to 11 and 2. A probe that silently did nothing would be
worse than no probe — the owner would run it, see no change, and rule out the
actual cause.

The panel now prints the active profile, so a screenshot of a crash says which
settings produced it. A bisect whose result cannot be tied to a configuration is
an anecdote.

### It was the shadow pass

`?debug&books=5&shadows=0` survived, so the owner went straight to the whole
shelf. Thirty-one books, antialiasing **on**, pixel ratio **2**, shadows off:

```
books    31
profile  aa=on dpr<=2 shadows=off guard=off
textures 58  geom 11  prog 2
draws    195  tris 1720
buffer   1054x1898  dpr 2.00
heap     11 / 3868 MB
gpu      ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL…)
uptime   18s
```

Stable, with the previous run also recorded as a clean exit. One variable
changed, and the failure went away.

**The ranking was wrong, and it is worth recording that it was.** Antialiasing
was ranked first on the arithmetic — 4× MSAA colour and depth at 1054×1926 is
~65 MB, the single largest allocation in the scene. It is still the largest
allocation, and it is not the problem: the shelf runs with it on. The
2048² shadow map is 16 MB, ranked third, and it is the one that kills the
context. Sizing an allocation predicted the wrong answer, which is the argument
for probing over reasoning about it.

### Shadows stay on by default — owner's call

The obvious move from that result is to default them off. **Rejected**, and it is
an aesthetics decision, which in this project belongs to the owner: shadows are
most of what makes the case read as furniture rather than as coloured boxes, and
a shelf without them is not the shelf. `smoke:render` shows the difference —
distinct colours 1305 → 1202 at identical 25.5% coverage — and it is visible.

So the question is not *whether* to have shadows but *which cheaper form of them*
a phone can hold, and nothing about that is answered yet.

Note also what a device check would cost: "mobile" is not detectable in any way
that stays true, and shipping shadows-off-for-phones would create a rule about
visitors that nothing in this repo could check — the same shape as the Cloudflare
zone setting that no gate can see. Whatever survives should be the default for
everyone.

### The shadows were optimised instead, and the pass is now free

Three changes, every one a strict improvement on every device:

**1. The shadow map is drawn once, not sixty times a second.** Nothing in this
scene moves. Books are placed at mount and stay there, the light never moves, and
a directional light's shadow map is a function of the light and the geometry —
*not* of the camera, which is the only thing that does move. So the renderer was
running a full extra pass every frame to compute an image identical to the last
one. `shadowMap.autoUpdate = false` with a single `needsUpdate` ends that.

Measured on the 49-book fixture, in steady state:

| | textures | draws |
| --- | --- | --- |
| shadows on | 50 | **302** |
| shadows off | 48 | **302** |

The frame costs the same either way. The two extra textures are the shadow target,
allocated once, which is the point.

**2. One caster per book instead of four.** 49 books were contributing ~196
shadow draws to describe 49 silhouettes. A book is solid: its shadow is its
outline, and the boards and spine strip add nothing to that outline the page
block does not already give. The block is inset by the binder's square, so the
silhouette is ~3mm small on a 230mm book — under half a texel here.

**3. The shadow camera is fitted to the case, which it never was.** A
`DirectionalLight` aims at the origin through a fixed ±5 orthographic box; the
case stands *on* the origin and grows upward, so a five-row unit at 5.6 tall was
half outside its own shadow frustum and the top of a tall shelf fell out of it
entirely. Aiming at the middle of the case and sizing the box to a bounding
sphere fixes that and pays twice: the same 2048² map now covers ~7 units instead
of 10, so every texel does about twice the work. `smoke:render` reports distinct
colours 1305 → **1318** — slightly *more* detail than before, not less.

**Whether that is enough for the phone is still an empirical question.** The pass
cost is gone; the depth target is still allocated and still sampled per fragment
by PCFSoft. If the driver's problem was either of those, this will not have
fixed it — so the probes stay, and `?casters=0` still discriminates.

### Every real-time configuration crashes; the shadows are painted instead

The probes came back exhausted. On the Pixel 10 Pro, with 31 books:

| configuration | result |
| --- | --- |
| `shadows=off` | **118 s, clean exit** |
| `shadows=soft@2048` | dead |
| `shadows=basic@2048` | dead |
| `shadows=basic@512` | dead |
| `shadows=soft@2048&casters=0` | dead at 44 s |

Soft filtering and basic, 2048 and 512, and with the casters removed so nothing
was drawn into the map at all. **Only the absence of a depth target survives.**

Every one of those runs renders the identical frame: 195 draws, 1,720 triangles,
7–10 MB of heap on a phone with 8 GB. That is not a load, and this was never a
memory problem — the *first* bug was (314 MB of covers, real and worth fixing),
and carrying that frame into a second unrelated failure cost most of a day. What
this looks like is a driver fault: the GPU is Imagination's PowerVR D-Series,
which the Tensor G5 took up in place of ARM Mali, so both the silicon and its
driver are months old and almost no WebGL content has run on them.

**Nothing here can fix that. Not depending on it can.**

Three's shadows are *shadow mapping*: render the scene from the light into a
depth texture, then have every fragment sample it. That is a technique for scenes
that change — and nothing on this shelf does. Books are placed once, the light
never moves, and a shadow does not depend on the camera, which is the only thing
that does. The scene was paying a fully dynamic solution for a completely static
problem, which would have been worth fixing on a machine that never crashed.

So `packages/site/src/shelf/contact-shadow.ts` computes the shading once, from
the same layout the books were placed with, and draws it into a canvas: a soft
body and a tighter root under each book, plus the ambient darkening in the corner
where a shelf meets its backboard. One textured plane per shelf, no shadow pass,
no depth target, no per-fragment lookup. `?shadows=1` still enables the
real-time path for comparison on hardware that can hold it.

It also does something the real-time version never did: **every shelf gets the
corner darkening, including empty ones**, so the bottom of a growing case no
longer reads as a different piece of furniture from the top.

`ctx.filter` is what makes the contact shadows soft — it is feature-checked by
writing and reading back, because where it is missing the same code would paint
hard black rectangles under every book, which is worse than no cast shadow at
all. There, the corner darkening remains and the books' own shadows are skipped.

### The case shades itself, and the books were never the point

The owner walked through a `?shadows=1` screenshot naming four things the painted
version was missing, beginning with *"the shelf itself casts a shadow on top of
all books"*. It does not, and neither does anything else: every book on the shelf
stands its front within 2cm of the case's front plane, so a ray leaving a cover
escapes into the room almost immediately and is blocked by nothing.

**What is dark is the wall behind them.** The backboard is the full depth of the
case back, so a ray leaving it has to cross all of that before it gets out, and
mostly does not — on a five-row case the plank's shadow falls about three
quarters of the way down the backboard, which is why only a strip along the
bottom of each shelf stays lit. Read as a picture, that is a dark band across the
top of every shelf, and it is what a viewer attributes to the books.

Three painters, all one plane per *row* rather than per book:

| | what it is |
| --- | --- |
| backboard shade | the plank above and the right-hand upright, cast on the back wall |
| recess shade | the corner light does not reach: under each plank, and at both uprights |
| upright wedge | the right upright's real shadow across the plank — widest at the back, nothing at the front edge |

The two cast shadows are **derived from the key light's actual position** rather
than tuned, so moving the light cannot leave them describing where it used to be.
The recess is deliberately not: a cast shadow from an upright would fall on one
side only and would barely touch a book, while the corner is dark on both sides
whatever the light does.

Strengths were set by **differencing against the real thing**, not by eye —
`?shadows=1` still renders Three's shadow map, so the two can be photographed at
the same camera and subtracted. The first pass came back measurably darker than
the shadows it was imitating. Cost: +10 draws, +10 textures, +20 triangles at 31
books, and `smoke:render` distinct colours **1165 → 1285** — more tonal detail,
not less.

Found on the way, by the owner: **a face-out book's footprint was the size of its
cover.** Turned a quarter turn, such a book puts `coverWidth × thickness` on the
plank, but both dimensions were taken from the cover — so a shadow the size of
the whole cover lay flat on the wood, reaching most of the way to the front edge
of the shelf. A dark smudge standing in front of a book, thrown by a light that
is in front of it.

The honest limits: books still do not shade each other beyond the band a shelved
book throws down one side of a face-out cover, and that band is straight where
the real one is *shaped* — the occluder is a taller neighbour, so its top corner
throws a diagonal. Reproducing that needs each book to know how tall the one
beside it is.

### Why the real-time path cannot be rescued here: the shader will not link

Remote debugging from the Pixel 10 Pro, with unminified dev sources, finally said
what six configurations of the bisect could not:

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
Material Type: MeshBasicMaterial
Program Info Log:                          ← empty, and so are both shader logs
WebGL: INVALID_OPERATION: useProgram: program not valid   ← then every frame
[.WebGL-0x…] GL_CONTEXT_LOST_KHR
```

A program **fails to link**, and the driver will not say why. Three then calls
`useProgram` on it sixty times a second until the context dies. That is the
mechanism, and it explains what the sizes and filters could not: `soft@2048`,
`basic@2048`, `basic@512` and `casters=0` all died alike because **none of them
change whether a program links**. It was never a budget.

Two details worth keeping:

- The failing material is a `MeshBasicMaterial` — a painted shadow plane, which
  is unlit and wants nothing to do with shadows. Turning `shadowMap.enabled` on
  recompiles *every* material in the scene, and three's `meshbasic` shader
  includes no shadow chunk in either stage, so the only difference in that
  program is two inert `#define`s. It compiles clean and will not link.
- **`VALIDATE_STATUS false` in that message means nothing.** Three prints
  `getProgramParameter(program, VALIDATE_STATUS)` without ever having called
  `gl.validateProgram`, and the initial value of that parameter is `false`. It
  reads like a second finding and is not one.

`?shadows=1` keeps the real-time path for hardware that can hold it. On this
device the answer is definitive and negative.

### Two instruments, so the next attempt is not another guess

The reason nothing had ever been readable is that **the instrument died with the
page it was measuring**. Three notices the failed link, logs it, and carries on
calling `useProgram` on the invalid program every frame; the driver refuses every
frame; the context is gone in a second or two. So:

**The shelf stops.** `renderer.debug.onShaderError` halts the render loop on the
first failure and shows a sentence. One bad frame is enough to know; sixty a
second only destroys the evidence. Observed in both directions by forcing
`LINK_STATUS` false in the browser — with the failure, `requestAnimationFrame` is
scheduled once and stays at one; without it, 1119 → 1600 over two seconds.

**And it asks the driver properly.** The handler calls `gl.validateProgram` —
which three never does — then reads the validate log, both shader logs, `getError`,
and the limits that usually explain a program that compiles but will not link:

```
SHADER WOULD NOT LINK — drawing stopped
  link log:  (silent)
  validate:  ok
  vertex:    (silent)
  fragment:  (silent)
  varying:   30
  uniforms:  vtx 4095 frag 1024
  samplers:  frag 16 vtx 16 all 32
```

It lands in the black box beside everything else, so it survives the session and
can be read off a phone with no cable.

**`?painted=0` is the discriminating probe.** It leaves out every painted shadow,
which is the only place a `MeshBasicMaterial` appears in this scene — the program
count drops 3 → 2 and the material that will not link is simply not there. So
`?painted=0&shadows=1` renders real shadows in a scene with no basic material at
all:

| | meaning |
| --- | --- |
| it runs | the fault is specific to those programs, and there is something to change |
| it still fails | the lit materials fail too, and there is not |

It also makes `?shadows=1` a *clean* reference for the first time. The two
shadow systems are independent, so asking for real shadows has always drawn them
on top of the painted ones and double-darkened everything the two agree about —
which is a thing to know when reading any earlier screenshot taken that way.

### Closed: nothing that reads a shadow map survives on this device

The full bisect, with the last three rows added by the instruments above:

| configuration | result |
| --- | --- |
| `shadows=0` | **118 s, clean exit** |
| `shadows=soft@2048` / `basic@2048` / `basic@512` | dead |
| `shadows=1&casters=0` | dead at 44 s |
| `shadows=1&books=0&painted=0` | dead — an **empty case** |
| `shadows=1&shadowfetch=0` | **survives** |
| `shadows=1&shadowtype=vsm` | dead |

Read together those last three settle it. An empty case dies, so nothing about
the library, the covers or the painted shading is involved. `shadowfetch=0`
survives with the whole 32 MB render target still allocated and the map still
drawn, so neither the allocation nor the one-shot pass is the problem. And VSM
dies, which was the last hope: it is the only path in three that reads the map
with a plain `sampler2D` instead of the `sampler2DShadow` hardware comparison
the other three share, so the fault is not the comparison sampler either.

What every dying configuration has and the surviving one does not is simply
**materials that read the shadow map at all**. Stated honestly, `shadowfetch=0`
does not separate *sampling* from *binding* — turning `shadowMap.enabled` off
also stops three uploading the shadow uniforms and binding those textures each
frame — and nothing available here can separate them. It does not matter: the
conclusion is the same either way.

**So the painted shading is not a workaround. It is the only design that was
ever going to work on this hardware**, and the case for it never depended on the
crash — a scene where nothing moves should not have been shadow-mapping in the
first place. `?shadows=1` stays for hardware that can hold it; on the Pixel 10
Pro the answer is definitive and negative, and the investigation is closed.

**Nobody has published this exact symptom** — searched, and there is no report of
a Pixel 10, a Tensor G5 or a PowerVR D-Series losing a WebGL context on a shadow
map. What *is* published is the reputation: the Pixel 10 shipped with Imagination
driver **v24.3** while **v25.1** already existed, its GPU sat at its 396 MHz idle
clock under load against a rated 1 GHz, games showed flickering textures and
screen tearing, and Google acknowledged it and began shipping driver fixes in
monthly patches without committing to v25.1. Depth-texture sampling bugs are also
a recurring class rather than a freak event — Firefox carried one that reproduced
on NVIDIA under macOS and on nothing else, and AMD has had `sampler2DShadow`
shadow mapping broken in a shipped driver.

The practical consequence: **this may simply come right with a system update**,
and `?shadows=1` is kept partly so it can be re-tested after one. Nothing in this
repo can detect it, so it needs a person and a phone — the same thing that found
it.

### Superseded: which *part* of the shadow pass costs

Three candidates, undistinguished: the depth target's **size**, PCFSoft's
**filtering**, or simply having a second **pass** at all — the shelf has ~190
shadow-casting parts at 31 books, so the pass roughly doubles the draw calls.

```
?shadows=1&casters=0                         ← run this one first
?shadows=1&shadowmap=1024&shadowtype=pcf
?shadows=1&shadowmap=512&shadowtype=basic
```

**`casters=0` is the only one that discriminates.** The other two make the shadow
work smaller, so surviving either says just "less was cheaper" and leaves you
guessing at which axis. `casters=0` keeps the depth target allocated and the pass
running, over an empty scene: if the shelf lives, the cost is *drawing the
casters*, and thinning them — the page block is sealed inside the case and cannot
cast anything visible — fixes it with the shadows intact. If it still dies, the
cost is the target or the shader sampling it, no amount of thinning will help,
and the answer is baked contact shadows: the scene is static, so that shading can
be painted into the wood rather than computed every frame. That keeps the look on
every device and costs nothing at runtime.

Do not build either fix until the probes have answered.

## Notes to the next session

All five phases are green and tagged. The tool runs against the owner's real
vault, not only fixtures.

If you pick this up:

- Run `pnpm test && pnpm build && pnpm smoke:render && pnpm gate:public` first.
  Those four are the contract; if they are green the project is where this file
  says it is.
- **Both gates stage their own fixture vault into `packages/site/public/`.**
  Running them while `pnpm dev:watch` is up swaps the live site to fixture data
  until the next vault edit. Rebuild with
  `pnpm stacks build --public --assets packages/site/public`.
- **Verify covers by eye, not by counting.** Sixteen were swapped for print
  editions once; eleven were right and five were wrong — three were a
  placeholder graphic and two were a different book — and nothing in the counts
  distinguished them. A contact sheet did.
- Configuration lives in `.env` (gitignored): `STACKS_VAULT`, and
  `GOOGLE_BOOKS_API_KEY` without which Google Books 429s on a shared quota.
- Still open: whether the print and audiobook editions of one title should
  collapse into a single spine. They currently render as two.
- Everything in `fixtures/` is invented. No copyrighted material, ever — see
  `plan.md` §1.
