/**
 * One single-use Turnstile token per question (docs/spec/ask-the-library.md S5
 * step 3). The script loads when the drawer first opens, so a visitor who never
 * opens it makes no third-party request (C11).
 */

/** The slice of Cloudflare's `window.turnstile` used here. */
export interface TurnstileApi {
  render(container: HTMLElement | string, options: Record<string, unknown>): string;
  execute(widget: string): void;
  reset(widget: string): void;
}

export const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Fixed, and checked again by the Worker. */
export const TURNSTILE_ACTION = 'ask';

export interface TokenSource {
  /** Starts loading and rendering; safe to call again. */
  prepare(): void;
  /** A fresh token, or undefined when the check could not run (script blocked, error, timeout). */
  token(): Promise<string | undefined>;
}

export interface TokenSourceDeps {
  readonly siteKey: string;
  readonly container: HTMLElement;
  readonly load: () => Promise<TurnstileApi>;
  readonly timeoutMs?: number;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export function createTokenSource(deps: TokenSourceDeps): TokenSource {
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let ready: Promise<{ api: TurnstileApi; widget: string } | undefined> | undefined;
  let waiting: ((token: string | undefined) => void) | undefined;

  const settle = (token: string | undefined): void => {
    const resolve = waiting;
    waiting = undefined;
    resolve?.(token);
  };

  const start = (): Promise<{ api: TurnstileApi; widget: string } | undefined> => {
    ready ??= (async () => {
      if (deps.siteKey === '') return undefined;
      try {
        const api = await deps.load();
        const widget = api.render(deps.container, {
          sitekey: deps.siteKey,
          action: TURNSTILE_ACTION,
          execution: 'execute',
          appearance: 'interaction-only',
          callback: (token: string) => {
            settle(token);
          },
          'error-callback': () => {
            settle(undefined);
          },
          'expired-callback': () => {
            settle(undefined);
          },
        });
        return { api, widget };
      } catch {
        return undefined;
      }
    })();
    return ready;
  };

  return {
    prepare: () => {
      void start();
    },
    token: async () => {
      const loaded = await start();
      if (loaded === undefined) return undefined;
      return new Promise<string | undefined>((resolve) => {
        // A question still waiting on an earlier token gets none.
        settle(undefined);
        const timer = setTimer(() => {
          settle(undefined);
        }, deps.timeoutMs ?? 20_000);
        waiting = (token) => {
          clearTimer(timer);
          resolve(token);
        };
        loaded.api.reset(loaded.widget);
        loaded.api.execute(loaded.widget);
      });
    },
  };
}

/** Adds Cloudflare's script once and resolves with `window.turnstile`. */
export function loadTurnstileScript(doc: Document, win: Window): Promise<TurnstileApi> {
  return new Promise<TurnstileApi>((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => {
      const api = (win as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api === undefined) reject(new Error('turnstile missing'));
      else resolve(api);
    };
    script.onerror = () => {
      reject(new Error('turnstile blocked'));
    };
    doc.head.append(script);
  });
}
