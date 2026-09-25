/**
 * One static server for a built `dist/`, shared by `pnpm smoke:render` and
 * `scripts/phone-check.ts`.
 *
 * Deliberately not the dev server: waiting for a subprocess to announce itself
 * on stdout is a race that hangs rather than fails, and a gate that can hang is
 * worse than one that can fail. Serving the build also means what is measured
 * is what ships.
 *
 * **An overlay** replaces the two paths a library lives at — `/library.json`
 * and `/covers/` — with another folder's, and serves everything else from the
 * build. That is how G60 (`one-shadow-reader`) puts a 300-book library under
 * the same bundle without a second `astro build`, and without staging a fixture
 * into `packages/site/public/`, which `pnpm deploy:site` assumes only the gates
 * write, in a fixed order.
 *
 * **An index, so a request never becomes a path.** Each folder is walked once,
 * when the server starts, into a map from its files' `/`-joined relative paths
 * to their paths on disk, and a request only ever *selects a key* in that map.
 * The string a browser sent is never joined, resolved, stat'd or opened, so no
 * spelling of it can name a file the walk did not find — `resolveServedPath`'s
 * refusals below are a second line rather than the only one. It is also what
 * CodeQL's `js/path-injection` needs to see: that query follows the request's
 * value into a filesystem call, and a `Map#get` hands back what was stored
 * under the key, never the key. The price is that a file appearing after the
 * server starts is not served; both callers build first, then serve.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { relative, sep } from 'node:path';
import { walk } from './walk.ts';

/** The paths a staged library occupies. Everything else is the build's. */
export const LIBRARY_PATHS: readonly string[] = ['library.json', 'covers'];

const HTML = 'text/html; charset=utf-8';

const CONTENT_TYPES: Record<string, string> = {
  '.html': HTML,
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
 * with `/` into a key for that folder's index, and never into a path. A
 * segment that could climb out of a folder or name another drive — `..`, `.`,
 * an empty one mid-path, a backslash, a colon, a NUL — refuses the whole
 * request, rather than being normalised into something that happens to exist.
 * No such key is in an index anyway; refusing first keeps the answer from
 * depending on that.
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

/**
 * Every file under `folder`, keyed by its path relative to it with `/` between
 * segments — the shape `resolveServedPath`'s segments join into — and valued
 * by its path on disk. A folder that is not there indexes nothing, so it
 * serves 404s rather than failing the start.
 */
export function indexFolder(folder: string): Map<string, string> {
  return new Map(walk(folder).map((file) => [relative(folder, file).split(sep).join('/'), file]));
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

/** The two calls a handler makes on a response: all a test's stand-in needs. */
export interface Reply {
  writeHead(status: number, headers?: Readonly<Record<string, string>>): unknown;
  end(body?: string | Buffer): unknown;
}

/**
 * Answers one request from the folders `options` names, indexed once, here.
 *
 * `resolveServedPath` decides *which* folder a request belongs to — that is
 * where the overlay's precedence lives — and its index decides whether the
 * file is there, so a cover missing from the overlay is a 404 even when the
 * build has one by that name. A file removed after the walk is a 404 as well,
 * rather than an exception that takes the server down mid-gate.
 */
export function distHandler(
  options: ServeOptions,
): (request: { readonly url?: string }, response: Reply) => void {
  const pages = new Map(Object.entries(options.pages ?? {}));
  const rootFiles = indexFolder(options.root);
  const overlayFiles =
    options.overlay === undefined ? new Map<string, string>() : indexFolder(options.overlay);
  const overlaid = options.overlay === undefined ? [] : LIBRARY_PATHS;

  return (request, response) => {
    const url = request.url ?? '/';
    const page = pages.get(url.split('?')[0] ?? '');
    if (page !== undefined) {
      response.writeHead(200, { 'Content-Type': HTML, ...options.headers });
      response.end(page);
      return;
    }

    const served = resolveServedPath(url, overlaid);
    const files = served?.from === 'overlay' ? overlayFiles : rootFiles;
    const file = served === undefined ? undefined : files.get(served.segments.join('/'));
    const body = file === undefined ? undefined : readIfThere(file);
    if (file === undefined || body === undefined) {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      ...options.headers,
    });
    response.end(body);
  };
}

function readIfThere(file: string): Buffer | undefined {
  try {
    return readFileSync(file);
  } catch {
    return undefined;
  }
}

/**
 * Serves a build on a port the operating system picks, unless told one.
 *
 * It used to be a fixed 4331, which was fine while one checkout existed.
 * Worktrees make two gates racing normal, and a fixed port turns that into
 * `EADDRINUSE` — or, if the other server is still up and serving *its* `dist/`,
 * a screenshot of the wrong branch scored as this one's. The phone check asks
 * for a fixed port on purpose: `adb reverse` has to name it.
 */
export function serveDist(options: ServeOptions): Promise<Served> {
  const server = createServer(distHandler(options));

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
