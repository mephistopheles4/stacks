/**
 * The pickup tuner's stylesheet, read out of the two packages **as text**.
 *
 * Tweakpane and `@tweakpane/plugin-essentials` ship no `.css` file. Each carries
 * its stylesheet as a string literal and injects it as a runtime `<style>`
 * element, which the page's hash-pinned `style-src` refuses: the pane draws
 * unstyled, nothing throws, and no screenshot gate notices (#376). So the page
 * pre-seats two empty `<style data-tp-style>` placeholders — Tweakpane skips its
 * injection when it finds one — and the CSS reaches the page as a stylesheet
 * file through a lazy `<link>` instead (ADR-0104).
 *
 * **Read, never imported and never evaluated.** Importing either module to get
 * at the string would put the library on the build's own path, and evaluating
 * it is running a dependency's code to answer a question its text answers.
 *
 * **Fails rather than guesses.** Every anchor below is checked, and a miss
 * throws naming the package, so a version bump that moves a literal, renames a
 * bundle or stops checking for a placeholder breaks the build instead of
 * shipping an unstyled pane. A backslash anywhere in a literal throws too: the
 * pinned versions carry none, and decoding escapes by hand is how a stylesheet
 * comes out subtly wrong.
 */

/**
 * The `data-tp-style` ids the page pre-seats, in the order the packages embed them.
 *
 * ⚠️ **Both are `plugin-`-prefixed, the core's own stylesheet included.** The
 * core registers its default bundle through the same `registerPlugin` as any
 * plugin, so its id is `plugin-default` and never `default`. A placeholder
 * named `default` was the first thing the styled-pane gate caught: the pane
 * drew styled from the `<link>` and still injected 24 KB the CSP refused.
 */
export const TUNER_STYLE_IDS = ['plugin-default', 'plugin-essentials'] as const;

/** The two package entry points, as the build reads them. */
export interface TunerSources {
  readonly tweakpane: string;
  readonly essentials: string;
}

/**
 * Tweakpane checks for a placeholder before it injects, and names a plugin's
 * as `plugin-<id>`. Both facts are what makes pre-seating work at all.
 */
const PLACEHOLDER_CHECK = 'style[data-tp-style=${id}]';
const PLUGIN_ID_RULE = 'embedStyle(this.document, `plugin-${bundle.id}`, bundle.css)';

/**
 * A single-quoted literal's body, escapes included, so that one holding an
 * escape is found and refused rather than missed and reported as moved.
 */
const BODY = String.raw`((?:[^'\\\n]|\\.)*)`;

/** The core's default bundle: `id: 'default',` then its css literal. */
const DEFAULT_CSS = new RegExp(
  String.raw`id: 'default',[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*css: '${BODY}'`,
);

/** Essentials: its id, then its css literal on the next line. */
const ESSENTIALS_CSS = new RegExp(String.raw`const id = 'essentials';\s*\nconst css = '${BODY}';`);

/** Every rule both packages write begins with this prefix. */
const RULE_PREFIX = '.tp-';

export function extractTunerCss(sources: TunerSources): string {
  if (!sources.tweakpane.includes(PLACEHOLDER_CHECK)) {
    throw new Error(
      'Tweakpane no longer checks for a `data-tp-style` placeholder before injecting its ' +
        'stylesheet, so the pre-seated placeholders would not stop the injection the CSP refuses',
    );
  }
  if (!sources.tweakpane.includes(PLUGIN_ID_RULE)) {
    throw new Error(
      'Tweakpane no longer names a plugin stylesheet `plugin-<id>`, so the ' +
        '`plugin-essentials` placeholder would not match',
    );
  }

  const core = literal(DEFAULT_CSS.exec(sources.tweakpane)?.[1], 'Tweakpane');
  const essentials = literal(ESSENTIALS_CSS.exec(sources.essentials)?.[1], 'essentials');
  return `${core}\n${essentials}\n`;
}

function literal(found: string | undefined, name: string): string {
  if (found === undefined) {
    throw new Error(`${name}: its stylesheet literal is not where the pinned version carried it`);
  }
  if (found.includes('\\')) {
    throw new Error(`${name}: its stylesheet literal holds an escape, which this does not decode`);
  }
  if (!found.startsWith(RULE_PREFIX)) {
    throw new Error(`${name}: the literal found does not read as its stylesheet`);
  }
  return found;
}
