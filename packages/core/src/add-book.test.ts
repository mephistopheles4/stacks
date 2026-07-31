import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { addBook } from './add-book.ts';
import type { HttpGet } from './metadata/http.ts';

/** A reader that fails every request, standing in for a book no API knows. */
const noProvider: HttpGet = async () => undefined;

/** Answers the Open Library search with one book, and nothing else. */
const findsThinkingInSystems: HttpGet = async (url) =>
  url.includes('/search.json')
    ? { docs: [{ title: 'Thinking in Systems', author_name: ['Donella H. Meadows'] }] }
    : undefined;

describe('addBook — duplicate reporting', () => {
  let dir: string;
  let vault: ObsidianAdapter;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-add-'));
    vault = new ObsidianAdapter(dir);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('says "already shelved", not "nothing found", when no provider knows the book', async () => {
    // The case that made this worth fixing: a book on your own shelf that
    // neither API can find reported "nothing found for …", which is true of the
    // providers and useless to someone looking straight at the book.
    await vault.writeBook({
      title: 'The Human-Agent Orchestrator: Leading and Scaling AI-Driven Organizations',
      author: 'Nima Schei',
      status: 'read',
    });

    const result = await addBook(
      'The Human-Agent Orchestrator: Leading and Scaling AI-Driven Organizations Nima Schei',
      vault,
      noProvider,
    );

    expect(result.kind).toBe('duplicate');
    if (result.kind !== 'duplicate') return;
    expect(result.matchedBeforeLookup).toBe(true);
    expect(result.existing).toContain('Human-Agent Orchestrator');
  });

  it('names the shelved book, not the search result', async () => {
    await vault.writeBook({ title: 'Thinking in Systems', author: 'Donella H. Meadows' });

    // A partial term the pre-check cannot recognise, so the providers answer
    // first and the post-lookup check catches it.
    const result = await addBook('thinking in systems primer', vault, findsThinkingInSystems);

    expect(result.kind).toBe('duplicate');
    if (result.kind !== 'duplicate') return;
    expect(result.existing).toBe('Thinking in Systems');
    expect(result.matchedBeforeLookup).toBe(false);
  });

  it('matches on ISBN without consulting a provider', async () => {
    await vault.writeBook({
      title: 'The Tidal Engine',
      author: 'Marisol Vane',
      isbn: '9781000000016',
    });

    const result = await addBook('978-1-00-000001-6', vault, noProvider);

    expect(result.kind).toBe('duplicate');
    if (result.kind !== 'duplicate') return;
    expect(result.existing).toBe('The Tidal Engine');
    expect(result.matchedBeforeLookup).toBe(true);
  });

  it('still reports not-found for a book that genuinely is not there', async () => {
    const result = await addBook('a book nobody has ever written', vault, noProvider);
    expect(result.kind).toBe('not-found');
  });

  it('skips the shelf entirely under --force', async () => {
    await vault.writeBook({ title: 'Thinking in Systems', author: 'Donella H. Meadows' });

    const result = await addBook('thinking in systems', vault, findsThinkingInSystems, {
      force: true,
    });

    expect(result.kind).toBe('added');
    expect(await vault.listBooks()).toHaveLength(2);
  });
});
