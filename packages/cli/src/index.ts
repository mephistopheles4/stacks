#!/usr/bin/env node
import { Command } from 'commander';
import { BOOK_STATUSES } from '@stacks/core';

/**
 * Phase 0: every command is registered but unimplemented.
 *
 * Registration is the point — the Phase 0 gate is that `stacks --help` prints a
 * command list, which a bare program would not.
 */
function notImplemented(landsIn: string): () => never {
  return () => {
    console.error(`stacks: not implemented yet — lands in ${landsIn}`);
    process.exit(1);
  };
}

const program = new Command();

program
  .name('stacks')
  .description('Reading tracker whose Obsidian vault is the database.')
  .version('0.0.0');

program
  .command('add')
  .description('Fetch metadata and cover for a book, then write a note into the vault')
  .argument('<isbn-or-title>', 'an ISBN, or a title to search for')
  .option('--status <status>', `one of: ${BOOK_STATUSES.join(' | ')}`)
  .action(notImplemented('phase 1'));

program
  .command('build')
  .description('Parse the vault into library.json and build the static site')
  .option('--public', 'emit a shareable build: covers and metadata only, no note bodies')
  .action(notImplemented('phase 1'));

program
  .command('status')
  .description('Quick stats: books this year, in progress, covers still missing')
  .action(notImplemented('phase 1'));

program
  .command('import')
  .description('Import listening history from a self-hosted Audiobookshelf instance')
  .argument('<source>', 'currently only "audiobookshelf"')
  .action(notImplemented('phase 4'));

program.parse();
