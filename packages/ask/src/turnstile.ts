import { TURNSTILE_ACTION } from './limits.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileInput {
  readonly secret: string;
  readonly token: string;
  readonly remoteIp: string;
  readonly siteOrigin: string;
}

/**
 * S5 step 3. Sends the secret, token and `remoteip`, then requires success, the
 * production hostname and the fixed action. Anything that cannot be checked is
 * false: a thrown fetch, a non-JSON reply, a timeout.
 */
export async function verifyTurnstile(
  input: TurnstileInput,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(SITEVERIFY, {
      method: 'POST',
      body: new URLSearchParams({
        secret: input.secret,
        response: input.token,
        remoteip: input.remoteIp,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const result = (await response.json()) as {
      success?: unknown;
      hostname?: unknown;
      action?: unknown;
    };
    return (
      result.success === true &&
      result.hostname === new URL(input.siteOrigin).hostname &&
      result.action === TURNSTILE_ACTION
    );
  } catch {
    return false;
  }
}
