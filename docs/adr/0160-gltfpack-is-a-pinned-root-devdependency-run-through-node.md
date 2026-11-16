# ADR-0160 — gltfpack is a pinned root devDependency, run through node

**Date:** 2026-11-16
**Status:** accepted, built in [#600](https://github.com/mephistopheles4/stacks/issues/600)
**Issue:** [#600](https://github.com/mephistopheles4/stacks/issues/600)
**Spec:** [#593 revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109), S4.7 and S4.8

## Decision

`gltfpack` **1.3.0** is a root `devDependency`, pinned exactly. `build_room.py
--pack` finds it at `node_modules/gltfpack/cli.js` and runs it with `node`, never
through the `node_modules/.bin` shim, with the committed flags
`-cc -kn -ke -km -kv -vtf -si 0.5 -slb`: meshopt compression, every named node and
extra kept, simplify 0.5.

The owner's words, typed in the session that built this: *"Yes, install gltfpack
1.3.0 as a root devDependency and unpack KTX-Software 4.4.2."*

## Why

The packed GLB is 3.0 MB against 35.9 MB raw (measured on bake 10), and the room's
download is the budget the owner cares about on a phone. gltfpack is the tool that
produces the meshopt stream three's loader decodes.

It is a root dependency, not a site one, because the pack step runs from the
bake, which is a script of the repository and not of a package. It is pinned
exactly because the output is committed: a different version is a different GLB,
and a rebake should say so in `build.json` rather than drift.

The `.bin` shim is a `.cmd` file on Windows, and Blender's Python runs a command
without a shell, so it fails there. Running the package's own entry file through
node works the same on every platform.

## What it costs

One devDependency with no dependencies of its own (its WebAssembly is in the
package). It runs only on the owner's machine, only when a room is rebaked. It
touches no build, no test and no deploy, and nothing the visitor receives.

## What was refused

- **A binary downloaded by a script.** It would have needed its own pin, hash and
  host in the threat model, and the package is that already.
- **gltf-transform in place of gltfpack.** It can meshopt-compress too, but its
  simplifier is not the one measured, and the room's budget was measured with
  gltfpack.

KTX-Software 4.4.2 is not a dependency at all: it is unpacked from its release
archive into the ignored `artifacts/tools/`, never installed, and its path is an
argument to `encode_ktx2.mjs`.
