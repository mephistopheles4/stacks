/**
 * The room's loading screen (#593, spec S3), as the prototype dressed it.
 *
 * The baked room is a GLB of about 3 MB and some 50 textures beside it,
 * and without a cover the visitor watches the bookcase float in the dark, then the room arrive
 * black and its surfaces pop in one by one as their textures land. The screen covers the page
 * until the last texture is in, and shows how far along it is.
 */

export interface LoadState {
  /** Bytes of the GLB read so far, and its size if the server said (0 when it did not). */
  readonly glbLoaded: number;
  readonly glbTotal: number;
  readonly glbDone: boolean;
  /** Textures in, and textures asked for: known only once the GLB is parsed. */
  readonly texLoaded: number;
  readonly texTotal: number;
}

/** How long the full bar holds, and how long the cover takes to dissolve into the room. */
const HOLD_MS = 350;
const FADE_MS = 1400;

/** The GLB's share of the bar: the rest is the textures, which arrive after it. */
const GLB_SHARE = 0.5;

/** How far along the room is, 0 to 1; whole only when the GLB and every texture are in. */
export function loadFraction(s: LoadState): number {
  const glb = s.glbDone ? 1 : s.glbTotal > 0 ? Math.min(s.glbLoaded / s.glbTotal, 0.99) : 0;
  if (!s.glbDone) return GLB_SHARE * glb;
  if (s.texTotal === 0) return 1;
  const tex = Math.min(s.texLoaded / s.texTotal, 1);
  return GLB_SHARE + (1 - GLB_SHARE) * tex;
}

export interface LoadingScreen {
  update(state: LoadState): void;
  /** Fades the screen out and removes it. */
  done(): void;
}

/** The site's theme (pages/index.astro): its ground, its ink, and the brand mark's colours. */
const THEME = {
  ground: '#1a1613',
  ink: '#f2e8dc',
  inkDim: '#a89684',
  paper: '#EBDCC4',
  red: '#B4472E',
  amber: '#C98A2B',
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', 'Roboto Mono', monospace",
};

/** The stacks mark (assets/stacks-mark-inverse.svg), drawn here: the site may not import the
 * file as markup into a module the root typecheck reads. */
function mark(size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const bars: [number, number, number, string][] = [
    [7, 12, 50, THEME.paper],
    [7, 26.5, 34, THEME.red],
    [45, 26.5, 12, THEME.amber],
    [7, 41, 43, THEME.paper],
  ];
  for (const [x, y, w, fill] of bars) {
    const r = document.createElementNS(ns, 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: 11, rx: 5.5, fill })) {
      r.setAttribute(k, String(v));
    }
    svg.append(r);
  }
  return svg;
}

/**
 * The cover, built here rather than in markup: it exists only while a room loads, so a page
 * drawn with `?shelf` or `?solo` never has one (spec S3.5). Styled through the CSSOM, which the site's CSP
 * allows where an inline `style` attribute would not; dressed as the page's own header is.
 */
export function showLoadingScreen(): LoadingScreen {
  const cover = document.createElement('div');
  cover.setAttribute('role', 'status');
  // How the gates tell this cover from the page's own status line: it must never outlive a load.
  cover.setAttribute('data-loading-screen', '');
  cover.setAttribute('aria-live', 'polite');
  Object.assign(cover.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    background: THEME.ground,
    color: THEME.ink,
    fontFamily: THEME.sans,
  });
  const brand = document.createElement('div');
  Object.assign(brand.style, { display: 'flex', alignItems: 'center', gap: '0.4rem' });
  const word = document.createElement('span');
  word.textContent = 'stacks';
  Object.assign(word.style, {
    fontFamily: THEME.mono,
    fontWeight: '500',
    fontSize: '1.75rem',
    letterSpacing: '-0.02em',
  });
  brand.append(mark(36), word);
  const label = document.createElement('div');
  label.textContent = 'Lighting the room…';
  Object.assign(label.style, { fontSize: '0.875rem', color: THEME.inkDim });
  const track = document.createElement('div');
  Object.assign(track.style, {
    width: 'min(220px, 60vw)',
    height: '4px',
    borderRadius: '2px',
    background: 'rgba(168, 150, 132, 0.2)',
    overflow: 'hidden',
  });
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    width: '100%',
    height: '100%',
    borderRadius: '2px',
    background: THEME.amber,
    transform: 'scaleX(0)',
    transformOrigin: 'left',
    transition: 'transform 200ms linear',
  });
  track.append(bar);
  const percent = document.createElement('div');
  Object.assign(percent.style, {
    fontFamily: THEME.mono,
    fontSize: '0.75rem',
    color: THEME.inkDim,
    fontVariantNumeric: 'tabular-nums',
  });
  percent.textContent = '0%';
  cover.append(brand, label, track, percent);
  document.body.append(cover);

  let shown = 0;
  return {
    update(state) {
      // never backwards: the textures' count is learnt late and could pull the bar back
      shown = Math.max(shown, loadFraction(state));
      bar.style.transform = `scaleX(${shown.toFixed(3)})`;
      percent.textContent = `${Math.round(shown * 100)}%`;
    },
    done() {
      bar.style.transform = 'scaleX(1)';
      percent.textContent = '100%';
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        cover.remove();
        return;
      }
      // held a moment first: the room's first frames upload its textures and can stutter, and
      // the full bar is worth a beat; then a slow dissolve into the room
      cover.style.transition = `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      setTimeout(() => (cover.style.opacity = '0'), HOLD_MS);
      cover.addEventListener('transitionend', (e) => {
        // the bar's own transition bubbles up here too, and must not cut the fade short
        if (e.target === cover && e.propertyName === 'opacity') cover.remove();
      });
      setTimeout(() => cover.remove(), HOLD_MS + FADE_MS + 500); // a hidden tab never ends it
    },
  };
}

/**
 * The loading screen's own rule, apart from any DOM (spec S3.2, S3.3): it lifts when every texture
 * the walk asked for has been applied **and** the walk is done, never on a file's fetch. A texture
 * that failed still settles, so no failure holds the screen up. `ask` before a load starts, `settle`
 * when it ends either way, `walked` once the last has been asked for.
 */
export interface Settler {
  ask(): void;
  settle(): void;
  walked(): void;
  /** Textures applied or failed, and asked for: the bar's count. */
  readonly counts: () => { settled: number; asked: number };
}

export function createSettler(onSettled: () => void): Settler {
  let asked = 0;
  let settled = 0;
  let walkDone = false;
  let lifted = false;
  const check = (): void => {
    if (walkDone && !lifted && settled === asked) {
      lifted = true;
      onSettled();
    }
  };
  return {
    ask: () => {
      asked += 1;
    },
    settle: () => {
      settled += 1;
      check();
    },
    walked: () => {
      walkDone = true;
      check();
    },
    counts: () => ({ settled, asked }),
  };
}
