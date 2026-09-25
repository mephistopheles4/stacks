# Only the bookcase reads the shadow map

**2026-09-24** — `?shadows=1` on the Pixel 10 Pro XL, measured over three
rounds with shader hooks injected into the live site, and the site-side change
that came out of it. The decision is
[ADR-0088](../adr/0088-one-program-samples-the-shadow-map-in-two-draws.md); the
change before this one, which joined the woodwork, is
[the woodwork is one mesh](./2026-09-24-the-woodwork-is-one-mesh.md).

## The answer first

- **One sampling program survives; four and five die.** With only the bookcase's
  program reading the map, the live site ran 120 s three times, 300 s once and
  120 s under orbiting, with no loss. With the four book programs reading it and
  the bookcase not, it died at frame 8, twice.
- **`receiveShadow = false` is not the fix.** Sending the uniform as `0` in every
  program died at frames 8 and 9, like the unmodified page. The sampler has to
  be absent from the program.
- **It counts draws, not time.** Throttled to 1.9 fps, the page died at the same
  frame with the same count, 3,474 sampling draws, five and a half times later.
- **PCF only.** `?shadowtype=basic` with only the bookcase reading the map died
  at frame 11 after 132 sampling draws.
- **On the site, `?shadows=1` now samples the map in 2 draws from 1 program**, at
  both fixture sizes, where it drew 302 from 5 on the 50-book fixture.

## The device

Pixel 10 Pro XL, PowerVR DXT-48-1536, driver 25.3@6908880, Chrome 153, ANGLE on
the GLES backend. The painted default ran 120 s three times with no loss, which
is the control round 2 never ran.

## What dies, and when

| configuration | runs | frame | sampling draws at loss |
| --- | --- | --- | --- |
| `?shadows=1` | 5 of 5 lost | 8 ± 1 | 3,474 |
| `?shadows=1`, throttled to 1.9 fps | 2 of 2 lost | 8 | 3,474 |
| `?shadows=1&books=2` | 2 of 2 lost | 146 | 3,087 |
| `?shadows=1&books=1&painted=0` | 2 of 2 lost | 291 | 3,504 |
| `?shadows=1&shadowtype=basic` | 5 of 5 lost | 9 | 3,860 |
| `gl.flush()` after every sampling draw | 3 of 3 lost | 7–8 | 3,088–3,474 |
| `?shadows=1&books=0&painted=0` | 2 of 2 survived | — | 43,206 at 120 s |

⚠️ **The empty case now survives**, where ADR-0016 records it dying in August.
The driver moved in between, so read that entry as a finding about the driver
of its day.

## Which programs read the map

The site drew 411 times a frame and 386 of those sampled the map, from five
MeshStandard programs: spines, pages and head caps, boards, covers, and wood
with backing. Hooks rewrote the fragment shaders on the live page:

| hook | programs sampling | result |
| --- | --- | --- |
| `#undef USE_SHADOWMAP` in every program but the bookcase's | 1 | survived 3/3 at 120 s, 1/1 at 300 s, 1/1 orbiting, 1/1 with `painted=0` |
| the same, `shadowtype=basic` | 1 | lost 2/2 at frame 11 |
| `#undef` only in the bookcase's program | 4 | lost 2/2 at frame 8 |
| no edit; `receiveShadow` forced to `0` | 5 | lost 2/2 at frames 8 and 9 |
| `#undef` everywhere | 0 | survived 2/2 |

Every death came with a GPU-process crash line in the logcat, and no survivor
had one. Where the desktop renders of the surviving configuration and the
unmodified page differ, the phone's screenshot is closer to the surviving one on
98.3% of those pixels.

A later round found that the one surviving program has a ceiling: 12 sampling
draws a frame held and 13 died. The bookcase's own count grew with the library,
which is why the woodwork was joined first.

## The site-side version, checked on desktop

The change does in `buildBook` what the first hook did in the page. Measured
under SwiftShader at a pinned `?woodSeed=`, against the build with the woodwork
already joined:

| build and URL | programs sampling | sampling draws a frame |
| --- | --- | --- |
| before, `?shadows=1` | 5 | 302 on 50 books, 47 on 7 |
| after, `?shadows=1` | 1 | 2 on both |
| after, `?shadows=1` under `woodSpecies: flat` | 2 | 2 on both |
| after, `?shadows=1&receivers=all` | 5 | 302 on 50 books, 47 on 7 |
| after, default page | 0 | 0 |

- **`?receivers=all` is the old `?shadows=1`**, byte for byte: 0 samples differ
  in all four runs, both fixtures at both viewports.
- **The default page does not change**, byte for byte, in the same four runs.
- **What does change is `?shadows=1` itself.** On the 50-book fixture it moves
  20,696 desktop pixels (1.6%) by more than 1 level, worst 71.

## What it costs

The band the plank throws across the top of each face-out cover row, and the
wedge a taller book throws on the next. On the live library, 5.4% of the page's
pixels changed by more than 8 levels, and they got brighter by 32 on average. At
phone scale it reads as a shelf with real shadows whose covers are a little
flatter at the top, not as something broken.
