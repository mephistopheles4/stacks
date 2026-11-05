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
