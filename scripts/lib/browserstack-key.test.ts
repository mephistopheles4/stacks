/**
 * The key rules T6 adds (room spec S13.6, C14): the BrowserStack key lives in the
 * launcher's own environment and nowhere the repo's root `.env` reaches, because
 * wrangler reads that file itself on every run.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserstackFileRefusals,
  browserstackRootRefusals,
  dropBrowserstack,
  isBrowserstackName,
} from './browserstack-key.ts';
import { uploadEnv } from './upload.ts';

const file = (text: string, label = 'the repo root .env') => ({ label, text });

describe('isBrowserstackName', () => {
  it('matches the prefix in any case and nothing else', () => {
    expect(isBrowserstackName('BROWSERSTACK_ACCESS_KEY')).toBe(true);
    expect(isBrowserstackName('browserstack_username')).toBe(true);
    expect(isBrowserstackName('BROWSERSTACK_')).toBe(true);
    expect(isBrowserstackName('BROWSERSTACK')).toBe(false);
    expect(isBrowserstackName('XBROWSERSTACK_KEY')).toBe(false);
    expect(isBrowserstackName('STACKS_VAULT')).toBe(false);
  });
});

describe('browserstackFileRefusals — an env file may not name a BROWSERSTACK_ variable', () => {
  it('refuses each name, however dotenv would read the line, and never prints a value', () => {
    const secret = 's3cr3t-value-123';
    const text = [
      '# a comment is not an assignment',
      `BROWSERSTACK_ACCESS_KEY=${secret}`,
      `  export BROWSERSTACK_USERNAME="${secret}"`,
      `browserstack_other: ${secret}`,
      'STACKS_VAULT=C:\\vault',
    ].join('\r\n');
    const found = browserstackFileRefusals([file(text)]);
    expect(found).toHaveLength(3);
    expect(found.join('\n')).toContain('BROWSERSTACK_ACCESS_KEY');
    expect(found.join('\n')).toContain('BROWSERSTACK_USERNAME');
    expect(found.join('\n')).toContain('BROWSERSTACK_OTHER');
    expect(found.join('\n')).toContain('the repo root .env');
    expect(found.join('\n')).not.toContain(secret);
    expect(found.join('\n')).not.toContain('STACKS_VAULT');
  });

  it('refuses a blank assignment too: the name is what is refused, not the value', () => {
    expect(browserstackFileRefusals([file('BROWSERSTACK_ACCESS_KEY=')])).toHaveLength(1);
  });

  it('passes a file that holds no such name, and a commented one', () => {
    expect(
      browserstackFileRefusals([file('STACKS_VAULT=x\n# BROWSERSTACK_ACCESS_KEY=\n')]),
    ).toEqual([]);
    expect(browserstackFileRefusals([])).toEqual([]);
  });

  it('names each file that holds one', () => {
    const found = browserstackFileRefusals([
      file('BROWSERSTACK_ACCESS_KEY=a', 'the repo root .env'),
      file('BROWSERSTACK_USERNAME=b', 'the repo root .env.local'),
    ]);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('the repo root .env');
    expect(found[1]).toContain('the repo root .env.local');
  });
});

describe('browserstackRootRefusals — the env files an entry loads', () => {
  it('reads the root .env, .env.local and the main checkout’s .env, and skips a missing one', () => {
    const files: Record<string, string> = {
      [join('/repo', '.env')]: 'STACKS_VAULT=x',
      [join('/repo', '.env.local')]: 'BROWSERSTACK_ACCESS_KEY=a',
      [join('/main', '.env')]: 'BROWSERSTACK_USERNAME=b',
    };
    const found = browserstackRootRefusals('/repo', '/main', (path) => files[path]);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('.env.local');
    expect(found[1]).toContain("main checkout's .env");
    expect(browserstackRootRefusals('/repo', undefined, () => undefined)).toEqual([]);
  });
});

describe('dropBrowserstack', () => {
  it('removes every BROWSERSTACK_ name in any case and keeps the rest', () => {
    const kept = dropBrowserstack({
      BROWSERSTACK_ACCESS_KEY: 'k',
      browserstack_username: 'u',
      PATH: '/bin',
      HOME: '/h',
    });
    expect(kept).toEqual({ PATH: '/bin', HOME: '/h' });
  });
});

describe('uploadEnv — wrangler is never handed a BrowserStack variable', () => {
  it('drops them from the shell even when .env did not supply them', () => {
    const env = uploadEnv(
      { BROWSERSTACK_ACCESS_KEY: 'k', Browserstack_Username: 'u', PATH: '/bin' },
      [],
    );
    expect(Object.keys(env).some((name) => name.toUpperCase().startsWith('BROWSERSTACK_'))).toBe(
      false,
    );
    expect(env['PATH']).toBe('/bin');
    expect(env['WRANGLER_SEND_METRICS']).toBe('false');
  });
});
