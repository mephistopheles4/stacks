/**
 * G5 — the vault is the source of truth (invariant 1).
 * G13 — no third-party material is committed, ever.
 *
 * G5 is one line of the invariant made mechanical: `library.json` is a build
 * artifact, always regenerable, never hand-edited, gitignored. The way that
 * rule breaks is not somebody editing the file — it is somebody committing it,
 * after which it stops being regenerable and starts being a second database.
 *
 * G13 is the rule most likely to be broken by someone who has never read
 * `fixtures/README.md`, and it is invisible to every other gate here. Cover art
 * from a provider is somebody else's copyrighted image; the project's standing
 * constraint is that none of it is committed, and that fixtures are wholly
 * invented. Real covers exist at runtime only, in a gitignored vault. A
 * contributor adding one real cover to "improve the fixtures" would be the
 * easiest possible way to create a legal problem, and nothing but this would
 * notice.
 *
 * See docs/gates.md, rows G5 (vault-is-truth) and G13 (no-third-party-material).
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { BINARY, expectFound, REPO_ROOT, ROOM_SUPPORT_FOLDERS, trackedFiles } from './repo.ts';

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether any `.gitignore` **rule** names this path, tracked or not.
 *
 * `git check-ignore` consults the index and never reports a tracked file as
 * ignored — correct, since tracking wins — but it makes "this file must not be
 * ignored" unfalsifiable for a file that is currently tracked. Adding the rule
 * back changes nothing it can see, which is precisely the change worth
 * catching. `--no-index` reads the rules instead of the outcome.
 */
function matchesIgnoreRule(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', path], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

/**
 * The only committed binaries, and why each is allowed.
 *
 * `fixtures/vault/Library/covers/` holds two-tone PNGs emitted by
 * `scripts/make-fixture-covers.ts` — a ~40-line zero-dep encoder over
 * node:zlib. They depict nothing; they exist so the dominant-colour extractor
 * has something non-uniform to find.
 *
 * `docs/images/` holds the README's screenshot, cropped by
 * `scripts/make-readme-image.ts` from a device-check desktop screenshot — and
 * that check serves the **50-book fixture build**, so every title on those
 * spines is invented too. That is the whole reason this directory can be
 * allowlisted: the same render pointed at a real vault would publish somebody's
 * reading list and somebody else's cover art, which is exactly what this row
 * exists to stop. An entry here is a claim about *provenance*, never about file
 * type.
 */
const GENERATED_BINARY_DIRS = ['fixtures/vault/Library/covers/', 'docs/images/'];

/**
 * The brand art, allowed one filename at a time.
 *
 * Same claim as the two directories above and a cleaner one: these were drawn
 * for this app. The icons are rasterised from the committed SVGs beside them by
 * `scripts/make-icons.ts`; `og.png` is the designed share card. There is no
 * third party anywhere near any of them.
 *
 * Filenames rather than a directory, because the directory is
 * `packages/site/public/` — the folder `stacks build --public` stages a real
 * vault's covers into. A prefix entry there would allow committing exactly the
 * thing this rule exists to stop, and it would do it in the one place a real
 * cover is already sitting on disk. So each file is named, and anything else
 * that appears beside them goes red.
 */
const BRAND_BINARY_FILES = [
  'packages/site/public/favicon-16.png',
  'packages/site/public/favicon-32.png',
  'packages/site/public/apple-touch-icon.png',
  'packages/site/public/og.png',
  /**
   * ⚠️ **The one committed binary this project did not make**, and the only
   * entry here that is somebody else's file rather than its own brand art.
   *
   * Google's *powered by Google* graphic, byte-for-byte as
   * `books.google.com/googlebooks/images/poweredby.png` serves it. The Google
   * APIs ToS §6 requires it displayed, and the Books branding page says *"Do not
   * change any of the Google marks in any way"* — so unlike every provider logo
   * on the card, which is redrawn (ADR-0050), this one cannot be redrawn or
   * substituted with text and still satisfy the clause.
   *
   * Hotlinking would have avoided committing it and was rejected: this page
   * makes zero third-party requests, and fetching it from Google would disclose
   * every visitor's IP and referer to satisfy an obligation that has nothing to
   * do with privacy. See ADR-0048.
   *
   * **Named as a file rather than by allowing its directory**, which is the
   * distinction `docs/gates.md` draws about this row: a directory is a standing
   * permission, and the next third-party binary dropped beside it should go red.
   */
  'packages/site/public/poweredby-google.png',
];

/**
 * The woodwork's sheets — somebody else's photographs, allowed on a **licence**
 * rather than on authorship.
 *
 * Poly Haven publishes its whole library under **CC0**, which places the files
 * in the public domain: no attribution owed, no notice to carry, and
 * redistribution explicitly permitted. That is a different claim from every
 * entry above — `poweredby-google.png` is committed because a ToS clause
 * *requires* it displayed, and the brand art is committed because this project
 * drew it — and it is the only claim under which a third party's image may be
 * committed here at all. [#281](https://github.com/mephistopheles4/stacks/issues/281)
 * settled that the bookcase takes a committed CC0 file rather than a browser
 * bake, and the choice of sheet is
 * [#284](https://github.com/mephistopheles4/stacks/issues/284)'s.
 *
 * ⚠️ **Filenames, and never the directory**, for the reason the brand list
 * gives one paragraph up: a prefix entry under `packages/site/public/` would
 * grant a standing permission in exactly the folder `stacks build --public`
 * stages a real vault's covers into. The backboard's arrived with
 * [#304](https://github.com/mephistopheles4/stacks/issues/304) and a species
 * menu's will with [#306](https://github.com/mephistopheles4/stacks/issues/306),
 * and each one is a line here — which is a licence somebody re-checked rather
 * than a directory nobody revisits.
 *
 * ⚠️ **This list says nothing about size.** G52 (`sheet-size`) caps the long
 * edge and the bytes of everything in that directory; the two rows meet on the
 * same files and ask different questions.
 */
const CC0_BINARY_FILES = [
  'packages/site/public/wood/rosewood-diff-1024.jpg',
  // Poly Haven `dark_wood`, CC0, the backboard's own sheet — #304. A second
  // licence re-checked, by filename, rather than a directory nobody revisits.
  'packages/site/public/wood/darkwood-diff-512.jpg',
  // Poly Haven `sapele_veneer`, CC0, the species menu's second entry — #306. A
  // third licence re-checked the same way.
  //
  // ⚠️ **The one file here a default page never fetches.** The menu is lazy, so
  // this is committed and served only when somebody selects it — which is why
  // G52's existence clause had to widen from `SHIPPED_SHEETS` to `ALL_SHEETS`
  // in the same commit, and why G53 (`one-sheet`) exists to keep it out of what
  // every visitor downloads. Committed and unfetched is a state this list did
  // not have before, and it is the state a licence is easiest to forget in.
  'packages/site/public/wood/sapele-diff-512.jpg',
];

/**
 * The rooms' baked files, allowed as a **directory** on a **provenance** that
 * each room's own `SOURCES.md` carries — [ADR-0162](../docs/adr/0162-the-rooms-directory-is-allowed-on-its-sources-file.md).
 *
 * ⚠️ **This is the one directory entry in the third-party list, and it widens
 * what the rule above says**: every other entry here names a file, and the only
 * claim under which a third party's image may be committed is CC0. A room is a
 * GLB and its textures, baked from models whose licences are CC0, CC BY or public
 * domain (`packages/site/rooms/<room>/inputs.json`, read by G75), and CC BY wants
 * the author credited, which a filename list cannot say. So the claim for
 * `packages/site/public/rooms/` is `SOURCES.md` beside each room's files, and the
 * rule below holds a room's binaries to having one.
 *
 * It is a directory because a room is 80 files and rebakes rename them. It is
 * safe to allow as one for the reason the brand art could not be: this folder is
 * not where `stacks build --public` stages a real vault's covers (`covers/`,
 * `held-covers/` and `notes/`, beside it), so a real cover dropped here would be
 * the wrong place for it twice over, and the sweep below still reads every folder
 * under it.
 */
const ROOM_BINARY_DIR = 'packages/site/public/rooms/';

/** A path inside a room's folder: under `rooms/`, and not in the shared support folders. */
const inRoom = (path: string): boolean =>
  path.startsWith(ROOM_BINARY_DIR) &&
  !ROOM_SUPPORT_FOLDERS.some((folder) => path.startsWith(`${ROOM_BINARY_DIR}${folder}/`));

describe('G5 — library.json is a build artifact', () => {
  it('is not tracked by git', () => {
    const tracked = trackedFiles();
    expectFound(tracked, 'tracked files', 20);

    const committed = tracked.filter((path) => path.endsWith('library.json'));
    expect(
      committed,
      `library.json is a build artifact and must stay regenerable: ${committed.join(', ')}`,
    ).toEqual([]);
  });

  it('is gitignored wherever it gets written', () => {
    // Both the default local output and the staged public one.
    expect(isIgnored('library.json')).toBe(true);
    expect(isIgnored('packages/site/public/library.json')).toBe(true);
  });

  it('keeps the rest of the build output out too', () => {
    expect(isIgnored('packages/site/public/covers/anything.jpg')).toBe(true);
    // The owner's published Thoughts: a broad add after a real build would put
    // them into public history, beyond retraction (spec §6).
    expect(isIgnored('packages/site/public/notes/a-book-1x2y3z.json')).toBe(true);
    expect(isIgnored('artifacts/shelf.png')).toBe(true);

    // `og.png` sits in that same folder and is deliberately *not* ignored: it
    // is the designed share card, committed, and `publish()` no longer writes
    // one. If a build ever starts rendering it again, this is the line that
    // says the two decisions have to move together — and it reads the rule
    // rather than the outcome, because the outcome cannot change while the file
    // is tracked.
    expect(matchesIgnoreRule('packages/site/public/og.png')).toBe(false);
  });

  it('keeps the held copies out too', () => {
    // A 1200px copy of every cover, some of them photographed by the owner: a
    // broad add after a real build would put them into public history.
    expect(isIgnored('packages/site/public/held-covers/a-book.jpg')).toBe(true);
  });
});

/**
 * A binary copied from a dependency's own release, allowed by **filename** and on its **licence**.
 *
 * `basis_transcoder.wasm` is the Basis Universal transcoder (Binomial LLC, Apache-2.0) exactly as
 * three 0.185.1 ships it under `examples/jsm/libs/basis/`. The page fetches it and posts the bytes
 * into the KTX2 worker, which may fetch nothing itself ([ADR-0163](../docs/adr/0163-wasm-is-allowed-on-the-page-and-eval-is-confined-to-the-ktx2-worker.md),
 * #601). It is code and not somebody's picture, and the same bytes sit in `node_modules`; they are
 * committed because the worker beside them is generated from that three and the pair is what is
 * tested and served. Apache-2.0 permits redistribution.
 *
 * ⚠️ **A named file and never a directory**, for the reason the brand list gives: the room spec
 * (#593, S16) asks the owner to admit `packages/site/public/rooms/` as a directory for the room's
 * own baked files, which is T1's decision to make and widens nothing this list holds. `.wasm` joined
 * `BINARY` with this entry, because G66 would otherwise read it as text.
 */
const DEPENDENCY_BINARY_FILES = ['packages/site/public/rooms/basis/basis_transcoder.wasm'];

describe('G13 — no third-party material is committed', () => {
  it('tracks no binary outside the generated fixture covers and the brand art', () => {
    const allowedFiles = new Set([
      ...BRAND_BINARY_FILES,
      ...CC0_BINARY_FILES,
      ...DEPENDENCY_BINARY_FILES,
    ]);
    const offenders = trackedFiles().filter(
      (path) =>
        BINARY.test(path) &&
        !GENERATED_BINARY_DIRS.some((dir) => path.startsWith(dir)) &&
        !inRoom(path) &&
        !allowedFiles.has(path),
    );

    expect(
      offenders,
      'committed binaries outside the generated fixture covers and the brand art. Real ' +
        "cover art is somebody else's copyrighted image and is never committed — see " +
        `fixtures/README.md: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('still tracks the generated fixture covers, so the rule is not vacuous', () => {
    // If the fixture covers vanished, the assertion above would pass over an
    // empty set and stop meaning anything.
    const fixtures = trackedFiles().filter((path) =>
      GENERATED_BINARY_DIRS.some((dir) => path.startsWith(dir)),
    );
    expectFound(fixtures, 'generated fixture covers', 5);
  });

  it('has no allowlisted directory that has gone empty', () => {
    for (const dir of GENERATED_BINARY_DIRS) {
      const inside = trackedFiles().filter((path) => path.startsWith(dir));
      expect(inside.length, `${dir} is allowlisted but tracks nothing — drop it`).toBeGreaterThan(
        0,
      );
    }
  });

  it('tracks every allowlisted brand file', () => {
    // Both halves of a named entry. A file that stopped being committed leaves
    // a permission behind for something nobody ships, and — because the page
    // links all four — a 404 on every visit that no other gate would notice.
    // `og.png` is the one that matters most: it was written by `publish()`
    // until it became committed art, so the failure mode is a build quietly
    // going back to overwriting it and someone deleting the "stale" original.
    const tracked = new Set(trackedFiles());
    const missing = BRAND_BINARY_FILES.filter((path) => !tracked.has(path));

    expect(
      missing,
      'allowlisted as brand art but not tracked — the page links every one of these, ' +
        `so a missing file is a 404 on every visit: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('tracks every allowlisted CC0 sheet', () => {
    // The reverse assertion the brand list already carries, for the same
    // reason and with a sharper failure: a sheet the shelf still asks for and
    // nobody committed is a 404 that leaves the bookcase at its fallback
    // colour, which looks exactly like a texture that was never bound. The
    // permission outliving the file is the other half — an allowlist entry
    // nobody revisits is what this whole row exists to refuse.
    const tracked = new Set(trackedFiles());
    const missing = CC0_BINARY_FILES.filter((path) => !tracked.has(path));

    expect(
      missing,
      'allowlisted as CC0 woodwork sheets but not tracked — the shelf fetches every one ' +
        `of these: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('tracks a SOURCES.md in every room folder that tracks a binary', () => {
    // The provenance claim for packages/site/public/rooms/: a room's binaries
    // are allowed because SOURCES.md credits where they come from. A folder of
    // baked files with none beside them is a standing permission with no claim
    // behind it, which is the thing this row exists to refuse.
    const tracked = trackedFiles();
    const inRooms = tracked.filter(inRoom);
    const withBinaries = new Set(
      inRooms
        .filter((path) => BINARY.test(path))
        .map((path) => path.slice(ROOM_BINARY_DIR.length).split('/')[0] as string),
    );
    expectFound([...withBinaries], 'room folders that track a binary', 1);

    const unsourced = [...withBinaries].filter(
      (room) => !tracked.includes(`${ROOM_BINARY_DIR}${room}/SOURCES.md`),
    );
    expect(
      unsourced,
      `${ROOM_BINARY_DIR} is allowed on each room's SOURCES.md, and these folders track a ` +
        `binary and no SOURCES.md beside it: ${unsourced.join(', ')}`,
    ).toEqual([]);

    // A binary directly in the folder, with no room around it, has no SOURCES.md to be allowed on.
    const loose = inRooms.filter(
      (path) => BINARY.test(path) && !path.slice(ROOM_BINARY_DIR.length).includes('/'),
    );
    expect(loose, `binaries directly in ${ROOM_BINARY_DIR}, outside any room folder`).toEqual([]);
  });

  it('tracks every allowlisted dependency binary', () => {
    // The permission outliving the file is the failure this row exists to refuse, and the file
    // vanishing is a 404 on the transcoder's wasm that leaves every KTX2 texture on its WebP
    // fallback without anything saying so.
    const tracked = new Set(trackedFiles());
    const missing = DEPENDENCY_BINARY_FILES.filter((path) => !tracked.has(path));

    expect(
      missing,
      'allowlisted as a dependency binary but not tracked — the page fetches it for the KTX2 ' +
        `worker: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps docs/images to exactly the generated screenshot', () => {
    // A directory-level permission is broader than the rest of this allowlist,
    // and nothing here can inspect an image to tell an invented shelf from a
    // real one. So the *filename* is pinned instead: dropping any other picture
    // in beside it goes red, and replacing this one is a deliberate act that
    // shows up in review as a changed binary rather than as a new file nobody
    // looks at. Regenerate with:
    //   pnpm tsx scripts/make-readme-image.ts <the desktop screenshot of a check:devices run>
    const images = trackedFiles().filter((path) => path.startsWith('docs/images/'));

    expect(
      images,
      'docs/images/ holds the README screenshot rendered from the fixture vault, and ' +
        'nothing else. A picture of a real shelf publishes real titles and real cover ' +
        `art — see fixtures/README.md: ${images.join(', ')}`,
    ).toEqual(['docs/images/shelf.png']);
  });
});
