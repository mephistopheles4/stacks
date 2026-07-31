#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  ObsidianAdapter,
  addBook,
  buildLibrary,
  createCachedHttpGet,
  isBookStatus,
  BOOK_STATUSES,
  type BookStatus,
} from '@stacks/core';

const DEFAULT_CACHE = '.cache';
const DEFAULT_OUT = 'library.json';

interface GlobalOptions {
  readonly vault?: string;
  readonly cache?: string;
}

const program = new Command();

program
  .name('stacks')
  .description('Reading tracker whose Obsidian vault is the database.')
  .version('0.0.0')
  .option('--vault <path>', 'path to the Obsidian vault (or set STACKS_VAULT)')
  .option('--cache <path>', `where API responses are cached (default: ${DEFAULT_CACHE})`);

program
  .command('add')
  .description('Fetch metadata and cover for a book, then write a note into the vault')
  .argument('<isbn-or-title>', 'an ISBN, or a title to search for')
  .option('--status <status>', `one of: ${BOOK_STATUSES.join(' | ')}`, 'read')
  .option('--force', 'add even if the book already exists in the vault')
  .action(async (term: string, options: { status: string; force?: boolean }) => {
    const { vault, get } = context();

    if (!isBookStatus(options.status)) {
      fail(`--status must be one of: ${BOOK_STATUSES.join(', ')}`);
    }

    const result = await addBook(term, vault, get, {
      status: options.status as BookStatus,
      ...(options.force === true ? { force: true } : {}),
    });

    switch (result.kind) {
      case 'added':
        console.log(`added: ${result.path}`);
        if (result.metadata?.source !== undefined) {
          console.log(`  metadata from ${result.metadata.source}`);
        }
        break;
      case 'duplicate':
        console.log(`already in the vault: ${result.title}`);
        break;
      case 'not-found':
        fail(`nothing found for "${result.term}"`);
    }
  });

program
  .command('build')
  .description('Parse the vault into library.json')
  .option('--public', 'emit a shareable build: covers and metadata only, no note bodies')
  .option('-o, --out <file>', `where to write library.json (default: ${DEFAULT_OUT})`)
  .action(async (options: { public?: boolean; out?: string }) => {
    const { vault } = context();

    const books = await vault.listBooks();
    const library = buildLibrary(books, { isPublic: options.public === true });

    const out = resolve(options.out ?? DEFAULT_OUT);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(library, null, 2)}\n`, 'utf8');

    const scope = options.public === true ? 'public' : 'local';
    console.log(`wrote ${out} — ${library.bookCount} book(s), ${scope} build`);
  });

program
  .command('status')
  .description('Quick stats: books this year, in progress, covers still missing')
  .action(async () => {
    const { vault } = context();
    const books = await vault.listBooks();
    const year = String(new Date().getFullYear());

    const finishedThisYear = books.filter((b) => b.finished?.startsWith(year) === true).length;
    const reading = books.filter((b) => b.status === 'reading').length;
    const missingCovers = books.filter((b) => b.cover === undefined).length;

    console.log(`${books.length} book(s) in the vault`);
    console.log(`  finished in ${year}: ${finishedThisYear}`);
    console.log(`  reading now:       ${reading}`);
    console.log(`  without a cover:   ${missingCovers}`);
  });

program
  .command('import')
  .description('Import listening history from a self-hosted Audiobookshelf instance')
  .argument('<source>', 'currently only "audiobookshelf"')
  .action(() => {
    fail('not implemented yet — lands in phase 4');
  });

/** Resolves the vault and cache once, the same way for every command. */
function context(): { vault: ObsidianAdapter; get: ReturnType<typeof createCachedHttpGet> } {
  const options = program.opts<GlobalOptions>();
  const vaultPath = options.vault ?? process.env['STACKS_VAULT'];

  if (vaultPath === undefined || vaultPath.trim().length === 0) {
    fail('no vault: pass --vault <path> or set STACKS_VAULT');
  }

  return {
    vault: new ObsidianAdapter(vaultPath),
    get: createCachedHttpGet(resolve(options.cache ?? DEFAULT_CACHE)),
  };
}

function fail(message: string): never {
  console.error(`stacks: ${message}`);
  process.exit(1);
}

await program.parseAsync();
