# Progress

**Read this first.** It is the only file that says where the project actually is.

This is an **index, not a narrative**. One line per event, newest phase last.
Gists and links — never restate the plan. If you find yourself explaining *what*
a phase does here, it belongs in [`plan.md`](./plan.md) instead.

Update it in the **same commit** as the gate it describes.

**No live counts in Current state.** A book count is wrong again the next time
anyone runs `stacks add`, and a stale number in the one file that claims to say
where the project is costs more than it tells you. Name the command that answers
instead. Counts *inside* a dated record — what an import added, how many books a
phone was rendering when it died — are measurements and stay exactly as they are.

---

## Current state

| | |
| --- | --- |
| **Last green gate** | G27 — a command's report accounts for every book it counted |
| **Now working on** | books that read as books — map [#50](https://github.com/mephistopheles4/stacks/issues/50), whose fifteen tickets are all closed and **all built**. See below |
| **Queued** | the map's fog, which is the only current answer — ask [#50](https://github.com/mephistopheles4/stacks/issues/50)'s *Not yet specified*. [#62](https://github.com/mephistopheles4/stacks/issues/62) separately left the owner three `stacks enrich` commands to run against the real vault |
| **Decisions** | [`docs/adr/`](./adr/) — extracted from the old Decision Log, one file each |
| **Repository** | [public](https://github.com/mephistopheles4/stacks); `main` protected — PR + `gates`, no bypass |
| **Blocked on** | nothing |
| **Mobile crash** | closed. Two separate bugs: 314 MB of texture (G15), then a driver that cannot sample a shadow map. The shelf paints its shadows now |
| **Deployed** | https://stacks.aymandiab.com — Cloudflare Pages, `pnpm deploy:site` |
| **Running against** | the owner's real vault, not fixtures — `pnpm stacks status` for the count |

## Gate log

| Phase | Gate | Status | Commit |
| --- | --- | --- | --- |
| 0 — scaffold | `stacks --help` lists commands · empty shelf renders · fixtures committed | ✅ green | tag `phase-0` |
| 1 — data layer | `stacks build` → valid `library.json` · malformed skipped · 4 test cases | ✅ green | tag `phase-1` |
| 2 — shelf | `pnpm smoke:render` → non-blank `artifacts/shelf.png` · 50 books · click opens card | ✅ green | tag `phase-2` |
| 3 — public build | `--public` output has zero canary hits · share card reaches `dist/` | ✅ green | tag `phase-3` |
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
so it matches the real spine. See [`docs/adr/`](./adr/) for each.

### Phase 3 evidence

`pnpm gate:public` green: builds for real, then greps every text file that
shipped for the canary, for vault note paths, and for `sourcePath` — 0 hits. It
also fails if the canary is missing from the fixture vault, so it cannot pass
vacuously. OG image 24.8 KB at 1200x630. 71 tests pass.

Both gates were made to stage their own input: they previously fought over
`packages/site/public/library.json`, so whichever ran last decided what the
other tested. Verified passing back to back in either order.

Since G20 the rules live in `scripts/lib/public-build.ts`, and
`deploy:site` applies the same ones to the real build rather than its own weaker
copy. The script still owns planting the canary and building from the fixtures.

### Phase 4 evidence

`stacks import audible <export>` against a real Libation export: 22 records, 17
added, 5 correctly matched against books already shelved — two of them separated
only by a *long* subtitle, which needed a dedupe fix first. Re-running added 0
and skipped 22, so the import is idempotent. The vault now holds 25 books, every
one with cover art.

The source is Audible/Libation rather than the brief's Audiobookshelf; see
[ADR-0021](./adr/0021-audible-via-libation.md) for why. `importBooks` is source-agnostic — an ABS importer would
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
| **Zone bot protection can refuse the deploy check** | ⚠️ see below — the deploy still works, the *verification* does not |
| **The scripts echo the commands they run** | ℹ️ since G24 — `gate:public` gained two `$ pnpm …` lines, `pnpm worktree` one. Nothing asserts on that stdout; checked |
| Resolved versions | TS 7.0.2 · Vitest 4 · Astro 7.1.6 · three 0.185.1 · sharp 0.35 |

### The deploy check could not read the site

**2026-08-03.** `deploy:site` uploaded correctly and then could not confirm what
the site was serving, because the zone answered every automated request with a
Cloudflare challenge — `403`, `Cf-Mitigated: challenge`. Cleared by allowing
"definitely automated" traffic; the check reads the site again. The code that
came out of it is [ADR-0027](./adr/0027-deploy-check-reports-refusal.md), and it
is deliberately not specific to any of this.

Four things worth keeping, none of which are guessable from the symptom:

- **Images were exempt, so the loud part of the output stayed green.** A run
  makes one HTML request and thirty-odd cover requests; only the HTML one was
  challenged. `.json` was challenged too, `.png` and `.jpg` were not.
- **It failed in the vocabulary of its own false positive.** The refusal
  surfaced as "serving a build with no stamp", which reads exactly like the edge
  propagation delay the check is built to wait out — so it looked like something
  to ignore. That is why it went unnoticed, and why the fix was to make the
  check distinguish the two rather than to change any setting.
- **A DNS change the day before was the obvious suspect and was not the cause.**
  `stacks.aymandiab.com` resolves to the same edge addresses as the root domain
  rather than the Pages range, so it is proxied through the zone — which is what
  makes zone rules apply at all, and is the necessary condition. But that was
  already true: `deploy.ts` records that the zone overrides this build's
  `Cache-Control`, which only happens through a proxy, and this file records
  `X-Robots-Tag` being read off a live response, which a challenge would have
  prevented. A setting changed, not the routing.
- **Only the zone can date it.** Security → Events names the service that
  mitigated a given request, and the account Audit Log says who changed what and
  when. Nothing in this repository can see either — the same blind spot as the
  zone's cache TTL.

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
- ~~**No `.gitattributes`.**~~ Added — `* text=auto eol=lf`, with the fixture
  binaries marked so they are never diffed.

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

## Worktrees, and the deploy guard that follows from them

`pnpm worktree <branch>` makes a second checkout beside this one that actually
runs: sibling directory, `pnpm install`, and it names the `.env` it will read.

Two things are gitignored and therefore missing from a bare `git worktree add`.
`node_modules` fails loudly. `.env` fails as `no vault: pass --vault <path>`, on
a branch where nothing is wrong, which is a confusing thing to be told.

**There is one `.env` and every checkout reads it — it is not copied.** A copy
drifts with nothing going red, and `STACKS_DEV_HOST=1` left behind in a stale
one keeps the shelf on the network long after anyone remembers enabling it. The
mechanism is `git rev-parse --git-common-dir`, the single `.git` all linked
worktrees share; it answers *relative* in the main checkout and absolute in a
worktree, which is the one thing about it that has to be got right, and
`packages/cli/src/env.test.ts` pins all three positions against a real detached
worktree. Editing that file changes every worktree at once. That is the point,
and a surprise if you assumed otherwise.

Two things had to change to survive a second checkout:

- **`smoke:render` asks the OS for a port** instead of insisting on 4331. The
  bad failure was never `EADDRINUSE` — it was another checkout's server still
  up and serving *its* `dist/`, so the gate screenshots someone else's branch
  and reports the score as this one's. Two gates were then run concurrently, in
  two checkouts, and both came back 49 books / 1285 colours / 25.3%.
- **`deploy:site` refuses any branch but `main`** — G17. Four checkouts sharing
  one `.env` all hold `SITE_URL`, so the publish command looks identical from
  every one of them. `--any-branch` overrides deliberately; `--dry-run` and
  `--check-only` are exempt because neither uploads.

Not shared between worktrees, deliberately: `.cache/` (API responses — each
checkout refetches, and no test path touches it, since tests inject a
fixture-backed `HttpGet` that throws on an unmapped URL) and `artifacts/`
(regenerable, and you want each branch's screenshot separate).

## A test had been calling the internet for months — G21

`packages/core/src/enrich.test.ts` downloaded a real cover from
`covers.openlibrary.org` on every run. It surfaced as an intermittent CI timeout
on `suite (node 22)` — 1290ms locally against 5ms for its six siblings, at a
quarter of vitest's 5s cap, and a loaded 2-core runner needs only a ~4x
slowdown to blow that. The leading theory was sharp's native binding load; it
was wrong, and cheaply so — that import costs ~290ms and vitest charges it to
`import`, not to whichever test runs first.

The seam: the metadata layer takes an injected `HttpGet` so lookups stay off the
network, but `covers/cache-cover.ts`'s `download` reaches for the global
`fetch`, so the injection stops short of the bytes. The fixture response carries
an ISBN and no `cover_i`, so the adapter guesses a `covers.openlibrary.org` URL
and that URL was really being fetched. Fixed by stubbing `fetch` in that file:
1448ms → 62ms, with the cover path still exercised rather than quietly dropped.

**The belief that this could not happen was written down in three places**, and
this file was one of them — the note under worktrees explains that `.cache/` is
safe to keep per-checkout *because* tests inject a fixture-backed `HttpGet`. The
claim is true; the reasoning is the incomplete model that let this through, and
it is left standing above as the record of what everyone thought. The other two
are `CLAUDE.md`'s Phase 1 gate and `covers/download.test.ts`'s opening comment.

G21 makes it mechanical. Two findings worth carrying, both in
[`gates.md`](./gates.md) in full: a guard that only *throws* is swallowed by
`download`'s deliberate `catch { return undefined }` and reports **7 passed**,
so the gate records attempts and asserts in an `afterEach` instead; and the
gate's own spec was vacuous until the installation was split into its own file,
because the spec installed the guard merely by importing it.

## Cover acquisition — G22

Three commands each rebuilt the same four steps around `cacheCover`
([#26](https://github.com/mephistopheles4/stacks/issues/26)). The issue proposed
a new `acquireCover` module; what shipped is smaller, because reading the three
copies did not support the premise.

**They had not drifted.** `add-book.ts` and `enrich.ts` held byte-identical
candidate expressions, and the importer's differs because it does something
different — it runs a `lookup` to find a print cover and prepends it. Two
orderings, not three, and the third is not a copy. What *had* diverged was the
write path, and the cause is not cover logic: `writeBook` takes a `BookInput` in
the domain vocabulary (`coverSource`), `updateBook` takes `FrontmatterChanges` in
the file vocabulary (`cover_source`), and `enrich` is the only caller that has to
cross that boundary. That is what produced the third assembly.

So: `cacheCover` now takes `readonly (string | undefined)[]` and does its own
filtering, which deletes the duplicated guard at all three sites; `coverUrls()`
in `metadata/types.ts` states *large before small* once; and
`covers/cover-keys.ts` shapes a `CachedCover` into its three keys for the two
callers that build a `BookInput`. **`enrich` stays hand-written**, deliberately —
its "never overwrite a hand-set spine colour" guard and its `filled` reporting
are its own, and a shaper flexible enough to serve them would assert less than
one that only serves creation. Two of three is the honest outcome.

`--dry-run` keeps its own "was a URL on offer" check for the same reason: that is
the difference between reporting a cover it *would* have fetched and one it never
could, and it is the command's reporting concern, not the downloader's.

G22 is structural because the failure it guards is silent — see
[`gates.md`](./gates.md). `pnpm test` went 308 → 323: two new spec files, no
existing one changed.

**Still open**

- **One helper, six copies, three names.** `add-book`, `import/audible`,
  `metadata/google-books` and `metadata/open-library` call it `maybe`;
  `frontmatter` calls it `optional`; `library` calls it `pick`. Identical
  bodies. A bigger and more G10-shaped duplication than the one above — and
  grepping for `maybe` finds four of the six, which is how it stayed six.

  It is **not** dead weight written for `exactOptionalPropertyTypes`, which is
  not enabled: omitting a key and setting it to `undefined` differ for
  `Object.keys`, `in`, and spreading, and `frontmatter.ts` documents that as the
  reason. So this is a consolidation, not a deletion, and it carries an
  exception that has to be stated rather than discovered: `undefined` in a
  `FrontmatterChanges` *removes* the key, so near `updateBook` the distinction
  is load-bearing in the opposite direction.

  Filed as [#29](https://github.com/mephistopheles4/stacks/issues/29). Not among
  the six candidates of the architecture review that produced #26 — and the
  three names are why: any search anchored on one of them finds a subset and
  reads as too small to be worth a candidate. Which is also how it reached six.

## One helper, six copies, three names — G23

`keyIfPresent` existed six times with byte-identical bodies and three names:
`maybe` in four files, `optional` in `frontmatter.ts`, `pick` in `library.ts`
([#29](https://github.com/mephistopheles4/stacks/issues/29)). Consolidated into
`packages/core/src/key-if-present.ts`, 45 call sites, plus the three
`googleBooksKey` guards in the CLI — redundant twice over, since nothing tests
that key's presence and `withKey` already normalises both `undefined` and the
empty string. `pnpm test` went 323 → 339 — the 16 tests in the two new spec files. No existing spec changed.

**The three names are the finding, not the six copies.** Each author checked for
an existing helper, searched the one name they had in mind, found nothing, and
wrote it. Grepping `maybe` returns four of six, which reads like a small local
habit rather than a repo-wide rule with two aliases — and the architecture
review that produced six duplication candidates from this codebase missed this
one for exactly that reason. So G23 matches on what the body *returns*, never on
what the function is called; see [`gates.md`](./gates.md), which also carries
the two mutations that came back green before the gate was right.

**The issue's stated hazard turned out to have no live instance**, and that is
worth recording rather than quietly dropping. `FrontmatterChanges` really does
invert the rule — near `updateBook`, `undefined` *removes* a key from a note in
the owner's vault — but no code is positioned to trip over it: all three
`updateBook` callers build changes from literals or guarded assignment, and none
of the seventeen inline conditional spreads is anywhere near one. `enrich.ts` cannot
express a removal at all, since its accumulator is typed
`Record<string, string | number>` and needs a cast to widen at the call. That
protection reads as accidental and is now deliberate at least in the record.
Gating it would have been a rule nothing could fail on, so it is stated in
`CONTEXT.md` under **Removal** and gated nowhere.

The seventeen inline spreads were left alone, as filed. They share the same text and
are not copies of anything — each is one decision at one call site — and the
`return` in G23's anchor separates them without needing an exempt list.

## Shelf placement got an interface — no gate

[#25](https://github.com/mephistopheles4/stacks/issues/25). `placeBooks` decided
where every book went and mutated the scene graph in the same loop, so the only
way to ask where a book had ended up was to render the shelf on a GPU. It is now
`placeShelf(rows) -> Placement[][]` in `packages/site/src/shelf/placement.ts`,
with `case.ts` holding the bookcase's dimensions and `buildBooks` doing the
Three.js half. [ADR-0029](./adr/0029-placement-imports-the-case.md) has the
design; `CONTEXT.md` gained **footprint**, **contact** and **run**.

**No row was added to [`gates.md`](./gates.md), on purpose.** There is no defect
here — the seventeen new tests are tests, not a scored rule. The tempting row is
"no placement breaches the case", and it was refused: that is arithmetic checking
arithmetic, written the same day by the same person, and scoring it invites
reading a green board as *books are inside the case*. G16 already claims that
rule and measures the rendered scene. The `hashUnit` duplication would have been
the other candidate; it was collapsed instead, and a row guarding against a
second FNV-1a nobody has written yet is an obligation for an unobserved failure.

The argument against all of that is **G21**, which was written for a rule two
files already claimed was true and both were false for months, with nothing red
because nobody looked. The distinction relied on: G21's rule was already broken
when its row was written, and this one becomes true by construction in the commit
that creates it. If that reads thin later, the hash row is ten lines.

**The screenshot cannot check a change like this, and that was measured.** Three
runs of *identical* code produce three different PNG hashes. Decoded to pixels,
runs either agree exactly or differ by 20–41 of 1,296,000, always at channel
delta 1 — driver antialiasing jitter, still there with the code reverted. So
`artifacts/shelf.png` has a noise floor of ~40 pixels and the lift's diff was 23.
Anything that actually moved a book moves thousands, by much more.

What *did* prove it: a throwaway probe dumping every book's real world transform
out of the rendered scene, before and after. Identical, with `caseOverflow`
agreeing to the last digit (`0.0012000000000000899`). Transcribing the old
arithmetic into a comparison function would only have compared the new code
against a fresh copy of the same misreading.

**Three of the seventeen tests were green under mutation on the first sweep**,
and each was a fixture that never reached the case it named:

- the clearance test asserted two books merely did not overlap — which stays true
  with the clearance deleted. It now names the amount.
- the "no gap at the start of a row" fixture repeated years on a four-cycle, and
  after the newest-first sort no row ever *began* on a year change. Unique
  descending years fix it, plus an assertion that the fixture still has the shape
  the test needs.
- a book you are reading gets its own year (`yearOf` returns `'reading'`), so a
  face-out book always arrives behind a year gap — which stands its neighbour
  straight and removes the angle change being tested. The fixture uses an
  explicit `face_out` inside one year now.

All seventeen were then observed red by mutating the line each covers.

**Settled since, as [#36](https://github.com/mephistopheles4/stacks/issues/36):
three live answers to "how wide is a shelf", and it turned out to be five.**
`case.ts` states `USABLE_WIDTH` and `toRows` packs into it; the cursor still runs
flush from `-SHELF.width / 2`, which is where that band begins; `leanThatFits` is
deleted. See [ADR-0031](adr/0031-one-usable-width.md) and G25.

The two answers nobody had filed were the larger ones. The packer charged
`footprint + 0.008` a book where the cursor spends `+ 0.002` shelved or `+ 0.016`
face-out — **0.162 across a twenty-seven book row**, as much as the entire
`padding * 2 + LEAN_ALLOWANCE` the issue was about. And `leanThatFits` counted
angle changes by `faceOut` transitions alone, blind to the upright book after a
year gap that the cursor pays clearance for — latent, because measured across a
120-book library it returned 0.72, 1.26, 1.12 and 1.00 radians against a
`MAX_LEAN` of 0.062. It had never once bound.

**The measurement is the part worth keeping.** A full row was leaving 0.374 of
bare wood at its right end, which decomposes as 0.17 of declared reserve, 0.162
of that charging error, ~0.10 of wrap granularity, less ~0.06 of clearance —
only the first of the four on purpose. Rows now hold 27–30 books against the ~30
`CLAUDE.md` says the case was built to, and G16 reports `case overflow 0.0012`
before and after, which is `SKIN` and not slop.

**Deleting `leanThatFits` moved its bug rather than removing it.** The packer is
now the only thing budgeting clearances, so its change count has to include
year-gap uprights or containment stops holding. That is `leansInPlace`, exported
from `placement.ts` and read by the packer instead of copied.

## The probes became a tuning panel — map [#39](https://github.com/mephistopheles4/stacks/issues/39)

Ten one-shot URL probes, built to bisect the crash above, are now controls you
move while looking at the shelf — plus every light, tone mapping and exposure,
bloom, the materials and the room. Charted as a wayfinder map with eight
tickets; all eight closed. Three of them were research and their answers are in
[`docs/research/`](./research/), which is new.

**The panel's entire contract is that a control must not lie**, which is this
file's oldest rule about instruments applied to a slider. Every row carries a
class dot — live, rebuild, reload — and the panel prints what `applySettings`
*reported* rather than what it asked for. Seven faults were caught by building
it that way, and not one by a test:

| | |
| --- | --- |
| the shadow toggle enabled the shadow map over a light whose `castShadow` was latched at mount | shelf looks identical, reported applied |
| `materialNeedsLights()` excludes `MeshBasicMaterial`, so a live toggle relinked only the *lit* materials | a **different program set than the equivalent reload** — it would have appeared to work on the Pixel while the shipped default still killed it |
| `toneMappingExposure` only exists inside `#ifdef TONE_MAPPING`, and `none` is the default | the slider moved, the picture did not |
| moving the light left the shadow frustum sized for where it used to be | a hard straight line across the wood, which reads as a rendering fault |
| *assigning* `scene.fog` rebuilds every program even to an identical value | every tick of every slider was a full recompile |
| a refusal was computed from the transition, so nudging any later slider cleared it | the URL asserted a configuration the shelf was not in |
| `renderer.info` resets inside every `render()`, and a composer renders several times | the panel read `draws 1  tris 1` on a shelf drawing 331 |

**The black box survived the change.** `profile` is a getter, not a string built
at mount, and it carries a **change sequence** — a crash after eight toggles
reads as a sequence and not as a final state. Storage key is `v2`. It follows
the live shelf through a rebuild rather than holding the disposed one, and it
records the query it died on, because the panel writes what you dial into the
URL and reloading would otherwise repeat the crash.

**The painted shadows follow the light** rather than being left describing where
it used to be ([ADR-0033](./adr/0033-painters-follow-the-light.md)) — repainted,
not remounted, because a rebuild re-pays ~24 MB of cover upload to redraw a
handful of 2D canvas fills. Measured **60 textures, flat across 500 repaints**;
a leak there would have climbed until the tab died, on a panel built to diagnose
exactly that.

**Bloom is in, ambient occlusion is refused**
([ADR-0034](./adr/0034-bloom-behind-a-composer.md)). The composer costs the
multisampling — `EffectComposer` never sets `samples` — so with bloom on the
context is made without MSAA, antialiasing moves to an SMAA pass, and `profile`
says `aa=smaa` rather than leaving `?aa` flipping an attribute no pixel reads.
AO samples a native `DepthTexture` as a plain `sampler2D`, which is what
`?shadowtype=vsm` did — the run that settled the investigation above by dying
anyway.

Measured at 1280×800 on an RTX 5090: bloom off 1281 distinct colours at 25.3%,
on 1214 at 25.4%, at strength 0.9 1329 at 28.8%, **240 fps throughout**. The drop
at defaults is SMAA against MSAA, not bloom.

`pnpm test` 392 → **421**. `smoke:render` unchanged at 49 books, 0.0012 case
overflow, 1285 distinct colours, 25.3% — the refactor moved no pixels, which is
the whole check on it. `debug-panel` splits into its own **8.8 KB** chunk whose
strings are absent from the main bundle, so an ordinary visitor downloads none
of it.

**No new gate row**, deliberately. The rule would be "every control has a real
effect", and the honest version is already structural: a control that does
nothing has to travel through `ApplyReport`, which has nowhere to put it except
a refusal the panel prints. A test asserting that is arithmetic checking
arithmetic written the same day by the same person — the `placeShelf` precedent.
If a control is ever found lying, that is the day the row is worth writing.

**`docs/plan.md`'s "wayfinder: not installed, not needed" is reversed**, and says
why. The reasoning was true of the four phases and stopped being true after
them. The entry above it, refusing `to-prd`/`to-issues`/`implement`, stands.

## The logo

The app has a mark: four bars in a 64-unit box, a full line, a broken one with a
dot past the break, a third line. Three colourways in
`packages/site/src/assets/`, a paper-tiled `favicon.svg`, two favicon PNGs and a
180x180 touch icon rasterised from those by `scripts/make-icons.ts`, a designed
1200x630 share card, and a header that is now the mark beside a lowercase mono
wordmark instead of a bare `<h1>Stacks</h1>`.

**All of it is committed, and the arguments for not committing it were both
wrong.** The first was that G13 tracks no binary outside a short allowlist, so
the icons should be built at site-build time and gitignored. But G13's allowlist
is a claim about *provenance* and its own comment says so — art drawn for this
app is the cleanest such claim the list holds, and the repo already commits two
other script-generated asset sets. "Generated" and "committed" were never
alternatives.

The second was the share card. `renderOgImage` drew one from `library.json`, on
the reasoning that a preview should be "the shape of a library" rather than a
fixed picture. That is a good argument for a thing nobody had designed yet; once
there was a real card it stopped being one. **`og-image.ts` is deleted and
`publish()` no longer writes `og.png`** — it stages into
`packages/site/public/`, where the committed card now lives, so a build that
still rendered one would overwrite the art every time, silently, since both are
a 1200x630 PNG at the same path.

G13 names the four brand files one at a time and **never by directory**, because
the directory is the folder a real vault's covers get staged into. It checks
both directions: an unlisted binary appearing beside them goes red, and so does
an allowlisted file that stops being tracked. G5 pins `og.png` from the other
side, asserting it is *not* gitignored while everything else `publish()` stages
is — the two decisions have to move together or the card quietly becomes build
output again.

**The README's hero image had to be regenerated by hand, and nothing would have
said so.** `docs/images/shelf.png` is a committed crop of what `smoke:render`
produces, and the header is *in* that crop — so a change to the header silently
stales the front page of the repo. The render gate passing is not evidence the
image is current: the gate writes `artifacts/`, which is gitignored, and
`scripts/make-readme-image.ts` is the hand-run step that moves it. Regenerate
with:

```
pnpm smoke:render && pnpm tsx scripts/make-readme-image.ts
```

**No webfont.** The brand sheet says IBM Plex Mono 500 and the page asks for it,
then takes whatever monospace the machine has. One request and ~30 KB for six
letters, on a page whose first paint is a WebGL scene, is a poor trade. The
`theme-color` is the page's own `#1a1613` rather than the palette's paper, which
above a near-black room reads as a rendering fault.

**The header lockup is arithmetic, and was not until a review said so.** The
sheet asks for the mark at the wordmark's cap height with one bar height of
clear space; the first version had `--mark-size: 1.55em` chosen by eye against a
screenshot, which is **39% oversized** — 0.97em of ink against ~0.70em of caps.
Both numbers now derive from two custom properties, and both have to subtract
the artwork's own padding: the bars fill 40 of the box's 64 units and start 7 in
from each side, so the box is not the mark and the SVG's own margin already
counts as clear space. Adding a full bar beside it set the wordmark 18 units
away rather than 11.

Measured in the browser rather than trusted: **25.2px of ink against 25.00px of
cap height** at a 36px wordmark, and one bar (6.93px) to both the wordmark and
the caption below. The multiplier is fixed at 1.12, so a machine without IBM
Plex Mono drifts by whatever its fallback's cap height differs by — CSS cannot
read font metrics, and that is the accepted limit of doing this without a
webfont.

**The same rationale written in five places went stale in one of them within
the hour.** `packages/site/src/assets/README.md` carried its own copy of the G13
provenance argument, a link to the deleted ADR, and a paragraph describing
`og-image.ts` — all three written before the two reversals above and none
updated by them. It now points at the assertion instead of restating it, which
is [ADR-0026](./adr/0026-constitution-is-gated-not-duplicated.md)'s rule applied
to a README. `docs/gates.md`'s G13 row said "three named icons" against a
four-entry list for the same reason.

**No ADR.** One was written for the icons and deleted with them: once branding
is simply committed there is no trade-off left to record, and what remains
non-obvious — why filenames and not a directory, why `publish()` stops writing
`og.png`, why density rather than resize when rasterising an SVG — lives beside
the code it governs, in the gate, in `publish.ts` and in `make-icons.ts`.

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
  There is exactly one, in the main checkout, and every worktree reads it.
- Still open: whether the print and audiobook editions of one title should
  collapse into a single spine. They currently render as two.
- Everything in `fixtures/` is invented. No copyrighted material, ever — see
  `plan.md` §1.

## 2026-08-06 — the lookup was refusing books the providers were holding

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

## 2026-08-06 — the same command was also reporting on fewer books than it counted

[#67](https://github.com/mephistopheles4/stacks/issues/67), found while
re-resolving [#62](https://github.com/mephistopheles4/stacks/issues/62) on the
fixed lookup. G27 is the gate.

`stacks enrich --dry-run` printed `33 book(s) considered, 6 with gaps`, then five
lines, then `would fill 3 book(s), 2 left alone`. **Five books accounted for out
of six.** The sixth — `The Infinity Machine`, an `isbn` gap with nothing anywhere
to fill it — produced no line and entered no total.

**The cause is one overloaded outcome.** `enrichBook` returned `complete` both
when a book had *no gaps* and when it had gaps it could not fill. The first is
genuinely nothing to say; the second is not. `case 'complete': break;` could only
treat them alike, and a `break` that reported neither looked exactly like one
that reported both.

Split into `complete` and `unfilled`, and the report lifted out of the command's
action callback into `packages/cli/src/enrich-report.ts`, where something can
call it. **The arithmetic is now held by shape rather than by care**:
`reportEntry` returns a book's printed line *and* the total it belongs to
together, so there is no way to write one without the other, and the compiler
refuses a kind that is missed. Two paths reach `unfilled` — a lookup that offered
nothing, and a `spine_color` gap whose cover is not on disk — and they share a
kind deliberately, because the printed line must not claim a provider was asked
when none was.

**Why this one is worth a gate.** It had already changed an answer: #62's first
resolution read *"7 with gaps, would fill 1, 5 left alone"* off this output and
concluded a seventh book had fallen through the lookup. Nothing had. G26 and G27
came out of the same investigation and are opposite failures — a tool that
returned the wrong answer, and a tool that returned a *true* answer about a
smaller set than it claimed. The second is harder to notice, because every line
it prints is correct.

**Observed red** by folding `unfilled` back into `complete`: two of the gate's
five fixture books turn "nothing was missing", and the assertion names why.

## Books that read as books — map [#50](https://github.com/mephistopheles4/stacks/issues/50) built

Fifteen closed tickets, implemented as seven commits. The map is plan-only by its
own rule; this is the ordinary phase work that followed it. Every ticket stated a
per-book texture and draw-call cost, so **`smoke:render` now reports what the
renderer is holding** — the one gate that draws 49 books could not see any of
those numbers, so a slice costing more than its ticket claimed came back green.
Reported and not asserted: #53's budget is an estimate, the counts move with the
fixture, and a gate that reddens on a number nobody can interpret trains people
to raise the number.

| | what shipped | measured | its ticket said |
| --- | --- | --- | --- |
| [#57](https://github.com/mephistopheles4/stacks/issues/57) | binding: hashed, `binding:` overrides; board + square + height band | +0 draws, +0 bytes | +0, +0 |
| [#65](https://github.com/mephistopheles4/stacks/issues/65) | `materials.spineProfile` `{ rise, roll }` per binding | **+2** textures shelf-wide, +0 draws, +0 tris | +2 shared, +0, +0 |
| [#56](https://github.com/mephistopheles4/stacks/issues/56)/[#66](https://github.com/mephistopheles4/stacks/issues/66) | head cap, `1 × 10`, `CAP` 0.16, hardbacks only | **+20** draws over 49 books (+0.41 each) | +20, +0.41 |
| [#54](https://github.com/mephistopheles4/stacks/issues/54) | one 2048×8 striation map + per-book jitter | **+1** texture shelf-wide, +0 draws | one shared, +0 |
| [#58](https://github.com/mephistopheles4/stacks/issues/58)/[#68](https://github.com/mephistopheles4/stacks/issues/68) | binding roughness *constants*; aspect-correct canvas | **+8** textures (the newly typed books) | 41 → 49 typed |
| [#60](https://github.com/mephistopheles4/stacks/issues/60) | three length bands, subtitle-driven layout | every counter unchanged | costs nothing |
| [#62](https://github.com/mephistopheles4/stacks/issues/62) | hashed thickness for a book with no page count | unchanged on fixtures | free |

`pnpm test` **421 → 475**. `smoke:render`: 49 books, case overflow **0.0012**
before and after — unchanged through all seven — distinct colours 1285 → **1493**
at 25.3% non-background. All four gates green.

**Two predictions were wrong and both are recorded where they were made.**
`USE_NORMALMAP` splits the spine materials into their own program variants —
programs 3 → 5, a cost no ticket named, and the number the Pixel 10 investigation
turned on. I then predicted retiring `MIN_LEGIBLE_THICKNESS` would fold one back
and it did not.

**Two latent defects came out of implementing decided work.**

- **#54's striation profile did not tile.** Gathering 14 drew different noise
  from gathering 0, so the height field stepped by 0.025 at `u = 1` and the
  wrapping central difference reported a ~25 slope across a smooth surface. That
  reaches past one texel, because the encoding scale normalises the whole map
  against its steepest slope — a spike at the seam quietly compresses every real
  leaf. It had not, because the leaves reach ~155; it would have sprung the moment
  anyone lowered `LEAVES_PER_GATHERING`, which its own comment invites.
- **The binding hash had to be salted.** Sharing `hashUnit(id)` with `heightFor`
  would make every paperback exactly the shorter 60% of the shelf — and since
  binding then *biases* the height band, the two compound into a monotonic
  silhouette that every other test passes. Observed red without the salt.

⚠️ **One decided number does not reach the outcome it was sold on, and it is left
as decided rather than changed on the way past.** #58's spine canvas clamp is
`32..128`, and `128` is a claim about how many pixels type *needs* while aspect is
what the function is for. A book wants `1024 × thickness / height` texels — **111
to 252** on the owner's library — so everything past 128 saturates:

| | fixed 128 | clamped 32..128 |
| --- | --- | --- |
| the owner's 27 typed books | 0.87×–1.97× | **1.00×–1.97×** |
| the 50-book fixture | 0.46×–1.64× | **1.00×–1.64×** |

The squeeze is gone completely and the worst stretch is untouched. Raising
`SPINE_CANVAS_MAX` to 256 covers the real top aspect of 0.246 and makes the whole
range exact, at up to double the canvas on the thickest books — which are also
the ones with the most spine on screen. Bytes against letterforms, so it is the
owner's call: one named constant, and a test that goes red when it moves.

**No new gate row**, on the `placeShelf` precedent. Every cost claim these
tickets make is now *reported by `smoke:render`* rather than asserted, which is
the honest shape for a number that legitimately moves; and the two rules worth
pinning — that the striation profile is periodic, and that binding and height
draw off independent hashes — are unit tests over pure functions, both observed
red. A scoreboard row implies a rule that can go red for a reason a reader can
act on, and "textures went up by three" is not that.

**Aesthetics are the owner's, and there are three images to look at.**
`artifacts/shelf.png` is the full shelf, which is #60's acceptance framing — the
question it asks is whether the range reads as one publisher's imprint or as
noise. `artifacts/shelf-close.png` and `artifacts/shelf-head.png` are near
renders, because the cap, the profile and the striation are all approach effects
and #54 established that share-of-screen cannot judge them. All three are
fixture, and per the map's caveat that is the right test here: none of these is a
question about the real books' *colours*.
