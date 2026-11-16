/**
 * Does a long Thoughts page scroll under a finger on a real phone? The check
 * only a phone in BrowserStack's device cloud can run (#599): iOS WebKit will
 * not start a native overflow scroll inside the `CSS3DRenderer` layer, and no
 * desktop engine shows it, so the shelf's own gates cannot (G35's held-at-rest
 * check sets `scrollTop` from script, which scrolls even when a finger cannot).
 *
 *     pnpm exec tsx scripts/ios-swipe-check.ts --premise   the live site, the page moved to a flat layer
 *
 *     --device <name>    the device (iPhone 16 Pro)
 *     --os <version>     its OS version (18)
 *     --browser <name>   safari, or chrome on an Android device (safari)
 *     --url <address>    the page to load (the live site)
 *     --premise          the S3 check: clone the open book's right page into a flat layer
 *                        in the page and swipe the clone
 *
 * **Not a `pnpm` script, and not a gate**: it needs the owner's BrowserStack
 * account, which no CI runner and no contributor has. See `docs/commands.md`.
 *
 * ⚠️ **The credential**: read from `~/.config/browserstack.env`
 * (`%USERPROFILE%\.config\browserstack.env` on Windows) into this process,
 * sent in an `Authorization` header and nowhere else. It is never printed,
 * never on a command line and never written to the repository or a log; an
 * error prints an HTTP status and the hub's message, cut short, with the
 * session id masked (`scripts/lib/browserstack-driver.ts`).
 *
 * One verdict line, and a non-zero exit when the page did not scroll.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDriver, parseCredentials, scrub } from './lib/browserstack-driver.ts';
import {
  ARM_SCROLL_COUNT,
  FIND_AND_OPEN,
  judge,
  MOVE_CLONE_TO_FLAT,
  parseSwipeArgs,
  READ_AFTER,
  swipePath,
  type After,
  type Armed,
  type Opened,
} from './lib/ios-swipe.ts';

const CREDENTIAL_FILE = join(homedir(), '.config', 'browserstack.env');
const SETTLE_MS = 400;
const DRAG_MS = 700;
const MOMENTUM_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message: string): never {
  // Thrown, not exited: a session that is open must reach `driver.end()`.
  throw new Error(message);
}

async function main(): Promise<void> {
  const options = parseSwipeArgs(process.argv.slice(2));
  if (typeof options === 'string') fail(options);
  if (options.local || options.checkServed) fail('--local and --check-served are not built yet');
  if (!options.premise) fail('only --premise is built so far');

  let text: string;
  try {
    text = readFileSync(CREDENTIAL_FILE, 'utf8');
  } catch {
    return fail('no credential file at ~/.config/browserstack.env');
  }
  const credentials = parseCredentials(text);
  if (credentials === undefined) {
    return fail(
      '~/.config/browserstack.env must set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY',
    );
  }

  const driver = createDriver(credentials, (url, init) => fetch(url, init));
  try {
    await driver.start({
      deviceName: options.device,
      osVersion: options.os,
      browserName: options.browser,
      local: options.local,
      sessionName: options.premise ? 'premise' : 'swipe',
    });
    await driver.navigate(options.url);
    const opened = (await driver.runAsync(FIND_AND_OPEN)) as Opened;
    if ('error' in opened) fail(opened.error);

    if (options.premise) {
      const moved = (await driver.run(MOVE_CLONE_TO_FLAT)) as { error?: string };
      if (moved.error !== undefined) fail(moved.error);
      await sleep(SETTLE_MS);
    }
    const armed = (await driver.run(ARM_SCROLL_COUNT)) as Armed | { error: string };
    if ('error' in armed) fail(armed.error);
    const path = swipePath(armed);
    await driver.swipe(path.from, path.to, DRAG_MS);
    await sleep(MOMENTUM_MS);
    const after = (await driver.run(READ_AFTER)) as After;

    const verdict = judge(armed, after, options.premise);
    console.log(verdict.line);
    if (!verdict.scrolled) process.exitCode = 1;
  } finally {
    await driver.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `ios-swipe-check: ${scrub(error instanceof Error ? error.message : 'unknown failure')}`,
  );
  process.exitCode = 1;
});
