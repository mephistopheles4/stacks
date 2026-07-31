#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { loadEnv } from './env.ts';
import {
  ObsidianAdapter,
  addBook,
  buildLibrary,
  compareShelfPosition,
  createCachedHttpGet,
  enrichBook,
  importBooks,
  missingFields,
  isBookStatus,
  parseAudibleExport,
  publish,
  watchVault,
  BOOK_STATUSES,
  SHELVED_STATUSES,
  type BookStatus,
} from '@stacks/core';

// Before anything reads process.env — a real variable still wins over the file.
loadEnv();

const DEFAULT_CACHE = '.cache';
const DEFAULT_OUT = 'library.json';
const DEFAULT_ASSETS = 'packages/site/public';

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

    const googleBooksKey = process.env['GOOGLE_BOOKS_API_KEY'];
    const result = await addBook(term, vault, get, {
      status: options.status as BookStatus,
      ...(options.force === true ? { force: true } : {}),
      ...(googleBooksKey === undefined || googleBooksKey.length === 0
        ? {}
        : { googleBooksKey }),
    });

    switch (result.kind) {
      case 'added':
        console.log(`added: ${result.path}`);
        if (result.metadata?.source !== undefined) {
          console.log(`  metadata from ${result.metadata.source}`);
        }
        break;
      case 'duplicate':
        // Name the shelved book, not whatever a search happened to return.
        console.log(`already in the vault: ${result.existing}`);
        if (!result.matchedBeforeLookup && result.title !== result.existing) {
          console.log(`  matched "${result.title}"`);
        }
        console.log('  use --force to add it anyway');
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
  .option(
    '--assets <dir>',
    `where --public stages library.json, covers and og.png (default: ${DEFAULT_ASSETS})`,
  )
  .option('--watch', 'rebuild whenever the vault changes')
  .action(
    async (options: { public?: boolean; out?: string; assets?: string; watch?: boolean }) => {
      const { vault, vaultPath } = context();

      const rebuild = async (): Promise<void> => {
        const books = await vault.listBooks();

        // A public build stages a whole folder — metadata, the covers it
        // actually references, and the link-preview image. A local build is
        // just the index.
        if (options.public === true) {
          const assets = resolve(options.assets ?? DEFAULT_ASSETS);
          const result = await publish(books, vault, assets, { isPublic: true });

          console.log(
            `wrote ${result.libraryPath} — ${result.library.bookCount} book(s), public build`,
          );
          console.log(`  covers    ${result.coversCopied} copied into ${assets}`);
          console.log(`  og image  ${result.ogImagePath}`);
          if (result.coversMissing.length > 0) {
            console.warn(
              `  missing   ${result.coversMissing.length} cover(s): ${result.coversMissing.join(', ')}`,
            );
          }
          return;
        }

        const library = buildLibrary(books, { isPublic: false });
        const out = resolve(options.out ?? DEFAULT_OUT);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
        console.log(`wrote ${out} — ${library.bookCount} book(s), local build`);
      };

      await rebuild();
      if (options.watch !== true) return;

      console.log(`\nwatching ${vaultPath} — Ctrl-C to stop`);
      const watcher = watchVault(vaultPath, async () => {
        try {
          await rebuild();
        } catch (error) {
          // A rebuild that throws must not kill the watch; the next save is
          // very often the fix.
          console.error(`rebuild failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      // Hold the process open until interrupted.
      process.on('SIGINT', () => {
        watcher.close();
        process.exit(0);
      });
      await new Promise<never>(() => {});
    },
  );

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
  .command('enrich')
  .description('Fill missing metadata on notes that already exist, never overwriting')
  .argument('[title]', 'only enrich books whose title contains this')
  .option('--dry-run', 'report what would be filled, without writing')
  .action(async (title: string | undefined, options: { dryRun?: boolean }) => {
    const { vault, get } = context();
    const googleBooksKey = process.env['GOOGLE_BOOKS_API_KEY'];

    const needle = title?.toLowerCase();
    const books = (await vault.listBooks()).filter(
      (book) => needle === undefined || book.title.toLowerCase().includes(needle),
    );

    if (books.length === 0) {
      fail(title === undefined ? 'no books in the vault' : `no book matching "${title}"`);
    }

    // Only the ones with something to fill are worth a lookup.
    const candidates = books.filter((book) => missingFields(book).length > 0);
    console.log(
      `${books.length} book(s) considered, ${candidates.length} with gaps` +
        (options.dryRun === true ? '  (dry run)' : ''),
    );

    let filled = 0;
    let missed = 0;
    for (const book of candidates) {
      const gaps = missingFields(book).join(', ');
      const outcome = await enrichBook(book, vault, get, {
        ...(options.dryRun === true ? { dryRun: true } : {}),
        ...(googleBooksKey === undefined || googleBooksKey.length === 0
          ? {}
          : { googleBooksKey }),
      });

      switch (outcome.kind) {
        case 'filled':
          filled += 1;
          console.log(`  + ${outcome.title.slice(0, 52)}`);
          console.log(`      ${outcome.fields.join(', ')}  (was missing: ${gaps})`);
          break;
        case 'not-found':
          missed += 1;
          console.log(`  ? ${outcome.title.slice(0, 52)} — no provider knows it`);
          break;
        case 'mismatch':
          missed += 1;
          // Refusing is the right answer: metadata for a book that merely
          // resembles this one is worse than leaving the gap.
          console.log(`  ! ${outcome.title.slice(0, 46)}`);
          console.log(`      refused "${outcome.found.slice(0, 52)}" — not the same book`);
          break;
        case 'complete':
          break;
      }
    }

    const verb = options.dryRun === true ? 'would fill' : 'filled';
    console.log(`\n${verb} ${filled} book(s)${missed > 0 ? `, ${missed} left alone` : ''}`);
  });

program
  .command('order')
  .description('Show the shelf order, or renumber it with gaps')
  .option('--renumber', 'write shelf_order into every shelved note')
  .option('--step <n>', 'gap between numbers (default: 10)', '10')
  .option('--dry-run', 'show what --renumber would write, without writing')
  .action(async (options: { renumber?: boolean; step: string; dryRun?: boolean }) => {
    const { vault } = context();

    const step = Number(options.step);
    if (!Number.isFinite(step) || step <= 0) {
      fail(`--step must be a positive number, got "${options.step}"`);
    }

    // Only books that actually appear on the shelf. Numbering a wishlist book
    // would be numbering something nobody can see.
    const shelved = (await vault.listBooks())
      .filter((book) => SHELVED_STATUSES.has(book.status))
      .sort(compareShelfPosition);

    if (shelved.length === 0) {
      console.log('no shelved books to order');
      return;
    }

    if (options.renumber !== true) {
      console.log(`${shelved.length} book(s), in shelf order:\n`);
      for (const [index, book] of shelved.entries()) {
        const current = book.shelfOrder === undefined ? '   ·' : String(book.shelfOrder).padStart(4);
        console.log(`${current}  ${String(index + 1).padStart(3)}. ${book.title}`);
      }
      console.log('\nrun with --renumber to write these positions back as shelf_order');
      return;
    }

    let written = 0;
    for (const [index, book] of shelved.entries()) {
      const shelfOrder = (index + 1) * step;
      if (book.shelfOrder === shelfOrder) continue;

      if (options.dryRun === true) {
        console.log(`  ${String(shelfOrder).padStart(4)}  ${book.title}`);
        written += 1;
        continue;
      }

      try {
        await vault.updateBook(book.sourcePath, { shelf_order: shelfOrder });
        written += 1;
      } catch (error) {
        console.warn(
          `  ! ${book.title} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const verb = options.dryRun === true ? 'would renumber' : 'renumbered';
    console.log(
      `\n${verb} ${written} of ${shelved.length} book(s), in steps of ${String(step)}` +
        `\nleaving gaps so a book can be slotted in with a number between two others`,
    );
  });

program
  .command('import')
  .description('Import a library export into the vault')
  .argument('<source>', 'currently only "audible" (a Libation JSON export)')
  .argument('<file>', 'path to the export file')
  .option('--dry-run', 'report what would be imported without writing anything')
  .option('--skip-covers', 'do not download cover art')
  .option('--dates-from-added', 'use DateAdded as the finished date (the export has no real one)')
  .action(
    async (
      source: string,
      file: string,
      options: { dryRun?: boolean; skipCovers?: boolean; datesFromAdded?: boolean },
    ) => {
      if (source !== 'audible') {
        fail(`unknown import source "${source}" — currently only "audible"`);
      }
      const { vault, get } = context();

      let data: unknown;
      try {
        data = JSON.parse(await readFile(resolve(file), 'utf8'));
      } catch (error) {
        fail(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }

      const books = parseAudibleExport(data, {
        dateAddedAsFinished: options.datesFromAdded === true,
      });
      if (books.length === 0) {
        fail(`no books found in ${file} — is it a Libation library export?`);
      }

      console.log(`${books.length} book(s) in the export`);

      const gbKey = process.env['GOOGLE_BOOKS_API_KEY'];
      const result = await importBooks(books, vault, {
        ...(options.dryRun === true ? { dryRun: true } : {}),
        ...(options.skipCovers === true ? { skipCovers: true } : { get }),
        ...(gbKey === undefined || gbKey.length === 0 ? {} : { googleBooksKey: gbKey }),
      });

      for (const outcome of result.outcomes) {
        switch (outcome.kind) {
          case 'added':
            console.log(`  + ${outcome.title}`);
            break;
          case 'would-add':
            console.log(`  + ${outcome.title}  (dry run)`);
            break;
          case 'duplicate':
            console.log(`  = ${outcome.title}  — already shelved as "${outcome.existing}"`);
            break;
          case 'failed':
            console.warn(`  ! ${outcome.title}  — ${outcome.reason}`);
            break;
        }
      }

      const verb = options.dryRun === true ? 'would add' : 'added';
      console.log(
        `\n${verb} ${result.added}, skipped ${result.duplicates} already shelved` +
          (result.failed > 0 ? `, ${result.failed} failed` : ''),
      );
    },
  );

/** Resolves the vault and cache once, the same way for every command. */
function context(): {
  vault: ObsidianAdapter;
  vaultPath: string;
  get: ReturnType<typeof createCachedHttpGet>;
} {
  const options = program.opts<GlobalOptions>();
  const vaultPath = options.vault ?? process.env['STACKS_VAULT'];

  if (vaultPath === undefined || vaultPath.trim().length === 0) {
    fail('no vault: pass --vault <path> or set STACKS_VAULT');
  }

  return {
    vault: new ObsidianAdapter(vaultPath),
    vaultPath: resolve(vaultPath),
    get: createCachedHttpGet(resolve(options.cache ?? DEFAULT_CACHE)),
  };
}

/**
 * Ends the command with a message and a non-zero exit code.
 *
 * Throws rather than calling `process.exit`. Exiting from inside an async
 * commander action tears the event loop down while fetch and sharp handles are
 * still open, which on Windows aborts the process with a libuv assertion
 * (`exit code 3221226505`) instead of a clean `1` — so "no such book" looked
 * like a crash.
 */
class CliError extends Error {}

function fail(message: string): never {
  throw new CliError(message);
}

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CliError) {
    console.error(`stacks: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
