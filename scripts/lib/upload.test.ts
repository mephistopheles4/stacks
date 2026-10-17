/**
 * The two things the deploy checks about its upload that a test can reach
 * without deploying: which wrangler is installed, and what environment it gets.
 *
 * `scripts/deploy.ts` runs at import, so neither can be driven through it; both
 * live in `./upload.ts` for that reason. Nothing here starts a process.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../packages/cli/src/env.ts';
import { pinMismatch, uploadEnv } from './upload.ts';

describe('pinMismatch — the deploy refuses a wrangler that is not the pinned one', () => {
  it('says nothing when the installed version is the pin, and names both when it is not', () => {
    expect(pinMismatch('4.149.0', '4.149.0')).toBeUndefined();

    const stale = pinMismatch('4.148.0', '4.149.0');
    expect(stale).toContain('4.148.0');
    expect(stale).toContain('4.149.0');

    // Nothing installed is a mismatch too, not a pass: `pnpm exec` would then
    // run whatever wrangler the PATH offers.
    expect(pinMismatch(undefined, '4.149.0')).toContain('4.149.0');
  });
});

describe('uploadEnv — the upload gets no .env key it does not need', () => {
  let dir: string | undefined;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('drops what loadEnv set, keeps wrangler’s names and the shell’s, and pins telemetry off', () => {
    dir = mkdtempSync(join(tmpdir(), 'stacks-upload-env-'));
    const file = join(dir, '.env');
    writeFileSync(
      file,
      [
        'GOOGLE_BOOKS_API_KEY=planted-key',
        'STACKS_VAULT=/planted/vault',
        'CLOUDFLARE_API_TOKEN=planted-token',
        'SET_BY_THE_SHELL=from-the-file',
        'WRANGLER_SEND_METRICS=from-the-file',
      ].join('\n'),
    );
    vi.stubEnv('SET_BY_THE_SHELL', 'from-the-shell');
    vi.stubEnv('WRANGLER_SEND_METRICS', 'true');
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', undefined);
    vi.stubEnv('STACKS_VAULT', undefined);
    vi.stubEnv('CLOUDFLARE_API_TOKEN', undefined);

    const loaded = loadEnv(file);
    const env = uploadEnv(process.env, loaded);

    expect(loaded).toEqual(
      expect.arrayContaining(['GOOGLE_BOOKS_API_KEY', 'STACKS_VAULT', 'CLOUDFLARE_API_TOKEN']),
    );
    expect(env['GOOGLE_BOOKS_API_KEY']).toBeUndefined();
    expect(env['STACKS_VAULT']).toBeUndefined();
    expect(env['CLOUDFLARE_API_TOKEN']).toBe('planted-token');
    expect(env['SET_BY_THE_SHELL']).toBe('from-the-shell');
    expect(env['WRANGLER_SEND_METRICS']).toBe('false');
    expect(env['PATH'] ?? env['Path']).toBeDefined();
  });
});
