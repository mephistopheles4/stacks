import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The model's reasoning is kept by the evals' own AI wrapper (scripts/lib/ask-reasoning.ts) and
 * nowhere in the Worker (docs/spec/ask-the-library.md S9): nothing in the request path may read
 * it, so nothing in it can reach a log, a reply or storage. The canary tests in handler.test.ts
 * and tool-loop.test.ts show it; this holds the cause.
 */
describe('the Worker never touches the reasoning of the model (C15, C32)', () => {
  const sources = readdirSync(new URL('.', import.meta.url))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => [name, readFileSync(new URL(name, import.meta.url), 'utf-8')] as const);

  it.each(sources)('%s does not mention reasoning', (_name, source) => {
    expect(source).not.toMatch(/reasoning/i);
  });
});
