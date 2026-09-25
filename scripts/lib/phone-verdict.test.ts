/**
 * The pure half of `scripts/phone-check.ts`.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`. The script around it
 * needs adb and a phone, which is why everything that decides anything lives
 * here, where a desktop can check it.
 */

import { describe, expect, it } from 'vitest';
import {
  formatRows,
  interestingLogcat,
  matrixRuns,
  parsePhoneArgs,
  phoneVerdict,
  pickDevice,
  resolveRunUrl,
  type PhoneObservation,
} from './phone-verdict.ts';

/** A run that held: polled 120 times, in front each time, the default page drawing real-time. */
const held: PhoneObservation = {
  polls: 120,
  visiblePolls: 120,
  lostAtS: undefined,
  linkFailures: 0,
  contexts: 1,
  ready: true,
  fallback: 'none',
};

describe('phoneVerdict', () => {
  it('passes a run that held, in front, with no fallback in play', () => {
    expect(phoneVerdict(held).kind).toBe('survived');
  });

  it('calls a loss a loss, whatever else the run saw', () => {
    const verdict = phoneVerdict({ ...held, lostAtS: 1.2, visiblePolls: 3, fallback: 'waiting' });
    expect(verdict).toEqual({
      kind: 'lost',
      reason: 'the WebGL context was lost 1.2 s after navigation',
    });
  });

  it('calls a failed link its own failure', () => {
    expect(phoneVerdict({ ...held, linkFailures: 2 }).kind).toBe('link-fail');
  });

  it('refuses a page that never drew as a survival', () => {
    // An origin Chrome has blocked after a loss answers every new context with
    // null: the page shows a sentence and draws nothing, and nothing is lost.
    expect(phoneVerdict({ ...held, ready: false, contexts: 0 }).kind).toBe('no-context');
    expect(phoneVerdict({ ...held, contexts: 0 }).reason).toContain('saw no WebGL context');
  });

  it('refuses a page that was hidden for even one poll', () => {
    const verdict = phoneVerdict({ ...held, visiblePolls: 119 });
    expect(verdict.kind).toBe('invalid-hidden');
    expect(verdict.reason).toContain('in front for 119 of 120 polls');
  });

  it('refuses a run nobody polled', () => {
    expect(phoneVerdict({ ...held, polls: 0, visiblePolls: 0 })).toEqual({
      kind: 'invalid-hidden',
      reason: 'the page was never polled',
    });
  });

  it.each(['remembered', 'retired', 'probe-override', 'restored', 'fresh-canvas', undefined])(
    'refuses a run whose fallback read %s, which may have been painted',
    (fallback) => {
      // After one lost run the device carries a record, and every later run
      // would start painted and survive by reading no map at all.
      expect(phoneVerdict({ ...held, fallback }).kind).toBe('invalid-fallback');
    },
  );
});

describe('parsePhoneArgs', () => {
  it('runs the default page once for 120 s on port 8765 through adb on the PATH', () => {
    expect(parsePhoneArgs([])).toEqual({
      runs: [{ label: 'run', url: '/', waitS: 120 }],
      serve: undefined,
      port: 8765,
      adb: 'adb',
      serial: undefined,
      keep: false,
      shot: false,
      gpuinfo: false,
    });
  });

  it('takes every flag it documents', () => {
    const options = parsePhoneArgs([
      '--url',
      '/?shadows=0',
      '--wait',
      '45',
      '--label',
      'painted',
      '--serial',
      'ABC123',
      '--adb',
      'C:/tools/adb.exe',
      '--port',
      '9000',
      '--serve',
      'packages/site/dist',
      '--keep',
      '--shot',
    ]);
    expect(options).toMatchObject({
      runs: [{ label: 'painted', url: '/?shadows=0', waitS: 45 }],
      serial: 'ABC123',
      adb: 'C:/tools/adb.exe',
      port: 9000,
      serve: 'packages/site/dist',
      keep: true,
      shot: true,
    });
  });

  it('runs the matrix with the reproduction last', () => {
    const runs = parsePhoneArgs(['--matrix', '--wait', '60']).runs;
    expect(runs.map((run) => run.url)).toEqual(['/', '/', '/', '/?shadows=0', '/?receivers=all']);
    expect(runs.every((run) => run.waitS === 60)).toBe(true);
    expect(matrixRuns(10).at(-1)?.label).toBe('receivers-all');
  });

  it.each([
    [['--seriall', 'X'], 'unknown argument "--seriall"'],
    [['stray'], 'unknown argument "stray"'],
    [['--serial'], '--serial needs a value'],
    [['--serial', '--keep'], '--serial needs a value'],
    [['--wait', '0'], '--wait needs a whole number'],
    [['--wait', 'soon'], '--wait needs a whole number'],
    [['--url', 'stacks.example'], '--url takes a path'],
    [['--matrix', '--url', '/'], 'drop --url'],
  ])('refuses %j rather than guessing', (argv, message) => {
    expect(() => parsePhoneArgs(argv)).toThrow(message);
  });

  it('takes an absolute URL for a page it does not serve', () => {
    expect(parsePhoneArgs(['--url', 'https://stacks.example/']).runs[0]?.url).toBe(
      'https://stacks.example/',
    );
  });
});

describe('resolveRunUrl', () => {
  it("puts a path on the phone's localhost, where adb reverse points", () => {
    expect(resolveRunUrl('/?receivers=all', 8765)).toBe('http://localhost:8765/?receivers=all');
  });

  it('leaves a whole URL alone', () => {
    expect(resolveRunUrl('https://stacks.example/', 8765)).toBe('https://stacks.example/');
  });
});

describe('pickDevice', () => {
  const listing = (...lines: string[]): string =>
    ['List of devices attached', ...lines, ''].join('\r\n');

  it('drives the one device attached', () => {
    expect(pickDevice(listing('ABCD1234EFGH5678\tdevice'), undefined)).toBe('ABCD1234EFGH5678');
  });

  it('ignores a device that is not authorised or is offline', () => {
    expect(pickDevice(listing('AAA\tunauthorized', 'BBB\toffline', 'CCC\tdevice'), undefined)).toBe(
      'CCC',
    );
  });

  it('refuses to choose between two', () => {
    expect(() => pickDevice(listing('AAA\tdevice', 'BBB\tdevice'), undefined)).toThrow(
      'more than one device: AAA, BBB — pass --serial',
    );
  });

  it('takes the one it was told, and only if it is there', () => {
    expect(pickDevice(listing('AAA\tdevice', 'BBB\tdevice'), 'BBB')).toBe('BBB');
    expect(() => pickDevice(listing('AAA\tdevice'), 'BBB')).toThrow('no device "BBB"');
  });

  it('says so when nothing is attached', () => {
    expect(() => pickDevice(listing(), undefined)).toThrow('no device attached');
  });
});

describe('formatRows', () => {
  it('prints a header, the columns, and three lines a run', () => {
    const lines = formatRows('PowerVR D-Series DXT-48-1536 · Chrome/153', [
      {
        label: 'default-1',
        verdict: { kind: 'survived', reason: 'held' },
        elapsedS: 120.4,
        sampling: '30 steady frames',
        judged: 'ok',
      },
    ]);
    expect(lines[0]).toBe('PowerVR D-Series DXT-48-1536 · Chrome/153');
    expect(lines[1]).toBe(`${'run'.padEnd(11)}${'verdict'.padEnd(18)}${'time'.padStart(7)}   G61`);
    expect(lines[2]).toBe(
      `${'default-1'.padEnd(11)}${'survived'.padEnd(18)}${'120 s'.padStart(7)}   ok\n` +
        `${''.padEnd(11)}held\n${''.padEnd(11)}30 steady frames`,
    );
  });
});

describe('interestingLogcat', () => {
  it('keeps the driver and the GPU process, and drops the window chatter', () => {
    const logcat = [
      '09-24 11:28:01.100 I/WindowManager( 1): Relayout chromium',
      "09-25 02:06:37.649 W/JobInfo ( 1948): Job 'com.android.chrome/org.chromium.components.background_task_scheduler' has a deadline",
      '09-25 02:06:41.413 D/ActivityManager( 1948): freezing 26520 com.google.android.webview:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0',
      '09-24 11:28:02.200 E/chromium( 2): [ERROR:gpu_process_host.cc] GPU process exited unexpectedly',
      '09-24 11:28:02.300 W/IMGSRV  ( 3): HWR event',
      '09-24 11:28:03.000 I/Launcher( 4): nothing to see',
    ].join('\n');
    expect(interestingLogcat(logcat)).toEqual([
      '09-24 11:28:02.200 E/chromium( 2): [ERROR:gpu_process_host.cc] GPU process exited unexpectedly',
      '09-24 11:28:02.300 W/IMGSRV  ( 3): HWR event',
    ]);
  });

  it('keeps only the last lines asked for', () => {
    const logcat = Array.from(
      { length: 5 },
      (_, index) => `E/chromium: line ${String(index)}`,
    ).join('\n');
    expect(interestingLogcat(logcat, 2)).toEqual(['E/chromium: line 3', 'E/chromium: line 4']);
  });
});
