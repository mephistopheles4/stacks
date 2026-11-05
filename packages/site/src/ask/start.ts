import { mountAsk } from './drawer.ts';

/**
 * The drawer's one entry point: find the elements, hand them to `mountAsk`.
 *
 * In a `.ts` module rather than in `Ask.astro`'s `<script>` for the shelf's
 * reason (`shelf/start.ts`): logic in an `.astro` file is counted by nothing.
 * The ids are the seam between the markup and the code.
 */
export function startAsk(): void {
  const launcher = document.getElementById('ask-launcher');
  const panel = document.getElementById('ask-panel');
  const close = document.getElementById('ask-close');
  const form = document.getElementById('ask-form');
  const input = document.getElementById('ask-input');
  const send = document.getElementById('ask-send');
  const thread = document.getElementById('ask-thread');
  const quick = document.getElementById('ask-quick');
  const live = document.getElementById('ask-live');
  const widget = document.getElementById('ask-widget');

  if (
    !(launcher instanceof HTMLButtonElement) ||
    !(panel instanceof HTMLElement) ||
    !(close instanceof HTMLButtonElement) ||
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLTextAreaElement) ||
    !(send instanceof HTMLButtonElement) ||
    !(thread instanceof HTMLElement) ||
    !(quick instanceof HTMLElement) ||
    !(live instanceof HTMLElement) ||
    !(widget instanceof HTMLElement)
  ) {
    // The template changed; the shelf must not go with it.
    return;
  }

  mountAsk({
    launcher,
    panel,
    close,
    form,
    input,
    send,
    thread,
    quick,
    live,
    widget,
    siteKey: panel.dataset.siteKey ?? '',
  });
}
