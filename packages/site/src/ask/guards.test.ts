import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two promises the drawer keeps in its glue, which no browser-less test can run,
 * held as reads of the source so moving either is red (integrity lens, C11, C15).
 */
const DIR = 'packages/site/src/ask';
const code = (name: string): string =>
  readFileSync(join(DIR, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

describe('the drawer renders text, never markup (C15)', () => {
  it.each(readdirSync(DIR).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts')))(
    '%s sets no HTML',
    (name) => {
      expect(code(name)).not.toMatch(
        /innerHTML|outerHTML|insertAdjacentHTML|document\.write|set:html/,
      );
    },
  );

  it('Ask.astro uses no set:html either', () => {
    expect(readFileSync(join(DIR, 'Ask.astro'), 'utf8')).not.toContain('set:html');
  });
});

describe('Turnstile loads on the first open and not before (C11)', () => {
  it('calls prepare() once, inside show(), and loads the script nowhere else', () => {
    const drawer = code('drawer.ts');
    expect([...drawer.matchAll(/tokens\.prepare\(\)/g)]).toHaveLength(1);
    const show = /function show\(\): void \{[\s\S]*?\n {2}\}/.exec(drawer)?.[0] ?? '';
    expect(show).toContain('tokens.prepare()');
    expect([...drawer.matchAll(/loadTurnstileScript/g)]).toHaveLength(2); // import + the one load
  });

  it('the component names no preconnect or prefetch to Cloudflare', () => {
    expect(readFileSync(join(DIR, 'Ask.astro'), 'utf8')).not.toMatch(
      /preconnect|dns-prefetch|challenges\.cloudflare/,
    );
  });
});

describe('the text box shrinks as well as grows (S7)', () => {
  it('measures with its transition off, or a deletion can never shrink it', () => {
    const drawer = code('drawer.ts');
    const fit = /function fit\(\): void \{[\s\S]*?\n {2}\}/.exec(drawer)?.[0] ?? '';
    const off = fit.indexOf("style.transition = 'none'");
    const measure = fit.indexOf('scrollHeight');
    const restore = fit.indexOf("style.transition = ''");
    expect(off).toBeGreaterThan(-1);
    expect(off).toBeLessThan(measure);
    expect(restore).toBeGreaterThan(measure);
  });
});

describe('an outside click closes the drawer and nothing else (S7, C9)', () => {
  it('marks the click as taken when it closes the drawer', () => {
    const drawer = code('drawer.ts');
    expect(drawer).toMatch(
      /outside\.up\([^)]*\)[^{]*\{\s*event\.preventDefault\(\);\s*hide\('outside'\);/,
    );
  });

  it('has the shelf honour that mark only when a book is held', () => {
    const boot = readFileSync('packages/site/src/shelf/boot.ts', 'utf8');
    expect(boot).toMatch(/prevented && held\.pickup\?\.held\(\) !== undefined\) return;/);
    expect(readFileSync('packages/site/src/shelf/scene.ts', 'utf8')).toContain(
      'event.defaultPrevented',
    );
  });
});

describe('follow-ups replace the quick questions, and they come back (S7)', () => {
  it('shows follow-ups when there are some and the quick questions otherwise, as text', () => {
    const drawer = code('drawer.ts');
    expect(drawer).toContain('setQuick(result.followUps.length > 0 ? result.followUps : defaults)');
    const set = /function setQuick[\s\S]*?\n {2}\}/.exec(drawer)?.[0] ?? '';
    expect(set).toContain('button.textContent = text');
  });
});

describe('the conversation lives in a page variable and is sent with each question (memory spec D2, C21)', () => {
  const sources = readdirSync(DIR)
    .filter((name) => /\.(ts|astro)$/.test(name) && !name.endsWith('.test.ts'))
    .map((name) => [name, code(name)] as const);

  it.each(sources)('%s touches no storage, cookie or history API', (_name, source) => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./);
    expect(source).not.toMatch(/history\.(pushState|replaceState)|location\.(hash|search)\s*=/);
  });

  it('the drawer sends what memory holds and remembers each reply', () => {
    const drawer = code('drawer.ts');
    expect(drawer).toContain('askLibrary(question, token, memory.recent())');
    expect(drawer).toContain('memory.remember(question, result)');
  });
});

describe('the drawer waits at least as long as the Worker may take (T11)', () => {
  it("puts no abort or timer of its own on the answer request, so the Worker's 30-second deadline decides", () => {
    for (const name of ['client.ts', 'drawer.ts']) {
      const source = code(name);
      expect(source, name).not.toMatch(/AbortController|AbortSignal|signal\s*:/);
      expect(source, name).not.toMatch(/setTimeout/);
    }
  });
});

describe('motion is an addition that reduced motion removes (S7)', () => {
  it('reads prefers-reduced-motion in the drawer, and the style turns every animation off under it', () => {
    expect(code('drawer.ts')).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    const astro = readFileSync(join(DIR, 'Ask.astro'), 'utf8');
    const reduced =
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n {2}\}/.exec(astro)?.[0] ?? '';
    for (const rule of ['.is-entering', '.is-leaving', '.ask-new', '.ask-waiting']) {
      expect(reduced, rule).toContain(rule);
    }
    expect(reduced).toContain('animation: none');
  });

  it('marks new entries and pills, and clears the mark when their animation ends, so reopening replays none', () => {
    const drawer = code('drawer.ts');
    expect(drawer).toContain('ask-${kind} ask-new');
    expect(drawer).toContain("'ask-book ask-new'");
    expect(drawer).toContain("thread.addEventListener('animationend'");
    expect(drawer).toContain("classList.remove('ask-new')");
  });

  it('staggers pills by index, and sets no typing effect', () => {
    expect(code('drawer.ts')).toContain("link.style.setProperty('--i', String(index))");
    expect(code('drawer.ts')).not.toMatch(/typewriter|charAt|slice\(0, *i/i);
  });
});
