import { describe, expect, it } from 'vitest';
import type { AskResult } from './client.ts';
import { createMemory } from './memory.ts';

const reply = (mode: AskResult['mode'], answer = 'An answer.'): AskResult => ({
  mode,
  answer,
  books: [],
  followUps: [],
});

describe('the page remembers the conversation (memory spec D1 to D4)', () => {
  it('starts empty', () => {
    expect(createMemory().recent()).toEqual([]);
  });

  it('keeps the last 2 answered exchanges, oldest first', () => {
    const memory = createMemory();
    memory.remember('one?', reply('ai', 'A1'));
    memory.remember('two?', reply('ai', 'A2'));
    memory.remember('three?', reply('ai', 'A3'));
    expect(memory.recent()).toEqual([
      { question: 'two?', answer: 'A2' },
      { question: 'three?', answer: 'A3' },
    ]);
  });

  it.each(['search', 'limited', 'error', 'unavailable'] as const)(
    'does not keep a %s reply',
    (mode) => {
      const memory = createMemory();
      memory.remember('one?', reply('ai', 'A1'));
      memory.remember('two?', reply(mode));
      expect(memory.recent()).toEqual([{ question: 'one?', answer: 'A1' }]);
    },
  );

  it('cuts a question at 300 characters and an answer at 600', () => {
    const memory = createMemory();
    memory.remember('q'.repeat(400), reply('ai', 'a'.repeat(900)));
    const [only] = memory.recent();
    expect(only?.question).toHaveLength(300);
    expect(only?.answer).toHaveLength(600);
  });

  it('hands out a copy, so a caller cannot change what is remembered', () => {
    const memory = createMemory();
    memory.remember('one?', reply('ai'));
    (memory.recent() as unknown[]).length = 0;
    expect(memory.recent()).toHaveLength(1);
  });

  it('is a fresh conversation for each page: two memories share nothing', () => {
    const a = createMemory();
    a.remember('one?', reply('ai'));
    expect(createMemory().recent()).toEqual([]);
  });
});
