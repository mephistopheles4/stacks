/**
 * PROTOTYPE — THROWAWAY. Do not merge to `main`.
 *
 * The page-level attribution surface, mounted on the *real* page so it is judged
 * against the lit bookcase, the header lockup and #91's bottom sheet rather than
 * in a vacuum. Ticket: "What does the page-level attribution surface carry, and
 * how is it drawn?" (#106).
 *
 * Run it: `pnpm dev`, then `/?attribproto=bl` (or `header`, `tr`). Add
 * `&cardproto=C` to have the card in the picture too — the collision this has to
 * survive is with #92's locked card, not with today's.
 *
 * What it is here to answer:
 *
 * 1. **Which corner is even available.** The page has four and three are spoken
 *    for: the header owns top-left, the desktop card owns bottom-right, and on a
 *    phone #91's full-bleed sheet owns the whole bottom edge whenever a card is
 *    open. `measure()` reports the overlap in pixels rather than by eye.
 * 2. **What it carries** — Google's graphic alone, plus Apple's credit line, or
 *    plus a four-provider credits line that nobody requires.
 * 3. **Whether it reads as a credit or as an endorsement.** Under the header it
 *    is one lockup and no new corner; it also puts "powered by Google" directly
 *    beneath the site's own wordmark, which says something different.
 *
 * ⚠️ **The Google graphic here is a placeholder at an ASSUMED footprint.** The
 * real `books.google.com/googlebooks/images/poweredby.png` has not been fetched
 * and its pixel dimensions are not known to this session — #103 only recorded
 * that the URL returns 200. `GRAPHIC` below is a guess, adjustable from the bar,
 * and every number this prototype prints inherits that. Layout sensitivity is
 * what it answers; the artwork is not.
 */

type Place = 'header' | 'bl' | 'tr' | 'auto';
type Content = 'google' | 'apple' | 'all' | 'row';

const PLACES: Place[] = ['header', 'bl', 'tr', 'auto'];
const PLACE_NAMES: Record<Place, string> = {
  header: 'under the header — one lockup, no new corner',
  bl: 'bottom-left — the colophon corner (the owner’s choice)',
  tr: 'top-right — the free corner on desktop',
  auto: 'bottom-left above #91’s breakpoint, under the header below it',
};

const CONTENTS: Content[] = ['google', 'apple', 'all', 'row'];
const CONTENT_NAMES: Record<Content, string> = {
  google: "Google's graphic alone (all that is owed if Apple's line is not)",
  apple: "+ Apple's credit line (#104 assumed this rides here)",
  all: '+ a four-provider credits line (manners, not compliance)',
  row: 'the graphic, then an “Attribution” link beside it (the owner’s shape)',
};

/**
 * ASSUMED, not measured — see the header comment. Adjustable from the bar so the
 * sensitivity of every placement to this number is visible rather than hidden.
 */
const GRAPHIC = { width: 144, height: 26 };

/**
 * Apple's credit line, constructed by §7.1's governing sentence rather than
 * copied from its badge-scoped example:
 *
 *   "listing all the Apple trademarks used in your communication. List only the
 *    trademarks actually used in your materials."
 *
 * #92 locked the Apple Books **icon**, not the badge, and §7.1 publishes no
 * icon variant — so the Apple-logo sentence of the badge variant is dropped and
 * only the service mark is left. If the vendored artwork turns out to carry the
 * Apple logo, the first sentence comes back.
 */
const APPLE_CREDIT = 'Apple Books is a service mark of Apple Inc.';

const CREDITS = 'Book data from Open Library, Google Books, Apple Books and O’Reilly.';

interface Measure {
  /** The surface's own box. */
  rect: { x: number; y: number; width: number; height: number };
  /** Pixels of the surface hidden by the card/sheet, 0 when nothing is open. */
  overlap: number;
  /**
   * Pixels of the surface landing on the header lockup.
   *
   * Added after the first pass measured only the card and reported `tr` as
   * "clear in every state" on a 375px phone — where its text in fact lands on
   * top of "Drag to look around · click a book". The instrument was measuring
   * one collision on a page that has two, which is the failure `?solo` exists
   * to prevent and this rig had just repeated.
   */
  onHeader: number;
  /** Whether the surface is off the viewport on any side. */
  clipped: boolean;
  sheet: boolean;
}

/** Mounted by boot.ts when `?attribproto` is present. */
export function mountAttribPrototype(initial: string): void {
  let place: Place = isPlace(initial) ? initial : 'bl';
  let content: Content = 'apple';
  let graphicHeight = GRAPHIC.height;

  document.head.append(styleTag());

  const surface = document.createElement('div');
  surface.className = 'pattr';

  const graphic = document.createElement('span');
  graphic.className = 'pattr-graphic';
  graphic.setAttribute('role', 'img');
  graphic.setAttribute('aria-label', 'powered by Google');
  graphic.textContent = 'powered by Google';

  const appleLine = document.createElement('p');
  appleLine.className = 'pattr-line';
  appleLine.textContent = APPLE_CREDIT;

  const creditsLine = document.createElement('p');
  creditsLine.className = 'pattr-line pattr-credits';
  creditsLine.textContent = CREDITS;

  /*
   * The owner's shape: the graphic stays *displayed* — Google's clause is not
   * satisfiable behind a click, which is what #104 settled — and a link beside
   * it carries everything longer. Interactive, so unlike the text-only variants
   * a collision with the sheet is a **stolen tap** rather than hidden text.
   */
  const link = document.createElement('a');
  link.className = 'pattr-link';
  link.href = '/attribution';
  link.textContent = 'Attribution';

  const bar = buildBar();
  document.body.append(bar.root);

  function render(): void {
    surface.dataset['place'] = place;
    surface.style.setProperty('--pattr-w', `${String(Math.round(graphicHeight * (GRAPHIC.width / GRAPHIC.height)))}px`);
    surface.style.setProperty('--pattr-h', `${String(graphicHeight)}px`);

    surface.dataset['content'] = content;
    const parts: HTMLElement[] = [graphic];
    if (content === 'apple' || content === 'all') parts.push(appleLine);
    if (content === 'all') parts.push(creditsLine);
    if (content === 'row') parts.push(link);
    surface.replaceChildren(...parts);

    /*
     * `header` is not a corner of its own: it appends to the existing lockup, so
     * it inherits the header's offsets, its `pointer-events: none` and its clear
     * space instead of restating any of them. The corner placements live on
     * <body>. `auto` is the header's child too — a corner element cannot become
     * a flow child of the header in CSS alone, and the header is the placement
     * the small viewport needs.
     */
    const inHeader = place === 'header' || (place === 'auto' && sheetQuery().matches);
    const host = inHeader ? document.querySelector('header') : document.body;
    (host ?? document.body).append(surface);
    bar.sync();
  }

  render();

  (window as unknown as { __attribproto?: unknown }).__attribproto = {
    set(next: { place?: Place; content?: Content; graphicHeight?: number }): void {
      if (next.place !== undefined) place = next.place;
      if (next.content !== undefined) content = next.content;
      if (next.graphicHeight !== undefined) graphicHeight = next.graphicHeight;
      render();
    },
    measure(): Measure {
      const box = surface.getBoundingClientRect();
      const card = document.getElementById('book-card');
      const open = card !== null && !card.hidden;
      const other = open && card !== null ? card.getBoundingClientRect() : undefined;
      return {
        rect: {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        },
        overlap: other === undefined ? 0 : Math.round(overlapArea(box, other)),
        onHeader: Math.round(headerOverlap(surface, box)),
        clipped:
          box.left < 0 ||
          box.top < 0 ||
          box.right > window.innerWidth ||
          box.bottom > window.innerHeight,
        sheet: window.matchMedia('(max-width: 700px), (max-height: 500px)').matches,
      };
    },
    hideBar(): void {
      bar.root.hidden = true;
    },
  };

  function buildBar(): { root: HTMLElement; sync: () => void } {
    const root = document.createElement('div');
    root.className = 'pattr-bar';

    const placeButtons = PLACES.map((value) =>
      button(value, () => {
        place = value;
        render();
      }),
    );
    const contentButtons = CONTENTS.map((value) =>
      button(value, () => {
        content = value;
        render();
      }),
    );

    const height = document.createElement('input');
    height.type = 'number';
    height.className = 'pattr-bar-n';
    height.value = String(graphicHeight);
    height.addEventListener('input', () => {
      const next = Number(height.value);
      if (Number.isFinite(next) && next > 4) {
        graphicHeight = next;
        render();
      }
    });

    const readout = document.createElement('span');
    readout.className = 'pattr-bar-readout';

    root.append(
      label('place'),
      group(placeButtons),
      label('shows'),
      group(contentButtons),
      label('graphic px'),
      height,
      readout,
    );

    return {
      root,
      sync(): void {
        for (const [index, node] of placeButtons.entries())
          node.dataset['on'] = String(PLACES[index] === place);
        for (const [index, node] of contentButtons.entries())
          node.dataset['on'] = String(CONTENTS[index] === content);
        const box = surface.getBoundingClientRect();
        const card = document.getElementById('book-card');
        const hidden =
          card === null || card.hidden ? 0 : Math.round(overlapArea(box, card.getBoundingClientRect()));
        const onHeader = Math.round(headerOverlap(surface, box));
        readout.dataset['over'] = String(hidden > 0 || onHeader > 0);
        readout.textContent =
          hidden > 0
            ? `${String(hidden)}px² behind the card`
            : onHeader > 0
              ? `${String(onHeader)}px² on the lockup`
              : `${String(Math.round(box.width))}×${String(Math.round(box.height))}, clear`;
        root.title = `${PLACE_NAMES[place]} · ${CONTENT_NAMES[content]}`;
      },
    };
  }
}

/**
 * How much of the surface lands on the header's own two lines. Zero by
 * construction when the surface is *inside* the header — it is then a flow
 * sibling of the caption, not something on top of it — so this only ever fires
 * for a corner placement that has drifted into the lockup on a small viewport.
 */
function headerOverlap(surface: HTMLElement, box: DOMRect): number {
  const header = document.querySelector('header');
  if (header === null || header.contains(surface)) return 0;
  let total = 0;
  for (const node of header.children) total += overlapArea(box, node.getBoundingClientRect());
  return total;
}

function sheetQuery(): MediaQueryList {
  return window.matchMedia('(max-width: 700px), (max-height: 500px)');
}

function overlapArea(a: DOMRect, b: DOMRect): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}

function group(children: HTMLElement[]): HTMLElement {
  const node = document.createElement('span');
  node.className = 'pattr-bar-group';
  node.append(...children);
  return node;
}

function label(text: string): HTMLElement {
  const node = document.createElement('span');
  node.className = 'pattr-bar-label';
  node.textContent = text;
  return node;
}

function isPlace(value: string): value is Place {
  return value === 'header' || value === 'bl' || value === 'tr';
}

function styleTag(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = CSS;
  return style;
}

const CSS = `
/*
 * Non-interactive by construction: nothing here is a link, so it can carry the
 * header's own \`pointer-events: none\` and a collision with the sheet becomes
 * occlusion rather than a stolen tap. Google's clause asks for the graphic to be
 * *displayed*; #98's per-book Google mark on the card is what discharges the
 * per-result *link* limb (#104 §2).
 */
.pattr {
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: min(22rem, calc(100vw - 2rem));
  color: #857361;
  font: 400 0.6875rem/1.45 ui-sans-serif, system-ui, sans-serif;
}

/* The placeholder, drawn at the assumed footprint of Google's poweredby.png. */
.pattr-graphic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--pattr-w);
  height: var(--pattr-h);
  flex: none;
  border: 1px dashed rgba(242, 232, 220, 0.28);
  border-radius: 0.15rem;
  color: #a89684;
  font-size: 0.625rem;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.pattr-line { margin: 0; }
.pattr-credits { color: #6f6051; }

/* Under the header: no offsets of its own — the lockup already has them. */
header .pattr { margin-top: 0.85rem; }

body > .pattr {
  position: absolute;
  z-index: 5;
}
body > .pattr[data-place='bl'] {
  bottom: clamp(1rem, 4vw, 2.5rem);
  left: clamp(1rem, 4vw, 2.5rem);
}
body > .pattr[data-place='auto'] {
  bottom: clamp(1rem, 4vw, 2.5rem);
  left: clamp(1rem, 4vw, 2.5rem);
}

/* The owner's shape reads left to right: graphic, then the link beside it. */
.pattr[data-content='row'] {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}

/* A link has to be clickable, so it opts back out of the surface's inertness. */
.pattr-link {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #a89684;
  text-decoration: underline;
  text-underline-offset: 0.2em;
  /* WCAG 2.5.5: a 44px target, on the device #91 made primary. */
  min-height: 2.75rem;
}
.pattr-link:hover { color: #f2e8dc; }
.pattr[data-content='linked-graphic'] { gap: 0; }
body > .pattr[data-place='tr'] {
  top: clamp(1rem, 4vw, 2.5rem);
  right: clamp(1rem, 4vw, 2.5rem);
  align-items: flex-end;
  text-align: right;
}

.pattr-bar {
  position: fixed; z-index: 60; left: 50%; top: 0.5rem;
  transform: translateX(-50%);
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem;
  max-width: calc(100vw - 1rem);
  padding: 0.35rem 0.5rem;
  border-radius: 999px;
  background: #f2e8dc; color: #1a1613;
  font: 500 11px/1.2 ui-monospace, monospace;
  box-shadow: 0 0.5rem 1.5rem rgba(0,0,0,0.5);
}
.pattr-bar[hidden] { display: none; }
.pattr-bar button { border: 0; border-radius: 999px; padding: 0.3rem 0.55rem; background: rgba(26,22,19,0.1); color: inherit; font: inherit; cursor: pointer; }
.pattr-bar button[data-on='true'] { background: #1a1613; color: #f2e8dc; }
.pattr-bar-label { padding: 0 0.35rem; }
.pattr-bar-group { display: inline-flex; gap: 0.25rem; }
.pattr-bar-n { width: 3.5rem; border: 0; border-radius: 999px; padding: 0.3rem 0.4rem; background: rgba(26,22,19,0.1); font: inherit; }
.pattr-bar-readout { padding: 0.3rem 0.55rem; border-radius: 999px; background: #1d7a3d; color: #fff; }
.pattr-bar-readout[data-over='true'] { background: #b3261e; }
`;
