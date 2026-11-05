/**
 * What the model's response carries besides its answer, for the evals only
 * (docs/spec/ask-the-library.md S9). The Worker never reads, logs, returns or stores any of
 * it: `packages/ask/src` has no mention of reasoning (a test holds that), and these functions
 * run in the eval's own AI wrapper, on the raw response, before the Worker's code sees it.
 *
 * Workers AI puts it at `choices[0].message.reasoning_content` (docs/spec/ask-the-library.md S9,
 * from the 2026-11-05 live runs). `reasoningOf` also looks in the other places a chat or
 * responses-style reply puts it, and `responseKeys` records which keys a response had, so a change
 * of shape shows in the next transcript.
 */
interface Item {
  readonly type?: unknown;
  readonly content?: readonly { readonly text?: unknown }[];
  readonly summary?: readonly { readonly text?: unknown }[];
}
interface Shape {
  readonly choices?: readonly { readonly message?: Record<string, unknown> }[];
  readonly output?: readonly Item[];
  readonly [key: string]: unknown;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** The model's reasoning in one response, or undefined when it carries none. */
export function reasoningOf(out: unknown): string | undefined {
  const o = (typeof out === 'object' && out !== null ? out : {}) as Shape;
  const message = o.choices?.[0]?.message;
  const direct =
    text(message?.['reasoning_content']) ??
    text(message?.['reasoning']) ??
    text(o['reasoning_content']) ??
    text(o['reasoning']);
  if (direct !== undefined) return direct;
  const output: readonly Item[] = Array.isArray(o.output) ? (o.output as Item[]) : [];
  const parts = output
    .filter((item) => item.type === 'reasoning')
    .flatMap((item) => [...(item.content ?? []), ...(item.summary ?? [])])
    .map((part) => text(part.text))
    .filter((t): t is string => t !== undefined);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/** The keys a response had, top level and on the first choice's message: where to look next time. */
export function responseKeys(out: unknown): string[] {
  const o = (typeof out === 'object' && out !== null ? out : {}) as Shape;
  const message = o.choices?.[0]?.message;
  return [
    ...Object.keys(o),
    ...(message === undefined ? [] : Object.keys(message).map((k) => `choices[0].message.${k}`)),
  ];
}

/** One model call as the eval saw it: its reasoning, if any, and the keys of the response. */
export interface CallCapture {
  readonly reasoning: string | undefined;
  readonly keys: readonly string[];
}

export const capture = (out: unknown): CallCapture => ({
  reasoning: reasoningOf(out),
  keys: responseKeys(out),
});
