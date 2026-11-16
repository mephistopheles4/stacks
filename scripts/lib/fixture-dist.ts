/**
 * The fixture build, made by the tool and not assumed (room spec S13.2).
 *
 * The tunnel launcher and `pnpm preview:fixture` each build the 50-book fixture vault into a
 * scratch `dist/` **of their own**, run G20's rules on it, refuse a `library.json` that does not
 * carry the fixture's marker, and serve or upload only that folder. Neither ever serves the dev
 * server or `packages/site/dist`, which a real build may have left behind: a tunnel carries
 * whatever is on its one port to a device cloud, and a preview is a public address.
 *
 * `judgeFixtureLibrary` is pure. `buildFixtureDist` and `judgeFixtureDist` do the work.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gateBuildEnv } from './analytics-gate.ts';
import { FIXTURE_MARKER_ID } from './fixture-books.ts';
import { judgeServed } from './ios-swipe.ts';
import { inspectPublicBuild } from './public-build.ts';
import { REPO_ROOT } from './repo-root.ts';
import { runShell } from './run.ts';

/** Under `artifacts/`, which is gitignored: a scratch folder is never a tracked file. */
export const SCRATCH_ROOT = join(REPO_ROOT, 'artifacts', 'room-devices');

/** The origin the fixture build is made for: no real host, so no share tag points at the owner's. */
export const FIXTURE_ORIGIN = 'https://stacks.fixture.example';

const SITE_DIST = join(REPO_ROOT, 'packages', 'site', 'dist');
const SITE_PUBLIC = join(REPO_ROOT, 'packages', 'site', 'public');

export interface Judged {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/**
 * Whether a parsed `library.json` is the fixture's: every title one the generator could have
 * written (`judgeServed`), and the marker id present. Counts, never quotes: a title that is not
 * a fixture's may be a real one.
 */
export function judgeFixtureLibrary(library: unknown): Judged {
  const titles = judgeServed(library);
  if (!titles.ok) return { ok: false, lines: [titles.line] };
  const books = (library as { books: readonly unknown[] }).books;
  const marked = books.some((book) => (book as { id?: unknown } | null)?.id === FIXTURE_MARKER_ID);
  if (!marked) {
    return {
      ok: false,
      lines: ['fixture build refused: the library does not carry the fixture marker book'],
    };
  }
  return { ok: true, lines: [titles.line, 'the fixture marker book is present'] };
}

/**
 * Builds the 50-book fixture site and copies it to `scratch`, replacing what was there.
 *
 * It stages the fixture into `packages/site/public/` as `gate:public` and `smoke:render` do, so
 * a real `pnpm deploy:site` after it must run its own build last, which it always does
 * (docs/commands.md). The copy is what is judged, served and uploaded: nothing here reads
 * `packages/site/dist` after the copy, and nothing outside `artifacts/` is written.
 */
export function buildFixtureDist(scratch: string): void {
  const env = gateBuildEnv({ ...process.env, SITE_URL: FIXTURE_ORIGIN });
  runShell('pnpm', ['fixtures:50'], { wholeEnv: env });
  runShell(
    'pnpm',
    ['stacks', 'build', '--public', '--vault', 'fixtures/vault-50', '--assets', `"${SITE_PUBLIC}"`],
    { wholeEnv: env },
  );
  runShell('pnpm', ['--filter', '@stacks/site', 'run', 'build'], { wholeEnv: env });
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(dirname(scratch), { recursive: true });
  cpSync(SITE_DIST, scratch, { recursive: true });
}

/** The scratch folder's `library.json` and G20's rules, judged. Nothing is served until this is ok. */
export async function judgeFixtureDist(scratch: string): Promise<Judged> {
  const file = join(scratch, 'library.json');
  if (!existsSync(file)) return { ok: false, lines: ['fixture build refused: no library.json'] };
  let library: unknown;
  try {
    library = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, lines: ['fixture build refused: library.json is not valid JSON'] };
  }
  const marked = judgeFixtureLibrary(library);
  if (!marked.ok) return marked;
  const report = await inspectPublicBuild(scratch, { origin: FIXTURE_ORIGIN, analytics: 'off' });
  if (report.problems.length > 0) {
    return {
      ok: false,
      lines: [
        ...marked.lines,
        ...report.problems.map((problem) => `G20 ${problem.rule}: ${problem.message}`),
      ],
    };
  }
  return { ok: true, lines: [...marked.lines, ...report.observations] };
}
