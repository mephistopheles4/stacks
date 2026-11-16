# ADR-0161 — The room is committed baked, with a build record and fetchable inputs

**Date:** 2026-11-16
**Status:** accepted, built in [#600](https://github.com/mephistopheles4/stacks/issues/600)
**Issue:** [#600](https://github.com/mephistopheles4/stacks/issues/600)
**Spec:** [#593 revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109), S4 and S14

## Decision

The packed GLB and both texture sets of a room (WebP and KTX2 ETC1S) are
**committed** under `packages/site/public/rooms/<room>/`, and the pipeline that
made them is committed beside the room in `packages/site/rooms/`:

- `inputs.json` names every bake input outside git: page URL, licence, author,
  SHA-256, destination, and a download URL for each one that can be fetched.
- `fetch_inputs.py` fetches them over HTTPS from three hosts into the ignored
  `artifacts/rooms/<room>/`, and checks every input, hand-placed ones included,
  against its SHA-256. `build_room.py` refuses to bake until that check passes.
- `build.json` records the bake command, the three tool versions and the SHA-256
  of every input and every served file. Three gates read it: `room-build-record`,
  `room-budget` and `room-inputs`.
- The owner's block-out is `layout.json`, data written into the repository, so no
  untracked `.blend` is an input.

A rebake is **the same room, not the same bytes**: Cycles and the encoders are not
bit-for-bit across machines, and the record says what was run, not that it will
reproduce.

## Why

A clone draws the same room without Blender, ktx or gltfpack, and the build never
runs the bake. The cost is that committed binaries grow history at every rebake
(the packed room is about 27 MB with WebP and 35 MB with KTX2). Rebakes are rare.
If they stop being rare, **moving a room's files to Cloudflare R2 storage is the
way out**, and `build.json`'s hashes are what would tell the move it lost nothing.

## What was refused

- **Baking in CI.** It needs a GPU for sixteen minutes and Blender 5.3; the owner
  bakes on their machine.
- **Keeping the inputs in git.** Sixty-eight files, most of them third-party
  models under licences that want attribution; the hashes keep them honest
  without the copies.
- **A signed download link in `inputs.json`.** A link that expires is no record.
  Every entry names its page, and an input that needs an account (Sketchfab) is
  marked `manual` and placed by hand.

## The audit

The inputs were audited before anything was moved: each source in the prototype's
`SOURCES.md` was read from its host's own API on 2026-11-16 and is CC0, CC BY or
public domain. None was dropped.

## How this was decided

The bake command was not recorded on the prototype branch. It was reconstructed
from the transcript of the session that ran the bake (bake 10, 2026-11-15) and is
recorded in `build.json` as reconstructed. The rug and the wallpaper tile were
rederived from the Met's photographs with the arguments of the session that made
them and came out byte for byte the same as the PNGs the bake used.
