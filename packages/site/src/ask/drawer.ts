import { onHeld, requestPickUp } from './bridge.ts';
import { askLibrary, unavailable, type AskResult } from './client.ts';
import { createOutsideClick, escapeTakenBy, type CloseReason } from './close.ts';
import { createTokenSource, loadTurnstileScript } from './turnstile.ts';

/** The page's pieces, found by `Ask.astro` and handed over. */
export interface AskElements {
  readonly launcher: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLTextAreaElement;
  readonly send: HTMLButtonElement;
  readonly thread: HTMLElement;
  readonly quick: HTMLElement;
  readonly live: HTMLElement;
  readonly widget: HTMLElement;
  readonly siteKey: string;
}

export const WAITING = 'Looking through the shelf';
/** The text area grows to this share of the window, then scrolls. */
const MAX_INPUT_SHARE = 0.4;

/**
 * The drawer's behaviour (docs/spec/ask-the-library.md S7). Everything a visitor
 * can read arrives through `textContent`: a question, an answer and a book's
 * title are text nodes and never markup (C15).
 */
export function mountAsk(ui: AskElements): { open(): void; close(reason: CloseReason): void } {
  const { panel, launcher, input, thread } = ui;
  let open = false;
  let busy = false;

  const tokens = createTokenSource({
    siteKey: ui.siteKey,
    container: ui.widget,
    load: () => loadTurnstileScript(document, window),
  });

  function show(): void {
    if (open) return;
    open = true;
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    // The first open starts Cloudflare's script. A visitor who never opens the
    // drawer makes no third-party request (C11).
    tokens.prepare();
    input.focus();
  }

  function hide(reason: CloseReason): void {
    if (!open) return;
    open = false;
    const focusWasInside = panel.contains(document.activeElement);
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    // Picking a book up moves focus to the book; only take it back when it was ours.
    if (reason !== 'pickup' || focusWasInside) launcher.focus();
  }

  launcher.addEventListener('click', () => {
    if (open) hide('button');
    else show();
  });
  ui.close.addEventListener('click', () => {
    hide('button');
  });

  // Escape, first and on the window, so it is taken wherever focus is. Marking it
  // handled is what keeps the shelf from also putting a held book back.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!escapeTakenBy(open, event.key)) return;
      event.preventDefault();
      hide('escape');
    },
    true,
  );

  const outside = createOutsideClick();
  const inside = (target: EventTarget | null): boolean =>
    target instanceof Node && (panel.contains(target) || launcher.contains(target));
  document.addEventListener(
    'pointerdown',
    (event) => {
      outside.down(event.clientX, event.clientY, inside(event.target));
    },
    true,
  );
  document.addEventListener(
    'pointerup',
    (event) => {
      if (open && outside.up(event.clientX, event.clientY, inside(event.target))) hide('outside');
    },
    true,
  );

  onHeld(window, () => {
    hide('pickup');
  });

  // The text area follows its content over 140 ms to 40% of the window.
  function fit(): void {
    const before = input.offsetHeight;
    // Measured with the transition off. With it on, setting the height to 0 only
    // starts a transition, the box is still its old height when scrollHeight is
    // read, and the reading can never be smaller than that: the box grew but never
    // shrank when the text was deleted.
    input.style.transition = 'none';
    input.style.height = '0px';
    const wanted = input.scrollHeight;
    const cap = window.innerHeight * MAX_INPUT_SHARE;
    input.style.overflowY = wanted > cap ? 'auto' : 'hidden';
    input.style.height = `${String(before)}px`;
    // Reading the height forces the layout the transition starts from.
    void input.offsetHeight;
    input.style.transition = '';
    input.style.height = `${String(Math.min(wanted, cap))}px`;
  }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    ui.form.requestSubmit();
  });

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void ask(input.value);
  });
  for (const chip of ui.quick.querySelectorAll('button')) {
    chip.addEventListener('click', () => {
      void ask(chip.textContent);
    });
  }

  async function ask(raw: string | null): Promise<void> {
    const question = (raw ?? '').trim();
    if (question === '' || busy) return;
    busy = true;
    ui.send.disabled = true;
    input.value = '';
    fit();
    ui.quick.hidden = true;
    addEntry('question', question);
    const waiting = addEntry('waiting', WAITING);
    ui.live.textContent = WAITING;
    const token = await tokens.token();
    const result: AskResult = token === undefined ? unavailable : await askLibrary(question, token);
    waiting.remove();
    addAnswer(result);
    ui.live.textContent = result.answer;
    busy = false;
    ui.send.disabled = false;
    input.focus();
  }

  function addEntry(kind: 'question' | 'answer' | 'waiting', text: string): HTMLElement {
    const entry = document.createElement('p');
    entry.className = `ask-${kind}`;
    entry.textContent = text;
    thread.append(entry);
    thread.scrollTop = thread.scrollHeight;
    return entry;
  }

  function addAnswer(result: AskResult): void {
    const entry = addEntry('answer', result.answer);
    if (result.books.length === 0) return;
    const list = document.createElement('span');
    list.className = 'ask-books';
    for (const book of result.books) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ask-book';
      link.textContent = book.title;
      link.addEventListener('click', () => {
        requestPickUp(window, book.id);
      });
      list.append(link);
    }
    entry.append(list);
  }

  return { open: show, close: hide };
}
