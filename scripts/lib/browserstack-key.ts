/**
 * Where the BrowserStack key may and may not be (room spec S13.6, C14).
 *
 * The key belongs in the tunnel launcher's own environment, set for that one
 * command, and in nothing the repository's root `.env` reaches: **wrangler loads
 * the root `.env` and `.env.local` itself on every run**, so a key written there
 * would reach the Cloudflare upload. Three rules keep it out, and this module
 * holds the decisions so a test can drive them:
 *
 * - `deploy:site`, `deploy:ask` and the launcher refuse to run while a root env
 *   file names a `BROWSERSTACK_` variable (`browserstackFileRefusals`);
 * - the environment the upload hands wrangler drops every `BROWSERSTACK_`
 *   variable, whichever way it got there (`dropBrowserstack`, called by
 *   `uploadEnv`);
 * - nothing here ever returns, prints or logs a value.
 *
 * Names only, as `pnpm turnstile`'s refusal of `CLOUDFLARE_API_TOKEN` reads them.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mainCheckout } from '../../packages/cli/src/env.ts';
import { isBrowserstackName } from './browserstack-local.ts';
import { REPO_ROOT } from './repo-root.ts';
import { assignments, envFilePaths, type EnvFile } from './turnstile.ts';

// Defined in `browserstack-local.ts`, which the device check imports: this file reads `mainCheckout`,
// which the key-holding step must not have in its import graph.
export { dropBrowserstack, isBrowserstackName } from './browserstack-local.ts';

/** Why an env file cannot be allowed: each `BROWSERSTACK_` name it assigns, by file, never by value. */
export function browserstackFileRefusals(files: readonly EnvFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    for (const { name } of assignments(file.text)) {
      if (isBrowserstackName(name)) {
        found.push(
          `${file.label} names ${name.toUpperCase()}, which wrangler would read from it: keep the BrowserStack key in the launcher's own environment`,
        );
      }
    }
  }
  return found;
}

/**
 * The refusals for the env files an entry would load: the repo root's `.env` and
 * `.env.local`, and the main checkout's `.env` when this is a worktree. The reader
 * is injected, so a test needs no file system; an entry passes `readFileSync`
 * guarded for a missing file.
 */
export function browserstackRootRefusals(
  root: string,
  main: string | undefined,
  read: (path: string) => string | undefined,
): string[] {
  const files: EnvFile[] = envFilePaths(root, main).flatMap(({ label, path }) => {
    const text = read(path);
    return text === undefined ? [] : [{ label, text }];
  });
  return browserstackFileRefusals(files);
}

/**
 * The same refusals read off this checkout's disk, for an entry to call before it does anything.
 * No flag clears them: the deploys carry the Cloudflare credentials and the launcher carries the
 * BrowserStack key, and a root env file naming one of its variables puts the key where wrangler
 * reads it.
 */
export function browserstackRootRefusalsOnDisk(): string[] {
  return browserstackRootRefusals(REPO_ROOT, mainCheckout(), (path) =>
    existsSync(path) ? readFileSync(path, 'utf8') : undefined,
  );
}
