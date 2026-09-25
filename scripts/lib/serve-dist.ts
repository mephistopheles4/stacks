/**
 * One static server for a built `dist/`, for every script that renders one.
 *
 * ⚠️ **Written on #382's branch and copied here**, so that the two branches
 * share one server. The differences are comments and `fileWithin`, which #384
 * added after CodeQL flagged the copy; #382 carries the same three alerts.
 *
 * Deliberately not the dev server: waiting for a subprocess to announce itself
 * on stdout is a race that hangs rather than fails, and a gate that can hang is
 * worse than one that can fail. Serving the build also means what is measured
 * is what ships.
 *
 * **An overlay** replaces the two paths a library lives at — `/library.json`
 * and `/covers/` — with another folder's, and serves everything else from the
 * build. That is how G59 (`large-library-lit`) puts a 300-book library under
 * the same bundle without a second `astro build`, and without staging a fixture
 * into `packages/site/public/`, which `pnpm deploy:site` assumes only the gates
 * write, in a fixed order.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve, sep } from 'node:path';

/** The paths a staged library occupies. Everything else is the build's. */
export const LIBRARY_PATHS: readonly string[] = ['library.json', 'covers'];

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Where a request is served from, as path segments under that folder. */
export interface ServedPath {
  readonly from: 'root' | 'overlay';
  readonly segments: readonly string[];
}

/**
 * The file a URL path names, or `undefined` for one that must not be served.
 *
 * Pure, and it returns **segments rather than a joined path**, so what it
 * decides does not depend on the host's path dialect: the caller joins them
 * under a folder it chose. A segment that could climb out of that folder or
 * name another drive — `..`, `.`, an empty one mid-path, a backslash, a colon,
 * a NUL — refuses the whole request, rather than being normalised into
 * something that happens to exist.
 */
export function resolveServedPath(
  urlPath: string,
  overlaid: readonly string[] = LIBRARY_PATHS,
): ServedPath | undefined {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split(/[?#]/)[0] ?? '');
  } catch {
    return undefined;
  }
  if (!path.startsWith('/')) return undefined;

  const segments = path.slice(1).split('/');
  // A trailing slash names the folder's index, and `/` names the site's.
  if (segments.at(-1) === '') segments[segments.length - 1] = 'index.html';
  if (segments.some((segment) => !safe(segment))) return undefined;

  const from = overlaid.includes(segments[0] ?? '') ? 'overlay' : 'root';
  return { from, segments };
}

/**
 * The file `segments` names under `base`, or `undefined` if it is not under it.
 *
 * **Structural, where `safe` is a list.** `safe` refuses the segments known to
 * climb — a denylist, and a denylist is only as good as its author's memory of
 * a platform's path rules. This resolves the path and asks whether it is still
 * inside the folder, which holds whatever the list forgot. Both stay: the
 * list refuses a bad request early and says why, and this is what makes the
 * promise *"never serve outside the folder"* true rather than likely.
 *
 * The server this replaced in `smoke-render.ts` held that promise with a
 * `startsWith(root)` on the joined path. The segment list took its place, and
 * CodeQL's `js/path-injection` then found no barrier between the URL and
 * `readFileSync` — three high alerts, on this pull request and on #382.
 */
export function fileWithin(base: string, segments: readonly string[]): string | undefined {
  const folder = resolve(base);
  const file = resolve(folder, ...segments);
  return file.startsWith(folder + sep) ? file : undefined;
}

function safe(segment: string): boolean {
  return (
    segment !== '' &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('\\') &&
    !segment.includes(':') &&
    !segment.includes('\0')
  );
}

export interface ServeOptions {
  /** The build to serve: a `dist/` folder. */
  readonly root: string;
  /** A folder whose `library.json` and `covers/` replace the build's. */
  readonly overlay?: string;
  /** `0`, the default, asks the operating system for a free one. */
  readonly port?: number;
  readonly host?: string;
  /** Fixed pages by exact path, served before anything on disk. */
  readonly pages?: Readonly<Record<string, string>>;
  /** Sent with every file. `no-store` keeps a phone from caching one build into the next. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Served {
  readonly server: Server;
  readonly origin: string;
}

/**
 * Serves a build on a port the operating system picks, unless told one.
 *
 * It used to be a fixed 4331, which was fine while one checkout existed.
 * Worktrees make two gates racing normal, and a fixed port turns that into
 * `EADDRINUSE` — or, if the other server is still up and serving *its* `dist/`,
 * a screenshot of the wrong branch scored as this one's. A caller that has to
 * name its port to something else — `adb reverse`, say — can ask for one.
 */
export function serveDist(options: ServeOptions): Promise<Served> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    const page = options.pages?.[url.split('?')[0] ?? ''];
    if (page !== undefined) {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'], ...options.headers });
      response.end(page);
      return;
    }

    const served = resolveServedPath(url, options.overlay === undefined ? [] : LIBRARY_PATHS);
    const base = served?.from === 'overlay' ? options.overlay : options.root;
    const file =
      served === undefined || base === undefined ? undefined : fileWithin(base, served.segments);
    if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }

    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      ...options.headers,
    });
    response.end(readFileSync(file));
  });

  const host = options.host ?? '127.0.0.1';
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    // `address()` means something only once listening has happened, which is
    // why the origin is built here.
    server.listen(options.port ?? 0, host, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('the server is listening on a pipe, not a port'));
        return;
      }
      resolve({ server, origin: `http://${host}:${String(address.port)}` });
    });
  });
}
