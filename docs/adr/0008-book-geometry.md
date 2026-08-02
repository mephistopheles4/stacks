# A book is a case wrapped round a page block, not one painted box

Each book is two boards plus a spine strip enclosing a smaller block of paper, recessed at head, tail and fore-edge by the binder's *square*. The printed cover and spine are planes floating `SKIN` above their boards rather than faces of them.

A single box has to answer for the cover, the spine, the boards and the page edges with one set of faces — which is why the top and bottom of every book came out spine-coloured. Draw calls are unchanged by the split; object count is not.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **One mesh per book, not InstancedMesh.** CLAUDE.md says measure before optimising: 49 books render fine, and InstancedMesh would force a texture atlas for per-book covers. Revisit at the 200-book performance target, with a measurement. *(Superseded below: a book is now a small group of parts. InstancedMesh is still rejected, for the same reason.)*

- **2026-07-31** — **A book is a case wrapped round a page block, not one painted box.** Superseding the entry above. A single box has to answer for the cover, the spine, the boards *and* the page edges with one set of faces, which is why the top and bottom of every book came out spine-coloured — the owner spotted it. A real hardback is two boards plus a spine strip enclosing a smaller block of paper, recessed at head, tail and fore-edge by the binder's *square*. That is now the geometry: `BOARD` 0.011 and `SQUARE` 0.013 world units, ≈2.5mm and ≈3mm at the shelf's 1 unit ≈ 24cm. So the top of a book reads as paper with a thin rim of cover, and the cover stands proud of the pages.

- **2026-07-31** — **Draw calls are unchanged by that; object count is not.** `BoxGeometry` emits one draw call per *face group*, so the old six-material box already cost six draws — exactly what the six single-material parts cost now. What did change is per-object work: matrix updates and frustum culling go 1 → 6 per book, so the 200-book target is ~1200 objects rather than ~200. That is the number the measurement deferred above should now look at first.

- **2026-07-31** — **The cover and the spine are planes floating `SKIN` above their boards**, not faces of them. Costs nothing extra given the per-group draw call, avoids z-fighting, and lets each printed face be exactly the size of its own artwork — a face-out cover keeps its true aspect instead of inheriting the board's.

- **2026-07-31** — **The picker raycasts recursively and every part of a book is registered against it**, so a click on the pages or a board opens the same card as a click on the spine. Both halves are needed: with one missing, clicks return `undefined` and nothing errors.
