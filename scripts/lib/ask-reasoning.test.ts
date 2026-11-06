import { describe, expect, it } from 'vitest';
import { capture, neuronsOf, reasoningOf, responseKeys } from './ask-reasoning.ts';

describe("reasoningOf: the model's reasoning, kept for the evals (S9)", () => {
  it("reads reasoning_content or reasoning on a chat reply's message", () => {
    expect(
      reasoningOf({
        choices: [{ message: { content: 'A', reasoning_content: 'I should search.' } }],
      }),
    ).toBe('I should search.');
    expect(reasoningOf({ choices: [{ message: { content: 'A', reasoning: 'Thinking.' } }] })).toBe(
      'Thinking.',
    );
  });

  it('reads it at the top level of the response', () => {
    expect(reasoningOf({ reasoning_content: 'Top.' })).toBe('Top.');
    expect(reasoningOf({ reasoning: 'Top two.' })).toBe('Top two.');
  });

  it('reads reasoning items in a responses-style output, content and summary', () => {
    const out = {
      output: [
        { type: 'reasoning', content: [{ text: 'Step one.' }], summary: [{ text: 'Short.' }] },
        { type: 'message', content: [{ type: 'output_text', text: 'Answer.' }] },
      ],
    };
    expect(reasoningOf(out)).toBe('Step one.\nShort.');
  });

  it('says there is none when the response carries none', () => {
    expect(reasoningOf({ choices: [{ message: { content: 'A' } }] })).toBeUndefined();
    expect(reasoningOf({ response: 'A' })).toBeUndefined();
    expect(reasoningOf(null)).toBeUndefined();
    expect(reasoningOf('text')).toBeUndefined();
    expect(reasoningOf({ choices: [{ message: { reasoning_content: '  ' } }] })).toBeUndefined();
  });

  it('records the keys of a response, so a run shows where the reasoning is', () => {
    expect(
      responseKeys({ choices: [{ message: { content: 'A', reasoning_content: 'R' } }], usage: {} }),
    ).toEqual([
      'choices',
      'usage',
      'choices[0].message.content',
      'choices[0].message.reasoning_content',
    ]);
    expect(responseKeys(undefined)).toEqual([]);
  });

  it('captures both for one call', () => {
    const c = capture({ response: 'A', reasoning: 'R' });
    expect(c.reasoning).toBe('R');
    expect(c.keys).toEqual(['response', 'reasoning']);
  });

  it('reads the Neurons the response reports in its usage, or says there are none (M4)', () => {
    expect(neuronsOf({ usage: { neurons: 12.5 } })).toBe(12.5);
    expect(neuronsOf({ usage: { neurons: 0 } })).toBe(0);
    expect(neuronsOf({ usage: { prompt_tokens: 5 } })).toBeUndefined();
    expect(neuronsOf({ usage: { neurons: '12' } })).toBeUndefined();
    expect(neuronsOf({ usage: { neurons: -1 } })).toBeUndefined();
    expect(neuronsOf({ usage: { neurons: Number.NaN } })).toBeUndefined();
    expect(neuronsOf({ usage: { neurons: Number.POSITIVE_INFINITY } })).toBeUndefined();
    expect(neuronsOf(null)).toBeUndefined();
    expect(capture({ usage: { neurons: 7 } }).neurons).toBe(7);
  });
});
