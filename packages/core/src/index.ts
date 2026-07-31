export {
  BOOK_STATUSES,
  DEFAULT_BOOK_STATUS,
  isBookStatus,
  type BookInput,
  type BookRecord,
  type BookStatus,
} from './types.ts';

export type { VaultAdapter } from './adapters/vault-adapter.ts';
export { ObsidianAdapter } from './adapters/obsidian-adapter.ts';

export { parseNote, type ParsedNote } from './frontmatter.ts';

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
  type MetadataSource,
} from './metadata/index.ts';

export { addBook, type AddBookOptions, type AddBookResult } from './add-book.ts';

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

export { renderOgImage, type OgImageOptions } from './og-image.ts';
export { publish, type PublishOptions, type PublishResult } from './publish.ts';
