import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LibraryBook } from '@stacks/core';
import { toRows, type ShelfBook } from './books.ts';
import {
  LIFT,
  makeBackboardShade,
  makeContactShadow,
  makeNeighbourShadow,
  makeRecessShade,
  type CaseLight,
  type Contact,
} from './contact-shadow.ts';
import { rowsForCase, SHELF } from './case.ts';
import { placeShelf, type Placement } from './placement.ts';
import {
  DEFAULT_SETTINGS,
  heightOf,
  type LightPosition,
  type SettingsPatch,
  type ShadowTypeName,
  type ShelfSettings,
  type ToneMappingName,
} from './shelf-settings.ts';
import { makeSpineTexture, MIN_LEGIBLE_THICKNESS } from './spine-texture.ts';

/**
 * The shelf.
 *
 * Books stand spine-out, the way books actually sit on a shelf — which is why
 * `spine_color` carries so much of the look. Covers face along the row and are
 * only really visible on the books that sit face-out (the ones you are
 * currently reading).
 *
 * Vanilla Three.js, no react-three-fiber (decided in CLAUDE.md).
 */

/**
 * `soft` is gone, and was gone before the probes that thought they were testing
 * it.
 *
 * three 0.185 deprecated `PCFSoftShadowMap` and substitutes `PCFShadowMap` for
 * it, with a console warning — so `?shadowtype=soft` and `?shadowtype=pcf` have
 * been the same renderer all along, and the profile string was reporting a
 * filter that was not running. Mapped honestly rather than dropped, so an old
 * URL still works and says what it actually got.
 */
const SHADOW_TYPES: Record<ShadowTypeName, THREE.ShadowMapType> = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  soft: THREE.PCFShadowMap,
  vsm: THREE.VSMShadowMap,
};

/**
 * Tone mapping by name, for the same reason `SHADOW_TYPES` exists.
 *
 * A settings blob carrying `toneMapping: 4` says nothing to anyone reading the
 * file, and three's numeric constants are not stable across major versions —
 * `soft` is already a documented case of a name outliving what it mapped to.
 */
const TONE_MAPPINGS: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/**
 * A book on the shelf, and where its front face sits in its own local space.
 *
 * The offset has to be carried rather than assumed: a book is built at its real
 * size with no scale applied, so "the front of the book" is half its depth —
 * the shelf depth for a shelved book, the cover width for a face-out one.
 */
interface PlacedBook {
  readonly group: THREE.Group;
  readonly frontZ: number;
}

/**
 * What the renderer is actually holding, read live.
 *
 * Counts rather than bytes, because that is what `renderer.info` knows — and a
 * count is the more useful number anyway: the expected texture count is
 * predictable from the library, so a total that climbs past it is a leak, which
 * no byte estimate would tell you apart from a big shelf.
 */
export interface ShelfStats {
  readonly textures: number;
  readonly geometries: number;
  readonly programs: number;
  readonly calls: number;
  readonly triangles: number;
  /** The drawing buffer, in device pixels — CSS size times the pixel ratio. */
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly pixelRatio: number;
}

/**
 * What a settings change actually did — and, more importantly, what it did not.
 *
 * The rule this exists to keep is `docs/progress.md`'s: *"a probe that silently
 * did nothing would be worse than no probe"*. Every one of the original ten was
 * verified to have a real measured effect before it shipped, because a probe
 * that appears to work and does not sends the owner off to rule out the actual
 * cause. A panel control is the same hazard wearing a nicer UI, so the shelf
 * reports back rather than letting the panel assume.
 */
export interface ApplyReport {
  /** Changed on the live scene, described in the settings' own vocabulary. */
  readonly applied: readonly string[];
  /**
   * Changed in the settings and NOT on the scene: these need the shelf rebuilt.
   * The panel must say so rather than show a moved slider over an unmoved shelf.
   */
  readonly needsRebuild: readonly string[];
  /** Needs a whole new WebGL context, which means a page reload. */
  readonly needsReload: readonly string[];
}

export interface ShelfHandle {
  dispose(): void;
  /** Books currently on the shelf, in draw order. Used by the smoke gate. */
  readonly bookCount: number;
  /** The GPU, when the browser is willing to name it. */
  readonly gpu: string | undefined;
  /**
   * The renderer settings the shelf is running **now**, not the ones it started
   * with. See the getter in `mountShelf` for why that distinction is load-bearing.
   */
  readonly profile: string;
  /** The full current settings, for the panel to edit and export. */
  readonly settings: ShelfSettings;
  /**
   * Every setting change this session, oldest first — so a crash record reads as
   * a sequence rather than as a final state.
   */
  readonly changeLog: readonly string[];
  /**
   * Moves the shelf to a new configuration, applying everything that can be
   * applied live and reporting everything that cannot.
   */
  applySettings(next: ShelfSettings): ApplyReport;
  /**
   * How far the worst-placed book sticks out through the side of the case, in
   * world units. Zero means every book is inside its shelf.
   *
   * Measured from real world bounds rather than from the layout arithmetic, so
   * it catches a rotation the arithmetic forgot — which is exactly how it went
   * wrong: a leaning book's corners swing out past the footprint the cursor
   * advanced by, and both the case side and the book beside it were being
   * driven through.
   */
  readonly caseOverflow: number;
  /**
   * What the driver said about any program that would not link. Empty is the
   * normal case, and the shelf is halted whenever it is not.
   */
  readonly shaderErrors: readonly string[];
  /** Live renderer counters. See `./diagnostics.ts`. */
  stats(): ShelfStats;
  /**
   * Where a given book currently sits on screen, in CSS pixels.
   *
   * Exists so the click-to-inspect test can aim at a real book instead of a
   * hardcoded coordinate that silently stops pointing at anything the moment
   * the layout changes.
   */
  projectBook(index: number): { x: number; y: number } | undefined;
}

/**
 * Renderer settings that can be overridden per load, to bisect a context loss.
 *
 * The library-size bisect (`?books=N`) came back saying the shelf dies with five
 * books, 632 triangles and eleven textures — so the cost that matters is fixed,
 * paid before a single book is drawn, and it lives in these four settings. Each
 * is separately overridable rather than bundled into a "mobile profile" for one
 * reason: a bundle would very likely make the crash go away while leaving nobody
 * able to say which knob did it, and would ship three permanent quality
 * regressions to fix one bug.
 *
 * Ranked by what the numbers implicate, on the device that actually fails:
 * a 1054×1926 buffer with 4× MSAA colour and depth is ~65 MB and by far the
 * largest allocation here; the pixel ratio is what sets that size; the 2048²
 * shadow map is 16 MB; and the resize guard is last but stays plausible because
 * the failure is delayed rather than at first paint.
 */
export interface RendererOverrides {
  /** `?aa=0`. MSAA resolve is the expensive path on a tile-based GPU. */
  readonly antialias?: boolean;
  /** `?dpr=1.5`. Caps `devicePixelRatio`; the default cap is 2. */
  readonly maxPixelRatio?: number;
  /**
   * `?shadows=0`. Turns off the shadow map and the light that casts it.
   *
   * The shadow pass is what loses the context on a Pixel 10 Pro — the full
   * 31-book shelf is stable without it and dies in 6–18 seconds with it, one
   * variable, everything else untouched. It stays **on by default anyway**:
   * shadows are most of what makes the shelf read as furniture rather than as
   * coloured boxes, and the owner's call is that losing them is not the price.
   * So the question is not whether to keep them but which cheaper form of them
   * survives, which is what the three switches below are for.
   */
  readonly shadows?: boolean;
  /** `?shadowmap=1024`. Edge of the depth target; the default is 2048 (16 MB). */
  readonly shadowMapSize?: number;
  /**
   * `?shadowtype=basic|pcf|soft|vsm`. See `SHADOW_TYPES`: `soft` is now `pcf`.
   *
   * `vsm` is the one that is not a variation on the others. The first three all
   * declare `uniform sampler2DShadow` and read the map with a hardware depth
   * comparison — which is the fetch `?shadowfetch=0` has now identified as what
   * takes the context away, and which is why all three died alike at every size
   * and filter. Variance shadow maps store depth and depth-squared in an
   * ordinary texture and read it with a plain `sampler2D`, so they are the only
   * configuration here that avoids the operation actually implicated.
   */
  readonly shadowType?: 'basic' | 'pcf' | 'soft' | 'vsm';
  /**
   * `?casters=0`. Nothing casts, but the shadow map is still allocated and the
   * pass still runs — over an empty scene.
   *
   * The one switch that *discriminates* rather than just reducing. Everything
   * else makes the shadow work smaller, so surviving any of them says only "less
   * was cheaper". This separates the two candidate mechanisms outright: if the
   * shelf lives with the target allocated and the pass empty, the cost is
   * drawing ~190 shadow casters; if it still dies, the cost is the depth target
   * or the shader that samples it, and no amount of thinning the geometry will
   * help.
   */
  readonly shadowCasters?: boolean;
  /**
   * `?guard=1`. Skips `setSize` when the canvas has not actually changed size.
   *
   * Assigning `canvas.width` reallocates the drawing buffer even when the value
   * is identical, so an unguarded `ResizeObserver` churns the whole
   * multisampled framebuffer on every layout event. Off by default so that the
   * probe measures a change rather than smuggling in a fix.
   */
  readonly guardResize?: boolean;
  /**
   * `?painted=0`. Leaves out the painted shading — no contact shadows, no
   * backboard shade, no recess, no neighbour bands.
   *
   * Two jobs. It makes `?shadows=1` a *clean* reference again: the two systems
   * are independent, so asking for real shadows has always drawn them on top of
   * the painted ones and double-darkened everything they agree about.
   *
   * And it discriminates on the shader failure. The program that will not link
   * is a `MeshBasicMaterial`, which in this scene is only ever a painted shadow.
   * With them gone the scene has no basic material left, so if `?shadows=1` then
   * links and runs, the fault is specific to those programs and there is
   * something to change; if it still fails, it is the lit materials too and
   * there is not.
   */
  readonly painted?: boolean;
  /**
   * `?shadowfetch=0`. Draws the shadow map once, then stops *reading* it.
   *
   * The isolator. Enabling shadows confounds three things, and the bisect has
   * now eliminated one of them outright:
   *
   *  - the render target is allocated — a 2048² depth texture **and** a 2048²
   *    RGBA8 colour texture that three creates and never samples, 16 MB each;
   *  - the shadow pass runs — but `autoUpdate = false` means exactly once, at
   *    first paint, so it cannot be what takes a context away twelve seconds
   *    later, and `casters=0` dying agrees;
   *  - every lit fragment samples the depth texture, every frame, forever.
   *
   * `receiveShadow` cannot separate the last two: three keys `USE_SHADOWMAP` on
   * `shadowMap.enabled` and the light count alone, so turning it off on the
   * books would change nothing at all. Turning the whole flag off after the
   * first frame and recompiling does: the target stays allocated, the map stays
   * drawn, and the sampling stops.
   *
   * Survives → the per-frame depth fetch is what kills the driver.
   * Still dies → merely holding a sampled depth attachment does, and there is
   * nothing left to fix.
   */
  readonly shadowFetch?: boolean;
}

/**
 * Translates the URL's vocabulary into the settings vocabulary.
 *
 * Two shapes for what looks like one thing, deliberately. `RendererOverrides` is
 * flat, historic and named after query parameters (`?aa`, `?shadowfetch`);
 * `SettingsPatch` is nested and named after what the shelf is made of. Neither
 * can be renamed into the other without cost — the URLs are recorded in
 * `docs/progress.md` and have to keep working, and the settings blob has to read
 * like the shelf rather than like a bisect.
 *
 * So they are translated rather than merged. `docs/progress.md` records the same
 * shape under "Cover acquisition — G22": `writeBook` takes a `BookInput` in the
 * domain vocabulary (`coverSource`) and `updateBook` takes `FrontmatterChanges`
 * in the file vocabulary (`cover_source`), and crossing that boundary is what
 * produced a third assembly nobody wanted. The lesson taken there was to let the
 * boundary show in one named place rather than to collapse the vocabularies.
 */
export function toSettingsPatch(overrides: RendererOverrides): SettingsPatch {
  // Conditional spreads rather than assignment, so an absent override stays
  // absent rather than becoming an explicit `undefined`. The difference is not
  // cosmetic: `resolveSettings` folds with object spread, and a key present with
  // value `undefined` overwrites the default with nothing. `key-if-present.ts`
  // in core exists for this exact hazard, but the site may only `import type`
  // from `@stacks/core` — a value import drags `node:fs` and sharp into the
  // browser bundle and the shelf silently never boots.
  return {
    renderer: {
      ...(overrides.antialias === undefined ? {} : { antialias: overrides.antialias }),
      ...(overrides.maxPixelRatio === undefined ? {} : { maxPixelRatio: overrides.maxPixelRatio }),
      ...(overrides.guardResize === undefined ? {} : { guardResize: overrides.guardResize }),
    },
    shadows: {
      ...(overrides.shadows === undefined ? {} : { enabled: overrides.shadows }),
      ...(overrides.shadowMapSize === undefined ? {} : { mapSize: overrides.shadowMapSize }),
      ...(overrides.shadowType === undefined ? {} : { type: overrides.shadowType }),
      ...(overrides.shadowCasters === undefined ? {} : { casters: overrides.shadowCasters }),
      ...(overrides.shadowFetch === undefined ? {} : { fetch: overrides.shadowFetch }),
      ...(overrides.painted === undefined ? {} : { painted: overrides.painted }),
    },
  };
}

export interface MountOptions {
  /** Called when a book is clicked, or with `undefined` when one is dismissed. */
  readonly onSelect?: (book: LibraryBook | undefined) => void;
  /**
   * What the shelf runs with. Total — see `ShelfSettings`.
   *
   * Callers holding the URL's partial vocabulary get here through
   * `resolveSettings(toSettingsPatch(overrides))`.
   */
  readonly settings?: ShelfSettings;
  /**
   * The GPU dropped the scene — the page is alive, the canvas is not.
   *
   * Happens when a phone kills the renderer, when the tab is backgrounded long
   * enough, or when the driver resets. Without a handler the canvas simply stops
   * updating and the shelf becomes a frozen or blank rectangle with nothing
   * saying why, which is precisely how this failed in the wild.
   */
  readonly onContextLost?: () => void;
  /** The GPU gave it back. Only ever fires if the loss was prevented-default. */
  readonly onContextRestored?: () => void;
  /**
   * A shader program would not link, and the shelf has stopped rather than
   * spend the context arguing about it.
   */
  readonly onShaderFailure?: (report: readonly string[]) => void;
}

export function mountShelf(
  canvas: HTMLCanvasElement,
  books: readonly LibraryBook[] = [],
  options: MountOptions = {},
): ShelfHandle {
  /**
   * What this mount is running — and it can change.
   *
   * `let`, not `const`, because the debug panel edits it live. Everything that
   * reports on the shelf reads through this rather than through a value copied
   * at mount: `profile` used to be a string built once here, which was correct
   * only for as long as nothing could change it. See `applySettings`.
   */
  let settings = options.settings ?? DEFAULT_SETTINGS;

  /**
   * Latched, and the only setting that genuinely cannot be anything else.
   *
   * `antialias` is a **context-creation attribute**. It is read by `getContext`
   * when the drawing buffer is made, and the context will not be made twice for
   * one canvas — so there is no amount of bookkeeping that turns this into a live
   * toggle. It is read once here so that a later edit to `settings` cannot make
   * the profile claim a buffer the driver is not holding.
   */
  const antialias = settings.renderer.antialias;

  // Read at build time. Each decides what geometry and which textures get made,
  // so changing one means building a different scene rather than adjusting this
  // one — the panel remounts for these rather than pretending. The rest are read
  // through `settings` at the point of use, so the panel can move them live.
  const shadows = settings.shadows.enabled;
  const shadowFetch = settings.shadows.fetch;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias });
  applyRendererSettings(renderer, settings);

  /**
   * What the driver said when a program would not link.
   *
   * A live array rather than a return value: the failure happens inside the
   * first `render`, which is inside this function, so there is nobody to hand it
   * to yet. The diagnostics panel reads it on its next tick.
   */
  const shaderErrors: string[] = [];

  const scene = new THREE.Scene();
  const background = new THREE.Color(settings.scene.background);
  scene.background = background;
  // Kept as a field rather than read off `scene.fog` later: turning fog off sets
  // `scene.fog` to null, and turning it back on needs the object it used to be.
  const fog = new THREE.Fog(settings.scene.background, settings.scene.fog.near, settings.scene.fog.far);
  scene.fog = settings.scene.fog.enabled ? fog : null;

  const rows = toRows(books);
  const rowCount = rowsForCase(rows.length);
  const unitHeight = rowCount * SHELF.rowHeight;

  const fov = 40;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.5;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, unitHeight * 0.48, 0);

  /**
   * Backs the camera off far enough for the whole case to fit — checked against
   * *both* axes and the real viewport aspect.
   *
   * A short wide case is width-constrained and a tall narrow one is
   * height-constrained, so fitting only the height clips the sides of a small
   * library. Runs once, on the first real layout, and then leaves the camera
   * alone so it never fights the user's orbiting.
   */
  const caseWidth = SHELF.width + SHELF.sideThickness * 2;
  let framed = false;

  const frameCamera = (aspect: number): void => {
    const half = Math.tan((fov / 2) * (Math.PI / 180));
    const forHeight = unitHeight / (2 * half);
    const forWidth = caseWidth / (2 * half * aspect);
    const distance = Math.max(forHeight, forWidth) * 1.35 + SHELF.depth;

    camera.position.set(caseWidth * 0.16, unitHeight * 0.52, distance);
    controls.maxDistance = distance * 2.4;
    controls.update();
  };

  frameCamera(16 / 9);

  const woodwork = buildShelf(rowCount, settings);
  scene.add(woodwork.group);
  const lights = addLighting(scene, unitHeight, settings);

  /**
   * The shadow map is drawn **once**, not sixty times a second.
   *
   * Nothing in this scene moves. The books are placed at mount and stay there,
   * the light never moves, and a directional light's shadow map is a function of
   * the light and the geometry — not of the camera, which is the only thing that
   * does move. So the default behaviour was to re-render an entire extra pass
   * every frame to compute an image identical to the one before it.
   *
   * That is the shadow cost, and this removes essentially all of it: `autoUpdate
   * = false` stops the per-frame pass, and `needsUpdate` asks for exactly one.
   */
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const textures = new TextureCache(renderer);
  const lookup: BookLookup = new Map();
  // The seam: all of the arithmetic happens first, in a module with no Three.js
  // in it, and the scene graph is built from what it returned.
  const placements = placeShelf(rows);
  const placed = buildBooks(scene, placements, textures, lookup, settings);

  const picker = new Picker(
    canvas,
    camera,
    placed.map((book) => book.group),
    lookup,
    options.onSelect,
  );

  /**
   * Stop, rather than spend the context arguing with a program that will not
   * link.
   *
   * Three carries on regardless: it calls `useProgram` on the invalid program
   * every frame, the driver answers `INVALID_OPERATION` every frame, and within
   * a second or two the context is gone. That is why nothing has ever been
   * readable afterwards — the instrument dies with the page it is measuring.
   * One bad frame is enough to know; sixty a second only destroys the evidence.
   */
  let halted = false;

  let frame = 0;
  let drawn = 0;

  const renderLoop = (): void => {
    if (halted) return;
    frame = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
    drawn += 1;

    // After the map is drawn and before it is ever read again. See `shadowFetch`.
    if (drawn === 1 && shadows && !shadowFetch) stopSamplingShadows(renderer, scene);
  };

  let shaderFailures = 0;

  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader): void => {
    shaderFailures += 1;
    const report = describeLinkFailure(gl, program, vertexShader, fragmentShader);

    // Only the first report is kept. Halting stops the *next* frame; three
    // returns from this callback and carries on walking the render list, so one
    // frame can fail several programs — and the panel is serialised into
    // `localStorage` once a second for as long as the page lives. An uncapped
    // list is a growing write on a device that is already in trouble, which is
    // the last thing a black box should do. The console still gets every one.
    if (shaderFailures === 1) shaderErrors.push(...report);
    else if (shaderFailures === 2) shaderErrors.push('(more programs failed after it — see the console)');

    // Three's own message lives in the `else` branch of the test that calls this
    // handler, so installing one *silences* it. Anyone reading a console — which
    // is how this failure was found in the first place — would have watched the
    // report get quieter as it got better. This says strictly more than the line
    // it replaced.
    console.error(`THREE program would not link:\n  ${report.join('\n  ')}`);

    halted = true;
    cancelAnimationFrame(frame);
    options.onShaderFailure?.(shaderErrors);
  };

  let sizedTo = { width: 0, height: 0 };

  const resize = (): void => {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    // Read through `settings` rather than off a local captured at mount, so
    // toggling the guard in the panel takes effect on the very next resize.
    if (settings.renderer.guardResize && clientWidth === sizedTo.width && clientHeight === sizedTo.height) {
      return;
    }
    sizedTo = { width: clientWidth, height: clientHeight };

    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();

    if (!framed) {
      framed = true;
      frameCamera(camera.aspect);
    }
  };

  /**
   * A lost context is recoverable, but only if you say so.
   *
   * The browser's default for `webglcontextlost` is that the context is gone for
   * good and `webglcontextrestored` never fires. Calling `preventDefault` is the
   * whole of what makes a restore possible — without it there is nothing to hand
   * back, whatever the driver does next.
   */
  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    options.onContextLost?.();
  };

  const handleContextRestored = (): void => {
    options.onContextRestored?.();
    // The one-shot shadow map died with the old context, and `autoUpdate` is off,
    // so without this the restored shelf renders with no shadows at all — and
    // silently, since nothing else would report it.
    renderer.shadowMap.needsUpdate = true;
    renderLoop();
  };

  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  renderLoop();

  /**
   * Every setting change this session has made, oldest first.
   *
   * A crash after eight toggles is far more legible as a sequence than as a
   * final state — "it died when I turned shadows on" is the finding, and a
   * snapshot of where the dials ended up cannot say it. Bounded, because the
   * black box serialises into `localStorage` once a second for as long as the
   * page lives and an uncapped list is a growing write on a device that may
   * already be in trouble.
   */
  const changes: string[] = [];
  const MAX_CHANGES = 24;

  return {
    bookCount: placed.length,
    gpu: describeGpu(renderer),
    caseOverflow: measureCaseOverflow(scene, placed),
    shaderErrors,

    /**
     * Read live, not captured at mount.
     *
     * This was a string built once in this function, and it was correct for
     * exactly as long as nothing could change a setting after mount. The debug
     * panel ends that, and a `profile` that reports the settings the page
     * *started* with would name a configuration the page was not running — on
     * the one instrument that survives a tab death, and off which every finding
     * in the crash investigation was read. `scene.ts` has already had one
     * profile string report a filter that was not running (see `SHADOW_TYPES`);
     * a second, worse, version of that is not worth risking to save a getter.
     */
    get profile(): string {
      const { renderer: r, shadows: s } = settings;
      return (
        `aa=${antialias ? 'on' : 'off'} dpr<=${String(r.maxPixelRatio)} ` +
        `shadows=${s.enabled ? `${s.type}@${String(s.mapSize)}` : 'off'} ` +
        `casters=${s.casters ? 'on' : 'off'} guard=${r.guardResize ? 'on' : 'off'} ` +
        `painted=${s.painted ? 'on' : 'off'} fetch=${s.fetch ? 'on' : 'off'} ` +
        `tone=${r.toneMapping}@${r.exposure.toFixed(2)}`
      );
    },

    get settings(): ShelfSettings {
      return settings;
    },

    get changeLog(): readonly string[] {
      return changes;
    },

    applySettings(next: ShelfSettings): ApplyReport {
      const report = applyLive(renderer, scene, background, fog, lights, woodwork, next, settings, unitHeight);
      settings = next;

      for (const entry of report.applied) {
        if (changes.length < MAX_CHANGES) changes.push(entry);
        else if (changes.length === MAX_CHANGES) changes.push('(more changes followed)');
      }

      return report;
    },

    stats(): ShelfStats {
      const { memory, render, programs } = renderer.info;
      return {
        textures: memory.textures,
        geometries: memory.geometries,
        programs: programs?.length ?? 0,
        calls: render.calls,
        triangles: render.triangles,
        bufferWidth: renderer.domElement.width,
        bufferHeight: renderer.domElement.height,
        pixelRatio: renderer.getPixelRatio(),
      };
    },

    projectBook(index: number): { x: number; y: number } | undefined {
      const book = placed[index];
      if (book === undefined) return undefined;

      // Aim at the front face of the spine, not the centre of the box — the
      // centre is buried inside the book and behind its neighbours.
      const point = book.group.localToWorld(new THREE.Vector3(0, 0, book.frontZ));
      point.project(camera);

      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - point.y) / 2) * rect.height,
      };
    },

    dispose(): void {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      observer.disconnect();
      picker.dispose();
      controls.dispose();
      textures.dispose();

      // Spine textures are generated per book rather than cached, and every
      // painted shadow carries a canvas of its own, so they are freed by walking
      // the scene rather than from the cover cache.
      //
      // Both kinds are named. Checking only for `MeshStandardMaterial` freed the
      // spines and left every shadow texture behind, because a shadow is an
      // unlit `MeshBasicMaterial` — and the count of those has just grown by two
      // per shelf. Covers are disposed twice, once here and once by the cache;
      // `dispose()` is idempotent, so that costs nothing and is cheaper than
      // working out which is which.
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;

        // Geometries too — but never the two shared unit shapes, which outlive
        // any one mount. Every book is a scaled `UNIT_BOX` or `UNIT_PLANE`, so a
        // blanket dispose here would free them for the whole module and leave a
        // second shelf drawing nothing at all.
        if (object.geometry !== UNIT_BOX && object.geometry !== UNIT_PLANE) {
          object.geometry.dispose();
        }

        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial
          ) {
            material.map?.dispose();
          }
          material.dispose();
        }
      });

      renderer.dispose();
    },
  };
}

/* -------------------------------------------------------------------------- */

/**
 * The GPU's own name for itself, when the browser will say.
 *
 * `WEBGL_debug_renderer_info` is absent or redacted in some browsers on privacy
 * grounds — it is a strong fingerprinting signal — so this is best-effort. Worth
 * asking for: "Adreno 750" versus "SwiftShader" is the difference between a
 * memory problem and a machine with no GPU acceleration at all.
 */
/**
 * Everything the driver will say about a program that would not link.
 *
 * Three prints `VALIDATE_STATUS false` in its own error — and never calls
 * `gl.validateProgram`, so that `false` is the parameter's *initial value* and
 * carries no information at all. It reads like a second symptom and is not one.
 * Asking properly is the one question nobody had put to this driver, and the
 * validate log is a different log from the link log: a driver that declines to
 * explain the first sometimes explains the second.
 *
 * The limits come with it because they are the usual reason a program that
 * compiles will not link — varyings, uniform vectors, texture units — and they
 * are the difference between "this hardware cannot" and "this driver will not".
 */
function describeLinkFailure(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): string[] {
  try {
    gl.validateProgram(program);

    const limit = (name: keyof WebGLRenderingContext): string => {
      const value: unknown = gl.getParameter(gl[name] as number);
      return typeof value === 'number' ? String(value) : '?';
    };

    return [
      `material:  ${materialOf(gl.getShaderSource(vertexShader))}`,
      `link log:  ${said(gl.getProgramInfoLog(program))}`,
      `validate:  ${gl.getProgramParameter(program, gl.VALIDATE_STATUS) === true ? 'ok' : 'failed'}`,
      `vertex:    ${said(gl.getShaderInfoLog(vertexShader))}`,
      `fragment:  ${said(gl.getShaderInfoLog(fragmentShader))}`,
      `gl error:  ${String(gl.getError())}`,
      `varying:   ${limit('MAX_VARYING_VECTORS')}`,
      `uniforms:  vtx ${limit('MAX_VERTEX_UNIFORM_VECTORS')} frag ${limit('MAX_FRAGMENT_UNIFORM_VECTORS')}`,
      `samplers:  frag ${limit('MAX_TEXTURE_IMAGE_UNITS')} vtx ${limit('MAX_VERTEX_TEXTURE_IMAGE_UNITS')} all ${limit('MAX_COMBINED_TEXTURE_IMAGE_UNITS')}`,
    ];
  } catch (error) {
    // An instrument that throws takes down the thing it is measuring.
    return [`link failure, and reading it also failed: ${String(error)}`];
  }
}

/**
 * Keeps the shadow map that was drawn, and stops every material reading it.
 *
 * Turning `shadowMap.enabled` off does not free the render target — three has
 * no path that does, even through `renderer.dispose()` — so what is left is a
 * context still holding a 2048² depth attachment that nothing samples. That is
 * exactly the state the probe needs, and it is not reachable any other way.
 *
 * The traverse is what makes it take effect: `USE_SHADOWMAP` is baked into each
 * program at compile time, so without dirtying the materials the flag would
 * change nothing until something else forced a recompile.
 */
function stopSamplingShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  renderer.shadowMap.enabled = false;

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.needsUpdate = true;
    }
  });
}

/** A GL info log, or a word for its silence — an empty one is itself a finding. */
function said(log: string | null): string {
  const text = log?.trim() ?? '';
  return text.length === 0 ? '(silent)' : text;
}

/**
 * Which material's program this was, read back out of the shader itself.
 *
 * three names the material in its own error — and `onShaderError` is not passed
 * it, so installing a handler loses the single most useful line in the message.
 * It survives in the source, though: every program three builds is prefixed with
 * `#define SHADER_TYPE` and `#define SHADER_NAME`, which is exactly what that
 * line was printing.
 */
function materialOf(source: string | null): string {
  const type = /^#define SHADER_TYPE (.+)$/m.exec(source ?? '')?.[1]?.trim();
  const name = /^#define SHADER_NAME (.+)$/m.exec(source ?? '')?.[1]?.trim();
  return [type ?? 'unknown', name].filter((part) => part !== undefined && part.length > 0).join(' ');
}

function describeGpu(renderer: THREE.WebGLRenderer): string | undefined {
  try {
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info') as {
      readonly UNMASKED_RENDERER_WEBGL: number;
    } | null;
    if (extension === null) return undefined;

    const name: unknown = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The worst amount by which any book breaches the inside of the case.
 *
 * `Box3.setFromObject` walks the real geometry through the real world matrices,
 * so a lean, a rotation, or a part positioned by hand all count. That is the
 * point: the layout cursor advances by a book's *thickness*, and a book rotated
 * about its centre is wider than that — measuring the arithmetic again would
 * only repeat its assumption.
 */
function measureCaseOverflow(scene: THREE.Scene, placed: readonly PlacedBook[]): number {
  scene.updateMatrixWorld(true);

  const inner = SHELF.width / 2;
  const box = new THREE.Box3();
  let worst = 0;

  for (const { group } of placed) {
    box.setFromObject(group);
    worst = Math.max(worst, -inner - box.min.x, box.max.x - inner);
  }

  return Math.max(0, worst);
}

/**
 * Which book a mesh is.
 *
 * A side table rather than Three's `userData`, which is typed `Record<string,
 * any>` and would quietly swallow a wrong key.
 */
export type BookLookup = Map<THREE.Object3D, LibraryBook>;

/**
 * The scene-graph half: a mesh per placement, put where the placement says.
 *
 * Everything about *where* a book goes was decided by `placeShelf` before this
 * ran. What is left is Three.js — geometry, materials, the click lookup, and the
 * painted overlays that stand in for a real-time shadow pass.
 */
function buildBooks(
  scene: THREE.Scene,
  placements: readonly (readonly Placement[])[],
  textures: TextureCache,
  lookup: BookLookup,
  settings: ShelfSettings,
): PlacedBook[] {
  // Was a separate parameter until the settings object existed, which let a
  // caller pass a `painted` that disagreed with the one the painters would later
  // read. One source, no way to disagree.
  const painted = settings.shadows.painted;

  const placed: PlacedBook[] = [];
  /** Contacts per row of *books*, indexed as `placements` is — top shelf first. */
  const byRow: Contact[][] = [];

  const rowCount = rowsForCase(placements.length);

  placements.forEach((row, rowIndex) => {
    row.forEach((placement, index) => {
      const { entry } = placement;

      // A shelved book stands a quarter-unit proud of a face-out one, so it is
      // between its neighbour's cover and the key light.
      //
      // Only when it is actually *next to* it: a book on the far side of a year
      // gap is a hand's width away and occludes nothing, and shading the cover
      // anyway put a hard band down the edge of a book standing on its own.
      const next = row[index + 1]?.entry;
      const shadedFromRight =
        painted &&
        entry.faceOut &&
        next !== undefined &&
        !next.faceOut &&
        (next.gapBefore ?? 0) === 0;

      // `frontZ` is half the book's depth by definition, so twice it is the
      // depth to build at — exactly, since halving and doubling a double is.
      const book = buildBook(entry, placement.frontZ * 2, textures, shadedFromRight, settings);

      book.rotation.y = placement.rotationY;
      book.rotation.z = placement.rotationZ;
      book.position.set(placement.position.x, placement.position.y, placement.position.z);

      scene.add(book);
      placed.push({ group: book, frontZ: placement.frontZ });
      // Every part of a book answers for the whole book, so a click on the
      // pages or a board opens the same card as a click on the spine.
      for (const part of book.children) lookup.set(part, entry.book);
    });

    // The painted shadow is drawn from exactly the contacts the books were
    // placed at, so the two cannot drift apart.
    byRow[rowIndex] = row.map((placement) => placement.contact);
  });

  // Every shelf, not only the ones holding books: the overlays also carry the
  // shading the case throws on itself, and an empty shelf has a backboard and a
  // corner just as a full one does. Skipping them would leave the bottom of a
  // growing case looking like a different piece of furniture from the top.
  if (!painted) return placed;

  const light = caseLight(rowCount * SHELF.rowHeight, settings);
  const openHeight = SHELF.rowHeight - SHELF.plankThickness;

  for (let row = 0; row < rowCount; row += 1) {
    const shelfY = row * SHELF.rowHeight + SHELF.plankThickness / 2;

    const shadow = makeContactShadow(
      byRow[rowCount - 1 - row] ?? [],
      SHELF.width,
      SHELF.depth,
      shelfY,
      light,
    );
    if (shadow !== undefined) scene.add(shadow);

    const shade = makeBackboardShade(SHELF.width, openHeight, INTERIOR_DEPTH, light);
    if (shade !== undefined) {
      shade.position.set(
        0,
        shelfY + openHeight / 2,
        -SHELF.depth / 2 + SHELF.backThickness / 2 + LIFT,
      );
      scene.add(shade);
    }

    const recess = makeRecessShade(SHELF.width, openHeight);
    if (recess !== undefined) {
      recess.position.set(0, shelfY + openHeight / 2, BOOK_FRONT_Z + RECESS_CLEARANCE);
      scene.add(recess);
    }
  }

  return placed;
}

/** Shared by every book: sizing is per-mesh scale, so one of each is enough. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

/**
 * A hardback case, in the same world units as the shelf (1 unit ≈ 24cm).
 *
 * `BOARD` is the thickness of a cover board — about 2.5mm on a real book — and
 * `SQUARE` is the *square*: the few millimetres by which the boards overhang the
 * page block at head, tail and fore-edge. They are why the top of a real book is
 * mostly paper with only a thin rim of cover showing, and why the cover stands
 * proud of the pages instead of being flush with them.
 */
const BOARD = 0.011;
const SQUARE = 0.013;

/** How far the printed faces float above the boards they are printed on. */
const SKIN = 0.0012;

/**
 * One book, built at its true size.
 *
 * Not a single painted box: a box has to answer for the cover, the spine, the
 * boards *and* the page edges with one set of faces, which is why the top and
 * bottom of a book used to be spine-coloured. A real book is a case wrapped
 * around a smaller block of paper, so that is what this builds — two boards and
 * a spine strip in the cover colour, and a page block recessed inside them.
 *
 * The cover and the spine are separate planes floating a hair above their
 * boards rather than faces of them. A `BoxGeometry` renders one draw call per
 * face group, so six faces of one box and six single-material meshes cost the
 * same; planes just let each printed face be exactly the size of its artwork.
 *
 * Local axes match the old box: spine at +Z (facing the room when shelved),
 * cover at +X (what you see once a book is turned face-out).
 */
function buildBook(
  entry: ShelfBook,
  depth: number,
  textures: TextureCache,
  shadedFromRight: boolean,
  settings: ShelfSettings,
): THREE.Group {
  const castShadows = settings.shadows.casters;
  // A spine wide enough to read gets its title printed on it; a very thin one
  // stays a plain board, because type squeezed onto it would just be noise.
  const spineTexture =
    entry.thickness >= MIN_LEGIBLE_THICKNESS
      ? makeSpineTexture({
          title: entry.book.title,
          colour: entry.colour,
          ...(entry.book.author === undefined ? {} : { author: entry.book.author }),
        })
      : undefined;

  const spine = new THREE.MeshStandardMaterial({
    color: spineTexture === undefined ? new THREE.Color(entry.colour) : new THREE.Color(0xffffff),
    roughness: 0.62,
    ...(spineTexture === undefined ? {} : { map: spineTexture }),
  });
  // Pages: slightly lighter than the boards, never pure white.
  const pages = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.95 });
  const boards = new THREE.MeshStandardMaterial({
    color: new THREE.Color(entry.colour).multiplyScalar(0.82),
    roughness: 0.7,
  });

  const cover = new THREE.MeshStandardMaterial({
    color: new THREE.Color(entry.colour),
    roughness: settings.materials.coverRoughness,
    metalness: settings.materials.coverMetalness,
  });
  if (entry.book.cover !== undefined) {
    textures.load(entry.book.cover).then((texture) => {
      if (texture !== undefined) {
        cover.map = texture;
        cover.color.set(0xffffff);
        cover.needsUpdate = true;
      }
    });
  }

  const group = new THREE.Group();

  const thickness = entry.thickness;
  const height = entry.height;
  // Both are fixed in the world rather than fractions of the book — a thin book
  // and a fat one are bound in the same card. Each is capped against the
  // dimension it eats so that a small enough book still has paper in it: `depth`
  // is the measured cover aspect on a face-out book, which is vault data, and a
  // page block scaled negative turns inside out rather than failing.
  const board = Math.min(BOARD, thickness * 0.3);
  const square = Math.min(SQUARE, height * 0.05, (depth - board) * 0.2);

  /**
   * Parts receive shadow but do not cast it — the page block below casts for the
   * whole book.
   *
   * Four casters per book meant ~124 shadow draws for 31 books, to describe 31
   * silhouettes. A book is a solid object: its shadow is its outline, and the
   * boards and spine strip contribute nothing to that outline the page block
   * does not already give. The block is inset by the binder's square, so the
   * silhouette is ~3mm small on a 230mm book — under half a texel at this map
   * resolution, and invisible.
   */
  const solid = (material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(UNIT_BOX, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Front and back boards, running the full height and depth of the book.
  for (const side of [1, -1]) {
    const face = solid(boards);
    face.scale.set(board, height, depth);
    face.position.set((side * (thickness - board)) / 2, 0, 0);
  }

  // The spine covering, closing the gap between the boards at the bound edge.
  const spineStrip = solid(boards);
  spineStrip.scale.set(thickness - board * 2, height, board);
  spineStrip.position.set(0, 0, (depth - board) / 2);

  // The page block, recessed inside the case at head, tail and fore-edge — and
  // the one part of a book that casts, standing in for all of it.
  const block = solid(pages);
  block.scale.set(thickness - board * 2, height - square * 2, depth - board - square);
  block.position.set(0, 0, (square - board) / 2);
  block.castShadow = castShadows;

  const printed = (material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const coverFace = printed(cover);
  coverFace.scale.set(depth, height, 1);
  coverFace.rotation.y = Math.PI / 2;
  coverFace.position.set(thickness / 2 + SKIN, 0, 0);

  const spineFace = printed(spine);
  spineFace.scale.set(thickness, height, 1);
  spineFace.position.set(0, 0, depth / 2 + SKIN);

  // A face-out book sits well back, so the shelved book on its right stands
  // proud of it and between it and the key light. The cover is the only large
  // flat surface on the shelf, and this is the one place that reads.
  //
  // Sized rather than scaled: the geometry is built at the cover's real size, so
  // the gradient is not stretched by whatever the mesh scale happens to be.
  if (shadedFromRight) {
    const neighbour = makeNeighbourShadow(depth, height);
    if (neighbour !== undefined) {
      neighbour.rotation.y = Math.PI / 2;
      neighbour.position.set(thickness / 2 + SKIN * 2, 0, 0);
      group.add(neighbour);
    }
  }

  return group;
}

/**
 * The case, plus handles on the two materials it is made of.
 *
 * The materials are returned rather than left buried in the group because the
 * panel dials them. Finding them again by walking the scene would mean matching
 * on type, and `dispose()` already records what that costs: checking only for
 * `MeshStandardMaterial` there freed the spines and left every shadow texture
 * behind. Holding the reference is cheaper and cannot mis-identify.
 */
interface Woodwork {
  readonly group: THREE.Group;
  readonly wood: THREE.MeshStandardMaterial;
  readonly backing: THREE.MeshStandardMaterial;
}

function buildShelf(rowCount: number, settings: ShelfSettings): Woodwork {
  const group = new THREE.Group();
  const castShadows = settings.shadows.casters;

  const wood = new THREE.MeshStandardMaterial({
    color: settings.materials.wood,
    roughness: settings.materials.woodRoughness,
  });
  const backing = new THREE.MeshStandardMaterial({
    color: settings.materials.woodDark,
    roughness: settings.materials.backingRoughness,
  });

  const unitHeight = rowCount * SHELF.rowHeight;
  const outerWidth = SHELF.width + SHELF.sideThickness * 2;

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(outerWidth, unitHeight, SHELF.backThickness),
    backing,
  );
  back.position.set(0, unitHeight / 2, -SHELF.depth / 2);
  back.receiveShadow = true;
  group.add(back);

  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(
      new THREE.BoxGeometry(SHELF.sideThickness, unitHeight, SHELF.depth),
      wood,
    );
    upright.position.set((side * (SHELF.width + SHELF.sideThickness)) / 2, unitHeight / 2, 0);
    upright.castShadow = castShadows;
    upright.receiveShadow = true;
    group.add(upright);
  }

  for (let row = 0; row <= rowCount; row += 1) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(outerWidth, SHELF.plankThickness, SHELF.depth),
      wood,
    );
    plank.position.set(0, row * SHELF.rowHeight, 0);
    plank.castShadow = castShadows;
    plank.receiveShadow = true;
    group.add(plank);
  }

  return { group, wood, backing };
}

/**
 * Where the key light stands, and where it aims.
 *
 * High and to the right — moved right of where it was, but not far. A
 * directional light does not fall off with distance, only with angle, so
 * swinging it out to the side takes light straight off the spines and covers,
 * which all face the room. Pushed hard right the case lost most of its
 * modelling. This is the compromise: enough of a sideways component for the
 * shadows to read as thrown from the top right, with the intensity lifted to
 * pay for the light the spines lose at that angle.
 *
 * A pair of functions rather than two lines inside `addLighting`, because the
 * shadows painted into the wood are computed from this light — and a painted
 * shadow whose light has quietly moved is worse than no shadow at all.
 */
function keyLightPosition(unitHeight: number, settings: ShelfSettings): THREE.Vector3 {
  return positionOf(settings.lighting.key.position, unitHeight);
}

function keyLightTarget(unitHeight: number, settings: ShelfSettings): THREE.Vector3 {
  return new THREE.Vector3(0, unitHeight * settings.lighting.key.aimHeight, 0);
}

/** Resolves a settings position against a case of a given height. */
function positionOf(position: LightPosition, unitHeight: number): THREE.Vector3 {
  return new THREE.Vector3(position.x, heightOf(position.y, unitHeight), position.z);
}

/** The key light as the painters need it. See `CaseLight`. */
function caseLight(unitHeight: number, settings: ShelfSettings): CaseLight {
  const toTarget = keyLightTarget(unitHeight, settings).sub(keyLightPosition(unitHeight, settings));
  return {
    xPerZ: Math.abs(toTarget.x / toTarget.z),
    yPerZ: Math.abs(toTarget.y / toTarget.z),
  };
}

/**
 * How far the backboard stands behind the front of the case — the depth a ray
 * leaving the back wall has to cross before it escapes into the room, and so
 * the whole reason the back of a shelf is dark and the front of it is not.
 */
const INTERIOR_DEPTH = SHELF.depth - SHELF.backThickness / 2;

/**
 * Where a shelved book's fore-edge stands — the frontmost thing on any shelf.
 *
 * A face-out book is nowhere near it: turned a quarter turn it is only as deep
 * as it is thick, and it sits about 0.3 further back, which is the width of
 * bare plank you can see in front of one. So the recess shading is placed
 * against *this* plane, in front of everything, and takes a little parallax on
 * the face-out covers behind it. That is affordable precisely because the
 * shading is a soft falloff with no edge to misregister.
 */
const BOOK_FRONT_Z = SHELF.depth / 2 - 0.02;

/**
 * How far the recess shading floats in front of the books.
 *
 * Enough to clear `SKIN` — the hair by which a printed face floats above its
 * board — with room to spare, and far short of the planks, whose own front
 * faces stand at the front of the case and must not be darkened.
 */
const RECESS_CLEARANCE = 0.008;

/** Handles on every light, so the panel can dial them without walking the scene. */
interface Lights {
  readonly ambient: THREE.AmbientLight;
  readonly key: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly lamp: THREE.PointLight;
  readonly keyTarget: THREE.Object3D;
}

function addLighting(
  scene: THREE.Scene,
  unitHeight: number,
  settings: ShelfSettings,
): Lights {
  const ambient = new THREE.AmbientLight(
    settings.lighting.ambient.colour,
    settings.lighting.ambient.intensity,
  );
  scene.add(ambient);

  const key = new THREE.DirectionalLight(settings.lighting.key.colour, settings.lighting.key.intensity);
  key.position.copy(keyLightPosition(unitHeight, settings));
  // Left off entirely rather than relying on `shadowMap.enabled`, so the depth
  // target is never allocated at all — which is the thing being measured.
  // Derived here rather than passed in. Taking both the fact and the object it
  // comes from let a caller hand over a `shadows` that disagreed with
  // `settings.shadows.enabled`; one source cannot disagree with itself.
  key.castShadow = settings.shadows.enabled;
  key.shadow.mapSize.set(settings.shadows.mapSize, settings.shadows.mapSize);

  /**
   * The shadow camera is fitted to the case, which it never was.
   *
   * A `DirectionalLight` aims at the origin through a fixed ±5 orthographic box.
   * The case stands *on* the origin and grows upward, so it was half outside its
   * own shadow frustum — a five-row unit is 5.6 tall against a 10-unit box
   * centred at y=0, and the top of a tall shelf simply fell out of it. Aiming at
   * the middle of the case and sizing the box to a sphere that bounds it fixes
   * that, and pays for itself twice: the same 2048² map now covers ~7 units
   * instead of 10, so every texel is doing about twice the work it was.
   */
  const target = new THREE.Object3D();
  target.position.copy(keyLightTarget(unitHeight, settings));
  scene.add(target);
  key.target = target;

  fitShadowCamera(key, target, unitHeight);

  scene.add(key);

  const fill = new THREE.DirectionalLight(settings.lighting.fill.colour, settings.lighting.fill.intensity);
  fill.position.copy(positionOf(settings.lighting.fill.position, unitHeight));
  scene.add(fill);

  // A warm lamp close to the shelf, so spines nearest the viewer read clearly
  // and the case has a centre of light rather than flat exposure.
  const lamp = new THREE.PointLight(
    settings.lighting.lamp.colour,
    settings.lighting.lamp.intensity,
    settings.lighting.lamp.distance,
    settings.lighting.lamp.decay,
  );
  lamp.position.copy(positionOf(settings.lighting.lamp.position, unitHeight));
  scene.add(lamp);

  return { ambient, key, fill, lamp, keyTarget: target };
}

/**
 * Sizes the shadow frustum to the case, and to where the light actually is.
 *
 * Extracted so it can run again. `far` is measured from the light to its target,
 * so it is only correct for the position the light held when it was computed —
 * and once the panel can move the light, a frustum fitted at mount describes
 * where the light used to be. That is the same class of fault the painted
 * shadows carry a warning about, and the symptom is worse: a shadow clipped by
 * its own frustum ends in a hard straight line across the wood, which reads as a
 * rendering fault rather than as a stale setting.
 */
function fitShadowCamera(
  key: THREE.DirectionalLight,
  target: THREE.Object3D,
  unitHeight: number,
): void {
  const radius =
    0.5 *
    Math.hypot(SHELF.width + SHELF.sideThickness * 2, unitHeight, SHELF.depth) *
    // A little margin: a shadow clipped by its own frustum ends in a hard
    // straight line across the wood, which reads as a rendering fault.
    1.08;

  const shadowCamera = key.shadow.camera;
  shadowCamera.left = -radius;
  shadowCamera.right = radius;
  shadowCamera.top = radius;
  shadowCamera.bottom = -radius;
  shadowCamera.near = 0.5;
  shadowCamera.far = key.position.distanceTo(target.position) + radius;
  shadowCamera.updateProjectionMatrix();
}

/**
 * The renderer properties that are read every frame, and so are simply assigned.
 *
 * All four are live: `setPixelRatio` and `setSize` reallocate the drawing buffer,
 * `toneMapping` and `toneMappingExposure` are uniforms the frame reads. Tone
 * mapping is the one with a catch — changing the *mode* changes a `#define`, so
 * three recompiles every material, which is the operation `docs/progress.md`
 * records failing to link on a Pixel 10. Exposure alone is a plain uniform and
 * recompiles nothing.
 */
function applyRendererSettings(renderer: THREE.WebGLRenderer, settings: ShelfSettings): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.renderer.maxPixelRatio));
  renderer.shadowMap.enabled = settings.shadows.enabled;
  renderer.shadowMap.type = SHADOW_TYPES[settings.shadows.type];
  renderer.toneMapping = TONE_MAPPINGS[settings.renderer.toneMapping];
  renderer.toneMappingExposure = settings.renderer.exposure;
}

/**
 * Moves the live scene as far as it can go, and names what it could not move.
 *
 * The honesty rule is the whole point — see `ApplyReport`. Every branch here
 * either changes something on the scene and says so, or refuses and says so.
 * Nothing is silently dropped, because a control that appears to work and does
 * not is worse than one that is visibly disabled.
 */
function applyLive(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  background: THREE.Color,
  fog: THREE.Fog,
  lights: Lights,
  woodwork: Woodwork,
  next: ShelfSettings,
  current: ShelfSettings,
  unitHeight: number,
): ApplyReport {
  const applied: string[] = [];
  const needsRebuild: string[] = [];
  const needsReload: string[] = [];

  const note = (list: string[], label: string, was: unknown, now: unknown): void => {
    if (was !== now) list.push(`${label}: ${String(was)} → ${String(now)}`);
  };

  /* --- the renderer ------------------------------------------------------- */

  // A context-creation attribute. There is no live path, only a reload.
  note(needsReload, 'antialias', current.renderer.antialias, next.renderer.antialias);

  note(applied, 'dpr', current.renderer.maxPixelRatio, next.renderer.maxPixelRatio);
  note(applied, 'tone mapping', current.renderer.toneMapping, next.renderer.toneMapping);
  note(applied, 'exposure', current.renderer.exposure, next.renderer.exposure);
  applyRendererSettings(renderer, next);

  // `guardResize` is read on the next resize, so it is live in the only sense
  // that matters — there is nothing to assign.
  note(applied, 'resize guard', current.renderer.guardResize, next.renderer.guardResize);

  /* --- shadows ------------------------------------------------------------ */

  /**
   * Both halves, or the toggle lies.
   *
   * `applyRendererSettings` sets `shadowMap.enabled`, and on its own that is not
   * enough: the key light's `castShadow` is what allocates the depth target and
   * what makes anything get drawn into it, and it was set once at mount. Turning
   * shadows on without it enables the shadow map over a light that casts
   * nothing, so the shelf looks identical — and this function would have
   * reported it as `applied`, which is exactly the failure `ApplyReport` exists
   * to prevent. Caught in review, not by a test; there is a spec for it now.
   */
  if (current.shadows.enabled !== next.shadows.enabled) {
    lights.key.castShadow = next.shadows.enabled;
    dirtyEveryMaterial(scene);
    applied.push(`shadows: ${current.shadows.enabled ? 'on' : 'off'} → ${next.shadows.enabled ? 'on' : 'off'}`);
  }
  note(applied, 'shadow type', current.shadows.type, next.shadows.type);
  if (current.shadows.enabled !== next.shadows.enabled || current.shadows.type !== next.shadows.type) {
    // `autoUpdate` is off — the map is drawn once, deliberately — so nothing
    // would redraw it, and a freshly enabled shadow map would stay empty.
    // `WebGLShadowMap.render()` also returns early when this is unset, before
    // the type-change traverse, so the type would not take either.
    renderer.shadowMap.needsUpdate = true;
  }

  // The depth target is allocated at the size the light was made with; changing
  // it means a new render target, which is the remount path.
  note(needsRebuild, 'shadow map size', current.shadows.mapSize, next.shadows.mapSize);
  // Which meshes have `castShadow` set is decided while the scene is built.
  note(needsRebuild, 'shadow casters', current.shadows.casters, next.shadows.casters);
  note(needsRebuild, 'shadow fetch', current.shadows.fetch, next.shadows.fetch);
  // Painted shading is baked into canvas textures at mount.
  note(needsRebuild, 'painted shading', current.shadows.painted, next.shadows.painted);

  /* --- the scene ---------------------------------------------------------- */

  if (current.scene.background !== next.scene.background) {
    background.setHex(next.scene.background);
    // The fog is the background colour by design — it is the case receding into
    // the room, not a coloured haze — so changing one and not the other leaves a
    // visible ring around the shelf.
    fog.color.setHex(next.scene.background);
    applied.push(`background: ${hex(current.scene.background)} → ${hex(next.scene.background)}`);
  }

  note(applied, 'fog', current.scene.fog.enabled, next.scene.fog.enabled);
  note(applied, 'fog near', current.scene.fog.near, next.scene.fog.near);
  note(applied, 'fog far', current.scene.fog.far, next.scene.fog.far);
  fog.near = next.scene.fog.near;
  fog.far = next.scene.fog.far;
  scene.fog = next.scene.fog.enabled ? fog : null;

  /* --- materials ---------------------------------------------------------- */

  if (current.materials.wood !== next.materials.wood) {
    woodwork.wood.color.setHex(next.materials.wood);
    applied.push(`wood: ${hex(current.materials.wood)} → ${hex(next.materials.wood)}`);
  }
  if (current.materials.woodDark !== next.materials.woodDark) {
    woodwork.backing.color.setHex(next.materials.woodDark);
    applied.push(`backing: ${hex(current.materials.woodDark)} → ${hex(next.materials.woodDark)}`);
  }
  note(applied, 'wood roughness', current.materials.woodRoughness, next.materials.woodRoughness);
  note(applied, 'backing roughness', current.materials.backingRoughness, next.materials.backingRoughness);
  woodwork.wood.roughness = next.materials.woodRoughness;
  woodwork.backing.roughness = next.materials.backingRoughness;

  // The books' own materials are made per book inside `buildBook`, so there is no
  // handle to reach them through. Honest rather than silent.
  note(needsRebuild, 'cover roughness', current.materials.coverRoughness, next.materials.coverRoughness);
  note(needsRebuild, 'cover metalness', current.materials.coverMetalness, next.materials.coverMetalness);

  /* --- lighting ----------------------------------------------------------- */

  applyLight(lights.ambient, current.lighting.ambient, next.lighting.ambient, 'ambient', applied);

  lights.key.position.copy(positionOf(next.lighting.key.position, unitHeight));
  lights.keyTarget.position.copy(keyLightTarget(unitHeight, next));
  // `far` is measured from the light to its target, so moving either leaves the
  // frustum sized for where the light used to be — and a shadow clipped by its
  // own frustum ends in a hard straight line across the wood.
  fitShadowCamera(lights.key, lights.keyTarget, unitHeight);
  if (next.shadows.enabled) renderer.shadowMap.needsUpdate = true;
  applyLight(lights.key, current.lighting.key, next.lighting.key, 'key', applied);
  notePosition(applied, 'key', current.lighting.key.position, next.lighting.key.position);
  note(applied, 'key aim', current.lighting.key.aimHeight, next.lighting.key.aimHeight);

  lights.fill.position.copy(positionOf(next.lighting.fill.position, unitHeight));
  applyLight(lights.fill, current.lighting.fill, next.lighting.fill, 'fill', applied);
  notePosition(applied, 'fill', current.lighting.fill.position, next.lighting.fill.position);

  lights.lamp.position.copy(positionOf(next.lighting.lamp.position, unitHeight));
  lights.lamp.distance = next.lighting.lamp.distance;
  lights.lamp.decay = next.lighting.lamp.decay;
  applyLight(lights.lamp, current.lighting.lamp, next.lighting.lamp, 'lamp', applied);
  notePosition(applied, 'lamp', current.lighting.lamp.position, next.lighting.lamp.position);
  note(applied, 'lamp distance', current.lighting.lamp.distance, next.lighting.lamp.distance);
  note(applied, 'lamp decay', current.lighting.lamp.decay, next.lighting.lamp.decay);

  /**
   * The painted shadows were computed from where the light used to be.
   *
   * This is the failure `contact-shadow.ts` and `keyLightPosition` both warn
   * about in prose: the painters derive their direction from the key light so
   * that moving it cannot leave them describing a light that is no longer there
   * — and a live control is exactly the thing that breaks the promise. They are
   * canvas textures baked at mount, so nothing here can redraw them; the panel
   * has to remount. Reported rather than ignored, which is the whole contract.
   */
  if (
    next.shadows.painted &&
    (!samePosition(current.lighting.key.position, next.lighting.key.position) ||
      current.lighting.key.aimHeight !== next.lighting.key.aimHeight)
  ) {
    needsRebuild.push('painted shadows follow the key light');
  }

  return { applied, needsRebuild, needsReload };
}

/**
 * Forces every material to recompile — including the ones three would skip.
 *
 * Without this a live shadow toggle produces a **different program set than the
 * equivalent reload**, which would make the panel disagree with the URL it
 * writes. Three decides what to recompile through `materialNeedsLights()`, and
 * that returns false for `MeshBasicMaterial` — so flipping `shadowMap.enabled`
 * relinks the lit materials and leaves the painted shadow planes alone.
 *
 * Those planes are the entire point. `docs/progress.md` records that the program
 * which will not link on the Pixel 10 is a `MeshBasicMaterial` — a painted
 * shadow plane, which is unlit and wants nothing to do with shadows. So a naive
 * live toggle would *appear to work* on the device that cannot hold the shipped
 * default, and would have sent the next investigation somewhere wrong.
 *
 * Found by the research on #41, not by a test. It is the whole reason that
 * ticket existed before this control did.
 */
function dirtyEveryMaterial(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.needsUpdate = true;
    }
  });
}

function applyLight(
  light: THREE.Light,
  was: { readonly colour: number; readonly intensity: number },
  now: { readonly colour: number; readonly intensity: number },
  label: string,
  applied: string[],
): void {
  if (was.colour !== now.colour) {
    light.color.setHex(now.colour);
    applied.push(`${label} colour: ${hex(was.colour)} → ${hex(now.colour)}`);
  }
  if (was.intensity !== now.intensity) {
    light.intensity = now.intensity;
    applied.push(`${label} intensity: ${String(was.intensity)} → ${String(now.intensity)}`);
  }
}

function notePosition(applied: string[], label: string, was: LightPosition, now: LightPosition): void {
  if (!samePosition(was, now)) applied.push(`${label} position moved`);
}

function samePosition(a: LightPosition, b: LightPosition): boolean {
  return a.x === b.x && a.z === b.z && a.y.ofHeight === b.y.ofHeight && a.y.plus === b.y.plus;
}

/** Colours read as `#rrggbb` in a change log; a decimal `7031610` reads as nothing. */
function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/* -------------------------------------------------------------------------- */

/**
 * Covers, loaded once each and shared.
 *
 * The fixture library reuses a handful of images across fifty books, and a real
 * library will not — so this caches by path rather than assuming uniqueness,
 * and a failed load degrades to the flat spine colour rather than an error.
 */
class TextureCache {
  readonly #loader = new THREE.TextureLoader();
  readonly #cache = new Map<string, Promise<THREE.Texture | undefined>>();
  readonly #anisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.#anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  load(path: string): Promise<THREE.Texture | undefined> {
    const existing = this.#cache.get(path);
    if (existing !== undefined) return existing;

    const url = path.startsWith('http') || path.startsWith('/') ? path : `/${path}`;
    const promise = new Promise<THREE.Texture | undefined>((resolve) => {
      this.#loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = this.#anisotropy;
          resolve(texture);
        },
        undefined,
        () => resolve(undefined),
      );
    });

    this.#cache.set(path, promise);
    return promise;
  }

  dispose(): void {
    for (const promise of this.#cache.values()) {
      void promise.then((texture) => texture?.dispose());
    }
    this.#cache.clear();
  }
}

/**
 * Click-to-inspect.
 *
 * The card itself is plain DOM positioned from the hit (CLAUDE.md) — this only
 * decides *which* book was hit and hands the record over.
 */
class Picker {
  readonly #raycaster = new THREE.Raycaster();
  readonly #pointer = new THREE.Vector2();
  readonly #canvas: HTMLCanvasElement;
  readonly #camera: THREE.Camera;
  readonly #books: THREE.Object3D[];
  readonly #lookup: BookLookup;
  readonly #onSelect: ((book: LibraryBook | undefined) => void) | undefined;
  #downAt: { x: number; y: number } | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
    books: readonly THREE.Object3D[],
    lookup: BookLookup,
    onSelect: ((book: LibraryBook | undefined) => void) | undefined,
  ) {
    this.#canvas = canvas;
    this.#camera = camera;
    this.#books = [...books];
    this.#lookup = lookup;
    this.#onSelect = onSelect;
    canvas.addEventListener('pointerdown', this.#handleDown);
    canvas.addEventListener('pointerup', this.#handleUp);
  }

  #handleDown = (event: PointerEvent): void => {
    this.#downAt = { x: event.clientX, y: event.clientY };
  };

  /** Only a click that didn't drag counts — orbiting must not select a book. */
  #handleUp = (event: PointerEvent): void => {
    const down = this.#downAt;
    this.#downAt = undefined;
    if (down === undefined) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;

    const rect = this.#canvas.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);

    // Recursive: a book is a group of parts, and any of them counts as a hit.
    const hit = this.#raycaster.intersectObjects(this.#books, true)[0];
    this.#onSelect?.(hit === undefined ? undefined : this.#lookup.get(hit.object));
  };

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#handleDown);
    this.#canvas.removeEventListener('pointerup', this.#handleUp);
  }
}
