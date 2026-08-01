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

**So shadows default to off**, and `?shadows=1` turns them back on.

Off *everywhere*, not off on phones. A device check would be the obvious move and
is the wrong one here: "mobile" is not detectable in any way that stays true, and
the result would be a rule about visitors that nothing in this repo could
possibly check — the same shape as the zone setting that no gate can see. If a
cheaper shadow survives on the phone, it becomes the default for everyone.

The aesthetic cost is real but small: the case reads slightly flatter, the books
are less grounded on the plank. `pnpm smoke:render` shows the difference and
still passes — 49 books, coverage identical at 25.5%, distinct colours 1305 →
1202.

### Still open: which *part* of the shadow pass

Nobody has distinguished the depth target's *size*, the expense of PCFSoft
*filtering*, or simply having a second *pass* at all — and the shelf has ~190
shadow-casting parts at 31 books, so the pass roughly doubles the draw calls.
Two more probes exist for it:

```
?shadows=1&shadowmap=1024&shadowtype=pcf     halve the target, cheapest filter
?shadows=1&shadowmap=512&shadowtype=basic    smaller again, no filtering
```

If either holds for a few minutes on the phone, shadows come back at that
setting. If neither does, the pass itself is the cost on this GPU and the honest
substitute is baked contact shadows — the scene is static, so the shading under
each book could be painted rather than computed. Do not build that until the
probes have answered.

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
