import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { extractTunerCss, TUNER_STYLE_IDS } from './tuner-css.ts';

const require = createRequire(import.meta.url);

/** The two files the build reads, as text — never imported, never evaluated. */
function packageSources(): { tweakpane: string; essentials: string } {
  return {
    tweakpane: readFileSync(require.resolve('tweakpane'), 'utf8'),
    essentials: readFileSync(require.resolve('@tweakpane/plugin-essentials'), 'utf8'),
  };
}

describe('extractTunerCss', () => {
  it('finds both stylesheets in the pinned packages', () => {
    const css = extractTunerCss(packageSources());

    // One rule from each: the root pane's, and the curve editor's.
    expect(css).toContain('.tp-rotv{');
    expect(css).toContain('.tp-cbzv');
    expect(css.length).toBeGreaterThan(20_000);
  });

  it('is pre-seated on the page as exactly these placeholders, each empty', () => {
    // The page template holds the placeholders; this holds them to the ids.
    const page = readFileSync(new URL('../pages/index.astro', import.meta.url), 'utf8');
    const seated = [...page.matchAll(/<style is:inline data-tp-style="([^"]+)"><\/style>/g)].map(
      (match) => match[1],
    );

    expect(seated).toEqual([...TUNER_STYLE_IDS]);
    expect(TUNER_STYLE_IDS).toEqual(['plugin-default', 'plugin-essentials']);
  });

  it('refuses when Tweakpane no longer carries its stylesheet where it did', () => {
    const sources = packageSources();
    const moved = sources.tweakpane.replace("css: '.tp-", "style: '.tp-");

    expect(() => extractTunerCss({ ...sources, tweakpane: moved })).toThrow(/Tweakpane/);
  });

  it('refuses when essentials no longer carries its stylesheet where it did', () => {
    const sources = packageSources();
    const moved = sources.essentials.replace("const css = '", "const styles = '");

    expect(() => extractTunerCss({ ...sources, essentials: moved })).toThrow(/essentials/);
  });

  it('refuses when a package would look for a different placeholder', () => {
    const sources = packageSources();
    // The page pre-seats `plugin-essentials`; a renamed bundle id would inject
    // its own `<style>`, which the CSP refuses, and the pane would draw unstyled.
    const renamed = sources.essentials.replace("const id = 'essentials';", "const id = 'basics';");

    expect(() => extractTunerCss({ ...sources, essentials: renamed })).toThrow(/essentials/);
  });

  it('refuses when Tweakpane stops checking for a placeholder before injecting', () => {
    const sources = packageSources();
    const unchecked = sources.tweakpane.replace('style[data-tp-style=${id}]', 'style[data-x]');

    expect(() => extractTunerCss({ ...sources, tweakpane: unchecked })).toThrow(/placeholder/);
  });

  it('refuses an escape inside a stylesheet literal rather than guess at it', () => {
    const sources = packageSources();
    const escaped = sources.essentials.replace("const css = '.tp-", "const css = '\\'.tp-");

    expect(() => extractTunerCss({ ...sources, essentials: escaped })).toThrow(/escape/);
  });

  it('refuses when Tweakpane stops naming a plugin stylesheet `plugin-<id>`', () => {
    const sources = packageSources();
    const renamed = sources.tweakpane.replace('`plugin-${bundle.id}`', '`ext-${bundle.id}`');

    expect(renamed).not.toBe(sources.tweakpane);
    expect(() => extractTunerCss({ ...sources, tweakpane: renamed })).toThrow(/plugin-<id>/);
  });

  it('refuses a literal found in place that does not read as a stylesheet', () => {
    const sources = packageSources();
    const other = sources.essentials.replace("const css = '.tp-", "const css = 'tp-");

    expect(other).not.toBe(sources.essentials);
    expect(() => extractTunerCss({ ...sources, essentials: other })).toThrow(/does not read as/);
  });
});
