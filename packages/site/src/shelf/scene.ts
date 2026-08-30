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
import { BACKBOARD_INSET, PLANK_INSET, rowsForCase, SHELF } from './case.ts';
import type { Post } from './post.ts';
import { placeShelf, type Placement } from './placement.ts';
import {
  BINDINGS,
  DEFAULT_SETTINGS,
  heightOf,
  type LightPosition,
  type ShadowTypeName,
  type ShelfSettings,
  type ToneMappingName,
} from './shelf-settings.ts';
import { hashUnit } from './hash.ts';
import { headCapGeometry, isHeadCapGeometry } from './head-cap.ts';
import { pageStriationMap } from './page-edges.ts';
import { spineNormalMap } from './spine-profile.ts';
import { makeSpineTexture } from './spine-texture.ts';
import {
  BACKBOARD_SHEET,
  WOODWORK_SHEET,
  applyWoodFibre,
  backingFibreMap,
  bindSheet,
  woodColour,
  worldSpaceUvs,
  type Axis,
  type Sheet,
  type SheetBinding,
} from './woodwork.ts';

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
  /**
   * Frames a second, averaged over the last window — 0 until the first one closes.
   *
   * Measured rather than assumed, because the number that matters is the one the
   * device actually achieves: this shelf renders continuously (OrbitControls
   * damps, so a frame is always scheduled), and the whole point of a tuning panel
   * is to see what a setting costs. A count of draws cannot say that — the shelf
   * drew the same 302 calls with shadows on and off, and one of those
   * configurations killed a phone.
   */
  readonly fps: number;
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
  /**
   * Changed in the settings and cannot take effect *as configured* — no rebuild
   * or reload would help, because something else has to change first.
   *
   * Kept apart from `needsRebuild` because offering a rebuild button for
   * something a rebuild cannot fix is its own small lie. The live case is
   * exposure under `NoToneMapping`: the uniform does not exist, and the fix is
   * to pick an operator, not to rebuild anything.
   */
  readonly refused: readonly string[];
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
   * What the scene was actually **built** with, as opposed to what has been
   * asked for since.
   *
   * The panel needs both to tell a control that is doing something from one that
   * is merely set: a rebuild-class control whose value has moved away from this
   * is waiting, and saying so is the difference between a lamp and a decoration.
   */
  readonly mountedWith: ShelfSettings;
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
   * What the scene was actually built with. Never reassigned.
   *
   * `settings` is what has been *asked* for; this is what the geometry, the
   * textures and the context were made from. Anything that can only change by
   * building again is reported by diffing against this, so a refusal stands
   * until it is honoured rather than being announced once and forgotten.
   */
  const mountedWith = options.settings ?? DEFAULT_SETTINGS;

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

  /**
   * Bloom needs a composer, and a composer takes the multisampling away.
   *
   * `EffectComposer` renders into its own offscreen targets and never sets
   * `samples` on them, so the MSAA the context was created with simply stops
   * applying. Asking for it anyway would allocate a multisampled drawing buffer
   * that nothing draws into — the cost of antialiasing with none of it — and it
   * would leave `?aa` flipping an attribute no pixel reads, which is the probe
   * that silently does nothing.
   *
   * So when effects are on, the context is made without MSAA and antialiasing
   * moves to an SMAA pass inside the chain. `profile` says `aa=smaa`, because
   * the setting still means something and it is not the same something.
   */
  const composed = settings.effects.bloom.enabled;
  const contextAntialias = composed ? false : antialias;

  // Read at build time. Each decides what geometry and which textures get made,
  // so changing one means building a different scene rather than adjusting this
  // one — the panel remounts for these rather than pretending. The rest are read
  // through `settings` at the point of use, so the panel can move them live.
  const shadows = settings.shadows.enabled;
  const shadowFetch = settings.shadows.fetch;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: contextAntialias });
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
  const fog = new THREE.Fog(
    settings.scene.background,
    settings.scene.fog.near,
    settings.scene.fog.far,
  );
  scene.fog = settings.scene.fog.enabled ? fog : null;

  const rows = toRows(books, settings.books);
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

  COVERS.useRenderer(renderer);
  const textures = COVERS;
  const lookup: BookLookup = new Map();
  // The seam: all of the arithmetic happens first, in a module with no Three.js
  // in it, and the scene graph is built from what it returned.
  const placements = placeShelf(rows);
  const { placed, painters } = buildBooks(scene, placements, textures, lookup, settings);

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

  /**
   * Frames a second, over a moving window rather than instantaneously.
   *
   * Half a second is long enough that the number stops flickering and short
   * enough that letting go of a slider shows the new cost almost at once. A
   * per-frame reciprocal would be unreadable, and a per-second one is too slow
   * to dial against.
   */
  const FPS_WINDOW_MS = 500;
  let fps = 0;
  let framesInWindow = 0;
  let windowStarted = performance.now();

  /**
   * How a frame is produced. Swapped once, if a composer arrives.
   *
   * `post.ts` is imported dynamically so the ~4.7 KB gzipped that bloom costs is
   * paid only by a page that asked for it. That import resolves after the first
   * frames have already been drawn, so the shelf renders straight to the canvas
   * until it lands rather than showing nothing while it waits.
   */
  let renderFrame = (): void => renderer.render(scene, camera);
  let post: Post | undefined;

  /**
   * The frame counters are reset by hand, once, at the top of the frame.
   *
   * `renderer.info.render` resets itself inside every `render()` call. That is
   * right for one call a frame and wrong the moment a composer is in the chain:
   * it renders the scene, then several fullscreen quads, so the surviving
   * numbers describe the *last quad* — the panel read `draws 1  tris 1` on a
   * shelf drawing 314 of them. A readout that under-reports by two orders of
   * magnitude on exactly the configuration you turned on to measure is worse
   * than no readout, which is this project's oldest rule about instruments.
   */
  renderer.info.autoReset = false;

  const renderLoop = (): void => {
    if (halted) return;
    frame = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.info.reset();
    renderFrame();
    drawn += 1;

    framesInWindow += 1;
    const now = performance.now();
    const elapsed = now - windowStarted;
    if (elapsed >= FPS_WINDOW_MS) {
      fps = (framesInWindow * 1000) / elapsed;
      framesInWindow = 0;
      windowStarted = now;
    }

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
    else if (shaderFailures === 2)
      shaderErrors.push('(more programs failed after it — see the console)');

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
    if (
      settings.renderer.guardResize &&
      clientWidth === sizedTo.width &&
      clientHeight === sizedTo.height
    ) {
      return;
    }
    sizedTo = { width: clientWidth, height: clientHeight };

    renderer.setSize(clientWidth, clientHeight, false);
    post?.setSize(clientWidth, clientHeight);
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

  if (composed) {
    void import('./post.ts').then(({ makePost }) => {
      // The mount may have been disposed while the chunk was in flight.
      if (halted || disposed) return;
      post = makePost(renderer, scene, camera, settings);
      post.setSize(canvas.clientWidth, canvas.clientHeight);
      renderFrame = () => post?.render();
    });
  }

  let disposed = false;

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
        `aa=${composed ? 'smaa' : antialias ? 'on' : 'off'} dpr<=${String(r.maxPixelRatio)} ` +
        `bloom=${settings.effects.bloom.enabled ? settings.effects.bloom.strength.toFixed(2) : 'off'} ` +
        `shadows=${s.enabled ? `${s.type}@${String(s.mapSize)}` : 'off'} ` +
        `casters=${s.casters ? 'on' : 'off'} guard=${r.guardResize ? 'on' : 'off'} ` +
        `painted=${s.painted ? 'on' : 'off'} fetch=${s.fetch ? 'on' : 'off'} ` +
        `tone=${r.toneMapping}@${r.exposure.toFixed(2)}`
      );
    },

    get settings(): ShelfSettings {
      return settings;
    },

    mountedWith,

    get changeLog(): readonly string[] {
      return changes;
    },

    applySettings(next: ShelfSettings): ApplyReport {
      const report = applyLive(
        renderer,
        scene,
        background,
        fog,
        lights,
        woodwork,
        painters,
        post,
        next,
        settings,
        mountedWith,
        unitHeight,
      );
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
        fps,
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
      disposed = true;
      post?.dispose();
      cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      observer.disconnect();
      picker.dispose();
      controls.dispose();
      painters?.dispose();
      // `textures` is the page-lifetime cover cache and is deliberately NOT
      // disposed here — see `COVERS`. The traverse below skips what it owns.

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
        const mesh = asMesh(object);
        if (mesh === undefined) return;

        // Geometries too — but never the shared shapes, which outlive any one
        // mount. Every book is a scaled `UNIT_BOX`, `UNIT_PLANE` or head cap, so a
        // blanket dispose here would free them for the whole module and leave a
        // second shelf drawing nothing at all.
        if (
          mesh.geometry !== UNIT_BOX &&
          mesh.geometry !== UNIT_PLANE &&
          !isHeadCapGeometry(mesh.geometry)
        ) {
          mesh.geometry.dispose();
        }

        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial
          ) {
            // Spine textures are generated per book and must be freed; covers
            // belong to the shared cache and must not be. Asking the cache which
            // is which beats guessing from the material type, which is how this
            // traverse got it wrong once before.
            if (!textures.owns(material.map)) material.map?.dispose();
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
/** The GL limits `describeLinkFailure` reads — constants, and no method names. */
type GlLimit =
  | 'MAX_VARYING_VECTORS'
  | 'MAX_VERTEX_UNIFORM_VECTORS'
  | 'MAX_FRAGMENT_UNIFORM_VECTORS'
  | 'MAX_TEXTURE_IMAGE_UNITS'
  | 'MAX_VERTEX_TEXTURE_IMAGE_UNITS'
  | 'MAX_COMBINED_TEXTURE_IMAGE_UNITS';

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

    // The six names, spelled out rather than `keyof WebGLRenderingContext`.
    // That wider type let a *method* name through — `gl['getParameter']` is as
    // valid a key as `gl['MAX_VARYING_VECTORS']` — and reading one unbound is
    // both meaningless here and a `this`-scoping hazard everywhere else. Naming
    // the constants also makes `as number` unnecessary: all six are `GLenum`.
    const limit = (name: GlLimit): string => {
      const value: unknown = gl.getParameter(gl[name]);
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
  dirtyEveryMaterial(scene);
}

/**
 * The mesh this object is, with three's own generic defaults back on it.
 *
 * ⚠️ **`object instanceof THREE.Mesh` does not give you a `THREE.Mesh`.**
 * TypeScript fills a generic class's parameters with `any` when it narrows by
 * the constructor, so the result is `Mesh<any, any, any>` and every read off it
 * — `.geometry`, `.material` — is an unsafe member access on `any`. Nothing
 * about the check is wrong; the type it produces is just weaker than the one
 * three declares. Assigning it to the plain `THREE.Mesh` here restores
 * `BufferGeometry` and `Material | Material[]`, so a real mistake at one of the
 * three call sites is caught by the compiler instead of being absorbed by
 * `any`.
 */
function asMesh(object: THREE.Object3D): THREE.Mesh | undefined {
  return object instanceof THREE.Mesh ? object : undefined;
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
  return [type ?? 'unknown', name]
    .filter((part) => part !== undefined && part.length > 0)
    .join(' ');
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
): { placed: PlacedBook[]; painters: Painters | undefined } {
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
  if (!painted) return { placed, painters: undefined };

  const painters = new Painters(scene, byRow, rowCount);
  painters.paint(settings);

  // The corner a shelf makes with its backboard is dark on both sides whatever
  // the light does, so it is not derived from the light and never repainted —
  // painted once, here, and left alone. See `makeRecessShade`.
  const openHeight = SHELF.rowHeight - SHELF.plankThickness;
  for (let row = 0; row < rowCount; row += 1) {
    const recess = makeRecessShade(SHELF.width, openHeight);
    if (recess !== undefined) {
      const shelfY = row * SHELF.rowHeight + SHELF.plankThickness / 2;
      recess.position.set(0, shelfY + openHeight / 2, BOOK_FRONT_Z + RECESS_CLEARANCE);
      scene.add(recess);
    }
  }

  return { placed, painters };
}

/**
 * The two painted shadows that are cast, and can therefore go stale.
 *
 * `contact-shadow.ts` and `keyLightPosition` both carry the same warning in
 * prose: the painters derive their direction from the key light *so that* moving
 * it cannot leave them describing a light that is no longer there. A panel with
 * a light control is exactly the thing that breaks that promise, so this exists
 * to keep it — the painters are redrawn from the light's new position instead of
 * being allowed to drift.
 *
 * **Repainting rather than remounting, deliberately.** The alternative was to
 * rebuild the whole shelf, which is correct by construction and much more
 * expensive for the wrong reason: `TextureCache` is per-mount, so a remount
 * re-pays ~24 MB of cover upload on the real vault (measured, #41) to redraw a
 * shadow that is a handful of 2D canvas fills. Nothing about a book changes when
 * the light moves.
 *
 * The contacts are held rather than recomputed because they are a function of
 * the *layout*, not of the light — the books have not moved, and re-deriving
 * them would be a second chance to disagree with where they were actually put.
 */
class Painters {
  readonly #scene: THREE.Scene;
  readonly #byRow: readonly (readonly Contact[])[];
  readonly #rowCount: number;
  #meshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, byRow: readonly (readonly Contact[])[], rowCount: number) {
    this.#scene = scene;
    this.#byRow = byRow;
    this.#rowCount = rowCount;
  }

  paint(settings: ShelfSettings): void {
    this.dispose();

    const light = caseLight(this.#rowCount * SHELF.rowHeight, settings);
    const openHeight = SHELF.rowHeight - SHELF.plankThickness;

    for (let row = 0; row < this.#rowCount; row += 1) {
      const shelfY = row * SHELF.rowHeight + SHELF.plankThickness / 2;

      const shadow = makeContactShadow(
        this.#byRow[this.#rowCount - 1 - row] ?? [],
        SHELF.width,
        SHELF.depth,
        shelfY,
        light,
      );
      if (shadow !== undefined) this.#add(shadow);

      const shade = makeBackboardShade(SHELF.width, openHeight, INTERIOR_DEPTH, light);
      if (shade !== undefined) {
        shade.position.set(
          0,
          shelfY + openHeight / 2,
          -SHELF.depth / 2 + SHELF.backThickness / 2 + LIFT,
        );
        this.#add(shade);
      }
    }
  }

  /**
   * Frees the canvases as well as the meshes.
   *
   * Every painted plane carries a `CanvasTexture` of its own — they are not
   * shared and not cached — so dropping the mesh without disposing the map leaks
   * one texture per shelf per repaint. Dragging a light slider would then climb
   * the texture count until the tab died, on a panel built to diagnose exactly
   * that. `dispose()` in `mountShelf` already names this hazard for the mount
   * path; a repaint is the same hazard on a loop.
   */
  dispose(): void {
    for (const mesh of this.#meshes) {
      this.#scene.remove(mesh);
      const material = mesh.material;
      if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
      if (!Array.isArray(material)) material.dispose();
      mesh.geometry.dispose();
    }
    this.#meshes = [];
  }

  #add(mesh: THREE.Mesh): void {
    this.#scene.add(mesh);
    this.#meshes.push(mesh);
  }
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

/**
 * A paperback's cover, in the same units — one sheet of card at about 0.3mm,
 * against the hardback's 2.6mm board.
 *
 * It is not zero. A paperback still has a cover with a visible edge where it
 * meets the page block, and collapsing it to nothing makes the book one solid
 * slab of paper with a printed face. Thin enough to read as card, thick enough to
 * still be there.
 */
const PAPER_COVER = 0.0013;

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
export function buildBook(
  entry: ShelfBook,
  depth: number,
  textures: TextureCache,
  shadedFromRight: boolean,
  settings: ShelfSettings,
): THREE.Group {
  const castShadows = settings.shadows.casters;

  /**
   * Every spine gets its title, and the canvas is cut to the book's own shape.
   *
   * There used to be a `MIN_LEGIBLE_THICKNESS` cutoff here, dropping type on the
   * thinnest six. It has retired, because it was never about size: the canvas was
   * 128x1024 for every book whatever its thickness and was stretched onto a plane
   * scaled `(thickness, height)`, so letterforms were distorted 0.87x-1.97x
   * across the shelf. A distortion rule wearing a legibility rule's words. See
   * `spineCanvasWidth`.
   */
  const spineTexture = makeSpineTexture({
    title: entry.book.title,
    colour: entry.colour,
    thickness: entry.thickness,
    height: entry.height,
    ...(entry.book.author === undefined ? {} : { author: entry.book.author }),
  });

  /**
   * The cross-section, shaded onto the flat plane that was already there.
   *
   * Shared per binding rather than made here, so a shelf of any size uploads two
   * of these — see `spine-profile.ts`. `undefined` for a flat profile, which is
   * the only way *off* costs nothing.
   */
  const profile = spineNormalMap(settings.materials.spineProfile, entry.binding);

  /**
   * Binding's third effect, and the cheapest thing on this whole map.
   *
   * #58 designed a shared binding-keyed *grain* in `roughnessMap` here; #68
   * rendered it and measured **0 pixels above JND** at `minDistance` against the
   * same bindings' roughness as a plain number. The spine sets no `metalness`, so
   * it is a dielectric at ~4% specular reflectance under soft light, and
   * roughness modulates a lobe that is barely there — a pattern in it cannot
   * read, while its *average* plainly does. Two constants move 17.8% of frame
   * over JND where #58's full design moved 13.2%, for +0 textures and +0 bytes
   * against its +2 shared and +0.667 MiB.
   *
   * So this is more visible than the layer it replaces, not a compromise version
   * of it. What was a flat `0.62` on every spine is now cloth against card.
   */
  const spine = new THREE.MeshStandardMaterial({
    color: spineTexture === undefined ? new THREE.Color(entry.colour) : new THREE.Color(0xffffff),
    roughness: settings.materials.spineRoughness[entry.binding],
    ...(spineTexture === undefined ? {} : { map: spineTexture }),
    ...(profile === undefined ? {} : { normalMap: profile }),
  });
  // Pages: slightly lighter than the boards, never pure white.
  const pages = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.95 });

  /**
   * The cut text block, given leaves.
   *
   * One shared map for the whole shelf and per-book jitter that is free because
   * this material is already made per book — so **+0 draw calls and +0 per-book
   * textures**, on a surface that is 9,678 pixels of flat cream slab at
   * `minDistance`. See `page-edges.ts`.
   *
   * `0` short-circuits to no map at all, the same rule the spine profile follows:
   * off must cost nothing, not a texture unit and a `#define` per book to say
   * nothing.
   */
  const striation = settings.materials.pageStriation;
  if (striation > 0) {
    const map = pageStriationMap();
    if (map !== undefined) {
      pages.normalMap = map;
      pages.normalScale = new THREE.Vector2(striation, striation);
    }
    // A shelf of blocks cut from one ream is a printed shelf. Small: this is
    // paper, and the range between two books' paper is narrow in life too.
    const drift = hashUnit(`${entry.book.id}-pages`);
    pages.color.offsetHSL((drift - 0.5) * 0.02, 0, (drift - 0.5) * 0.08);
    pages.roughness = 0.9 + drift * 0.08;
  }
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
    // Deliberately not awaited: the book is built and mounted now, and the
    // cover swaps itself in when it arrives. `void` rather than a `.catch`
    // because `load` resolves `undefined` on every failure and never rejects —
    // a missing cover is a coloured board, which is the fallback above.
    void textures.load(entry.book.cover).then((texture) => {
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
  //
  // Binding chooses between the two cases, and it chooses *both* numbers at
  // once. A paperback is not a hardback with the overhang taken off: the square
  // going without the board leaves a case still 2.6mm thick that has mysteriously
  // lost its rim, which reads as a modelling error rather than as a second
  // format. A paperback's cover is glued flush to the block, so there is no
  // square at all, and the card it is cut from is a fifth of a board.
  const paperback = entry.binding === 'paperback';
  const board = Math.min(paperback ? PAPER_COVER : BOARD, thickness * 0.3);
  const square = paperback ? 0 : Math.min(SQUARE, height * 0.05, (depth - board) * 0.2);

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

  /**
   * How much height the head cap takes off the covering below it.
   *
   * Proportional to **thickness**, never to height — which is the whole reason
   * one shared cap is the right shape on every book. Hardbacks only: a
   * perfect-bound paperback has no covering to roll, its card being cut flush
   * with the block at head and tail.
   */
  /**
   * The covering spans the case **exactly**, and every earlier number here was a
   * guess at how to dodge a coplanar surface.
   *
   * It has been `thickness + SKIN * 4` and `thickness - SKIN * 2`, and each was
   * visibly wrong in its own direction. Proud of the case, the roll's flat ends
   * are lit as surfaces of their own — a bright thumbprint on the corner with a
   * highlight along the step, circled from four angles across two sessions.
   * Inside it, they hide, but the boards then stand `SKIN` past the roll: a
   * four-pixel lit sliver of board at the head of every hardback, which is the
   * notch that started this.
   *
   * There is no third offset, because the covering is not floating above the case
   * — it *is* the outside of the case, and the case is `thickness` wide. What
   * made an offset seem necessary was the tuck's end fans lying in the boards'
   * own plane; the tuck is no longer fanned, so nothing here is coplanar with
   * anything. See `closeTheEnds`.
   */
  const capScale = thickness;
  const cap = entry.binding === 'hardback' ? settings.books.headCap * capScale : 0;

  /**
   * The case, and the one thing to understand about it: **the covering rolls over
   * a corner, so only the corner is cleared for it.**
   *
   * A hardback's head is one continuous turn of cloth across the whole thickness,
   * boards included, so the cap spans the full thickness and whatever is under
   * that corner has to stop `cap` short. Boxes cannot taper, so each board is two
   * of them — full depth below the roll, pulled back by `cap` inside it:
   *
   * ```
   *   ┌──────┐ ╮ board top   (board × cap × depth-cap)      head
   *   │      ├─╯ ← the roll turns through here
   *   │      │
   *   │ main │   board main  (board × height-cap × depth)    joint at +Z
   * ```
   *
   * **Three earlier shapes were wrong and each was wrong invisibly.** Boards at
   * full depth and full height put their front-top corners `cap` proud of the
   * surface rolling over them — two small square towers at the head of every
   * hardback. Pulling the boards back without widening the piece in front of them
   * left a void at the board's own x, and a diagonal view looked straight through
   * the hair between the printed spine and the cover into the page block's side.
   * Widening that piece to the full thickness closed the void and opened the
   * third: a `cap`-wide strip of *board* colour down the whole joint, the front
   * `cap` of a case that is only `cap` tall having been taken off all `height` of
   * it. That one over-cleared by `height / cap` — about sixty times — and it is
   * the one the owner circled on the shelf itself.
   *
   * None of the three moved a single counter: same draws, same triangles, same
   * textures. `?solo` found the first two and the owner found the third.
   *
   * ⚠️ **Rounding the boards' own corners instead is the tempting fix and is the
   * one #56 struck**: a corner radius on a box scaled `(board, height, depth)`
   * smears, those axes differing by two orders of magnitude, and doing it
   * honestly means a geometry per book — against the +0 per book every ticket on
   * this map costed itself against. Two boxes where there was one costs +2 draws
   * on a hardback and nothing on a paperback, which is what it is worth.
   *
   * A paperback rolls nothing, so `cap` is 0, there is no board top at all, and
   * every number here is what it always was.
   */
  const frontDepth = cap > 0 ? cap : board;

  for (const side of [1, -1]) {
    const x = (side * (thickness - board)) / 2;

    const main = solid(boards);
    main.scale.set(board, height - cap, depth);
    main.position.set(x, -cap / 2, 0);

    if (cap > 0) {
      const top = solid(boards);
      top.scale.set(board, cap, depth - cap);
      top.position.set(x, (height - cap) / 2, -cap / 2);
    }
  }

  /**
   * The covering at the bound edge, between the boards and behind the roll.
   *
   * Between them, not across them: the boards now reach the joint on their own,
   * so a full-thickness strip here would put its own dark sides where their
   * printed faces belong — which is the third fault above, exactly.
   */
  const spineStrip = solid(boards);
  spineStrip.scale.set(thickness - board * 2, height - cap, frontDepth);
  spineStrip.position.set(0, -cap / 2, (depth - frontDepth) / 2);

  // The page block, recessed inside the case at head, tail and fore-edge — and
  // the one part of a book that casts, standing in for all of it.
  const block = solid(pages);
  block.scale.set(thickness - board * 2, height - square * 2, depth - frontDepth - square);
  block.position.set(0, 0, (square - frontDepth) / 2);
  block.castShadow = castShadows;

  /**
   * The printed faces, laid **exactly on** their boards and biased in depth.
   *
   * They used to float `SKIN` in front, which is the obvious way to keep two
   * surfaces from fighting over the same pixel — and it costs a step. A step you
   * cannot see face-on and cannot miss edge-on: from any oblique angle the
   * board's own front face shows in the `SKIN` between the printed spine and the
   * printed cover, a dark hairline the full height of every joint. Measured at
   * `?solo`'s minimum distance it is four pixels wide. The owner circled it on
   * the *shelf*, which is what settled that it reads at all.
   *
   * `polygonOffset` says the same thing to the depth test without saying it to
   * the geometry: the artwork is coplanar with the board, and wins ties. One
   * hairline is not why this is the right shape — there is a `SKIN` gap at every
   * corner of every book for the same reason, and this closes all of them.
   *
   * ⚠️ **Nothing here reaches the shadow pass.** three's `getDepthMaterial`
   * copies `side`, `alphaTest`, `map` and displacement, and not `polygonOffset` —
   * so decal and board write the same depth into the shadow map, which is
   * harmless because it is the *same* depth. If a depth or normal prepass is ever
   * added for SSAO, it will render these through an override material that
   * ignores the offset, and every decal will speckle along its edges. That is the
   * one change that breaks this.
   */
  const printed = (material: THREE.MeshStandardMaterial): THREE.Mesh => {
    material.polygonOffset = true;
    // Factor scales with the depth slope, so the bias grows at exactly the
    // grazing angles where the hairline showed. Units is the spec's minimum
    // resolvable step; two of them, for the phones this project has history with.
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -2;
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  /**
   * The printed cover runs the whole depth, to the joint — and stops `cap` short
   * of the head, where the covering has rolled away in front of it.
   *
   * One plane and not two, which is the trade this makes: the top `cap` of the
   * board shows covering rather than artwork, a band 2% of the cover's height,
   * seen only on a face-out book and reading as the turn-in over the head. The
   * alternative is an L of two planes carrying two slices of one texture, for a
   * strip narrower than the board is thick.
   */
  const coverFace = printed(cover);
  coverFace.scale.set(depth, height - cap, 1);
  coverFace.rotation.y = Math.PI / 2;
  coverFace.position.set(thickness / 2, -cap / 2, 0);

  const spineFace = printed(spine);
  spineFace.scale.set(thickness, height - cap, 1);
  spineFace.position.set(0, -cap / 2, depth / 2);

  /**
   * The covering rolling over the head, on the hardbacks.
   *
   * **+1 draw call and +1 material on a capped book, +0 geometry and +0 texture
   * on any book** — the arc is shared for the whole shelf and the shading is the
   * spine's own normal map, whose `u` also runs across the width. At the
   * shipped 60% paperback that is ~+20 draws over 49 books, which is #56's
   * number and the reason this has a knob of its own.
   *
   * **The material is per book, and the alternative is a live lead rather than an
   * oversight.** #66 measured this cap slower in 7 of 7 paired passes and found
   * the triangles innocent — 128× them is indistinguishable from the rig's floor
   * — while *one shared material* came back indistinguishable from having no cap
   * at all. Sharing is not available here: the covering takes the book's own
   * colour, and 20 caps in one colour is the wrong picture. An `InstancedMesh`
   * with per-instance colour would share the material *and* collapse 20 draws to
   * 1, and neither #56 nor #66 rendered it. That is where to go if this ever
   * costs enough to matter.
   *
   * Its own material rather than `boards`: the covering does not darken where it
   * turns, and reusing the darkened board colour would put a step at the very
   * edge this exists to soften. And not `spine` either — that carries the printed
   * title, which would smear a slice of type across the cap.
   */
  if (cap > 0) {
    const covering = new THREE.MeshStandardMaterial({
      // The same cloth as the spine below it, which is the point of a cap.
      color: new THREE.Color(entry.colour),
      roughness: settings.materials.spineRoughness[entry.binding],
      ...(profile === undefined ? {} : { normalMap: profile }),
    });

    const arc = headCapGeometry(settings.books.headCap);
    if (arc !== undefined) {
      const head = new THREE.Mesh(arc, covering);
      head.castShadow = false;
      head.receiveShadow = true;
      /**
       * Uniformly, and by **thickness** — not by the roll.
       *
       * The arc already carries the roll; it spans one *width* unit along `x` and
       * rolls by `headCap` width units. Scaling by the roll instead made the cap
       * a narrow tab centred on the head, ~6× too narrow, with every counter
       * identical — same draw, same twenty triangles, same texture. Only a
       * picture could catch it, and only a near one.
       */
      head.scale.setScalar(capScale);
      // On the case, like the printed faces it continues — the covering's foot
      // lands exactly on the printed spine's top edge rather than a hair in
      // front of it, which would be a lip across the whole head.
      head.position.set(0, height / 2, depth / 2);
      group.add(head);
    }
  }

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
  /** The veneer, so `applySettings` can tell a fallback colour from a live one. */
  readonly sheet: SheetBinding;
  /** The backboard's own, for the same reason — it is a different image. */
  readonly backSheet: SheetBinding;
}

/**
 * A member's box, with its UVs rewritten to **its own sheet's** world-space
 * period and its grain running along `grain`.
 *
 * Wrapped rather than written as three statements per member so the
 * `BoxGeometry` call — where a member's size is decided, and where G51 reads it
 * — stays one expression carrying its own inset arithmetic. `worldSpaceUvs`
 * takes the size back off `geometry.parameters`, so there is no second copy of
 * that arithmetic to drift from this one.
 *
 * ⚠️ **The sheet is a parameter and not this file's constant.** The backboard
 * carries a different image at a different size whose figure runs the *other*
 * way, so the axis swap is read from the sheet being bound — see
 * `worldSpaceUvs`, and [#297](https://github.com/mephistopheles4/stacks/issues/297).
 */
function veneered(geometry: THREE.BoxGeometry, sheet: Sheet, grain: Axis): THREE.BoxGeometry {
  worldSpaceUvs(geometry, sheet, grain);
  return geometry;
}

/**
 * Which map the backboard's fibre is, for `applyWoodFibre`.
 *
 * ⚠️ **A thunk, and that is `applyWoodFibre`'s own rule rather than style**: a
 * default argument is evaluated whenever it is omitted, so naming the texture
 * here would clone — and therefore bake — the fibre on every page that has it
 * turned off. Named once because `buildShelf` and `applySettings` both pass it,
 * and two lambdas would be two chances to hand the backboard the planks' map.
 */
const backingFibre = (): THREE.Texture | null => backingFibreMap() ?? null;

function buildShelf(rowCount: number, settings: ShelfSettings): Woodwork {
  const group = new THREE.Group();
  const castShadows = settings.shadows.casters;

  // `materials.wood` is what the woodwork shows *before* the sheet decodes, and
  // if it never does — a diffuse map multiplies `color`, so `bindWoodSheet`
  // switches this to white inside the load callback. See `woodColour`.
  const wood = new THREE.MeshStandardMaterial({
    color: settings.materials.wood,
    roughness: settings.materials.woodRoughness,
  });
  const sheet = bindSheet(wood, WOODWORK_SHEET);
  // The relief half, and the slot the sheet's own normal map was wasting: drawn
  // rather than photographed, tiled far tighter than the figure, and zero bytes
  // on the wire. `0` binds nothing at all — see `applyWoodFibre`.
  applyWoodFibre(wood, settings.materials.woodFibre);
  // `materials.woodDark` takes `materials.wood`'s treatment, for its reason: it
  // is the colour the backboard shows before `dark_wood` decodes and if it never
  // does, and `bindSheet` switches it to white in the load callback.
  const backing = new THREE.MeshStandardMaterial({
    color: settings.materials.woodDark,
    roughness: settings.materials.backingRoughness,
  });
  const backSheet = bindSheet(backing, BACKBOARD_SHEET);
  // The same drawn fibre, turned a quarter turn to run *with* this sheet's
  // grain rather than across it — a clone's texture matrix, so +0 textures and
  // +0 bytes. #297 measured the turn at three to six times the fibre's own
  // presence, and found it on a 3x crop after no whole-frame number had.
  applyWoodFibre(backing, settings.materials.woodFibre, backingFibre);

  const unitHeight = rowCount * SHELF.rowHeight;
  const outerWidth = SHELF.width + SHELF.sideThickness * 2;

  // The uprights keep every plane they own, and every other member is shrunk off
  // those planes — see `PLANK_INSET`. The backboard takes twice the plank's, in
  // `x` and in `y`, so its sides do not land on the plank ends' new plane. Every
  // member stays centred where it was: the inset comes off both faces, so the
  // silhouette does not move. Held by G51 (`coplanar-faces`).
  //
  // Its grain runs **vertically**, which #285 states and does not derive: the
  // board is wider than tall at 2 and 3 rows and taller than wide from 4 on, so
  // a long-axis rule would turn the figure 90° the day the library fills its
  // third row. `dark_wood`'s own stripe runs the opposite way from rosewood's,
  // so `veneered` reads the swap off `BACKBOARD_SHEET.figure`.
  const back = new THREE.Mesh(
    veneered(
      new THREE.BoxGeometry(
        outerWidth - BACKBOARD_INSET * 2,
        unitHeight - BACKBOARD_INSET * 2,
        SHELF.backThickness,
      ),
      BACKBOARD_SHEET,
      'y',
    ),
    backing,
  );
  back.position.set(0, unitHeight / 2, -SHELF.depth / 2);
  back.receiveShadow = true;
  group.add(back);

  // The grain runs up an upright and along a plank — each member along its own
  // long axis, which is #285's verdict and is **stated rather than measured**:
  // `rowsForCase` grows an upright with the library while a plank's length never
  // moves, so a rule that took the longest side would rotate the figure the day
  // a book was added.
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(
      veneered(
        new THREE.BoxGeometry(SHELF.sideThickness, unitHeight, SHELF.depth),
        WOODWORK_SHEET,
        'y',
      ),
      wood,
    );
    upright.position.set((side * (SHELF.width + SHELF.sideThickness)) / 2, unitHeight / 2, 0);
    upright.castShadow = castShadows;
    upright.receiveShadow = true;
    group.add(upright);
  }

  for (let row = 0; row <= rowCount; row += 1) {
    const plank = new THREE.Mesh(
      veneered(
        new THREE.BoxGeometry(
          outerWidth - PLANK_INSET * 2,
          SHELF.plankThickness,
          SHELF.depth - PLANK_INSET * 2,
        ),
        WOODWORK_SHEET,
        'x',
      ),
      wood,
    );
    plank.position.set(0, row * SHELF.rowHeight, 0);
    plank.castShadow = castShadows;
    plank.receiveShadow = true;
    group.add(plank);
  }

  return { group, wood, backing, sheet, backSheet };
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

export function addLighting(
  scene: THREE.Scene,
  unitHeight: number,
  settings: ShelfSettings,
): Lights {
  const ambient = new THREE.AmbientLight(
    settings.lighting.ambient.colour,
    settings.lighting.ambient.intensity,
  );
  scene.add(ambient);

  const key = new THREE.DirectionalLight(
    settings.lighting.key.colour,
    settings.lighting.key.intensity,
  );
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

  const fill = new THREE.DirectionalLight(
    settings.lighting.fill.colour,
    settings.lighting.fill.intensity,
  );
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
  painters: Painters | undefined,
  post: Post | undefined,
  next: ShelfSettings,
  current: ShelfSettings,
  mountedWith: ShelfSettings,
  unitHeight: number,
): ApplyReport {
  const applied: string[] = [];
  const needsRebuild: string[] = [];
  const needsReload: string[] = [];
  const refused: string[] = [];

  /**
   * A *transition*: what changed since the last apply. Used for the live work,
   * which is by definition a thing you do once when a value moves.
   */
  const note = (list: string[], label: string, was: unknown, now: unknown): void => {
    if (was !== now) list.push(`${label}: ${String(was)} → ${String(now)}`);
  };

  /**
   * A *standing difference*: what the shelf would have to be rebuilt to honour,
   * measured against the settings the scene was actually **built** with — not
   * against the last apply.
   *
   * This is the difference between a warning and a lie. Comparing transitions
   * meant a refusal was announced once and then forgotten: toggle antialias, get
   * "reload to apply", then nudge any live slider and the notice cleared itself
   * — while the URL still asserted a configuration the shelf was not in. A
   * standing diff cannot forget, and it clears by itself the moment a rebuild
   * makes it true.
   */
  const standing = (list: string[], label: string, built: unknown, now: unknown): void => {
    if (built !== now) list.push(`${label}: ${String(built)} → ${String(now)}`);
  };

  /* --- the renderer ------------------------------------------------------- */

  // A context-creation attribute. There is no live path, only a reload.
  standing(needsReload, 'antialias', mountedWith.renderer.antialias, next.renderer.antialias);

  note(applied, 'dpr', current.renderer.maxPixelRatio, next.renderer.maxPixelRatio);
  note(applied, 'tone mapping', current.renderer.toneMapping, next.renderer.toneMapping);

  /**
   * Exposure does nothing at all under `NoToneMapping`, which is the default.
   *
   * `toneMappingExposure` is a uniform that only exists inside three's
   * `#ifdef TONE_MAPPING` block, so with no operator selected there is nothing
   * to scale and the assignment is silently inert. Reported as refused rather
   * than as applied — a slider that moves while the shelf does not is the exact
   * failure this whole report type exists to prevent. The panel disables the
   * control for the same reason; this is the backstop.
   */
  if (
    next.renderer.exposure !== DEFAULT_SETTINGS.renderer.exposure &&
    next.renderer.toneMapping === 'none'
  ) {
    refused.push('exposure does nothing until a tone mapping is chosen');
  }
  if (current.renderer.exposure !== next.renderer.exposure) {
    if (next.renderer.toneMapping === 'none') {
      /* already stated as refused, above — standing, so it does not vanish */
    } else {
      applied.push(
        `exposure: ${current.renderer.exposure.toFixed(2)} → ${next.renderer.exposure.toFixed(2)}`,
      );
    }
  }
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
    applied.push(
      `shadows: ${current.shadows.enabled ? 'on' : 'off'} → ${next.shadows.enabled ? 'on' : 'off'}`,
    );
  }
  note(applied, 'shadow type', current.shadows.type, next.shadows.type);
  if (
    current.shadows.enabled !== next.shadows.enabled ||
    current.shadows.type !== next.shadows.type
  ) {
    // `autoUpdate` is off — the map is drawn once, deliberately — so nothing
    // would redraw it, and a freshly enabled shadow map would stay empty.
    // `WebGLShadowMap.render()` also returns early when this is unset, before
    // the type-change traverse, so the type would not take either.
    renderer.shadowMap.needsUpdate = true;
  }

  // All four are decided while the scene is built, so they are measured against
  // what it was built with and stay outstanding until it is built again.
  standing(needsRebuild, 'shadow map size', mountedWith.shadows.mapSize, next.shadows.mapSize);
  standing(needsRebuild, 'shadow casters', mountedWith.shadows.casters, next.shadows.casters);
  standing(needsRebuild, 'shadow fetch', mountedWith.shadows.fetch, next.shadows.fetch);
  standing(needsRebuild, 'painted shading', mountedWith.shadows.painted, next.shadows.painted);

  /* --- effects ------------------------------------------------------------ */

  // Turning bloom on or off remakes the context (see `contextAntialias`), so it
  // is a standing rebuild. Its three numbers are plain uniforms once the chain
  // exists — and are silently inert while it does not, which is why they are
  // only reported as applied when it does.
  standing(needsRebuild, 'bloom', mountedWith.effects.bloom.enabled, next.effects.bloom.enabled);
  if (next.effects.bloom.enabled && mountedWith.effects.bloom.enabled) {
    note(applied, 'bloom strength', current.effects.bloom.strength, next.effects.bloom.strength);
    note(applied, 'bloom radius', current.effects.bloom.radius, next.effects.bloom.radius);
    note(applied, 'bloom threshold', current.effects.bloom.threshold, next.effects.bloom.threshold);
    post?.update(next);
  } else if (
    next.effects.bloom.strength !== current.effects.bloom.strength ||
    next.effects.bloom.radius !== current.effects.bloom.radius ||
    next.effects.bloom.threshold !== current.effects.bloom.threshold
  ) {
    refused.push('bloom is off, so its numbers do nothing');
  }

  /* --- the scene ---------------------------------------------------------- */

  if (current.scene.background !== next.scene.background) {
    background.setHex(next.scene.background);
    // The fog is the background colour by design — it is the case receding into
    // the room, not a coloured haze — so changing one and not the other leaves a
    // visible ring around the shelf.
    fog.color.setHex(next.scene.background);
    applied.push(`background: ${hex(current.scene.background)} → ${hex(next.scene.background)}`);
  }

  note(applied, 'fog near', current.scene.fog.near, next.scene.fog.near);
  note(applied, 'fog far', current.scene.fog.far, next.scene.fog.far);
  // Mutated in place. `near`, `far` and `color` are plain uniforms and cost
  // nothing to change — but *assigning* `scene.fog` rebuilds every program in
  // the scene, even to an identical value, because presence of fog is in the
  // program cache key. Doing it unconditionally would have made every tick of
  // every slider in the panel a full recompile.
  fog.near = next.scene.fog.near;
  fog.far = next.scene.fog.far;
  if (current.scene.fog.enabled !== next.scene.fog.enabled) {
    scene.fog = next.scene.fog.enabled ? fog : null;
    applied.push(
      `fog: ${current.scene.fog.enabled ? 'on' : 'off'} → ${next.scene.fog.enabled ? 'on' : 'off'}`,
    );
  }

  /* --- materials ---------------------------------------------------------- */

  if (current.materials.wood !== next.materials.wood) {
    /**
     * Routed through `woodColour`, and that is not decoration.
     *
     * A diffuse map **multiplies** `color`, so `bindWoodSheet` sets the material
     * white once the sheet decodes. Repainting it here with the knob's own value
     * — one tick of the debug panel, one `?tune=` — would put a dark colour back
     * under a live sheet and darken the whole bookcase at a third of the
     * brightness somebody judged. Once the sheet is bound the knob is the
     * fallback and nothing else, and the report says so rather than claiming a
     * change the eye cannot find: **a control must not lie**.
     */
    const shown = woodColour(next.materials.wood, woodwork.sheet.bound());
    woodwork.wood.color.setHex(shown);
    applied.push(
      `wood: ${hex(current.materials.wood)} → ${hex(next.materials.wood)}` +
        (shown === next.materials.wood ? '' : ' (fallback only — the sheet has decoded)'),
    );
  }
  if (current.materials.woodDark !== next.materials.woodDark) {
    // The same routing, for the same reason, on the surface that is 90% of the
    // near frame when the shelf is empty: unrouted, one panel tick puts a dark
    // colour back under a decoded `dark_wood`. See the block above.
    const shown = woodColour(next.materials.woodDark, woodwork.backSheet.bound());
    woodwork.backing.color.setHex(shown);
    applied.push(
      `backing: ${hex(current.materials.woodDark)} → ${hex(next.materials.woodDark)}` +
        (shown === next.materials.woodDark ? '' : ' (fallback only — the sheet has decoded)'),
    );
  }
  note(applied, 'wood roughness', current.materials.woodRoughness, next.materials.woodRoughness);
  note(
    applied,
    'backing roughness',
    current.materials.backingRoughness,
    next.materials.backingRoughness,
  );
  woodwork.wood.roughness = next.materials.woodRoughness;
  woodwork.backing.roughness = next.materials.backingRoughness;

  /**
   * Live, unlike its twin on the books, and for one reason: there is a handle.
   *
   * `pageStriation` is a standing rebuild because the books' materials are made
   * per book inside `buildBook` and nothing can reach them. The woodwork's one
   * material is held right here, so binding the fibre, unbinding it and moving
   * its scale are all a `normalScale` and a recompile away.
   *
   * ⚠️ **Reported as what took effect, not as what was asked for.** A browser
   * that will not give a 2D context has no map to bind, and `applyWoodFibre`
   * says so by returning the scale in force — a slider that moved while the
   * bookcase did not is the exact failure `ApplyReport` exists to prevent.
   */
  if (current.materials.woodFibre !== next.materials.woodFibre) {
    // Both surfaces, because it is one fibre: the backboard wears a clone of the
    // same bake, turned to run with its own grain. Reported once, because the
    // one thing that can refuse it — no 2D context — refuses it for both.
    const inForce = applyWoodFibre(woodwork.wood, next.materials.woodFibre);
    applyWoodFibre(woodwork.backing, next.materials.woodFibre, backingFibre);
    if (inForce === next.materials.woodFibre) {
      applied.push(`wood fibre: ${String(current.materials.woodFibre)} → ${String(inForce)}`);
    } else {
      refused.push('wood fibre: there is no canvas to draw it on, so the woodwork stays smooth');
    }
  }

  // The books' own materials are made per book inside `buildBook`, so there is no
  // handle to reach them through. Honest rather than silent.
  standing(
    needsRebuild,
    'cover roughness',
    mountedWith.materials.coverRoughness,
    next.materials.coverRoughness,
  );
  standing(
    needsRebuild,
    'cover metalness',
    mountedWith.materials.coverMetalness,
    next.materials.coverMetalness,
  );
  // Same bucket and the same sentence: the books' own materials are made per book
  // inside `buildBook`, so there is no handle to reach them through. The map
  // itself is re-baked on the rebuild, which is where the profile's shape is read.
  standing(
    needsRebuild,
    'page edges',
    mountedWith.materials.pageStriation,
    next.materials.pageStriation,
  );
  for (const binding of BINDINGS) {
    standing(
      needsRebuild,
      `${binding} spine roughness`,
      mountedWith.materials.spineRoughness[binding],
      next.materials.spineRoughness[binding],
    );
  }
  standing(
    needsRebuild,
    'spine profile',
    describeProfiles(mountedWith.materials.spineProfile),
    describeProfiles(next.materials.spineProfile),
  );

  /* --- the books ---------------------------------------------------------- */

  // The mixture decides each book's board, square and height *band*, all of which
  // are geometry built once in `buildBook` — and the height reaches further than
  // that, since a face-out book's footprint is its cover width, so the row
  // packing itself would have to run again. Nothing about that is live.
  standing(
    needsRebuild,
    'paperback mix',
    mountedWith.books.paperbackRatio,
    next.books.paperbackRatio,
  );
  // A mesh per hardback, and the covering below it shortened to make room. Both
  // are decided while the book is built.
  standing(needsRebuild, 'head cap', mountedWith.books.headCap, next.books.headCap);

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
   * The painted shadows follow the light, rather than being left describing
   * where it used to be.
   *
   * This is the failure `contact-shadow.ts` and `keyLightPosition` both warn
   * about in prose — *"a painted shadow whose light has quietly moved is worse
   * than no shadow at all"* — and a live light control is exactly the thing that
   * would have caused it. Repainting is cheap: they are 2D canvas fills, and the
   * books have not moved, so nothing else in the scene needs touching. See
   * `Painters` for why this is not a remount.
   */
  if (
    painters !== undefined &&
    (!samePosition(current.lighting.key.position, next.lighting.key.position) ||
      current.lighting.key.aimHeight !== next.lighting.key.aimHeight)
  ) {
    painters.paint(next);
    applied.push('painted shadows repainted for the new light');
  }

  return { applied, needsRebuild, needsReload, refused };
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
 *
 * `stopSamplingShadows` calls this rather than repeating the traverse, and the
 * reasoning above is why the two are the same operation: both turn the shadow
 * map off and both need the unlit materials relinked, or the change is invisible
 * until something else forces a recompile.
 */
function dirtyEveryMaterial(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = asMesh(object);
    if (mesh === undefined) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
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

function notePosition(
  applied: string[],
  label: string,
  was: LightPosition,
  now: LightPosition,
): void {
  if (!samePosition(was, now)) applied.push(`${label} position moved`);
}

function samePosition(a: LightPosition, b: LightPosition): boolean {
  return a.x === b.x && a.z === b.z && a.y.ofHeight === b.y.ofHeight && a.y.plus === b.y.plus;
}

/** Colours read as `#rrggbb` in a change log; a decimal `7031610` reads as nothing. */
function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * Both profiles as one comparable string.
 *
 * `standing` compares with `!==`, which is identity on an object and would call
 * every apply a change — a permanently amber lamp on a control nobody had
 * touched, which is the panel lying in the quieter direction.
 */
function describeProfiles(profiles: ShelfSettings['materials']['spineProfile']): string {
  return BINDINGS.map(
    (binding) =>
      `${binding} ${profiles[binding].rise.toFixed(3)}/${profiles[binding].roll.toFixed(2)}`,
  ).join(' ');
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
  readonly #owned = new Set<THREE.Texture>();
  #anisotropy = 1;

  /**
   * Told about a renderer rather than made from one, because it outlives them.
   *
   * Anisotropy is a device capability, not a property of a particular context,
   * so re-reading it on each mount costs nothing and keeps the cache from
   * needing a renderer to exist.
   */
  useRenderer(renderer: THREE.WebGLRenderer): void {
    this.#anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  /** Whether this cache made a texture — and is therefore the one to free it. */
  owns(texture: THREE.Texture | null | undefined): boolean {
    return texture !== null && texture !== undefined && this.#owned.has(texture);
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
          this.#owned.add(texture);
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
    this.#owned.clear();
  }
}

/**
 * The covers, cached for the life of the page rather than the life of a mount.
 *
 * It used to be made inside `mountShelf` and freed by `dispose()`, which was
 * right while a mount happened once. The debug panel's rebuild button makes it
 * happen whenever somebody changes the shadow map size — and #41 measured what
 * that costs on the owner's real vault: **~24 MB of cover re-upload**, refetched
 * and re-decoded, to change a setting that has nothing to do with the books.
 * That is the shape of the 314 MB problem G15 already fixed once.
 *
 * The GPU upload still happens again — `dispose()` on the old renderer takes its
 * context with it — but the fetch and the decode do not, which is the expensive
 * half on a phone.
 *
 * Never disposed. It is bounded by the size of the library, which is the same
 * bound `gates/cover-budget.test.ts` already enforces, and the alternative is a
 * cache that empties itself exactly when it would start being useful.
 */
export const COVERS = new TextureCache();

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
