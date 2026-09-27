import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { metadataOptionsFromEnv } from './metadata-options.ts';

/**
 * `STACKS_LANGUAGE`, read once and refused loudly.
 *
 * The value is interpolated into an Open Library query, so it is checked against
 * an allowlist rather than passed through — and a bad one stops the command
 * rather than falling back to English, because a silent fallback is the one
 * outcome indistinguishable from the setting working. See ADR-0094.
 */

const KEYS = ['STACKS_LANGUAGE', 'GOOGLE_BOOKS_API_KEY'] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('metadataOptionsFromEnv', () => {
  it('reads English when the variable is unset', () => {
    expect(metadataOptionsFromEnv().language).toBe('en');
  });

  it('reads English when the variable is empty', () => {
    process.env['STACKS_LANGUAGE'] = '  ';
    expect(metadataOptionsFromEnv().language).toBe('en');
  });

  it('trims and lowercases what it is given', () => {
    process.env['STACKS_LANGUAGE'] = ' TR ';
    expect(metadataOptionsFromEnv().language).toBe('tr');
  });

  it.each(['english', 'en-GB', 'eng', 'xx', 'en # English', 'constructor'])(
    'refuses %j, naming the variable and quoting what it received',
    (value) => {
      process.env['STACKS_LANGUAGE'] = value;

      // `loadEnv` keeps inline comments, so `STACKS_LANGUAGE=en # English`
      // arrives as `en # English` — and the owner has to be able to see that.
      expect(() => metadataOptionsFromEnv()).toThrow('STACKS_LANGUAGE');
      expect(() => metadataOptionsFromEnv()).toThrow(JSON.stringify(value));
    },
  );

  it('lists the codes it accepts when it refuses', () => {
    process.env['STACKS_LANGUAGE'] = 'english';
    expect(() => metadataOptionsFromEnv()).toThrow(/\ben\b.*\btr\b/);
  });

  it('carries the Google Books key beside it, and only when there is one', () => {
    expect(metadataOptionsFromEnv()).not.toHaveProperty('googleBooksKey');

    process.env['GOOGLE_BOOKS_API_KEY'] = 'abc';
    expect(metadataOptionsFromEnv().googleBooksKey).toBe('abc');
  });
});
