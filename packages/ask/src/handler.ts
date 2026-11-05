import { answerQuestion, type Reply } from './answer.ts';
import type { Env } from './env.ts';
import type { LibrarySource } from './library.ts';
import { logOutcome, type Outcome } from './outcome.ts';
import { readRequest } from './request.ts';
import { verifyTurnstile } from './turnstile.ts';
import { normaliseAddress, utcDay, visitorKey } from './visitor.ts';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function reply(status: number, body: Reply): Response {
  return Response.json(body, { status, headers: HEADERS });
}

const refusal = (status: number, mode: 'error' | 'limited', answer: string): Response =>
  reply(status, { mode, answer, books: [] });

const COULDNT_CONFIRM = "Couldn't confirm this request. Reload the page and ask again.";

export interface Deps {
  readonly source: LibrarySource;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/**
 * S5's refusals, in order. The first one ends the request without calling AI,
 * and a check that cannot run counts as a refusal (C5).
 */
export async function handleChat(request: Request, env: Env, deps: Deps): Promise<Response> {
  const parsed = await readRequest(request, env.SITE_ORIGIN).catch(() => ({ ok: false as const }));
  if (!parsed.ok) {
    return end(
      'refused-shape',
      refusal(400, 'error', "That question couldn't be sent. Shorten it and try again."),
    );
  }

  const address = normaliseAddress(request.headers.get('cf-connecting-ip'));
  const rawAddress = request.headers.get('cf-connecting-ip') ?? '';
  if (address === undefined || !env.TURNSTILE_SECRET || !env.VISITOR_KEY) {
    return end('refused-address', refusal(403, 'error', COULDNT_CONFIRM));
  }

  const human = await verifyTurnstile(
    {
      secret: env.TURNSTILE_SECRET,
      token: parsed.token,
      remoteIp: rawAddress,
      siteOrigin: env.SITE_ORIGIN,
    },
    deps.fetch ?? fetch,
  ).catch(() => false);
  if (!human) return end('refused-turnstile', refusal(403, 'error', COULDNT_CONFIRM));

  const limited = await withinLimits(env, address, (deps.now ?? (() => new Date()))());
  if (!limited) {
    return end(
      'refused-limit',
      refusal(429, 'limited', "That's the limit for now. Try again later."),
    );
  }

  try {
    const answered = await answerQuestion(env, deps.source, parsed.question);
    logOutcome(answered.outcome, answered.detail);
    return reply(200, answered.reply);
  } catch {
    // A DataError, or anything unforeseen: no AI call is retried.
    return end(
      'refused-data',
      refusal(503, 'error', "The library couldn't be read just now. Try again shortly."),
    );
  }
}

function end(outcome: Outcome, response: Response): Response {
  logOutcome(outcome);
  return response;
}

/** Per-minute binding first, then the daily object; either failing refuses. */
async function withinLimits(env: Env, address: string, now: Date): Promise<boolean> {
  try {
    const key = await visitorKey(address, utcDay(now), env.VISITOR_KEY ?? '');
    const minute = await env.RATE.limit({ key });
    if (!minute.success) return false;
    const stub = env.VISITORS.get(env.VISITORS.idFromName(key));
    const daily = (await (await stub.fetch('https://counter/hit', { method: 'POST' })).json()) as {
      allowed?: unknown;
    };
    return daily.allowed === true;
  } catch {
    return false;
  }
}
