# ADR-0162 — The rooms directory is allowed on its SOURCES.md, and G13 admits CC BY

**Date:** 2026-11-16
**Status:** proposed; the owner decides at merge
**Issue:** [#600](https://github.com/mephistopheles4/stacks/issues/600)
**Spec:** [#593 revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109), S16 and S4.14

## Decision

G13 (`no-third-party-material`) admits `packages/site/public/rooms/` as a
**directory**, on a provenance that each room folder's own `SOURCES.md`
carries, and the material under it may be CC0, CC BY or public domain. A room
folder that tracks a binary and no `SOURCES.md` beside it is red, and a binary
directly in `rooms/`, outside any room folder, is red. `glb` and `ktx2` join the
`BINARY` extension list, so a room's files are read by G13 and by no text sweep.

This **contradicts G13's recorded rules** in two places, and the owner is asked to
accept both:

- G13 allows named files and never a directory ([`docs/gates.md`](../gates.md)).
- CC0 alone was the claim under which a third party's image may be committed.

## Why

A room is about eighty files (a GLB, WebP and KTX2 textures) that a rebake
renames, and the credit CC BY asks for is an author and a link, which a list of
filenames cannot hold. The models are the reason the room is worth having: eight
of its sources are CC BY 4.0 and no CC0 stand-in for them exists in the library.

The reasons G13 refuses a directory elsewhere do not hold here. The refusal
protects `packages/site/public/`, where `stacks build --public` stages a real
vault's covers, held covers and notes; those three are siblings of `rooms/` and not
inside it, and every one of them is gitignored.

## What stays

- Every other entry in G13 is unchanged, and `packages/site/public/` itself is
  still never allowed as a prefix.
- G75 (`room-inputs`) holds each CC BY source to being credited in `SOURCES.md`
  by author and page.
- Nothing in G13 can tell a CC0 model from a stolen one. The claim is the
  owner's, made once, in `inputs.json` and read against each host's API in the
  audit ([ADR-0161](0161-the-room-is-committed-baked-with-a-record-and-fetchable-inputs.md)).

## What was refused

- **Naming each file**, as the CC0 woodwork sheets are. Eighty names that change
  on every rebake would be a list nobody re-checks, which is how G13 describes a
  standing permission.
- **Leaving the files out of git** and fetching them at deploy: the site is built
  from the repository, and a deploy that depends on four third-party hosts is a
  worse failure than a larger history.
