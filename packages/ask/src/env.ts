/**
 * The Worker's bindings, declared by hand so the package takes no dependency on
 * `@cloudflare/workers-types` (an ask-first item in docs/spec/ask-the-library.md
 * S13). Only the methods the Worker calls are named.
 */
export interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface DurableObjectStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface Env {
  readonly AI: AiBinding;
  readonly RATE: RateLimiter;
  /** The per-visitor daily counter, one object per HMAC key. */
  readonly VISITORS: DurableObjectNamespaceLike;
  /** The daily test's pass or fail, one object. */
  readonly HEALTH: DurableObjectNamespaceLike;
  readonly SITE_ORIGIN: string;
  readonly ASK_GATEWAY_ID: string;
  /** AI runs only when this is exactly `"true"`. */
  readonly ASK_AI_ENABLED?: string;
  /** Worker secrets. A missing one refuses every question. */
  readonly TURNSTILE_SECRET?: string;
  readonly VISITOR_KEY?: string;
}
