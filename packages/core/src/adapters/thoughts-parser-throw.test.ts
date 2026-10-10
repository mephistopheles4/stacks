import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { publish } from '../publish.ts';
import { ObsidianAdapter } from './obsidian-adapter.ts';

const CANARY = 'PARSER_ERROR_canary';
/** The body text that makes the mocked `preprocess` throw. */
const TRIGGER = 'BREAK_THE_PARSER';

// `micromark`'s `preprocess` throws, carrying the canary in its message, on any body
// holding the trigger: an error that is not a withhold, which the extractor
// rethrows and `publish()` must catch without printing.
vi.mock('micromark', async (importOriginal) => {
  const actual = await importOriginal<typeof import('micromark')>();
  return {
    ...actual,
    preprocess: () => {
      const run = actual.preprocess();
      return (...args: Parameters<typeof run>) => {
        if (String(args[0]).includes(TRIGGER)) throw new Error(`preprocess broke on ${CANARY}`);
        return run(...args);
      };
    },
  };
});

/**
 * N91: a parser that throws inside `extractThoughts` during `publish()` (spec
 * §3.1.4, D26). Mocked in a file of its own so no other test sees it.
 *
 * All text is invented for this file (ADR-0004).
 */
describe('N91: a parser that throws during a build', () => {
  let dir: string;
  let out: string;
  let spies: MockInstance[];

  const note = async (name: string, ...body: string[]): Promise<void> => {
    const contents = ['---', 'type: book', `title: ${name}`, '---', '', ...body, ''].join('\n');
    await writeFile(join(dir, 'Library', `${name}.md`), contents, 'utf8');
  };

  /** Every line the console was given, on any of its channels. */
  const printed = (): string =>
    spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(' '))).join('\n');

  /** Every staged file's text, under `out`. */
  async function staged(at: string): Promise<string[]> {
    const texts: string[] = [];
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) texts.push(...(await staged(path)));
      else texts.push(await readFile(path, 'utf8'));
    }
    return texts;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-parser-throw-'));
    out = await mkdtemp(join(tmpdir(), 'stacks-parser-throw-out-'));
    await mkdir(join(dir, 'Library'));
    spies = (['log', 'info', 'warn', 'error'] as const).map((channel) =>
      vi.spyOn(console, channel).mockImplementation(() => undefined),
    );
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  });

  it('writes no notes file for that book, finishes the others, and never prints the error', async () => {
    await note('Broken', '## Thoughts', '', `Mine, ${TRIGGER}.`, '', '## Notes', '', 'Private.');
    await note('Fine', '## Thoughts', '', 'Kept.', '', '## Notes', '', 'Private.');
    const vault = new ObsidianAdapter(dir);

    const result = await publish(await vault.listBooks(), vault, out, { isPublic: true });

    expect(result.notesWritten).toBe(1);
    const notes = await readdir(join(out, 'notes'));
    expect(notes).toHaveLength(1);
    expect(await readFile(join(out, 'notes', notes[0] ?? ''), 'utf8')).toContain('Kept.');
    // The catch in `publish()`, not a withhold, answered: the error reached it.
    expect(printed()).toContain(
      'stacks: wrote no Thoughts for Library/Broken.md — the note could not be read',
    );
    expect(printed()).not.toContain(CANARY);
    for (const text of await staged(out)) expect(text).not.toContain(CANARY);
  });
});
