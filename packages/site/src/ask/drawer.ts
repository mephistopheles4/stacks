import { onHeld, requestPickUp } from './bridge.ts';
import { askLibrary, unavailable, type AskResult } from './client.ts';
import { createOutsideClick, escapeTakenBy, type CloseReason } from './close.ts';
import { createMemory } from './memory.ts';
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
  // The last two answered exchanges: a page variable, gone on reload (memory spec D2).
  const memory = createMemory();

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
      if (open && outside.up(event.clientX, event.clientY, inside(event.target))) {
        // The click closed the drawer and that is all it does: the shelf sees it
        // marked, and does not put a held book back.
        event.preventDefault();
        hide('outside');
      }
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
  // One place above the box holds the three quick questions, and after an answer
  // that brings them, the model's follow-ups instead. Every button in it sends its
  // text as a new question, through the same limits as a typed one.
  const defaults = [...ui.quick.querySelectorAll('button')].map((b) => b.textContent ?? '');
  ui.quick.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button !== null && ui.quick.contains(button)) void ask(button.textContent);
  });

  function setQuick(texts: readonly string[]): void {
    const buttons = texts.map((text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      return button;
    });
    ui.quick.replaceChildren(...buttons);
    ui.quick.hidden = buttons.length === 0;
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
    const result: AskResult =
      token === undefined ? unavailable : await askLibrary(question, token, memory.recent());
    waiting.remove();
    memory.remember(question, result);
    addAnswer(result);
    // Follow-ups when the answer brought some; otherwise the quick questions again,
    // after every search fallback, limit and error too.
    setQuick(result.followUps.length > 0 ? result.followUps : defaults);
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
      // The whole title stays in the text, so a screen reader reads it all and
      // the pill only clips what it draws; the tooltip shows it too.
      link.title = book.title;
      const label = document.createElement('span');
      label.className = 'ask-book-title';
      label.textContent = book.title;
      link.append(bookIcon(), label);
      link.addEventListener('click', () => {
        requestPickUp(window, book.id);
      });
      list.append(link);
    }
    entry.append(list);
  }

  return { open: show, close: hide };
}

/** A small open book, built from nodes and never from markup. */
function bookIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ask-book-icon');
  for (const d of [
    'M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z',
    'M12 6.5v13',
  ]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
