# ADR-0170 — `private` is the only control: a wishlist book publishes unless it is private

**Date:** 2026-11-16
**Status:** accepted, built in [#603](https://github.com/mephistopheles4/stacks/issues/603); supersedes [ADR-0009](0009-shelf-layout.md) and [ADR-0012](0012-public-build-staging.md) on wishlist books, and amends [ADR-0028](0028-one-inspector-for-the-public-build.md)
**Issue:** [#603](https://github.com/mephistopheles4/stacks/issues/603), ticket T4 of the room spec ([#593](https://github.com/mephistopheles4/stacks/issues/593), revision 3, S9, S10 and S11)
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)

## Decision

1. **A public build publishes a wishlist book unless it is `private`.** Its `library.json` entry,
   its cover and held cover under the same caps, its `## Thoughts` through the same extractor, and
   its place in Ask the library, as any other book's. `private` still fails closed
   ([ADR-0010](0010-private-fails-closed.md)), so `private: yes` withholds a book from every one of
   those folders. A wishlist book stays off the main bookcase, and `?shelf` does not draw it.
2. **What changed in the code.** `isPublishable` in `packages/core/src/publish.ts` asks only
   `private`; the inspector's `wishlist-book` rule is gone, and `private-book` holds a private
   wishlist book as it holds any other; the Ask Worker's `toCatalogue` no longer treats
   `status: wishlist` as the sign of a local build, and still refuses a library carrying
   `sourcePath` or `private`.
3. **The Ask Worker ships first.** `deploy:ask` with the new filter goes out before the
   `deploy:site` that publishes wishlist books, or the Worker refuses the whole library and Ask
   goes down.
4. **A cover within the shelf cap is now read for metadata.** It is copied byte for byte, and a
   cover the owner photographed carries what a camera wrote, location included. The inspector's
   new `cover-metadata` rule reads `covers/` for EXIF, XMP, IPTC, PNG text and a Photoshop block, as
   `held-metadata` reads `held-covers/`, and a file sharp cannot read is refused too. It lives in
   the one inspector, so `gate:public` and `deploy:site`'s check of the real `dist/` both run it,
   and a deploy that finds one, wishlist book or not, refuses until the cover is saved again
   without its metadata.
5. **A one-off lists what changes.** `stacks build --public --list-new-wishlist` prints, in the
   terminal only, each wishlist book the build now publishes, by title, with a mark for its notes
   file and its cover. It is computed from the folder the same run staged, never from a second
   filter, and writes no file. It is removed after the owner confirms the first `deploy:site` after
   this change.
6. **The wishlist fixture now ships.** `The Quiet Protocol` carries a ship phrase of its own inside
   `## Thoughts` and the canary below the section, so G2 and `gate:public` prove a wishlist book's
   notes publish and its body does not.

## Why

The owner decided it: what they mean to read is theirs to publish or not, book by book, and the
floor stacks in the room are drawn from it. One control is simpler than two, and `private` already
fails closed. The old rule held a book back for being unowned, which the owner no longer wants.

## What it costs

- **A deployed copy stays until that deployment is deleted.** Marking a book private later takes it
  off the next deployment only; earlier deployments keep its cover and held copy at their own
  addresses. The owner reads the list `--list-new-wishlist` prints before the first deploy that
  ships this change.
- **The list of what the owner means to read is public**, for every wishlist book not marked
  private. That is the trade-off the spec names: what the site reveals against the stacks reading
  as real.
- **A deploy can refuse for a cover.** One within the shelf cap that carries photo metadata stops it
  until it is saved again without.
- The threat model's `private` line changes what is published, so its merge is the owner's.

## Not decided here

The floor stacks themselves, the pickup from them and G35's new cells are the same ticket and are
recorded with it in the code; they are display and add no decision a reader would not expect.
