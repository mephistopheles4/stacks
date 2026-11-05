import {
  MAX_BODY_BYTES,
  MAX_HISTORY,
  MAX_HISTORY_ANSWER_CHARS,
  MAX_HISTORY_QUESTION_CHARS,
  MAX_QUESTION_CHARS,
  MAX_TOKEN_CHARS,
} from './limits.ts';
import type { Exchange } from './prompt.ts';

export type ParsedRequest =
  | {
      readonly ok: true;
      readonly question: string;
      readonly token: string;
      readonly history: readonly Exchange[];
    }
  | { readonly ok: false };

const REFUSED: ParsedRequest = { ok: false };

/**
 * S5 step 2: POST, JSON, the production Origin, a body of at most 8 KB, a
 * question of 1 to 1,500 characters, and an optional `history` of earlier exchanges. Never reads a query string: an exact route
 * never delivers one (S12 results).
 */
export async function readRequest(request: Request, siteOrigin: string): Promise<ParsedRequest> {
  if (request.method !== 'POST') return REFUSED;
  if (request.headers.get('origin') !== siteOrigin) return REFUSED;
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type)) return REFUSED;
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return REFUSED;

  const text = await readCapped(request);
  if (text === undefined) return REFUSED;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return REFUSED;
  }
  if (typeof body !== 'object' || body === null) return REFUSED;
  const { question, token, history } = body as Record<string, unknown>;
  if (typeof question !== 'string' || typeof token !== 'string') return REFUSED;
  const trimmed = question.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_CHARS) return REFUSED;
  if (token.length === 0 || token.length > MAX_TOKEN_CHARS) return REFUSED;
  const earlier = readHistory(history);
  if (earlier === undefined) return REFUSED;
  return { ok: true, question: trimmed, token, history: earlier };
}

/**
 * Memory spec D4: absent, or a list of at most 2 `{ question, answer }` strings of
 * 1 to 300 and 1 to 600 characters. Only those two fields are kept. Anything else
 * refuses the whole request, as any bad shape does.
 */
function readHistory(value: unknown): Exchange[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY) return undefined;
  const kept: Exchange[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) return undefined;
    const { question, answer } = item as Record<string, unknown>;
    if (typeof question !== 'string' || typeof answer !== 'string') return undefined;
    if (question.trim() === '' || question.length > MAX_HISTORY_QUESTION_CHARS) return undefined;
    if (answer.trim() === '' || answer.length > MAX_HISTORY_ANSWER_CHARS) return undefined;
    kept.push({ question, answer });
  }
  return kept;
}

/** Reads at most `MAX_BODY_BYTES`, whatever Content-Length claimed. */
async function readCapped(request: Request): Promise<string | undefined> {
  if (request.body === null) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}
