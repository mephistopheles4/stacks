import { answerQuestion } from './answer.ts';
import type { Env } from './env.ts';
import { HEALTH_MAX_AGE_MS } from './limits.ts';
import type { LibrarySource } from './library.ts';
import { logOutcome, type OutcomeDetail } from './outcome.ts';

/** The one question the daily test asks (S11). Fixed, so nothing visitors type reaches it. */
export const DAILY_QUESTION = 'What have you read about finance?';

export interface HealthResult {
  readonly ok: boolean;
  readonly at: number;
}

/** The slice of Durable Object storage the health object uses. */
export interface HealthStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

/**
 * Holds only the daily test's pass or fail and the time, in an object separate
 * from the per-visitor one (S11). It saves no answer text.
 */
export class HealthState {
  constructor(private readonly state: { readonly storage: HealthStorage }) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const body = (await request.json()) as HealthResult;
      await this.state.storage.put('result', { ok: body.ok === true, at: Number(body.at) });
      return new Response(null, { status: 204 });
    }
    const result = await this.state.storage.get<HealthResult>('result');
    return Response.json(result ?? null);
  }
}

/** What the daily test spent, so the day's Neurons in the logs include it (observability S2). */
function spendOf(detail: OutcomeDetail): OutcomeDetail {
  const { neurons, tokensCached, tokensIn, tokensOut } = detail;
  return {
    ...(neurons !== undefined && { neurons }),
    ...(tokensCached !== undefined && { tokensCached }),
    ...(tokensIn !== undefined && { tokensIn }),
    ...(tokensOut !== undefined && { tokensOut }),
  };
}

const stub = (env: Env) => env.HEALTH.get(env.HEALTH.idFromName('daily'));

/**
 * Passes unless the AI call failed (a blank answer counts as failed; nothing reads what a good
 * answer says). A spent budget passes, and so does AI switched off on purpose; a failed data
 * load fails. The record is a bool and a time.
 */
export async function runDailyTest(
  env: Env,
  source: LibrarySource,
  now: () => number = Date.now,
): Promise<boolean> {
  let ok: boolean;
  let spend: OutcomeDetail = {};
  try {
    const answered = await answerQuestion(env, source, DAILY_QUESTION);
    ok = answered.ai !== 'failed';
    spend = spendOf(answered.detail);
  } catch {
    ok = false;
  }
  logOutcome(ok ? 'daily-pass' : 'daily-fail', spend);
  await stub(env).fetch('https://health/result', {
    method: 'POST',
    body: JSON.stringify({ ok, at: now() } satisfies HealthResult),
  });
  return ok;
}

/** 200 or 503 from the saved result, with no AI call and nothing but up or down (S11). */
export async function handleHealth(
  request: Request,
  env: Env,
  now: () => number = Date.now,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405 });
  }
  let up: boolean;
  try {
    const result = (await (
      await stub(env).fetch('https://health/result')
    ).json()) as HealthResult | null;
    // No result yet is up: a new deploy has not run its first test.
    up = result === null || (result.ok && now() - result.at <= HEALTH_MAX_AGE_MS);
  } catch {
    up = false;
  }
  logOutcome(up ? 'health-up' : 'health-down');
  return new Response(
    request.method === 'HEAD' ? null : up ? 'stacks-ask: up' : 'stacks-ask: down',
    {
      status: up ? 200 : 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    },
  );
}
