/**
 * G73 — every file a room serves matches its build record.
 *
 * A room is committed baked (ADR-0161): a GLB and two texture sets in
 * `packages/site/public/rooms/<room>/`, made by a bake nobody can see from the
 * outside. `packages/site/rooms/<room>/build.json` is what says which bake: the
 * commands, the three tool versions and the SHA-256 of every input and every
 * served file. This holds the record and the disk to each other:
 *
 * - every file the record lists exists and has the recorded hash;
 * - **a file in the room's folder that the record does not list is red**, so a
 *   texture swapped in by hand, or left behind by a rebake that renamed it, does
 *   not ship under a record that does not know it;
 * - every bake input's recorded hash is the one `inputs.json` names;
 * - the record holds **no absolute path, drive letter, `~` or `..` escaping the
 *   repo**, and its bake command runs Blender with `--factory-startup` and with
 *   no auto-run flag: the record is read by the next person to run it, on their
 *   machine, and the bake command runs scripts.
 *
 * ## What it does not say
 *
 * ⚠️ **It proves the files are the ones recorded, not that the bake would make
 * them again.** A rebake is the same room and not the same bytes (ADR-0161), and
 * `verified` in the record says what was run to check the command, not that it
 * reproduces. Refresh the hashes with `node packages/site/rooms/shared/record_build.mjs <room>`.
 *
 * ## The vacuous green
 *
 * A sweep over no rooms, or a room with an empty record, passes everything
 * below. So at least one room must be found, each record must list at least ten
 * served files and ten inputs, and the judgement is planted red on a copy of
 * the real record in the same file.
 *
 * See docs/gates.md, row G73 (room-build-record), and ADR-0161.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, ROOM_SUPPORT_FOLDERS, expectFound, imagesNamedBy, ktx2Of } from './repo.ts';

const ROOMS = 'packages/site/rooms';
const SERVED = 'packages/site/public/rooms';

/** A room's folder: the ones under `rooms/` that carry a `build.json`; `shared/` is scripts. */
function roomIds(): string[] {
  return readdirSync(join(REPO_ROOT, ROOMS), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, ROOMS, e.name, 'build.json')))
    .map((e) => e.name)
    .sort();
}

/** The folders under the served `rooms/`: what a visitor can fetch, whatever the scripts say. */
function servedRoomFolders(): string[] {
  return readdirSync(join(REPO_ROOT, SERVED), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !ROOM_SUPPORT_FOLDERS.includes(e.name))
    .map((e) => e.name)
    .sort();
}

/** Served room folders with no record to hold them: the ones every gate here would walk past. */
const unrecordedFolders = (served: readonly string[], recorded: readonly string[]): string[] =>
  served.filter((room) => !recorded.includes(room));

/**
 * A served room is its GLB, its SOURCES.md and the images the GLB names, each with its KTX2 twin.
 * Anything else the record lists was put there by hand and refreshed in: a cover, a scene, a note.
 */
function unexplainedFiles(served: Iterable<string>, glb: Buffer, glbName: string): string[] {
  const allowed = new Set([glbName, 'SOURCES.md']);
  for (const image of imagesNamedBy(glb)) {
    allowed.add(image);
    allowed.add(ktx2Of(image));
  }
  return [...served].filter((path) => !allowed.has(path));
}

/** Files directly in the served `rooms/` folder: a room is a folder, and a loose file is none. */
function looseServedFiles(): string[] {
  return readdirSync(join(REPO_ROOT, SERVED), { withFileTypes: true })
    .filter((e) => !e.isDirectory())
    .map((e) => e.name);
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(`${dir}/${e.name}`, rel));
    else out.push(rel);
  }
  return out;
}

const sha256 = (path: string): string =>
  createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, path)))
    .digest('hex');

interface BuildRecord {
  room?: unknown;
  tools?: Record_;
  bake?: { command?: unknown };
  encode?: { command?: unknown };
  inputs?: Record_;
  files?: Record_;
}
type Record_ = { [key: string]: unknown };

/** Every string anywhere in a JSON value. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

/** Flags that let Blender run a script a .blend carries. */
const AUTO_RUN =
  /(^|\s)(-y|--enable-autoexec|--python-expr|--python-text|--python-console|--python-use-system-env|--addons)(\s|$)/;

/** What is wrong with a build record, given the disk. Empty when nothing is. */
function recordFaults(
  room: string,
  record: BuildRecord,
  disk: { served: ReadonlyMap<string, string>; inputsJson: ReadonlyMap<string, string> },
): string[] {
  const faults: string[] = [];
  const files = record.files ?? {};
  const inputs = record.inputs ?? {};

  for (const [path, hash] of Object.entries(files)) {
    const have = disk.served.get(path);
    if (have === undefined) faults.push(`${room}: the record lists ${path}, which is not served`);
    else if (have !== hash) faults.push(`${room}: ${path} does not match the record's SHA-256`);
  }
  for (const path of disk.served.keys()) {
    if (!(path in files)) faults.push(`${room}: ${path} is served and the record does not list it`);
  }

  for (const [dest, hash] of disk.inputsJson) {
    if (inputs[dest] !== hash) {
      faults.push(`${room}: input ${dest} is not recorded with inputs.json's SHA-256`);
    }
  }
  for (const dest of Object.keys(inputs)) {
    if (!disk.inputsJson.has(dest))
      faults.push(`${room}: the record holds input ${dest}, which inputs.json does not name`);
  }

  for (const quoted of strings(record)) {
    const text = quoted.replace(/["']/g, '');
    if (/(^|[\s=:"'])[A-Za-z]:[\\/]/.test(text))
      faults.push(`${room}: a drive letter in "${text.slice(0, 60)}"`);
    if (/(^|[\s=:"'])\/[A-Za-z0-9._-]/.test(text))
      faults.push(`${room}: an absolute path in "${text.slice(0, 60)}"`);
    if (/(^|[\s=:"'])~/.test(text)) faults.push(`${room}: a ~ in "${text.slice(0, 60)}"`);
    if (/(^|[\s=\\/])\.\.([\\/]|\s|$)/.test(text))
      faults.push(`${room}: a .. segment in "${text.slice(0, 60)}"`);
    if (text.includes('\\')) faults.push(`${room}: a backslash in "${text.slice(0, 60)}"`);
  }

  const encode = record.encode?.command;
  if (typeof encode !== 'string' || encode.trim() === '') {
    faults.push(`${room}: no encode command is recorded, so the KTX2 set has no way to be made`);
  }
  const bake = (typeof record.bake?.command === 'string' ? record.bake.command : '').replace(
    /["']/g,
    '',
  );
  // what follows ` -- ` is the script's own arguments: Blender never reads a flag there
  const blenderArgs = bake.split(/\s--\s/)[0] ?? '';
  if (!/(^|\s)--factory-startup(\s|$)/.test(blenderArgs))
    faults.push(`${room}: the bake command does not run Blender with --factory-startup`);
  if (AUTO_RUN.test(blenderArgs)) faults.push(`${room}: the bake command enables auto-run scripts`);

  for (const [tool, version] of Object.entries(record.tools ?? {})) {
    if (typeof version !== 'string' || !/^\d+(\.\d+)*$/.test(version)) {
      faults.push(`${room}: the ${tool} version is not a bare number`);
    }
  }
  for (const tool of ['blender', 'gltfpack', 'ktx']) {
    if (!(tool in (record.tools ?? {}))) faults.push(`${room}: no ${tool} version is recorded`);
  }
  return faults;
}

function load(room: string) {
  const record = JSON.parse(
    readFileSync(join(REPO_ROOT, ROOMS, room, 'build.json'), 'utf8'),
  ) as BuildRecord;
  const inputsDoc = JSON.parse(
    readFileSync(join(REPO_ROOT, ROOMS, room, 'inputs.json'), 'utf8'),
  ) as {
    inputs: { dest: string; sha256: string }[];
  };
  const served = new Map(
    walk(`${SERVED}/${room}`).map((p) => [p, sha256(`${SERVED}/${room}/${p}`)]),
  );
  const inputsJson = new Map(inputsDoc.inputs.map((e) => [e.dest, e.sha256]));
  return { record, disk: { served, inputsJson } };
}

describe('G73 — a room serves what its build record says', () => {
  const rooms = roomIds();

  it('finds at least one room, each with a record that lists real work', () => {
    expectFound(rooms, 'rooms with a build.json', 1);
    for (const room of rooms) {
      const { record } = load(room);
      expect(
        Object.keys(record.files ?? {}).length,
        `${room}: served files recorded`,
      ).toBeGreaterThanOrEqual(10);
      expect(
        Object.keys(record.inputs ?? {}).length,
        `${room}: inputs recorded`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  it('has a record for every served room folder', () => {
    expectFound(servedRoomFolders(), 'served room folders', 1);
    expect(
      unrecordedFolders(servedRoomFolders(), rooms),
      `${SERVED}/ folders with no ${ROOMS}/<room>/build.json: a room the other room gates would not see`,
    ).toEqual([]);
  });

  it('serves only a GLB, its SOURCES.md and the images the GLB names', () => {
    expect(looseServedFiles(), `files directly in ${SERVED}/`).toEqual([]);
    for (const room of rooms) {
      const names = readdirSync(join(REPO_ROOT, SERVED, room)).filter((n) => n.endsWith('.glb'));
      expect(names, `${room}: one GLB`).toHaveLength(1);
      const glbName = names[0] as string;
      const glb = readFileSync(join(REPO_ROOT, SERVED, room, glbName));
      const { disk } = load(room);
      expect(
        unexplainedFiles(disk.served.keys(), glb, glbName),
        `${room}: served files the GLB does not name, which a refreshed record would have made green`,
      ).toEqual([]);
    }
  });

  it('is shown red on a file the GLB does not name', () => {
    const json = Buffer.from(JSON.stringify({ images: [{ uri: 'bake/a.webp' }] }));
    const header = Buffer.alloc(20);
    header.writeUInt32LE(json.length, 12);
    const glb = Buffer.concat([header, json]);
    expect(
      unexplainedFiles(
        [
          'room.glb',
          'SOURCES.md',
          'bake/a.webp',
          'ktx-etc1s/bake/a.ktx2',
          'bake/cover.webp',
          'x.blend',
        ],
        glb,
        'room.glb',
      ),
    ).toEqual(['bake/cover.webp', 'x.blend']);
  });

  it('exempts exactly one served folder, basis, and every other one is a room with a record', () => {
    // The room gates skip the shared support folders, so the list is pinned: a second entry is a
    // second folder the build record, the budget and the inputs check would never read.
    expect(ROOM_SUPPORT_FOLDERS).toEqual(['basis']);
    const allFolders = readdirSync(join(REPO_ROOT, SERVED), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const skipped = allFolders.filter((name) => !servedRoomFolders().includes(name));
    expect(skipped, `folders under ${SERVED}/ the room gates skip`).toEqual(['basis']);
  });

  it('is shown red on a served folder with no record', () => {
    expect(unrecordedFolders(['reading-corner', 'attic'], ['reading-corner'])).toEqual(['attic']);
  });

  it.each(rooms)(
    '%s: every served file matches the record, and the record holds no escape and no auto-run',
    (room) => {
      const { record, disk } = load(room);
      expect(recordFaults(room, record, disk)).toEqual([]);
    },
  );

  describe('is shown red on a copy of the real record', () => {
    const room = rooms[0] as string;
    const fresh = () => {
      const { record, disk } = load(room);
      return { record: structuredClone<BuildRecord>(record), disk };
    };
    const faultsWith = (
      change: (r: BuildRecord) => void,
      disk?: ReturnType<typeof load>['disk'],
    ) => {
      const f = fresh();
      change(f.record);
      return recordFaults(room, f.record, disk ?? f.disk);
    };

    it('a changed hash', () => {
      const faults = faultsWith((r) => {
        const files = r.files as Record_;
        files[Object.keys(files)[0] as string] = '0'.repeat(64);
      });
      expect(faults.join('\n')).toMatch(/does not match the record's SHA-256/);
    });

    it('a served file the record does not list', () => {
      const faults = faultsWith((r) => {
        delete (r.files as Record_)[Object.keys(r.files as Record_)[0] as string];
      });
      expect(faults.join('\n')).toMatch(/served and the record does not list it/);
    });

    it('a listed file that is not served', () => {
      const faults = faultsWith((r) => {
        (r.files as Record_)['gone.webp'] = '0'.repeat(64);
      });
      expect(faults.join('\n')).toMatch(/which is not served/);
    });

    it('an input hash that is not the one inputs.json names', () => {
      const faults = faultsWith((r) => {
        const inputs = r.inputs as Record_;
        inputs[Object.keys(inputs)[0] as string] = '1'.repeat(64);
      });
      expect(faults.join('\n')).toMatch(/is not recorded with inputs.json's SHA-256/);
    });

    it.each([
      ['a drive letter', 'blender -P C:/Users/someone/build_room.py', /drive letter/],
      ['an absolute path', 'blender -P /home/someone/build_room.py', /absolute path/],
      ['a home path', 'blender -P ~/build_room.py', /a ~ in/],
      ['a quoted absolute path', 'blender -P "/home/x/build_room.py"', /absolute path/],
      ['a quoted home path', "blender -P '~/build_room.py'", /a ~ in/],
      ['an escaping segment', 'blender -P ../build_room.py', /\.\. segment/],
      ['a backslash', 'blender -P packages\\site\\build_room.py', /backslash/],
    ])('%s in the bake command', (_name, command, pattern) => {
      const faults = faultsWith((r) => {
        r.bake = { command: `${command} --factory-startup` };
      });
      expect(faults.join('\n')).toMatch(pattern);
    });

    it('a bake command without --factory-startup, and one with auto-run', () => {
      expect(
        faultsWith((r) => {
          r.bake = { command: 'blender -b -P packages/site/rooms/shared/build_room.py' };
        }).join('\n'),
      ).toMatch(/--factory-startup/);
      expect(
        faultsWith((r) => {
          r.bake = { command: 'blender -b --factory-startup --enable-autoexec -P x.py' };
        }).join('\n'),
      ).toMatch(/auto-run/);
      expect(
        faultsWith((r) => {
          r.bake = { command: 'blender -b -y --factory-startup -P x.py' };
        }).join('\n'),
      ).toMatch(/auto-run/);
      for (const flag of ['--python-expr', '--python-text', '--python-console', '--addons']) {
        expect(
          faultsWith((r) => {
            r.bake = { command: `blender -b --factory-startup ${flag} x -P x.py` };
          }).join('\n'),
          flag,
        ).toMatch(/auto-run/);
      }
    });

    it("--factory-startup or auto-run only after the -- that ends Blender's arguments", () => {
      expect(
        faultsWith((r) => {
          r.bake = { command: 'blender -b -P x.py -- --room a --factory-startup' };
        }).join('\n'),
      ).toMatch(/--factory-startup/);
      expect(
        faultsWith((r) => {
          r.bake = { command: 'blender -b --factory-startup -P x.py -- -y --enable-autoexec' };
        }).join('\n'),
      ).not.toMatch(/auto-run/);
    });

    it('an input the record holds and inputs.json does not name', () => {
      const faults = faultsWith((r) => {
        (r.inputs as Record_)['commons/not_in_inputs_json.jpg'] = '2'.repeat(64);
      });
      expect(faults.join('\n')).toMatch(/which inputs.json does not name/);
    });

    it('a flag or path hidden by quotes, which the shell strips', () => {
      const bakeWith = (command: string) =>
        faultsWith((r) => {
          r.bake = { command };
        }).join('\n');
      expect(bakeWith('blender -b --factory-startup "-y" -P x.py')).toMatch(/auto-run/);
      expect(bakeWith('blender -b --factory-startup -P "../build_room.py"')).toMatch(
        /\.\. segment/,
      );
      expect(bakeWith('blender -b --factory-startup -P x.py --out=../outside')).toMatch(
        /\.\. segment/,
      );
    });

    it('a record with no encode command', () => {
      const faults = faultsWith((r) => {
        delete r.encode;
      });
      expect(faults.join('\n')).toMatch(/no encode command is recorded/);
    });

    it('a tool with no recorded version', () => {
      const faults = faultsWith((r) => {
        delete (r.tools as Record_).ktx;
      });
      expect(faults.join('\n')).toMatch(/no ktx version is recorded/);
    });

    it('a tool version that is not a bare number', () => {
      const faults = faultsWith((r) => {
        (r.tools as Record_).gltfpack = 'v1.3.0';
      });
      expect(faults.join('\n')).toMatch(/gltfpack version is not a bare number/);
    });
  });
});
