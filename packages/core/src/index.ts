export {
  BINDINGS,
  BOOK_STATUSES,
  DEFAULT_BOOK_STATUS,
  isBinding,
  isBookStatus,
  type Binding,
  type BookInput,
  type BookRecord,
  type BookStatus,
} from './types.ts';

export type { FrontmatterChanges, VaultAdapter } from './adapters/vault-adapter.ts';
export { ObsidianAdapter } from './adapters/obsidian-adapter.ts';

export { parseNote, type ParsedNote } from './frontmatter.ts';

export { keyIfPresent } from './key-if-present.ts';

export { compareShelfPosition, SHELVED_STATUSES, type Positionable } from './shelf-order.ts';

export {
  isProbablySameBook,
  isValidIsbn,
  normaliseIsbn,
  normaliseTitleAuthor,
  titleMatchScore,
} from './identity.ts';

export {
  buildLibrary,
  type BuildLibraryOptions,
  type Library,
  type LibraryBook,
} from './library.ts';

export { dominantColour, spineColour, type Region } from './covers/dominant-colour.ts';

export {
  createCachedHttpGet,
  lookup,
  lookupByIsbn,
  searchByTitle,
  type BookMetadata,
  type HttpGet,
  type MetadataOptions,
  type MetadataSource,
} from './metadata/index.ts';

export { addBook, type AddBookOptions, type AddBookResult } from './add-book.ts';

export { enrichBook, missingFields, type EnrichOptions, type EnrichOutcome } from './enrich.ts';

export { cacheCover, type CachedCover } from './covers/cache-cover.ts';

export {
  importBooks,
  parseAudibleExport,
  type AudibleBook,
  type AudibleImportOptions,
  type ImportableBook,
  type ImportOptions,
  type ImportOutcome,
  type ImportResult,
} from './import/index.ts';

export { isRebuildTrigger, watchVault, type Closeable, type WatchOptions } from './watch.ts';

export { publish, type PublishOptions, type PublishResult } from './publish.ts';

export {
  backfillCoverSources,
  type BackfillOptions,
  type BackfillOutcome,
  type BackfillResult,
  type MeasureCover,
} from './backfill-covers.ts';
export { measureCover } from './covers/measure.ts';
export { COVER_SOURCES, isCoverSource, type CoverSource } from './covers/cover-source.ts';
