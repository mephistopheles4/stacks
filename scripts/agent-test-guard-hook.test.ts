/**
 * `scripts/agent-test-guard.ts`'s athanor probe, and the script as Claude Code
 * spawns it (#513, C2, C5 and C7).
 *
 * A fake `athanor` goes on a scratch PATH: a `.cmd` on Windows, which is what
 * an npm install leaves, and a shell script elsewhere. The fake never starts
 * the real tool. ⚠️ **Excluded from Stryker's dry run**
 * (`vitest.stryker.config.ts`): it writes a scratch folder and spawns
 * processes. The decision itself is tested in process, in
 * `scripts/lib/agent-test-guard.test.ts`, which stays in.
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { probeAthanor } from './lib/agent-test-guard.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

const guard = join(REPO_ROOT, 'scripts', 'agent-test-guard.ts');
const scratch = mkdtempSync(join(tmpdir(), 'stacks-guard-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let made = 0;
function folder(): string {
  const dir = join(scratch, `case-${String(made++)}`);
  mkdirSync(dir);
  return dir;
}

// `ok` prints a version; `dangling` is mise's message for a shim that points
// nowhere; `hang` records its own process id and never returns.
const BODIES = {
  ok: "console.log('0.1.0');",
  dangling: "console.error('mise ERROR athanor is not a valid shim.'); process.exit(1);",
  noversion: "console.log('this is not athanor');",
  hang: "import('node:fs').then((fs) => fs.writeFileSync(new URL('./pid.txt', import.meta.url), String(process.pid))); setInterval(() => {}, 1000);",
};

function fake(kind: keyof typeof BODIES): string {
  const dir = folder();
  writeFileSync(join(dir, 'fake.mjs'), BODIES[kind]);
  if (process.platform === 'win32') {
    writeFileSync(join(dir, 'athanor.cmd'), `@"${process.execPath}" "%~dp0fake.mjs" %*\r\n`);
  } else {
    writeFileSync(
      join(dir, 'athanor'),
      `#!/bin/sh\nexec "${process.execPath}" "${dir}/fake.mjs" "$@"\n`,
    );
    chmodSync(join(dir, 'athanor'), 0o755);
  }
  return dir;
}

// A stand-in that leaves a marker where it runs, as a planted file would.
function planted(dir: string): string {
  const marker = join(dir, 'marker.txt');
  if (process.platform === 'win32') {
    writeFileSync(join(dir, 'athanor.cmd'), `@echo planted> "${marker}"\r\n`);
  } else {
    writeFileSync(join(dir, 'athanor'), `#!/bin/sh\necho planted > "${marker}"\n`);
    chmodSync(join(dir, 'athanor'), 0o755);
  }
  return marker;
}

// The machine's own NoDefaultCurrentDirectoryInExePath is taken out, so the
// probe stands on what it sets itself.
function envWith(path: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: path };
  for (const key of Object.keys(env)) {
    if (
      key.toLowerCase() === 'nodefaultcurrentdirectoryinexepath' ||
      key.toLowerCase() === 'path'
    ) {
      Reflect.deleteProperty(env, key);
    }
  }
  env.PATH = path;
  return env;
}

describe('C2: the probe', () => {
  it('finds a working athanor', async () => {
    expect(await probeAthanor({ env: envWith(fake('ok')) })).toBe(true);
  });

  it('counts a dangling shim, a non-version and an empty PATH as missing', async () => {
    expect(await probeAthanor({ env: envWith(fake('dangling')) })).toBe(false);
    expect(await probeAthanor({ env: envWith(fake('noversion')) })).toBe(false);
    expect(await probeAthanor({ env: envWith(folder()) })).toBe(false);
  });

  it('ends a hang at its limit, with the child gone', async () => {
    const dir = fake('hang');
    const started = Date.now();
    expect(await probeAthanor({ env: envWith(dir), limitMs: 1500 })).toBe(false);
    expect(Date.now() - started).toBeLessThan(4000);
    const pidFile = join(dir, 'pid.txt');
    expect(existsSync(pidFile)).toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    const alive = (): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 40 && alive(); i++) await new Promise((r) => setTimeout(r, 100));
    expect(alive()).toBe(false);
  });

  // The fixed folder and the switch against the current-folder lookup back
  // each other up, so this fails only when both are gone.
  it('never runs a file planted in the working folder', async () => {
    const dir = folder();
    const marker = planted(dir);
    const before = process.cwd();
    process.chdir(dir);
    try {
      expect(await probeAthanor({ env: envWith(fake('ok')) })).toBe(true);
      expect(await probeAthanor({ env: envWith(folder()) })).toBe(false);
      expect(existsSync(marker)).toBe(false);
    } finally {
      process.chdir(before);
    }
  });

  it('outside Windows, runs nothing when PATH has an empty or relative entry', async () => {
    const dir = fake('ok');
    const stand = folder();
    const marker = planted(stand);
    for (const path of [
      '',
      `${dir}${delimiter}`,
      `${dir}${delimiter}bin`,
      `${stand}${delimiter}.`,
    ]) {
      expect(
        await probeAthanor({ env: { PATH: path }, platform: 'linux' }),
        JSON.stringify(path),
      ).toBe(false);
    }
    expect(existsSync(marker)).toBe(false);
  });
});

const hook = (input: unknown, path: string, cwd = scratch) =>
  spawnSync(process.execPath, [guard], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: envWith(path),
    cwd,
    encoding: 'utf8',
  });
const call = (command: string, tool = 'Bash') => ({
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { command },
});

describe('C7: the script as Claude Code runs it', () => {
  it('prints the deny decision, exits 0 and writes nothing to stderr', () => {
    for (const tool of ['Bash', 'PowerShell']) {
      const r = hook(call('pnpm test', tool), fake('ok'));
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
      const out = JSON.parse(r.stdout) as Record<string, Record<string, unknown>>;
      expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
      expect(out.hookSpecificOutput).toMatchObject({
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      });
    }
  });

  it('is silent for every pass, from any working folder (C5)', () => {
    const working = fake('ok');
    const cases: [unknown, string][] = [
      [call('pnpm test # --host-fallback=docker is down'), working],
      [call('git status'), working],
      [call('athanor run'), working],
      [call('pnpm test'), folder()],
      [call('pnpm test'), fake('dangling')],
      [{ tool_name: 'Read', tool_input: { file_path: 'x' } }, working],
      ['{"tool_name": "Bash", "tool_input": {"command": "SECRET_TOKEN_abc123', working],
      ['not json at all', working],
      ['', working],
      ['null', working],
    ];
    for (const [input, path] of cases) {
      const r = hook(input, path, folder());
      expect(r.status, JSON.stringify(input)).toBe(0);
      expect(r.stdout, JSON.stringify(input)).toBe('');
      expect(r.stderr, JSON.stringify(input)).toBe('');
    }
  });

  it('holds no explicit decision but the refusal', () => {
    // An explicit allow skips the owner's permission prompt.
    const source =
      readFileSync(guard, 'utf8') +
      readFileSync(join(REPO_ROOT, 'scripts', 'lib', 'agent-test-guard.ts'), 'utf8');
    for (const word of ['allow', 'ask', 'updatedInput', 'additionalContext', 'systemMessage']) {
      expect(source).not.toMatch(new RegExp(`['"\`]${word}['"\`]`));
    }
  });
});
