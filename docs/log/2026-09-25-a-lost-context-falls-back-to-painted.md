# A lost context falls back to painted

**2026-09-25** — [#381](https://github.com/mephistopheles4/stacks/issues/381)'s
fourth change. When the shelf loses its WebGL context while it samples the
shadow map, the page writes one record, redraws the shelf painted, and later
loads start painted. The decision is
[ADR-0091](../adr/0091-a-lost-context-falls-back-to-painted-shadows.md); the
change before this one is [the cover shade](./2026-09-24-the-cover-shade.md).
Real-time shadows were still off by default in this change: the default flipped
after it, in [real-time shadows by default](./2026-09-25-real-time-shadows-by-default.md),
and was not to ship before it.

## The answer first

- **On the Pixel 10 Pro XL a real loss reaches neither rebuild.** Four losses,
  four the same: no restore, and the new canvas at 2.5 s refused with `Web page
  caused context loss and was blocked`. The page ends on its failure sentence,
  with the record written.
- **The record is what works there.** A reload about 17 s and 73 s after a loss
  came back painted from the record, at 60 fps. A reload about 9 s after one was
  refused a context, and the page said so.
- **Both rebuilds work on the device when a context is handed out.** A
  synthetic loss rebuilt painted on the same canvas when restored, and on a new
  canvas when not, and both ran at 60 fps.
- **`?shadows=1` held for 120 s at 60 fps** with only the bookcase reading the
  map. It is the first time the site-side change ran on the phone.
- **The GPU string carries no driver build**, so a driver update alone retires
  no record. The 30-day expiry is the retry.
- **A new gate, G59 (`context-loss-fallback`),** drives four losses through a
  real browser in `pnpm smoke:render`.

## What was built

- [`shadow-fallback.ts`](../../packages/site/src/shelf/shadow-fallback.ts) — the
  record, pure: reading, writing and forgetting it through a store that may
  throw, the painted base, the retirement rule, the starting state and the
  `fallback` line.
- [`context-recovery.ts`](../../packages/site/src/shelf/context-recovery.ts) —
  what one page does about a loss, as a state machine whose every effect is
  injected: `lost`, `restored`, and a timer.
- `boot.ts` wires them. Every closure reads a mutable `surface` rather than the
  canvas it was handed, because after a swap the old element has no parent and
  a notice shown against it is shown nowhere.
- `scene.ts` hands `onContextLost` the live settings, and checks `disposed`
  after the restored callback and at the top of `renderLoop`.
- `shelf-url.ts` writes the URL as a difference from the page's base, and the
  panel passes that base in, so a remembered device's `?shadows=0` never lands
  in a shared link.
- `diagnostics.ts` gains the `fallback` line and the `forget` button.

## Precedence

Highest first: the URL's `?shadows=`, then the record, then `DEFAULT_SETTINGS`.
The record only chooses the base the URL is folded onto, so the URL wins with no
code of its own. `shadow-fallback.test.ts` pins the four cases —
`?shadows=1` over a record is real-time, `?shadows=0` without one is painted, a
bare URL over a record is painted, and a bare URL without one is the shipped
default.

## The desktop checks

`pnpm smoke:render` runs four cases after its existing checks, each in a browser
context of its own, against `?shadows=1` while the default is painted and
against the plain page once it is not:

```text
context loss (G59), each case in a browser context of its own
  restore         restored painted (176 frames, 1 loop), reload remembered, ?shadows=1 probe-override
  no restore      new canvas after 2708ms, 1440x900, 1616 colours, 173 frames, 1 loop, card opens
  storage refused restored painted, not remembered, no page errors
  painted loss    notice, no record, no rebuild, resumed in place (174 frames, 1 loop)
```

**Observed red**, each planted, run and reverted, with the file hash checked
against its backup afterwards:

| plant | result |
| --- | --- |
| both `disposed` guards removed | red: `2 render-loop callbacks in one frame after the restore` |
| only `renderLoop`'s guard removed | green, 1 loop |
| only the restored handler's guard removed | green, 1 loop |
| `remember` claims a write and makes none | red in `restore` and in `storage refused` |
| the new shelf mounted on the lost canvas | red in `restore` and `no restore`: `refused` |

The two guards cover each other on purpose: either alone stops a disposed
shelf's loop, and the gate goes red only when both are gone.

The unit specs were planted the same way. Swapping `remember` after `notify`,
deleting the one-attempt guard and deleting `clearTimer` each reddened
`context-recovery.test.ts`; `>` for `>=` at the expiry and an unguarded
`setItem` each reddened `shadow-fallback.test.ts`.

## The phone

Pixel 10 Pro XL, Chrome 153, over USB, serving a build of this change with the
50-book fixture. Every run force-stops Chrome first unless it says it kept it.

| run | page | what happened |
| --- | --- | --- |
| baseline | `?debug&shadows=1` | 120 s, 60 fps, no loss, no record, `fallback real-time` |
| real loss 1 | `?debug&shadows=1&receivers=all` | lost at 1.3 s; new canvas refused at +2.53 s; `refused`, failure sentence, record written |
| reload, kept | `?debug`, 73 s after | remembered, painted, 60 fps for 30 s |
| real loss 2 | the same | lost at 1.2 s; refused at +2.53 s |
| reload, kept | `?debug`, 9 s after | no context: `This browser wouldn't give the page a 3D canvas…` |
| real loss 3 | the same, with a probe | lost at 1.2 s; refused at +2.54 s; the probe refused at +4, +8, +12, +16, +20 and +24 s |
| real loss 4 | the same | lost at 1.2 s; refused at +2.52 s |
| reload, kept | `?debug`, 17 s after | remembered, painted, 60 fps for 30 s |
| forget | `?debug` | the button showed, removed the record; the next load read `none` |
| synthetic restore | `?debug&shadows=1` | lost at 6.0 s, restored in 0.5 s, redrawn painted, 60 fps for 35 s |
| synthetic, no restore | `?debug&shadows=1` | new context at +2.54 s, painted, 60 fps for 35 s |

Every real loss logged the same pair in logcat: `Restarting GPU process due to
unrecoverable error. Context was lost.` and `GPU process exited unexpectedly:
exit_code=0`, then the GPU process was back in about 50 ms. The block outlived
it: the page's own document was refused to +24 s, and a navigation at 9 s was
refused too. Two points either side, 9 s refused and 17 s granted, and no claim
about where the edge is.

Losses 3 and 4 began on a record, under `?shadows=1`, so they read
`probe-override` before the loss — the probe beating the record on the device.
Each loss rewrote `at`. That is a new observed loss, not the refresh ADR-0091
forbids.

**The first `forget` looked like it failed.** The harness pressed it and
force-stopped Chrome within about a second, and the next load still found the
record. The likeliest reading, not measured, is that Chrome commits
`localStorage` lazily and a killed browser loses the last write. Pressed with
the page left open for ten seconds, it held. A real
loss kills the GPU process and not the browser, and every record the four
losses wrote was there on the next load.

**A same-canvas rebuild warns.** Disposing the restored shelf deletes handles
from the lost context on the restored one, and Chrome logs a burst of
`INVALID_OPERATION: delete: object does not belong to this context` — the
harness keeps the last 60 console lines, and all 60 were these. Warnings, not
errors; the page ran on at 60 fps. The new-canvas rebuild logs none.

## What this leaves for the owner

- **On this phone the in-page rebuild never happens after a real loss.** The
  visitor reads *"…would not give it another. Reload to bring it back — it will
  come back with painted shadows."* A reload within about 9 s then reads
  *"…Reloading usually fixes it."*, and the next one works. The two sentences
  chain, but the first reload can fail. Whether to change the wording is open.
- **A shader-link failure still halts** and writes nothing.
- **Not run:** a Galaxy S25 and the iOS simulator. The second device on USB was
  not a Galaxy. Real-time shadows were not the default in any run here.
