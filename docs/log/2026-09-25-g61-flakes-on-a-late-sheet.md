# G61 flakes on a late sheet

**2026-09-25** — [#385](https://github.com/mephistopheles4/stacks/issues/385).
G61 (`one-shadow-reader`) went red once during `pnpm deploy:site` on `main` at
4ca101c, on the owner's workstation GPU, after a day of green runs in CI and
locally:

```text
default, 50 books   126 steady  1–2 programs  2 draws/frame  FAILED
- G61, default, 50 books: (3) 1 of 126 steady frame(s) sample the shadow map from up to 2 programs — only one may read it: #2 MeshStandardMaterial, #7 MeshStandardMaterial
```

## The answer first

- **The settle ended at the last link, and the last change of program needs
  none.** The woodwork and the backboard are two `MeshStandardMaterial`s that
  compile to the same program. The first sheet to decode links the mapped
  program; the second switches its material to that program, which already
  exists. Every frame between the two decodes draws the no-map program and the
  mapped one, and every one after the first link counted as steady.
- **The window is the whole gap between the decodes, not "a frame or two"**, as
  `steadyFrames` and `docs/gates.md` said. It is as long as the network makes
  it: about 120 frames with one sheet held back 600 ms.
- **The fix ends the settle at the last change in which programs sample, too.**
  The hook records that frame beside the last link, so `settledFor()` — what
  `measureSampling` waits on — and `steadyFrames` — what the judge reads — are
  one rule. The change frame is itself steady: it is the first frame of the set
  that stayed.
- **It still fails what it exists to fail.** A standing second reader changes
  the set once and then holds two; one that comes and goes never settles.

## Reproducing it

A scratch probe ran `measureSampling`'s exact waits against the built site and
printed every frame in which the sampling set changed or anything linked.

Undelayed, 4 of 4 runs landed both sheets in one frame:

```text
f0 links=6 set={2}
f3 links=2 set={7}
verdict: ok
```

With either sheet's response held back 600 ms, 4 of 4 were red, the same two
programs as on `main`:

```text
f0   links=6 set={2}
f3   links=2 set={2,7}
f4   links=0 set={2,7} STEADY
...  every frame {2,7}, every one STEADY
f127 links=0 set={7}   STEADY    <- the second sheet: a switch, no link
verdict: (3) 123 of 247 steady frame(s) sample the shadow map from up to 2 programs
```

So the flake needs the two decodes to land in different frames. On a
workstation over localhost they almost never do.

The same probe on the fixed judge was green 4 of 4, with the steady window
starting at the frame the second sheet landed in (f126, f143, f128, f147).

## What the gate was shown to do

Each through `pnpm smoke:render`, and reverted against the committed tree:

| Plant | Settle | 50 books | 300 books | Control |
| --- | --- | --- | --- | --- |
| Backboard sheet held back 600 ms | ends at the last link | red, 136 of 259 | red, 78 of 152 | red, 5–6 programs |
| Backboard sheet held back 600 ms | also ends at a change | green, 123 steady | green, 80 steady | red, 5 programs |
| Backboard compiled apart (`vertexColors` off) | also ends at a change | red, 126 of 126 | red, 81 of 81 | red, 5 programs |

The control, `?receivers=all`, changes its set once, at f3 with a link, and
holds 5 programs after that (3 of 3 probe runs), so it is red for the right
reason under both rules. Its `5–6` on the old rule was this same late sheet.

Unplanted, `pnpm smoke:render` was green 5 of 5 in a row: 124–128 steady
frames at 50 books, 58–78 at 300, one program in 2 draws each time, and the
control red at 5 programs and 302 draws every run.

## Not measured

- **Whether a phone survives the decode gap.** A slow network gives a real
  visitor two sampling programs for as long as the second sheet takes. G61
  judges that as onset, the budget still holds it to 2 draws, and nobody has
  run a phone with one sheet held back.
- **A sheet still in flight when the network wait gives up.** The settle cannot
  wait out a change that has not happened. `measureSampling` waits up to 20 s
  for the network to go idle first; a sheet slower than that on localhost would
  be red for this same reason.
