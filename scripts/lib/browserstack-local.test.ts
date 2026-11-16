/**
 * The launcher's decisions (room spec S13, C14), with a fake key and a fake binary: the key is
 * in the config file and in nothing else, and the config file does not outlive the run.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  binaryArgs,
  configFileText,
  onlyList,
  parseLauncherArgs,
  readKey,
  runTunnel,
  scrubLogFile,
  sweepStaleConfigs,
  writeConfigFile,
  type ConfigFile,
  type Tunnel,
} from './browserstack-local.ts';

const KEY = 'fakeKey0123456789abcdef';
const USER = 'fake_user_1';
const key = { username: USER, accessKey: KEY };

describe('parseLauncherArgs', () => {
  it('takes the binary and an optional port, and refuses everything else', () => {
    expect(parseLauncherArgs(['--binary', '/b/BrowserStackLocal'])).toEqual({
      binary: '/b/BrowserStackLocal',
      port: 8766,
    });
    expect(parseLauncherArgs(['--binary', 'b', '--port', '9000'])).toEqual({
      binary: 'b',
      port: 9000,
    });
    for (const bad of [
      [],
      ['--binary'],
      ['--binary', '--port'],
      ['--binary', 'b', '--port', '80'],
      ['--binary', 'b', '--port', 'x'],
      ['--binary', 'b', '--key', 'k'],
      ['--binary', 'b', 'stray'],
    ]) {
      expect(typeof parseLauncherArgs(bad), bad.join(' ')).toBe('string');
    }
  });

  it('never echoes an unknown argument past forty characters', () => {
    const refused = parseLauncherArgs(['--binary', 'b', `--${'x'.repeat(200)}`]);
    expect(typeof refused === 'string' && refused.length < 100).toBe(true);
  });
});

describe('onlyList', () => {
  it('names the three hosts a device may ask for on the one port, and nothing else', () => {
    expect(onlyList(8766)).toBe('localhost,8766,0,127.0.0.1,8766,0,bs-local.com,8766,0');
  });
});

describe('readKey', () => {
  it('needs both variables, plainly shaped, and names the one that is wrong', () => {
    expect(readKey({ BROWSERSTACK_USERNAME: USER, BROWSERSTACK_ACCESS_KEY: KEY })).toEqual(key);
    expect(readKey({ BROWSERSTACK_ACCESS_KEY: KEY })).toContain('BROWSERSTACK_USERNAME');
    expect(readKey({ BROWSERSTACK_USERNAME: USER })).toContain('BROWSERSTACK_ACCESS_KEY');
    expect(readKey({ BROWSERSTACK_USERNAME: USER, BROWSERSTACK_ACCESS_KEY: '' })).toContain(
      'BROWSERSTACK_ACCESS_KEY',
    );
  });

  it('refuses a value that could end the YAML string early, and never prints it', () => {
    for (const odd of ['abc"def12345', 'abc\ndef12345', 'short', 'a b c d e f g h']) {
      const refused = readKey({ BROWSERSTACK_USERNAME: USER, BROWSERSTACK_ACCESS_KEY: odd });
      expect(typeof refused).toBe('string');
      expect(typeof refused === 'string' ? refused : '').not.toContain(odd);
    }
  });
});

describe('the binary’s command line', () => {
  it('carries the config file path and the one port, and no element holds the key', () => {
    const args = binaryArgs({ configFile: '/t/local.yml', logFile: '/r/tunnel.log', port: 8766 });
    expect(args).toContain('--config-file');
    expect(args).toContain('/t/local.yml');
    expect(args).not.toContain('--key');
    expect(args.some((arg) => arg.includes(KEY))).toBe(false);
  });
});

describe('writeConfigFile', () => {
  it('holds the key, is mode 0600 in its own folder where modes apply, and removes itself', () => {
    const config = writeConfigFile(KEY);
    try {
      expect(readFileSync(config.path, 'utf8')).toBe(configFileText(KEY));
      if (process.platform !== 'win32') {
        expect(statSync(config.path).mode & 0o777).toBe(0o600);
        expect(statSync(dirname(config.path)).mode & 0o777).toBe(0o700);
      }
    } finally {
      config.remove();
    }
    expect(existsSync(config.path)).toBe(false);
    expect(existsSync(dirname(config.path))).toBe(false);
    expect(() => {
      config.remove();
    }).not.toThrow();
  });
});

describe('sweepStaleConfigs', () => {
  it('removes a launcher folder holding only local.yml, and leaves every other folder alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'sweep-'));
    try {
      mkdirSync(join(root, 'bs-local-aaa'));
      writeFileSync(join(root, 'bs-local-aaa', 'local.yml'), 'key: "x"\n');
      mkdirSync(join(root, 'bs-local-bbb'));
      writeFileSync(join(root, 'bs-local-bbb', 'local.yml'), 'key: "x"\n');
      writeFileSync(join(root, 'bs-local-bbb', 'notes.txt'), 'mine');
      mkdirSync(join(root, 'other'));
      writeFileSync(join(root, 'other', 'local.yml'), 'key: "x"\n');
      writeFileSync(join(root, 'bs-local-file'), 'not a folder');
      expect(sweepStaleConfigs(root)).toBe(1);
      expect(existsSync(join(root, 'bs-local-aaa'))).toBe(false);
      expect(existsSync(join(root, 'bs-local-bbb', 'notes.txt'))).toBe(true);
      expect(existsSync(join(root, 'other', 'local.yml'))).toBe(true);
      expect(existsSync(join(root, 'bs-local-file'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('scrubLogFile', () => {
  it('removes the key and the username from the binary’s own log, and tolerates no log', () => {
    const root = mkdtempSync(join(tmpdir(), 'scrub-'));
    try {
      const log = join(root, 'tunnel.log');
      writeFileSync(log, `start as ${USER}\nconfig key ${KEY}\nfine line\n`);
      scrubLogFile(log, key);
      const text = readFileSync(log, 'utf8');
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(USER);
      expect(text).toContain('fine line');
      expect(() => {
        scrubLogFile(join(root, 'absent.log'), key);
      }).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** A fake binary: prints the lines it is given (one echoing the key, as a careless one might), then exits. */
function fakeTunnel(lines: readonly string[], code: number | null): Tunnel {
  return {
    onLine: (listener) => {
      for (const line of lines) listener(line);
    },
    exited: Promise.resolve(code),
    stop: () => undefined,
  };
}

describe('runTunnel — a fake key and a refused connection', () => {
  it('finds the key in no printed line and no file left behind, and returns the failure code', async () => {
    const printed: string[] = [];
    let config: ConfigFile | undefined;
    let started: readonly string[] = [];
    const code = await runTunnel(
      key,
      { binary: '/b/BrowserStackLocal', port: 8766 },
      '/r/tunnel.log',
      {
        writeConfig: (accessKey) => {
          config = writeConfigFile(accessKey);
          return config;
        },
        start: (_binary, args) => {
          started = args;
          return fakeTunnel(
            [`connecting with ${KEY} as ${USER}`, `connection refused for ${KEY}`],
            1,
          );
        },
        print: (line) => printed.push(line),
      },
    );
    expect(code).toBe(1);
    expect(printed).toHaveLength(2);
    expect(printed.join('\n')).not.toContain(KEY);
    expect(printed.join('\n')).not.toContain(USER);
    expect(started.some((arg) => arg.includes(KEY))).toBe(false);
    expect(config).toBeDefined();
    expect(existsSync(config?.path ?? '')).toBe(false);
  });

  it('removes the config file when the binary cannot be started', async () => {
    let config: ConfigFile | undefined;
    await expect(
      runTunnel(key, { binary: '/none', port: 8766 }, '/r/tunnel.log', {
        writeConfig: (accessKey) => {
          config = writeConfigFile(accessKey);
          return config;
        },
        start: () => {
          throw new Error('spawn failed');
        },
        print: () => undefined,
      }),
    ).rejects.toThrow('spawn failed');
    expect(existsSync(config?.path ?? '')).toBe(false);
  });

  it('hands the caller a way to stop the binary, for a signal', async () => {
    let stopped = false;
    let handle: (() => void) | undefined;
    await runTunnel(
      key,
      { binary: '/b', port: 8766 },
      '/r/t.log',
      {
        writeConfig: writeConfigFile,
        start: () => ({
          onLine: () => undefined,
          exited: Promise.resolve(null),
          stop: () => {
            stopped = true;
          },
        }),
        print: () => undefined,
      },
      (stop) => {
        handle = stop;
      },
    );
    handle?.();
    expect(stopped).toBe(true);
  });

  it('treats a signal exit as a failure', async () => {
    const code = await runTunnel(key, { binary: '/b', port: 8766 }, '/r/t.log', {
      writeConfig: writeConfigFile,
      start: () => fakeTunnel([], null),
      print: () => undefined,
    });
    expect(code).toBe(1);
  });
});
