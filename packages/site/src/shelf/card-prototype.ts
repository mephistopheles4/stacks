/**
 * PROTOTYPE — THROWAWAY. Do not merge to `main`.
 *
 * Three variants of the enhanced book card, mounted on the *real* shelf so the
 * sheet is judged against live 3D, real covers and real titles rather than in a
 * vacuum. Ticket: "What does the enhanced card look like?" (#92).
 *
 * Run it: `pnpm dev`, then `/?cardproto=A`. The floating bar at the bottom
 * switches variant, data case and the three toggles; ← / → cycle variants.
 *
 * What it is here to answer (in this order):
 *
 * 1. **#89 × #91.** #89 chose the fact set without #91's ~40vh sheet budget in
 *    hand, and #102 then added two more rows. The card is eight rows against a
 *    cap that is **325px on a portrait phone and 150px in landscape**. The bar
 *    measures content against that cap live and turns red when it is over.
 * 2. **Six calls that went against a recommendation** — #89's 2 (visible ISBN),
 *    5 (status word always), 6 (object block never vanishes), 7 (logo row),
 *    #102's `subjects` line, #98's Google as the search target. Three of them
 *    are toggles on the bar so their height cost is visible rather than argued.
 * 3. **Apple's mark has no visible label on touch** (#101 struck `title`; it
 *    does not fire on touch anyway). Each variant takes a different position.
 * 4. **Transition durations** — the only motion numbers #101 left open.
 * 5. **The 6-book no-identifier fallback** (#98) has to be drawn, not just the
 *    full row.
 *
 * Inherited, not re-decided here: the close control sits **outside** the
 * replaced subtree (#101 — otherwise every tap-to-swap destroys it and drops
 * focus to `<body>`); the live region is separate, permanent and outside the
 * card; under `prefers-reduced-motion` only follow-the-finger survives.
 *
 * The provider marks are **placeholders at the real footprint**, not the
 * licensed artwork (#98 leaves vendoring as an open risk). Layout is what this
 * answers; the artwork is not.
 */
import type { LibraryBook } from '@stacks/core';

type Variant = 'A' | 'B' | 'C';
type Case = 'today' | 'filled' | 'no-isbn' | 'bare';

/**
 * The links row, on its own axis — because it is not the layout question.
 *
 * #89 decision 7 chose "logo SVGs with tooltips"; #101 then struck `title` for
 * that row and closed, and #103 found no uniform logo row is available anyway.
 * What is left is the marks with something else doing the tooltip's job, and
 * the four candidates cost different amounts of height. Measured, not argued.
 */
type LinkStyle = 'labelled' | 'apple-labelled' | 'bare' | 'text';

const LINK_STYLES: LinkStyle[] = ['labelled', 'apple-labelled', 'bare', 'text'];
const LINK_NAMES: Record<LinkStyle, string> = {
  labelled: 'marks + text on all three',
  'apple-labelled': 'marks, text on Apple only',
  bare: 'marks bare (Apple unlabelled)',
  text: 'plain text, no marks',
};

/** The fields #97/#102 add, which no note carries until #99 runs. */
interface Enriched extends LibraryBook {
  publisher?: string;
  published?: string;
  subjects?: string;
  googleVolumeId?: string;
  appleTrackId?: string;
  openlibraryOlid?: string;
}

interface Toggles {
  /** #102's subjects line — flagged there as "the first line to cut". */
  subjects: boolean;
  /** #89 decision 5 — the status word leads every reading line. */
  statusAlways: boolean;
  /** #89 decision 2 — the ISBN renders as a visible string. */
  isbn: boolean;
}

const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Cover anchor — cover leads, labelled marks',
  B: 'Two column — cover rail, bare marks',
  C: 'Editorial — inline cover, text links',
};

const CASES: Case[] = ['today', 'filled', 'no-isbn', 'bare'];
const CASE_NAMES: Record<Case, string> = {
  today: 'today (41/41 real books — new keys absent)',
  filled: 'filled (post-#99 — 3 ids, publisher, published, subjects)',
  'no-isbn': 'no ISBN (6/41 — search link only)',
  bare: 'bare (no cover/author/isbn/pages/tags/dates)',
};

/** Mounted by boot.ts when `?cardproto` is present. */
export function mountCardPrototype(
  card: HTMLElement,
  initial: string,
): { show: (book: LibraryBook) => void; hide: () => void } {
  // Defaults are the direction #92 locked: C, marks bare, `title` for the name.
  let variant: Variant = isVariant(initial) ? initial : 'C';
  let dataCase: Case = 'today';
  let linkStyle: LinkStyle = 'bare';
  let duration = 220;
  const toggles: Toggles = { subjects: true, statusAlways: true, isbn: true };
  let current: LibraryBook | undefined;

  document.head.append(styleTag());
  card.className = 'pcard';
  card.dataset['variant'] = variant;

  /*
   * The close control is a sibling of the replaced content, not a child of it.
   * #101's one structural cost: `replaceChildren` on a subtree containing the
   * control destroys and recreates it on every tap-to-swap, dropping focus to
   * <body> mid-browse.
   */
  const closer = document.createElement('button');
  closer.type = 'button';
  closer.className = 'pclose';
  closer.setAttribute('aria-label', 'Close book details');
  closer.append(span('pclose-pill'), span('pclose-x', '×'));
  closer.addEventListener('click', () => hide());

  const body = document.createElement('div');
  body.className = 'pcard-body';
  card.replaceChildren(closer, body);

  /*
   * Separate, permanently present, visually hidden (#101). It cannot live in
   * the card: a `hidden` element is out of the accessibility tree, and
   * `replaceChildren` would re-read every chunk on each tap-to-swap.
   */
  const live = document.createElement('p');
  live.className = 'pcard-live';
  live.setAttribute('role', 'status');
  document.body.append(live);

  const bar = buildBar();
  document.body.append(bar.root);

  function render(): void {
    card.dataset['variant'] = variant;
    card.style.setProperty('--pcard-duration', `${String(duration)}ms`);
    if (current === undefined) {
      bar.measure(undefined);
      return;
    }
    const book = applyCase(current, dataCase);
    body.replaceChildren(...blocks(book, variant, toggles, linkStyle));
    // Measured after layout, so the bar reports what the sheet actually is.
    requestAnimationFrame(() => bar.measure(card));
  }

  function show(book: LibraryBook): void {
    const first = card.hidden;
    current = book;
    card.hidden = false;
    render();
    const shown = applyCase(book, dataCase);
    live.textContent =
      shown.author === undefined ? shown.title : `${shown.title} by ${shown.author}`;
    if (first) {
      card.classList.add('is-entering');
      requestAnimationFrame(() => card.classList.remove('is-entering'));
    }
  }

  function hide(): void {
    card.hidden = true;
    card.style.removeProperty('--pcard-drag');
    current = undefined;
    live.textContent = '';
    bar.measure(undefined);
  }

  mountDrag(card, closer, () => hide());

  /*
   * Drivable by number, the way `window.__solo` is (CLAUDE.md, "?solo"): the
   * head corner was re-cut seven times from hand-dragged orbits and no two
   * before-and-afters were the same picture. The same applies to a card whose
   * question is a pixel height — `scripts/proto-card-shots.ts` reads this.
   */
  (window as unknown as { __cardproto?: unknown }).__cardproto = {
    set(next: {
      variant?: Variant;
      case?: Case;
      links?: LinkStyle;
      toggles?: Partial<Toggles>;
    }): void {
      if (next.variant !== undefined) variant = next.variant;
      if (next.case !== undefined) dataCase = next.case;
      if (next.links !== undefined) linkStyle = next.links;
      Object.assign(toggles, next.toggles ?? {});
      bar.sync();
      render();
      bar.measure(card.hidden ? undefined : card);
    },
    /** Content height the card wants, against the cap a phone gives it. */
    measure(): { wanted: number; cap: number; over: number; sheet: boolean } {
      const cap = Math.round(window.innerHeight * 0.4);
      const wanted = card.scrollHeight;
      return {
        wanted,
        cap,
        over: wanted - cap,
        sheet: window.matchMedia('(max-width: 700px), (max-height: 500px)').matches,
      };
    },
    hideBar(): void {
      bar.root.hidden = true;
    },
  };

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const order: Variant[] = ['A', 'B', 'C'];
    const at = order.indexOf(variant);
    variant = order[(at + (event.key === 'ArrowRight' ? 1 : 2)) % 3] ?? 'A';
    bar.sync();
    render();
  });

  function buildBar(): { root: HTMLElement; sync: () => void; measure: (el?: HTMLElement) => void } {
    const root = document.createElement('div');
    root.className = 'pbar';

    const label = span('pbar-label');
    const prev = barButton('←', () => step(-1));
    const next = barButton('→', () => step(1));
    const caseButton = barButton('', () => {
      dataCase = CASES[(CASES.indexOf(dataCase) + 1) % CASES.length] ?? 'today';
      sync();
      render();
    });
    caseButton.classList.add('pbar-wide');
    const linksButton = barButton('', () => {
      linkStyle = LINK_STYLES[(LINK_STYLES.indexOf(linkStyle) + 1) % LINK_STYLES.length] ?? 'bare';
      sync();
      render();
    });
    linksButton.classList.add('pbar-wide');

    const toggleRow = document.createElement('span');
    toggleRow.className = 'pbar-toggles';
    const toggleButtons = (['subjects', 'statusAlways', 'isbn'] as const).map((key) => {
      const button = barButton(key === 'statusAlways' ? 'status' : key, () => {
        toggles[key] = !toggles[key];
        sync();
        render();
      });
      button.dataset['toggle'] = key;
      toggleRow.append(button);
      return [key, button] as const;
    });

    const ms = document.createElement('input');
    ms.type = 'number';
    ms.className = 'pbar-ms';
    ms.value = String(duration);
    ms.step = '20';
    ms.addEventListener('input', () => {
      const value = Number(ms.value);
      if (Number.isFinite(value) && value >= 0) duration = value;
      render();
    });

    const readout = span('pbar-readout');

    function step(by: number): void {
      const order: Variant[] = ['A', 'B', 'C'];
      variant = order[(order.indexOf(variant) + by + 3) % 3] ?? 'A';
      sync();
      render();
    }

    function sync(): void {
      label.textContent = `${variant} — ${VARIANT_NAMES[variant]}`;
      caseButton.textContent = CASE_NAMES[dataCase];
      linksButton.textContent = `links: ${LINK_NAMES[linkStyle]}`;
      for (const [key, button] of toggleButtons) button.dataset['on'] = String(toggles[key]);
    }

    /**
     * The instrument this prototype exists for.
     *
     * #91 capped the sheet at ~40vh and #89/#102 kept adding rows without ever
     * seeing the number. `scrollHeight` is the content the card *wants*; the cap
     * is what a phone gives it. Everything past the difference is below the fold
     * on the device the card is most used on.
     */
    function measure(el?: HTMLElement): void {
      if (el === undefined) {
        readout.textContent = 'click a book';
        readout.dataset['over'] = 'false';
        return;
      }
      const cap = Math.round(window.innerHeight * 0.4);
      const wanted = el.scrollHeight;
      const sheet = window.matchMedia('(max-width: 700px), (max-height: 500px)').matches;
      if (!sheet) {
        readout.textContent = `desktop card ${String(Math.round(el.getBoundingClientRect().height))}px (no cap)`;
        readout.dataset['over'] = 'false';
        return;
      }
      const over = wanted - cap;
      readout.textContent =
        over > 0
          ? `${String(wanted)}px wanted / ${String(cap)}px cap — ${String(over)}px below the fold`
          : `${String(wanted)}px wanted / ${String(cap)}px cap — fits`;
      readout.dataset['over'] = String(over > 0);
    }

    root.append(prev, label, next, caseButton, linksButton, toggleRow, ms, readout);
    sync();
    return { root, sync, measure };
  }

  return { show, hide };
}

/* ------------------------------------------------------------------ content */

/**
 * The eight blocks, in #89's order as #102 revised it:
 * cover / title / author / reading / tags / object / subjects / links.
 */
function blocks(
  book: Enriched,
  variant: Variant,
  toggles: Toggles,
  style: LinkStyle,
): HTMLElement[] {
  const head = variant === 'A' ? coverBlockA(book) : undefined;
  const cover = book.cover === undefined ? undefined : coverImage(book);

  const text: HTMLElement[] = [
    heading(book.title),
    book.author === undefined ? undefined : line('p', 'pauthor', book.author),
    line('p', 'preading', readingLine(book, toggles)),
    book.tags.length === 0 ? undefined : line('p', 'ptags', book.tags.join(' · ')),
    objectLine(book, toggles),
    !toggles.subjects || book.subjects === undefined
      ? undefined
      : line('p', 'psubjects', book.subjects),
    linksRow(book, style),
  ].filter(present);

  if (variant === 'A') return [head, ...text].filter(present);

  if (variant === 'B') {
    // Two column: the cover leads *horizontally*, so it costs width not height.
    // A coverless book collapses to one column — #89's two-shapes property.
    if (cover === undefined) return text;
    const rail = document.createElement('div');
    rail.className = 'prail';
    rail.append(cover);
    const column = document.createElement('div');
    column.className = 'pcolumn';
    column.append(...text);
    const row = document.createElement('div');
    row.className = 'prow';
    row.append(rail, column);
    return [row];
  }

  // C — editorial: cover, title and author share a header row; everything else
  // drops to footnote rank below it.
  const header = document.createElement('div');
  header.className = 'pheader';
  const titles = document.createElement('div');
  titles.append(...text.slice(0, book.author === undefined ? 1 : 2));
  if (cover !== undefined) header.append(cover);
  header.append(titles);
  return [header, ...text.slice(book.author === undefined ? 1 : 2)];
}

function coverBlockA(book: Enriched): HTMLElement | undefined {
  return book.cover === undefined ? undefined : coverImage(book);
}

function coverImage(book: Enriched): HTMLElement {
  const node = document.createElement('img');
  node.className = 'pcover';
  const src = book.cover ?? '';
  node.src = src.startsWith('/') ? src : `/${src}`;
  node.alt = `Cover of ${book.title}`;
  node.loading = 'lazy';
  return node;
}

function heading(title: string): HTMLElement {
  return line('h2', 'ptitle', title);
}

/**
 * #89 decision 5: the status word leads, always — 19 of 41 real books are read
 * with no dates and no rating, and the group would otherwise be empty on 46% of
 * the library. The toggle draws the overruled recommendation (the word only
 * when the line would be empty) so the difference is visible.
 */
function readingLine(book: Enriched, toggles: Toggles): string {
  const rest: string[] = [];
  if (book.finished !== undefined) rest.push(`finished ${book.finished}`);
  else if (book.started !== undefined) rest.push(`started ${book.started}`);
  if (book.rating !== undefined) rest.push('★'.repeat(book.rating));
  const lead =
    toggles.statusAlways || rest.length === 0 || book.status !== 'read' ? [book.status] : [];
  return [...lead, ...rest].join(' · ');
}

/**
 * #102's catalogue order, one line, dropped whole when all five are absent
 * (5 of 41 today). `published` is stored verbatim and rendered as a year — the
 * first four-digit run, or verbatim when there is none, so the card never hides
 * what the note says.
 */
function objectLine(book: Enriched, toggles: Toggles): HTMLElement | undefined {
  const parts: string[] = [];
  if (book.publisher !== undefined) parts.push(book.publisher);
  if (book.published !== undefined) parts.push(year(book.published));
  if (book.pages !== undefined) parts.push(`${String(book.pages)} pages`);
  if (book.binding !== undefined) parts.push(book.binding);
  if (toggles.isbn && book.isbn !== undefined) parts.push(book.isbn);
  return parts.length === 0 ? undefined : line('p', 'pobject', parts.join(' · '));
}

function year(published: string): string {
  return /\d{4}/.exec(published)?.[0] ?? published;
}

/**
 * #98: max three marks — Open Library, Google, Apple, in #97's provider order.
 * O'Reilly is recorded and never rendered (#94: its id 403s either way). A book
 * with no identifier at all gets one text search link instead, which is what
 * carries the distinction in form rather than in a tooltip.
 *
 * The row always renders: every book has a title, so every book has a link.
 *
 * The three variants disagree about the one thing #101 could not close — what a
 * *sighted touch* user sees. A: every mark carries visible text. B: marks bare,
 * so Apple's is wordless (the problem drawn honestly). C: no marks at all.
 */
function linksRow(book: Enriched, style: LinkStyle): HTMLElement {
  const row = document.createElement('div');
  row.className = 'plinks';

  const links: { name: string; href: string; mark: 'ol' | 'google' | 'apple' }[] = [];
  if (book.isbn !== undefined)
    links.push({
      name: 'Open Library',
      href: `https://openlibrary.org/isbn/${book.isbn}`,
      mark: 'ol',
    });
  else if (book.openlibraryOlid !== undefined)
    links.push({
      name: 'Open Library',
      href: `https://openlibrary.org/books/${book.openlibraryOlid}`,
      mark: 'ol',
    });
  if (book.googleVolumeId !== undefined)
    links.push({
      name: 'Google Books',
      href: `https://books.google.com/books?id=${book.googleVolumeId}`,
      mark: 'google',
    });
  if (book.appleTrackId !== undefined)
    links.push({
      name: 'Apple Books',
      href: `https://books.apple.com/book/id${book.appleTrackId}`,
      mark: 'apple',
    });

  if (links.length === 0) {
    /*
     * #98 chose Google against a recommendation of Open Library; #105 reverted
     * it on two grounds — `books.google.com/books?q=` 302s to general Google
     * Search, and a book Google does not hold returns ten confident wrong books
     * with no notice, where Open Library says it matched nothing.
     */
    const query = encodeURIComponent(`${book.title} ${book.author ?? ''}`.trim());
    const search = anchor(
      `https://openlibrary.org/search?q=${query}`,
      'Search Open Library for this book (opens in a new tab)',
    );
    search.className = 'plink plink--text plink--search';
    search.textContent = 'Search Open Library';
    row.append(search);
    return row;
  }

  for (const link of links) {
    /*
     * Open Library has no mark to render whatever the style: #103 found no
     * published guideline at all, so it is a text name in every row that has
     * marks in it. Google's licensed artwork is a *button carrying its own
     * words*, so it is never the wordless one. Apple's icon is.
     */
    const asText = style === 'text' || link.mark === 'ol';
    const node = anchor(link.href, `${link.name} (opens in a new tab)`);
    node.className = asText ? 'plink plink--text' : 'plink';
    if (asText) {
      // #101: a text link's visible text is its accessible name. Overriding it
      // risks a WCAG 2.5.3 (Label in Name) mismatch, so the aria-label goes.
      node.removeAttribute('aria-label');
      node.textContent = link.name;
      row.append(node);
      continue;
    }
    node.append(mark(link.mark));
    /*
     * LOCKED IN #92, and it reverses part of #101: `title` is the tooltip *and*
     * the accessible name, with no `aria-label` beside it.
     *
     * Dropping `aria-label` is what makes it legal — #101 struck `title`
     * because the two together double-announce, and the accessible-name
     * computation falls back to `title` when nothing else names the element.
     * Accepted with it: `title` never fires on touch, so Apple's icon — the one
     * mark carrying no words of its own — has no label for a sighted touch
     * user. Google's licensed button carries its words in the artwork and Open
     * Library is a text link, so the gap is that one control.
     */
    node.removeAttribute('aria-label');
    node.title = link.name;
    // Google's mark is the button, and the button has words in it either way.
    const word = link.mark === 'google' ? 'Google Preview' : link.name;
    const labelled =
      style === 'labelled' ||
      link.mark === 'google' ||
      (style === 'apple-labelled' && link.mark === 'apple');
    if (labelled) node.append(span('plink-word', word));
    row.append(node);
  }
  return row;
}

function anchor(href: string, label: string): HTMLAnchorElement {
  const node = document.createElement('a');
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  node.setAttribute('aria-label', label);
  return node;
}

/**
 * PLACEHOLDER artwork at the footprint the licensed mark would occupy. #98
 * leaves vendoring the real SVGs open; this answers layout, not licensing.
 */
function mark(kind: 'ol' | 'google' | 'apple'): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pmark');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  shape.setAttribute('x', '1');
  shape.setAttribute('y', '1');
  shape.setAttribute('width', '18');
  shape.setAttribute('height', '18');
  shape.setAttribute('rx', kind === 'apple' ? '4.5' : '2');
  shape.setAttribute('fill', 'currentColor');
  shape.setAttribute('opacity', '0.55');
  svg.append(shape);
  return svg;
}

/* --------------------------------------------------------------- data cases */

function applyCase(book: LibraryBook, dataCase: Case): Enriched {
  if (dataCase === 'today') return { ...book };
  if (dataCase === 'no-isbn') {
    const { isbn: _drop, ...rest } = book;
    return { ...rest };
  }
  if (dataCase === 'bare') {
    const {
      isbn: _i,
      author: _a,
      cover: _c,
      pages: _p,
      started: _s,
      finished: _f,
      rating: _r,
      binding: _b,
      ...rest
    } = book;
    return { ...rest, status: 'read', tags: [] };
  }
  return {
    ...book,
    publisher: PUBLISHERS[hash(book.id) % PUBLISHERS.length] ?? 'Penguin',
    published: `${String(1998 + (hash(book.id) % 27))}-04-12`,
    // #97 caps subjects at 5, comma-joined.
    subjects: SUBJECTS.slice(hash(book.id) % 3, (hash(book.id) % 3) + 5).join(', '),
    googleVolumeId: 'zyTCAlFPjgYC',
    appleTrackId: '1234567890',
    openlibraryOlid: 'OL7353617M',
  };
}

const PUBLISHERS = [
  'Penguin Books',
  'Harvard University Press',
  "O'Reilly Media",
  'Bloomsbury Publishing',
  'Farrar, Straus and Giroux',
];

const SUBJECTS = [
  'Economics',
  'Business & Economics',
  'History',
  'Technology & Engineering',
  'Computers',
  'Social Science',
  'Biography & Autobiography',
];

function hash(id: string): number {
  let total = 0;
  for (const ch of id) total = (total * 31 + ch.charCodeAt(0)) % 100_000;
  return total;
}

/* ------------------------------------------------------------------- motion */

/**
 * #91: the drag starts on the pill only, so the scrolling body never arbitrates
 * against it. Inert above the breakpoint — a grabber depicts a drag toward an
 * anchored edge, and the desktop card has none.
 */
function mountDrag(card: HTMLElement, pill: HTMLElement, onDismiss: () => void): void {
  const sheet = window.matchMedia('(max-width: 700px), (max-height: 500px)');
  let from: number | undefined;

  pill.addEventListener('pointerdown', (event) => {
    if (!sheet.matches) return;
    from = event.clientY;
    pill.setPointerCapture(event.pointerId);
    card.classList.add('is-dragging');
  });
  pill.addEventListener('pointermove', (event) => {
    if (from === undefined) return;
    card.style.setProperty('--pcard-drag', `${String(Math.max(0, event.clientY - from))}px`);
  });
  const end = (event: PointerEvent): void => {
    if (from === undefined) return;
    const moved = event.clientY - from;
    from = undefined;
    card.classList.remove('is-dragging');
    card.style.removeProperty('--pcard-drag');
    if (moved > Math.min(80, card.getBoundingClientRect().height * 0.3)) onDismiss();
  };
  pill.addEventListener('pointerup', end);
  pill.addEventListener('pointercancel', end);
}

/* ---------------------------------------------------------------- utilities */

function line(tag: string, className: string, content: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

function barButton(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

function span(className: string, content?: string): HTMLElement {
  const node = document.createElement('span');
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function present(node: HTMLElement | undefined): node is HTMLElement {
  return node !== undefined;
}

function isVariant(value: string): value is Variant {
  return value === 'A' || value === 'B' || value === 'C';
}

function styleTag(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = CSS;
  return style;
}

const CSS = `
.pcard {
  position: absolute;
  z-index: 20;
  color: #f2e8dc;
  font: 400 16px/1.4 system-ui, sans-serif;
  background: rgba(26, 22, 19, 0.86);
  backdrop-filter: blur(14px);
  box-shadow: 0 1.5rem 3rem rgba(0, 0, 0, 0.45);
  --pcard-duration: 220ms;
}
.pcard[hidden] { display: none; }

/* Desktop: the corner card, unchanged in kind, plus #91's x. */
.pcard {
  right: clamp(1rem, 4vw, 2.5rem);
  bottom: clamp(1rem, 4vw, 2.5rem);
  width: min(20rem, calc(100vw - 2rem));
  max-height: min(28rem, calc(100vh - 2rem));
  overflow-y: auto;
  padding: 1.15rem 1.25rem;
  border: 1px solid rgba(242, 232, 220, 0.14);
  border-radius: 0.85rem;
}
.pclose {
  position: absolute;
  top: 0.4rem;
  right: 0.5rem;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0;
  border: 0;
  background: none;
  color: #a89684;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
.pclose:hover { color: #f2e8dc; }
.pclose-pill { display: none; }

.pcard-live {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.ptitle { margin: 0; font-size: 1.05rem; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.pauthor { margin: 0.2rem 0 0; font-size: 0.9rem; color: #c9b8a4; }
.preading { margin: 0.6rem 0 0; font-size: 0.8rem; color: #a89684; }
.ptags { margin: 0.35rem 0 0; font-size: 0.75rem; color: #857361; }
.pobject { margin: 0.6rem 0 0; font-size: 0.75rem; color: #857361; }
.psubjects { margin: 0.25rem 0 0; font-size: 0.75rem; color: #6f6051; }
.pcover { display: block; width: 4.5rem; max-width: 100%; height: auto; border-radius: 0.2rem; box-shadow: 0 0.4rem 1rem rgba(0,0,0,0.5); }

.plinks { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.85rem; margin-top: 0.7rem; }
.plink { display: inline-flex; align-items: center; gap: 0.3rem; color: #c9b8a4; text-decoration: none; font-size: 0.75rem; min-height: 2.75rem; }
.plink--text { text-decoration: underline; text-underline-offset: 0.2em; }
.pmark { width: 1.25rem; height: 1.25rem; flex: none; }
.plink-word { white-space: nowrap; }

/* A — cover anchor: the cover leads at full card width. */
.pcard[data-variant='A'] .pcover { width: 100%; max-width: 9rem; margin-bottom: 0.8rem; }
.pcard[data-variant='A'] .ptitle { font-size: 1.15rem; }

/* B — two column: the cover costs width, not height. */
.prow { display: flex; gap: 0.85rem; align-items: flex-start; }
.prail { flex: none; }
.pcolumn { min-width: 0; flex: 1; }
.pcard[data-variant='B'] .pcover { width: 4.25rem; }

/* C — editorial: cover, title and author share a header row. */
.pheader { display: flex; gap: 0.7rem; align-items: flex-start; }
.pheader > div { min-width: 0; }
.pcard[data-variant='C'] .pcover { width: 2.75rem; }
.pcard[data-variant='C'] .ptitle { font-size: 1rem; }
.pcard[data-variant='C'] .pobject,
.pcard[data-variant='C'] .psubjects,
.pcard[data-variant='C'] .ptags { font-size: 0.72rem; }
.pcard[data-variant='C'] .preading { margin-top: 0.5rem; }

/* The sheet. #91's query, both halves: a landscape phone must not get the card. */
@media (max-width: 700px), (max-height: 500px) {
  .pcard {
    right: 0; left: 0; bottom: 0;
    width: auto;
    max-height: 40vh;
    padding: 1.4rem 1.1rem 1rem;
    border: 0;
    border-top: 1px solid rgba(242, 232, 220, 0.14);
    border-radius: 0.9rem 0.9rem 0 0;
    transform: translateY(var(--pcard-drag, 0px));
    transition: transform var(--pcard-duration) ease;
  }
  .pcard.is-entering { transform: translateY(100%); }
  .pcard.is-dragging { transition: none; }
  .pclose {
    top: 0; right: 0; left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 1.6rem;
    touch-action: none;
  }
  .pclose-x { display: none; }
  .pclose-pill { display: block; width: 2.25rem; height: 0.25rem; border-radius: 999px; background: rgba(242,232,220,0.32); }
}

/* #101: only the unattended motions were ever transitions, so this leaves
   follow-the-finger alone and takes the slide and the snap-back. */
@media (prefers-reduced-motion: reduce) {
  .pcard { transition: none; }
}

.pbar {
  position: fixed; z-index: 50; left: 50%; bottom: 0.5rem;
  transform: translateX(-50%);
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem;
  max-width: calc(100vw - 1rem);
  padding: 0.35rem 0.5rem;
  border-radius: 999px;
  background: #f2e8dc; color: #1a1613;
  font: 500 11px/1.2 ui-monospace, monospace;
  box-shadow: 0 0.5rem 1.5rem rgba(0,0,0,0.5);
}
.pbar[hidden] { display: none; }
.pbar button { border: 0; border-radius: 999px; padding: 0.3rem 0.55rem; background: rgba(26,22,19,0.1); color: inherit; font: inherit; cursor: pointer; }
.pbar button[data-on='true'] { background: #1a1613; color: #f2e8dc; }
.pbar-label { padding: 0 0.35rem; }
.pbar-ms { width: 3.5rem; border: 0; border-radius: 999px; padding: 0.3rem 0.4rem; background: rgba(26,22,19,0.1); font: inherit; }
.pbar-readout { padding: 0.3rem 0.55rem; border-radius: 999px; background: #1d7a3d; color: #fff; }
.pbar-readout[data-over='true'] { background: #b3261e; }
.pbar-toggles { display: inline-flex; gap: 0.25rem; }
`;
