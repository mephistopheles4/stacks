/**
 * Does a long Thoughts page scroll under a finger on a real phone? The check
 * only a phone in BrowserStack's device cloud can run (#599): iOS WebKit will
 * not start a native overflow scroll inside the `CSS3DRenderer` layer, and no
 * desktop engine shows it, so the shelf's own gates cannot (G35's held-at-rest
 * check sets `scrollTop` from script, which scrolls even when a finger cannot).
 *
 *     pnpm exec tsx scripts/ios-swipe-check.ts --premise        the live site, the page moved to a flat layer
 *     pnpm exec tsx scripts/ios-swipe-check.ts                  the live site as it is: the control
 *     pnpm exec tsx scripts/ios-swipe-check.ts --check-served   is the build on the port the fixture build? no session
 *     pnpm exec tsx scripts/ios-swipe-check.ts --local          swipe the fixture build through the tunnel
 *     pnpm exec tsx scripts/ios-swipe-check.ts --serve          serve the built fixture site on 127.0.0.1 for the tunnel
 *
 *     --device <name>    the device (iPhone 16 Pro)
 *     --os <version>     its OS version (18)
 *     --browser <name>   safari, or chrome on an Android device (safari)
 *     --url <address>    the page to load (the live site)
 *     --premise          the S3 check: clone the open book's right page into a flat layer
 *                        in the page and swipe the clone
 *     --local            load http://bs-local.com:<port> through BrowserStack Local, which the
 *                        owner starts and stops; checks the served build first, always
 *     --check-served     read http://127.0.0.1:<port>/library.json and refuse unless every title
 *                        is one the fixture generator writes; opens no session
 *     --serve            serve packages/site/dist on 127.0.0.1:<port> after judging its library.json
 *                        from disk, and nothing else; takes no argument but --port
 *     --port <number>    the port the fixture build is served on, and the tunnel's one port (8766)
 *
 * **Not a `pnpm` script, and not a gate**: it needs the owner's BrowserStack
 * account, which no CI runner and no contributor has. See `docs/ios-swipe-check.md`.
 *
 * ⚠️ **The credential**: read from `~/.config/browserstack.env`
 * (`%USERPROFILE%\.config\browserstack.env` on Windows) into this process,
 * sent in an `Authorization` header and nowhere else. It is never printed,
 * never on a command line and never written to the repository or a log; an
 * error prints an HTTP status and the hub's message, cut short, with the
 * session id masked (`scripts/lib/browserstack-driver.ts`). A page's own
 * strings are never printed: its errors are this tool's fixed sentences.
 *
 * One verdict line, and a non-zero exit when the page did not scroll.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDriver, parseCredentials, scrub } from './lib/browserstack-driver.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { serveDist } from './lib/serve-dist.ts';
import {
  ARM_SCROLL_COUNT,
  CLOSE_AND_READ_FALLBACK,
  FIND_AND_OPEN,
  judge,
  judgeServed,
  MOVE_CLONE_TO_FLAT,
  parseSwipeArgs,
  servedLibraryUrl,
  READ_AFTER,
  swipePath,
  readAfter,
  readArmed,
  readClosing,
  readOpened,
} from './lib/ios-swipe.ts';

const CREDENTIAL_FILE = join(homedir(), '.config', 'browserstack.env');
const SETTLE_MS = 400;
const DRAG_MS = 700;
const MOMENTUM_MS = 1500;
/** The built site `--serve` serves: the fixture build, after `pnpm --filter @stacks/site build`. */
const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');

/** The longest script, finding and opening the book, outlasts WebDriver's 30 s default. */
const SCRIPT_TIMEOUT_MS = 90_000;
const UNEXPECTED = 'the page returned an answer of a shape this check did not ask for';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message: string): never {
  // Thrown, not exited: a session that is open must reach `driver.end()`.
  throw new Error(message);
}

async function main(): Promise<void> {
  const options = parseSwipeArgs(process.argv.slice(2));
  if (typeof options === 'string') fail(options);

  // The one way to serve the fixture build for a tunnel: the built site, judged
  // from disk first, on this machine's loopback address and nothing else.
  if (options.serve) {
    let library: unknown;
    try {
      library = JSON.parse(readFileSync(join(DIST, 'library.json'), 'utf8'));
    } catch {
      return fail('packages/site/dist has no library.json: build the fixture site first');
    }
    const built = judgeServed(library);
    console.log(built.line);
    if (!built.ok) {
      process.exitCode = 1;
      return;
    }
    const { origin } = await serveDist({
      root: DIST,
      port: options.port,
      headers: { 'Cache-Control': 'no-store' },
    });
    console.log(`serving the fixture build on ${origin}; Ctrl-C stops it`);
    return;
  }

  // A tunnel serves whatever is on the port to a device cloud: before one is
  // opened, the build there must be the fixture build. `--local` always checks,
  // and `--check-served` alone checks and stops, with no credential and no session.
  if (options.local || options.checkServed) {
    let library: unknown;
    try {
      // A redirect would let one server answer the check and another the tunnel.
      const reply = await fetch(servedLibraryUrl(options.port), { redirect: 'error' });
      if (!reply.ok) fail(`nothing is serving a library on port ${String(options.port)}`);
      library = await reply.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('nothing is serving')) throw error;
      return fail(`nothing is serving a library on port ${String(options.port)}`);
    }
    const served = judgeServed(library);
    console.log(served.line);
    if (!served.ok) {
      process.exitCode = 1;
      return;
    }
    if (!options.local) return;
  }

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
    await driver.setScriptTimeout(SCRIPT_TIMEOUT_MS);
    await driver.navigate(options.url);
    // What a page hands back is outside text: each answer is checked for the
    // shape asked for, and a page's own string is never echoed: an `error` is
    // one of this tool's own sentences or "the page script failed".
    const opened = readOpened(await driver.runAsync(FIND_AND_OPEN));
    if (opened === undefined) fail(UNEXPECTED);
    if ('error' in opened) fail(opened.error);

    if (options.premise) {
      const moved = await driver.run(MOVE_CLONE_TO_FLAT);
      const refusal = readOpened(moved);
      if (refusal !== undefined && 'error' in refusal) fail(refusal.error);
      await sleep(SETTLE_MS);
    }
    const armed = readArmed(await driver.run(ARM_SCROLL_COUNT));
    if (armed === undefined) fail(UNEXPECTED);
    if ('error' in armed) fail(armed.error);
    const path = swipePath(armed);
    await driver.swipe(path.from, path.to, DRAG_MS);
    await sleep(MOMENTUM_MS);
    const after = readAfter(await driver.run(READ_AFTER));
    if (after === undefined) fail(UNEXPECTED);

    let closing = '';
    if (!options.premise) {
      const closed = readClosing(await driver.runAsync(CLOSE_AND_READ_FALLBACK));
      if (closed === undefined) fail(UNEXPECTED);
      closing = closed;
    }

    const verdict = judge(armed, after, options.premise, closing);
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
