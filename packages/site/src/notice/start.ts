import { mountNotices } from './modal.ts';

/**
 * The modal's one entry point (docs/spec/notice-modals.md N1): hand the page to `mountNotices`.
 *
 * In a `.ts` module rather than in `Notices.astro`'s `<script>` for the shelf's reason
 * (`shelf/start.ts`): logic in an `.astro` file is counted by nothing.
 */
export function startNotices(): void {
  mountNotices(document, window);
}
