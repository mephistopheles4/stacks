import { boot } from './boot.ts';

/**
 * The page's one entry point: find the elements, hand them to `boot`.
 *
 * This lives in a `.ts` module rather than in `Shelf.astro`'s `<script>` because
 * logic in an `.astro` file is counted by nothing — every mutation scope and
 * every complexity population globs `*.ts` — so anything with a type belongs
 * here, where the counters can see it. ⚠️ **It is typechecked either way now**:
 * G50 (`astro-types`) runs `astro check` inside `pnpm build`, so the reason this
 * paragraph used to give — *`astro check` cannot run under TypeScript 7* — is
 * no longer the reason, and coverage is. G7
 * caps a script block at a handful of bootstrap statements for that reason, and
 * the card's five elements put it over: the guard that was two `instanceof`
 * checks is now five, which is exactly the point where a bootstrap turns into a
 * program.
 *
 * The element ids are the seam between the markup and the code. They are looked
 * up rather than passed in because the template owns the markup and this owns
 * the types, and a `.astro` file cannot hold the second.
 */
export function start(): void {
  const canvas = document.getElementById('shelf-canvas');
  const card = document.getElementById('book-card');
  const body = document.getElementById('book-card-body');
  const status = document.getElementById('book-card-status');
  const dismiss = document.getElementById('book-card-dismiss');
  const viewer = document.getElementById('cover-viewer');
  const viewerImage = document.getElementById('cover-viewer-image');

  if (
    !(canvas instanceof HTMLCanvasElement) ||
    !(card instanceof HTMLElement) ||
    !(body instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(dismiss instanceof HTMLElement) ||
    !(viewer instanceof HTMLDialogElement) ||
    !(viewerImage instanceof HTMLImageElement)
  ) {
    // Nothing to boot into. Silent rather than thrown: a missing element here
    // means the template changed, which is a build-time mistake, and throwing on
    // a page whose whole content is a WebGL scene would leave a blank screen
    // with a console message nobody opened.
    return;
  }

  void boot(canvas, {
    card,
    body,
    status,
    dismiss,
    coverViewer: { dialog: viewer, image: viewerImage },
  });
}
