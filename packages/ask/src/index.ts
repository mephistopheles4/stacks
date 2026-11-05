import type { Env } from './env.ts';
import { handleChat } from './handler.ts';
import { handleHealth, runDailyTest } from './health.ts';
import { createLibrarySource, type LibrarySource } from './library.ts';

export { HealthState } from './health.ts';
export { VisitorCounter } from './visitor.ts';

/** One source per isolate: its caches expire on their own (S4). */
let held: { readonly origin: string; readonly source: LibrarySource } | undefined;

function sourceFor(env: Env): LibrarySource {
  if (held?.origin !== env.SITE_ORIGIN) {
    held = { origin: env.SITE_ORIGIN, source: createLibrarySource(env.SITE_ORIGIN, fetch) };
  }
  return held.source;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The routes are exact, so only the bare paths arrive. Anything else is no route.
    const { pathname } = new URL(request.url);
    if (pathname === '/api/chat') return handleChat(request, env, { source: sourceFor(env) });
    if (pathname === '/api/chat/health') return handleHealth(request, env);
    return new Response(null, { status: 404 });
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await runDailyTest(env, sourceFor(env));
  },
};
