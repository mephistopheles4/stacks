import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import type { HttpGet } from './metadata/http.ts';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURE_VAULT = join(REPO_ROOT, 'fixtures', 'vault');
const API_DIR = join(REPO_ROOT, 'fixtures', 'api');

export function readApiFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(API_DIR, name), 'utf8')) as unknown;
}

/**
 * An `HttpGet` backed entirely by captured responses.
 *
 * Tests must never make a live call (CLAUDE.md, phase 1 gate). This throws on
 * an unmapped URL rather than returning `undefined`, so a test that
 * accidentally reaches for the network fails loudly instead of quietly
 * exercising the not-found path and passing for the wrong reason.
 */
export function fixtureHttpGet(routes: Readonly<Record<string, string>>): HttpGet {
  return async (url: string) => {
    for (const [pattern, fixture] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return fixture === '' ? undefined : readApiFixture(fixture);
      }
    }
    throw new Error(`no fixture mapped for ${url} — tests must not hit the network`);
  };
}

/** A silenced `console.warn`, and what was said to it. */
export interface WarnSpy {
  /** One entry per call, arguments joined with a space — the shape assertions want. */
  readonly lines: readonly string[];
  /** Puts the real `console.warn` back. Call it in `afterEach`. */
  restore(): void;
}

/**
 * Silence `console.warn` and record what it was told.
 *
 * Invariant 3 makes a warning the *product* of a bad note rather than noise, so
 * four specs spy on `console.warn` — to keep a deliberate warning out of the
 * test output, and in one case to assert which files it named.
 *
 * ⚠️ **This exists because the obvious annotation is untypeable.** All four
 * wrote `let warn: ReturnType<typeof vi.spyOn>`, which resolves to
 * `MockInstance<any>`, so `warn.mockRestore()` is an unsafe call on an unsafe
 * member access — eight lint findings, one idiom, four files. A parameterised
 * annotation is clean and so is a shared helper; the helper was chosen because
 * it is the one that every future spec inherits. See ADR-0076.
 *
 * It returns `lines` rather than the spy because the spy is not what any caller
 * wanted: three of the four ignore it entirely, and the fourth was pushing
 * `args.join(' ')` into a local array of its own.
 *
 * ⚠️ **This is the first `vitest` import in a file here that is not a `.test.ts`,
 * and it must stay unreachable from `index.ts`.** `@stacks/core`'s root export is
 * what the site imports from, and a value path from there to `vitest` would put
 * the test framework in the browser bundle — the same failure mode as the
 * `node:fs` and sharp one that "the site may only `import type`" exists for. The
 * protection today is that nothing re-exports this file and only specs import it.
 * Keep it that way.
 */
export function spyOnWarn(): WarnSpy {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });

  return {
    lines,
    restore: () => {
      spy.mockRestore();
    },
  };
}

/** The real ISBN whose Open Library response is captured in fixtures/api. */
export const CAPTURED_ISBN = '9781603580557';

/**
 * Whether a URL is *at* a host, rather than merely mentioning one.
 *
 * A substring test answers "does this string contain those characters", which is
 * not the question any stub or assertion here is asking —
 * `evil.com/?x=googleapis.com` satisfies it, and so does
 * `googleapis.com.example.net`. CodeQL flags it as
 * `js/incomplete-url-substring-sanitization`, eleven times and counting.
 *
 * **Not a security fix**: nothing malicious turns up in a fixture map. It is a
 * routing rule that says what it means — a stub claiming "this is the Google
 * request" should not answer one that went somewhere else whose URL happens to
 * mention Google.
 *
 * Lives here rather than in one test file because six of them had written it
 * out, which is the shape a helper is supposed to prevent.
 */
export function isHost(url: string, host: string): boolean {
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

/** What a planted cover carries, each kind invented and each read back by the test that plants it. */
export interface PlantedCoverOptions {
  readonly format?: 'png' | 'jpeg';
  readonly exif?: boolean;
  readonly xmp?: boolean;
  /** An EXIF orientation tag, applied by nothing until a re-encode turns the copy upright. */
  readonly orientation?: number;
  /** A PNG `tEXt` chunk, which sharp reports as `comments`. PNG only. */
  readonly text?: boolean;
  /** An IPTC City dataset in a Photoshop APP13 segment, which sharp reports as `iptc`. JPEG only. */
  readonly iptc?: boolean;
}

/**
 * A real image carrying invented camera metadata, for the held tier's tests.
 *
 * One builder for `publish()`'s tests and G20's plants, because the plant has
 * to be the same file in both: a stage proven to strip what this writes, and an
 * inspector proven to refuse it. sharp writes EXIF, XMP and the orientation tag
 * itself; it writes neither PNG text nor IPTC, so those two are spliced in by
 * hand. Every string is invented (ADR-0004). sharp is loaded here, never at the
 * top of the module, so the many tests importing this file never pay for it.
 */
export async function plantedCover(
  width: number,
  height: number,
  options: PlantedCoverOptions = {},
): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  let pipeline = sharp({ create: { width, height, channels: 3, background: '#2f6d7a' } });
  if (options.exif === true) {
    pipeline = pipeline.withExif({ IFD0: { ImageDescription: 'Invented planted camera' } });
  }
  if (options.xmp === true) {
    pipeline = pipeline.withXmp(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
        'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>',
    );
  }
  if (options.orientation !== undefined) {
    pipeline = pipeline.withMetadata({ orientation: options.orientation });
  }
  if (options.format === 'jpeg') {
    const jpeg = await pipeline.jpeg().toBuffer();
    // APP13 right after the start-of-image marker.
    return options.iptc === true
      ? Buffer.concat([jpeg.subarray(0, 2), iptcSegment('Invented City'), jpeg.subarray(2)])
      : jpeg;
  }
  const png = await pipeline.png().toBuffer();
  // After the signature (8 bytes) and the IHDR chunk (25), where any chunk may go.
  return options.text === true
    ? Buffer.concat([
        png.subarray(0, 33),
        pngChunk('tEXt', Buffer.from('Comment\0Invented planted place', 'latin1')),
        png.subarray(33),
      ])
    : png;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, body, tail]);
}

/** One IPTC dataset, 2:90 (City), in an 8BIM resource 0x0404 inside an APP13 segment. */
function iptcSegment(city: string): Buffer {
  const value = Buffer.from(city, 'latin1');
  const dataset = Buffer.concat([Buffer.from([0x1c, 0x02, 0x5a, 0x00, value.length]), value]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(dataset.length);
  const resource = Buffer.concat([
    Buffer.from('8BIM', 'latin1'),
    Buffer.from([0x04, 0x04, 0x00, 0x00]),
    size,
    dataset,
    Buffer.alloc(dataset.length % 2),
  ]);
  const payload = Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), resource]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xed]), length, payload]);
}
