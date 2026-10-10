import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { extractTunerCss } from '../../packages/site/src/shelf/tuner-css.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * Writes the pickup tuner's stylesheet where the site imports it, before Vite
 * resolves a single module.
 *
 * The CSS lives inside the two packages' JavaScript (`tuner-css.ts` says why
 * and how it is found). The page needs it as a **file**, because a file is what
 * Vite's `?url` turns into a hashed asset that a lazy `<link>` loads — the one
 * route #376 measured styled under the CSP with nothing reaching a visitor
 * without `?debug`. So the build reads the packages as text, extracts, and
 * writes the result here; `pickup-tuner.ts` imports it with `?url`.
 *
 * **Gitignored and regenerated on every build and dev start**, from the pinned
 * packages in `node_modules`, so a version bump changes it with no hand step and
 * a stale copy cannot outlive the packages it came from. A throw here fails the
 * build, which is the point: an unstyled pane is silent everywhere else.
 */
export const TUNER_CSS = join(REPO_ROOT, 'packages', 'site', 'src', 'generated', 'tuner.css');

/** The one hook this uses, declared rather than importing vite's types (see `boot.ts`). */
interface BuildStartPlugin {
  readonly name: string;
  readonly enforce: 'pre';
  buildStart(): void;
}

export function writeTunerCss(): string {
  // Resolved from the site package, which is the one that depends on both.
  const require = createRequire(join(REPO_ROOT, 'packages', 'site', 'package.json'));
  const css = extractTunerCss({
    tweakpane: readFileSync(require.resolve('tweakpane'), 'utf8'),
    essentials: readFileSync(require.resolve('@tweakpane/plugin-essentials'), 'utf8'),
  });
  mkdirSync(dirname(TUNER_CSS), { recursive: true });
  writeFileSync(TUNER_CSS, css);
  return css;
}

export function tunerCssPlugin(): BuildStartPlugin {
  return {
    name: 'stacks:tuner-css',
    enforce: 'pre',
    buildStart() {
      writeTunerCss();
    },
  };
}
