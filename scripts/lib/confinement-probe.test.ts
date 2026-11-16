/**
 * The confinement probe (room spec S6.7, C6): red when the worker can get out, and the files it
 * writes are the ones G20 refuses in a production build.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  judgeProbe,
  PROBE_PAGE_PATH,
  PROBE_PAGE_SCRIPT,
  PROBE_TARGET_SOURCE,
  PROBE_WORKER_SOURCE,
  policyMetaOf,
  probePage,
  writeProbe,
} from './confinement-probe.ts';
import { CONFINEMENT_PROBE_MARKER, KTX2_WORKER_POLICY } from './public-build.ts';

const GREEN = { eval: 'reached', fetch: 'blocked', worker: 'blocked', importScripts: 'blocked' };

describe('judgeProbe', () => {
  it('is green only when eval ran and every way out was blocked', () => {
    expect(judgeProbe(GREEN).ok).toBe(true);
  });

  it('is red on a worker that can fetch, a second worker or importScripts, each on its own', () => {
    for (const out of ['fetch', 'worker', 'importScripts']) {
      const judged = judgeProbe({ ...GREEN, [out]: 'reached' });
      expect(judged.ok, out).toBe(false);
      expect(judged.line, out).toContain(out);
    }
  });

  it('is red when eval was blocked, and says it is the worker’s own policy that did not apply', () => {
    const judged = judgeProbe({ ...GREEN, eval: 'blocked' });
    expect(judged.ok).toBe(false);
    expect(judged.line).toContain('own policy');
  });

  it('is red on a missing answer and on an answer of another shape', () => {
    const { fetch: _omitted, ...partial } = GREEN;
    expect(judgeProbe(partial).ok).toBe(false);
    expect(judgeProbe({ ...GREEN, fetch: 'yes' }).ok).toBe(false);
    for (const shape of [undefined, null, 'x', 3]) expect(judgeProbe(shape).ok).toBe(false);
  });
});

describe('the probe’s sources', () => {
  it('carry the marker G20 refuses in a production build', () => {
    for (const text of [PROBE_WORKER_SOURCE, PROBE_TARGET_SOURCE, PROBE_PAGE_SCRIPT]) {
      expect(text).toContain(CONFINEMENT_PROBE_MARKER);
    }
    expect(probePage('<meta http-equiv="content-security-policy" content="x">')).not.toContain(
      'undefined',
    );
  });

  it('parse as scripts', () => {
    for (const text of [PROBE_WORKER_SOURCE, PROBE_TARGET_SOURCE, PROBE_PAGE_SCRIPT]) {
      expect(() => new Script(text)).not.toThrow();
    }
  });
});

describe('policyMetaOf', () => {
  it('finds the policy meta tag and nothing else', () => {
    const tag = '<meta http-equiv="content-security-policy" content="default-src \'none\'">';
    expect(policyMetaOf(`<head>${tag}</head>`)).toBe(tag);
    expect(policyMetaOf('<head><meta charset="utf-8"></head>')).toBeUndefined();
  });
});

describe('writeProbe', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'probe-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'rooms', 'basis'), { recursive: true });
    writeFileSync(join(dir, 'rooms', 'basis', 'ktx2-worker.js'), 'REAL WORKER');
    writeFileSync(
      join(dir, 'index.html'),
      '<head><meta http-equiv="content-security-policy" content="script-src \'self\'"></head>',
    );
    writeFileSync(
      join(dir, '_headers'),
      `/rooms/basis/ktx2-worker.js\n  Content-Security-Policy: ${KTX2_WORKER_POLICY}\n`,
    );
    return dir;
  }

  it('replaces the worker at its own path with the probe, and adds the target and the page', () => {
    const dir = scratch();
    writeProbe(dir, false);
    expect(readFileSync(join(dir, 'rooms', 'basis', 'ktx2-worker.js'), 'utf8')).toBe(
      PROBE_WORKER_SOURCE,
    );
    expect(
      readFileSync(join(dir, ...PROBE_PAGE_PATH.split('/').filter(Boolean)), 'utf8'),
    ).toContain('content-security-policy');
    expect(readFileSync(join(dir, '_headers'), 'utf8')).toContain(KTX2_WORKER_POLICY);
  });

  it('loosens the worker’s policy for the control, so the probe must come back red', () => {
    const dir = scratch();
    writeProbe(dir, true);
    const headers = readFileSync(join(dir, '_headers'), 'utf8');
    expect(headers).not.toContain(KTX2_WORKER_POLICY);
    expect(headers).not.toContain("default-src 'none'");
  });

  it('refuses a scratch folder with no policy meta or no worker policy to loosen', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'index.html'), '<head></head>');
    expect(() => {
      writeProbe(dir, false);
    }).toThrow('policy meta');
    const other = scratch();
    writeFileSync(join(other, '_headers'), '/x\n  X-Test: 1\n');
    expect(() => {
      writeProbe(other, true);
    }).toThrow('worker policy');
  });
});
