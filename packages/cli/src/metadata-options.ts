import {
  DEFAULT_READING_LANGUAGE,
  isReadingLanguage,
  keyIfPresent,
  READING_LANGUAGES,
  type MetadataOptions,
  type ReadingLanguage,
} from '@stacks/core';

/**
 * What every searching command hands the metadata layer, read from the
 * environment once: the Google Books key and the reading language.
 *
 * One function rather than a read at each of `add`, `enrich` and `import`, which
 * each read the key separately and would otherwise each grow a second read. All
 * three call it before any vault write, so a refusal writes nothing.
 *
 * **`STACKS_LANGUAGE` refuses a bad value rather than falling back to English.**
 * A silent fallback is the one outcome indistinguishable from the setting
 * working. The value is interpolated into an Open Library query, so it is held
 * to `^[a-z]{2}$` *and* the table rather than passed through, after trimming and
 * lowercasing; empty means unset. The refusal quotes what it received, because
 * `loadEnv` keeps inline comments: `STACKS_LANGUAGE=en # English` arrives as
 * `en # English`, and the owner has to be able to see why it was refused.
 *
 * **Core refuses a bad value too**, `importBooks` included — it checks up front,
 * outside the `catch` that keeps an export's cover when a lookup fails. This
 * refusal still comes first, and is the one that names `STACKS_LANGUAGE`. See
 * ADR-0094.
 */
export function metadataOptionsFromEnv(): MetadataOptions {
  return {
    language: readingLanguageFrom(process.env['STACKS_LANGUAGE']),
    ...keyIfPresent('googleBooksKey', process.env['GOOGLE_BOOKS_API_KEY']),
  };
}

function readingLanguageFrom(received: string | undefined): ReadingLanguage {
  const code = (received ?? '').trim().toLowerCase();
  if (code === '') return DEFAULT_READING_LANGUAGE;
  if (/^[a-z]{2}$/.test(code) && isReadingLanguage(code)) return code;

  throw new Error(
    `STACKS_LANGUAGE must be a two-letter ISO 639-1 code, one of: ` +
      `${READING_LANGUAGES.join(', ')} — got ${JSON.stringify(received)}`,
  );
}
