import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LibraryBook } from '@stacks/core';
import { toRows, type ShelfBook, type ShelfRow } from './books.ts';
import {
  LIFT,
  makeBackboardShade,
  makeContactShadow,
  makeNeighbourShadow,
  makeRecessShade,
  type CaseLight,
  type Footprint,
} from './contact-shadow.ts';
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
 * Proportions taken from a real bookcase rather than picked to look tidy.
 *
 * A hardback is roughly 3cm thick and 23cm tall, and a shelf about 90cm wide —
 * so width is ~4× book height and a shelf holds ~30 books. Matching that ratio
 * is what makes the thing read as furniture instead of as a chart.
 */
const SHELF = {
  width: 3.4,
  rowHeight: 1.12,
  depth: 0.72,
  plankThickness: 0.07,
  sideThickness: 0.09,
  backThickness: 0.05,
  /** Gap between neighbouring books. */
  bookGap: 0.008,
  /** Books sit slightly forward of the backboard, as they do in life. */
  bookDepth: 0.52,
  /** Breathing room at each end of a shelf. */
  padding: 0.06,
} as const;

/**
 * The case grows with the library, always keeping one empty shelf ahead.
 *
 * A fixed four-shelf unit means a small library sits in a mostly empty case and
 * the camera has to back off far enough to frame all that empty wood, which
 * leaves the spines too small to read. Sizing to content keeps the books large
 * and the shelf honest — there is always somewhere for the next book to go.
 */
const MIN_ROWS = 2;

/**
 * Slack kept at the end of every row.
 *
 * A leaning book is wider than an upright one: tilting a 0.95-tall board by
 * 0.062rad pushes its lower corner about 0.03 further out. Without this the last
 * book on a full shelf leans straight through the side of the case.
 */
const LEAN_ALLOWANCE = 0.05;

function rowsForCase(usedRows: number): number {
  return Math.max(usedRows + 1, MIN_ROWS);
}

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
const SHADOW_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  soft: THREE.PCFShadowMap,
} as const;

const COLOURS = {
  background: 0x1a1613,
  wood: 0x6b4f3a,
  woodDark: 0x4a3527,
  key: 0xffe9cc,
  fill: 0x5577aa,
} as const;

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

export interface ShelfHandle {
  dispose(): void;
  /** Books currently on the shelf, in draw order. Used by the smoke gate. */
  readonly bookCount: number;
  /** The GPU, when the browser is willing to name it. */
  readonly gpu: string | undefined;
  /** The renderer settings this mount actually ran with. See `RendererOverrides`. */
  readonly profile: string;
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
  /** `?shadowtype=basic|pcf|soft`. See `SHADOW_TYPES`: `soft` is now `pcf`. */
  readonly shadowType?: 'basic' | 'pcf' | 'soft';
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
}

export interface MountOptions {
  /** Called when a book is clicked, or with `undefined` when one is dismissed. */
  readonly onSelect?: (book: LibraryBook | undefined) => void;
  /** Per-load renderer settings. See `RendererOverrides`. */
  readonly renderer?: RendererOverrides;
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
  const antialias = options.renderer?.antialias ?? true;
  const maxPixelRatio = options.renderer?.maxPixelRatio ?? 2;
  const shadows = options.renderer?.shadows ?? false;
  const shadowMapSize = options.renderer?.shadowMapSize ?? 2048;
  const shadowType = options.renderer?.shadowType ?? 'pcf';
  const shadowCasters = options.renderer?.shadowCasters ?? true;
  const guardResize = options.renderer?.guardResize ?? false;
  const painted = options.renderer?.painted ?? true;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = SHADOW_TYPES[shadowType];

  /**
   * What the driver said when a program would not link.
   *
   * A live array rather than a return value: the failure happens inside the
   * first `render`, which is inside this function, so there is nobody to hand it
   * to yet. The diagnostics panel reads it on its next tick.
   */
  const shaderErrors: string[] = [];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOURS.background);
  scene.fog = new THREE.Fog(COLOURS.background, 14, 30);

  const rows = toRows(
    books,
    SHELF.width - SHELF.padding * 2 - LEAN_ALLOWANCE,
    SHELF.bookGap,
  );
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

  scene.add(buildShelf(rowCount, shadowCasters));
  addLighting(scene, unitHeight, shadows, shadowMapSize);

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
  const placed = placeBooks(scene, rows, textures, lookup, shadowCasters, painted);

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
  const renderLoop = (): void => {
    if (halted) return;
    frame = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
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
    if (guardResize && clientWidth === sizedTo.width && clientHeight === sizedTo.height) return;
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

  return {
    bookCount: placed.length,
    gpu: describeGpu(renderer),
    caseOverflow: measureCaseOverflow(scene, placed),
    shaderErrors,
    // Reported back so a screenshot of the panel says which settings were live.
    // A bisect whose result cannot be tied to a configuration is just an anecdote.
    profile:
      `aa=${antialias ? 'on' : 'off'} dpr<=${String(maxPixelRatio)} ` +
      `shadows=${shadows ? `${shadowType}@${String(shadowMapSize)}` : 'off'} ` +
      `casters=${shadowCasters ? 'on' : 'off'} guard=${guardResize ? 'on' : 'off'} ` +
      `painted=${painted ? 'on' : 'off'}`,

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

function placeBooks(
  scene: THREE.Scene,
  rows: readonly ShelfRow[],
  textures: TextureCache,
  lookup: BookLookup,
  castShadows: boolean,
  painted: boolean,
): PlacedBook[] {
  const placed: PlacedBook[] = [];
  /** Footprints per row of *books*, indexed as `rows` is — top shelf first. */
  const byRow: Footprint[][] = [];

  const rowCount = rowsForCase(rows.length);

  rows.forEach((row, rowIndex) => {
    // Drawn top-down: the newest books sit on the top shelf.
    const shelfY = (rowCount - 1 - rowIndex) * SHELF.rowHeight + SHELF.plankThickness / 2;

    // Books stand *against* the left upright and run right, as a shelf fills.
    //
    // Flush, with no padding: a book that leans left and starts a finger's width
    // clear of the side is leaning on nothing, which is the tell that made the
    // whole row look wrong. The case itself is what the first book rests on.
    let cursor = -SHELF.width / 2;
    let index = 0;

    /**
     * One slump angle per run of touching books.
     *
     * Books in a leaning row are not each at their own angle — they are a stack
     * resting on each other, so they are parallel, and the run as a whole leans
     * on whatever is at its left end. Giving every book its own angle is what
     * produced the wedge-shaped gaps: neighbours a fraction of a degree apart,
     * touching nowhere.
     */
    let runLean = Math.min(
      leanFor(rowIndex, index, row.books[0]?.book.id ?? ''),
      leanThatFits(row),
    );
    let startsRun = true;

    /**
     * The lean of whatever is immediately to the left, and how far it swings.
     *
     * The case's own side starts it off: vertical, and swinging not at all.
     */
    let leftLean = 0;
    let leftSway = 0;

    // Where each book meets the plank, gathered as the row is laid out — the
    // painted shadow is drawn from exactly the positions the books were placed
    // at, so the two cannot drift apart.
    const footprints: Footprint[] = [];

    for (const entry of row.books) {
      // Depth carries the cover's real aspect on a face-out book, which is
      // turned side-on, and the shelf depth on a shelved one.
      const depth = entry.faceOut ? entry.coverWidth : SHELF.bookDepth;

      // A shelved book stands a quarter-unit proud of a face-out one, so it is
      // between its neighbour's cover and the key light.
      //
      // Only when it is actually *next to* it: a book on the far side of a year
      // gap is a hand's width away and occludes nothing, and shading the cover
      // anyway put a hard band down the edge of a book standing on its own.
      const next = row.books[index + 1];
      const shadedFromRight =
        painted &&
        entry.faceOut &&
        next !== undefined &&
        !next.faceOut &&
        (next.gapBefore ?? 0) === 0;

      const book = buildBook(entry, depth, textures, castShadows, shadedFromRight);

      const gap = entry.gapBefore ?? 0;
      cursor += gap;

      // A run is broken by a year gap: the book after one has open shelf on its
      // left and nothing to rest against, so it stands up straight and becomes
      // the support for the books after it. A row's first book is not a break —
      // the case's own side holds it.
      if (gap > 0) {
        startsRun = true;
        runLean = Math.min(leanFor(rowIndex, index, entry.book.id), leanThatFits(row));
      }

      // A face-out book stands square; a shelved one leans unless it opens a run
      // with nothing on its left.
      const lean = entry.faceOut ? 0 : startsRun && index > 0 ? 0 : runLean;
      const sway = swayOf(entry.height, lean);

      // Clearance wherever the angle changes, and only there.
      //
      // Rotating a book about its centre swings its top-left and bottom-right
      // corners out past its own footprint by `sway`. Two neighbours at the same
      // angle stay parallel and never notice, which is why a run packs flush —
      // but where the angle changes, that swing lands inside whatever is beside
      // it. Both reported collisions are this: a leaning book's bottom corner
      // driven into the face-out book on its right, and the first book of a row
      // driven into the case's own side.
      if (lean !== leftLean) cursor += Math.max(sway, leftSway);
      leftLean = lean;
      leftSway = sway;

      if (entry.faceOut) {
        // Turned to show its cover, leaning back against the books beside it.
        //
        // -90°, not +90°: the cover is the +X face, and rotating +90° about Y
        // maps +X to -Z — pointing away from the room. Face-out books were
        // showing the viewer their back boards.
        book.rotation.y = -Math.PI / 2;
        book.rotation.z = 0.06;
        book.position.set(
          cursor + entry.coverWidth * 0.5,
          shelfY + entry.height / 2,
          (SHELF.depth - entry.coverWidth) / 2 - 0.02,
        );
        // A face-out book has been turned a quarter turn, so what it puts on the
        // plank is `coverWidth` across and only its own `thickness` deep — the
        // same slab as any other book, seen end-on. Taking the cover's width for
        // *both* painted a shadow the size of the cover flat on the wood, which
        // reached most of the way to the front edge of the shelf: a dark smudge
        // standing in front of a book, thrown by a light that is in front of it.
        footprints.push({
          x: cursor + entry.coverWidth * 0.5,
          width: entry.coverWidth,
          z: (SHELF.depth - entry.coverWidth) / 2 - 0.02,
          depth: entry.thickness,
        });
        cursor += entry.coverWidth + SHELF.bookGap * 2;
        // A face-out book is broad and flat on the shelf, so it is a support in
        // its own right — whatever follows it may lean on it.
        startsRun = false;
      } else {
        startsRun = false;

        book.rotation.z = lean;
        book.position.set(
          cursor + entry.thickness / 2,
          // Rotating about the centre would sink the low corner into the plank.
          shelfY + entry.height / 2 + (entry.thickness / 2) * Math.sin(Math.abs(lean)),
          (SHELF.depth - SHELF.bookDepth) / 2 - 0.02,
        );
        footprints.push({
          x: cursor + entry.thickness / 2,
          width: entry.thickness,
          z: (SHELF.depth - SHELF.bookDepth) / 2 - 0.02,
          depth: SHELF.bookDepth,
        });
        // Touching, not spaced. Books in a run share an angle, so they stay
        // parallel and their boards meet along the whole height — which is what
        // "resting on each other" has to look like. The hair of clearance is
        // only so two coincident faces do not fight over the same depth.
        cursor += entry.thickness + TOUCHING;
      }
      index += 1;

      scene.add(book);
      placed.push({ group: book, frontZ: depth / 2 });
      // Every part of a book answers for the whole book, so a click on the
      // pages or a board opens the same card as a click on the spine.
      for (const part of book.children) lookup.set(part, entry.book);
    }

    byRow[rowIndex] = footprints;
  });

  // Every shelf, not only the ones holding books: the overlays also carry the
  // shading the case throws on itself, and an empty shelf has a backboard and a
  // corner just as a full one does. Skipping them would leave the bottom of a
  // growing case looking like a different piece of furniture from the top.
  if (!painted) return placed;

  const light = caseLight(rowCount * SHELF.rowHeight);
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

/** Most a book leans, in radians — about 3.5°. Beyond that it looks knocked over. */
const MAX_LEAN = 0.062;

/**
 * Clearance between books that are meant to be touching.
 *
 * Not zero: two adjacent boards at exactly zero would be coplanar and z-fight
 * along their top edge, where the shelf actually shows them. Small enough that
 * no gap is visible at the scale a spine is drawn.
 */
const TOUCHING = 0.002;

/**
 * How far a leaning book's corners swing out past its own footprint.
 *
 * Rotating about the centre pushes the top-left corner left and the bottom-right
 * corner right, each by half the height times the sine of the angle — about
 * 0.03, which is a thin book's whole thickness. Neighbours at the same angle
 * stay parallel and never collide; wherever the angle *changes*, this is what
 * has to be reserved.
 */
function swayOf(height: number, lean: number): number {
  return (height / 2) * Math.sin(Math.abs(lean));
}

/**
 * The steepest lean whose clearances still fit inside the shelf.
 *
 * `toRows` packs a row without knowing anything about leaning, so every
 * clearance added afterwards is width the packer never budgeted for. A row with
 * several face-out books changes angle at each one, and at ~0.03 a time that is
 * enough to push the last book through the right-hand upright — a worse defect
 * than the one being fixed, and one that would only show on a full shelf.
 *
 * So the lean is capped to what the row's own slack can pay for. Rows with room
 * are unaffected; a tightly packed row leans less, which is also what a tightly
 * packed shelf does.
 */
function leanThatFits(row: ShelfRow): number {
  let used = 0;
  let changes = 0;
  let tallest = 0;
  // The case's side is vertical, so a leaning first book is already a change.
  let leftLeans = false;

  for (const entry of row.books) {
    used += entry.gapBefore ?? 0;
    used += entry.faceOut
      ? entry.coverWidth + SHELF.bookGap * 2
      : entry.thickness + TOUCHING;
    tallest = Math.max(tallest, entry.height);

    const leans = !entry.faceOut;
    if (leans !== leftLeans) changes += 1;
    leftLeans = leans;
  }

  if (changes === 0 || tallest === 0) return MAX_LEAN;

  const slack = Math.max(0, SHELF.width - used);
  // Inverting swayOf: the largest angle whose per-change swing the slack covers.
  return Math.asin(Math.min(1, (2 * (slack / changes)) / tallest));
}

/**
 * How far a shelved book leans to the left.
 *
 * The obvious version — an independent random angle per book — looks wrong and
 * renders worse: neighbours touch, so two books tilted opposite ways intersect.
 * Real shelves do not do that either. Books lean in *groups*, sharing a slump
 * until something upright interrupts it.
 *
 * So the angle is a slow wave along the row, which keeps adjacent books within
 * a fraction of a degree of each other, plus a little per-book jitter to stop
 * the wave reading as machinery. Both are derived from the row and the book id,
 * so a shelf looks the same on every rebuild.
 */
function leanFor(rowIndex: number, position: number, id: string): number {
  const wave = Math.sin(position * 0.62 + rowIndex * 2.3);
  const jitter = hashUnit(id) - 0.5;
  // Biased positive: +Z rotation tips the top of the book to the left.
  const lean = 0.55 + wave * 0.38 + jitter * 0.14;
  return Math.max(0, Math.min(1, lean)) * MAX_LEAN;
}

/** FNV-1a squashed to 0..1 — deterministic, no dependency, good enough. */
function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 8) / 0x1000000;
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
  castShadows: boolean,
  shadedFromRight: boolean,
): THREE.Group {
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
    roughness: 0.55,
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

function buildShelf(rowCount: number, castShadows: boolean): THREE.Group {
  const group = new THREE.Group();

  const wood = new THREE.MeshStandardMaterial({ color: COLOURS.wood, roughness: 0.82 });
  const backing = new THREE.MeshStandardMaterial({ color: COLOURS.woodDark, roughness: 0.95 });

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

  return group;
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
function keyLightPosition(unitHeight: number): THREE.Vector3 {
  return new THREE.Vector3(5, unitHeight + 3.4, 5.6);
}

function keyLightTarget(unitHeight: number): THREE.Vector3 {
  return new THREE.Vector3(0, unitHeight / 2, 0);
}

/** The key light as the painters need it. See `CaseLight`. */
function caseLight(unitHeight: number): CaseLight {
  const toTarget = keyLightTarget(unitHeight).sub(keyLightPosition(unitHeight));
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

function addLighting(
  scene: THREE.Scene,
  unitHeight: number,
  shadows: boolean,
  shadowMapSize: number,
): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));

  const key = new THREE.DirectionalLight(COLOURS.key, 2.7);
  key.position.copy(keyLightPosition(unitHeight));
  // Left off entirely rather than relying on `shadowMap.enabled`, so the depth
  // target is never allocated at all — which is the thing being measured.
  key.castShadow = shadows;
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize);

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
  target.position.set(0, unitHeight / 2, 0);
  scene.add(target);
  key.target = target;

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

  scene.add(key);

  const fill = new THREE.DirectionalLight(COLOURS.fill, 0.75);
  fill.position.set(-5, unitHeight * 0.6, 4.5);
  scene.add(fill);

  // A warm lamp close to the shelf, so spines nearest the viewer read clearly
  // and the case has a centre of light rather than flat exposure.
  const lamp = new THREE.PointLight(0xffd7a8, 14, 14, 2);
  lamp.position.set(1.6, unitHeight * 0.72, 2.4);
  scene.add(lamp);
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
