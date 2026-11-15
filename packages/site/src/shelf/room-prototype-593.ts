/**
 * PROTOTYPE for #593 — throwaway, never for `main`.
 *
 * `?room` loads the baked reading corner around the bookcase and swaps the
 * shelf's live lights for a set that agrees with the room's lamp. The room is
 * drawn unlit (`MeshBasicMaterial` over its baked atlas), so it reads no light
 * and no shadow map: G61's one reader stays the bookcase.
 *
 * `?room=keep` loads the room but leaves the shelf's own lights alone, for the
 * before/after on question 1.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FOV, type Framing } from './framing.ts';
import { addCandleFlames } from './room-flames-593.ts';
import { showLoadingScreen } from './room-loading-593.ts';
import type { SettingsPatch } from './shelf-settings.ts';

export type RoomMode = 'off' | 'match' | 'keep';

// no `location` outside a page (the mount tests): no room
export function roomMode(
  params: URLSearchParams = new URLSearchParams(
    typeof location === 'undefined' ? '' : location.search,
  ),
): RoomMode {
  if (!params.has('room')) return 'off';
  return params.get('room') === 'keep' ? 'keep' : 'match';
}

/**
 * The room's opening view: the corner at an angle, the bookcase on the left, the chair and the
 * lamp on the right and the rug in front, framed by hand by the owner in a window about square
 * (0.99) and read back off the orbit. Orbiting turns about the room's middle, not the bookcase's.
 */
const ROOM_VIEW = {
  position: { x: -5.267, y: 4.306, z: 14.331 },
  target: { x: 2.334, y: 1.504, z: 1.335 },
};
/** What must stay in frame across, in world units: the bookcase's far side to the lamp, the
 * width that view holds at 0.99. */
const ROOM_SPAN = 11;
/** And up and down: the rug's near edge to the lamp's shade. A wide window comes in until
 * this fills the height; held at the owner's distance it left the corner small in dark floor. */
const ROOM_HEIGHT = 8;

/**
 * Where the camera opens in room mode: along the owner's line of sight, as close as both the
 * span and the height allow, so a wide window comes in and an upright phone backs off, as
 * `frameBookcase` does for the case.
 */
export function frameRoom(aspect: number, bookcase: Framing): Framing {
  const { position: p, target: t } = ROOM_VIEW;
  const base = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
  const half = Math.tan((FOV / 2) * (Math.PI / 180));
  const distance = Math.max(ROOM_HEIGHT / 2 / half, ROOM_SPAN / 2 / (half * aspect));
  const k = distance / base;
  return {
    distance,
    position: { x: t.x + (p.x - t.x) * k, y: t.y + (p.y - t.y) * k, z: t.z + (p.z - t.z) * k },
    target: t,
    maxDistance: distance * (bookcase.maxDistance / bookcase.distance),
  };
}

/** The hero lamp's bulb, in three's coordinates (Blender (5.31, -2.28, 4.85), printed by
 * `build_room.py --lamp hero`). */
const BULB = { x: 5.31, y: 4.85, z: 2.28 };

/**
 * The light that goes with this room — the brief's "light settings live with
 * the room". The key stands on the line from the bookcase's middle through the
 * bulb, so the books' live shadows fall the way the baked ones do.
 */
export const ROOM_LIGHTING: SettingsPatch = {
  scene: { background: 0x0d0b09 },
  lighting: {
    ambient: { colour: 0xffd9b0, intensity: 0.28 },
    key: {
      colour: 0xffc890,
      intensity: 2.3,
      position: { x: BULB.x * 2.1, y: { ofHeight: 0.5, plus: 4.6 }, z: BULB.z * 2.1 + 1.2 },
    },
    fill: { colour: 0x3a4a66, intensity: 0.3 },
    lamp: {
      colour: 0xffb070,
      intensity: 38,
      distance: 18,
      decay: 2,
      position: { x: BULB.x, y: { ofHeight: 0, plus: BULB.y }, z: BULB.z },
    },
  },
};

export interface LoadedRoom {
  readonly bytes: number;
  readonly loadMs: number;
  readonly draws: number;
  readonly slots: Record<string, unknown>;
}

declare global {
  interface Window {
    __room?: LoadedRoom;
    /** The scene the room went into: a close-up of the rug's edge is rendered from it by
     * hand, since the shelf's camera is clamped well clear of the floor. */
    __roomScene?: THREE.Scene;
    /** The orbit, so a view framed by hand can be read back into `ROOM_VIEW`. */
    __roomControls?: { readonly target: THREE.Vector3; readonly object: THREE.Object3D };
  }
}

/** Fetches and adds the room; resolves once it is in the scene. */
export async function addPrototypeRoom(
  scene: THREE.Scene,
  exposure = 1,
  renderer?: THREE.WebGLRenderer,
): Promise<LoadedRoom> {
  const started = performance.now();
  // `?chair=blocks|scripted|polyhaven|trellis|hero` picks which baked room to load.
  const chair = new URLSearchParams(location.search).get('chair') ?? 'blocks';
  const file = /^[a-z]+$/.test(chair) ? `room-${chair}.glb` : 'room-blocks.glb';
  // `BASE_URL` is vite's; the root typecheck sees only the slice boot.ts declares
  const base = (import.meta.env as unknown as { BASE_URL?: string }).BASE_URL ?? '/';
  const url = `${base.replace(/\/$/, '')}/room-prototype-593/${file}`;
  const screen = showLoadingScreen();
  const progress = { glbLoaded: 0, glbTotal: 0, glbDone: false, texLoaded: 0, texTotal: 0 };
  const buffer = await download(url, (loaded, total) => {
    screen.update({ ...progress, glbLoaded: loaded, glbTotal: total });
  });
  progress.glbDone = true;
  screen.update(progress);
  // the room's meshes are meshopt-compressed (build_room.py --pack): three's own decoder, in WebAssembly
  await MeshoptDecoder.ready;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
  // every texture the walk below asks for counts toward the screen, which lifts once the last is in
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    screen.update({ ...progress, texLoaded: loaded, texTotal: total });
  };

  let draws = 0;
  const slots: Record<string, unknown> = {};
  const flames: THREE.Object3D[] = [];
  const folder = url.slice(0, url.lastIndexOf('/') + 1);
  const textures = new THREE.TextureLoader(manager);
  // `?tex=etc1s` reads each texture as KTX2 (ETC1S) from `ktx-etc1s/`, transcoded to whichever packed
  // format the GPU knows by three's basis transcoder (WebAssembly, in a worker of its own, see
  // `ktx2Loader`); a GPU that knows none gets plain RGBA. They stay packed in GPU memory, about 190 MB
  // for the room against about 1.5 GB for the WebPs unpacked.
  const codec = new URLSearchParams(location.search).get('tex') ?? 'webp';
  const ktx =
    renderer && codec === 'etc1s' ? ktx2Loader(manager, `${folder}basis/`, renderer) : null;
  // The screen lifts once every texture is ON the room, not once its file has arrived: a KTX2 file
  // still has to go through the transcoder's worker, and the screen faded over a half-dressed room.
  let asked = 0;
  let settled = 0;
  let walked = false;
  const settle = (): void => {
    settled += 1;
    if (walked && settled === asked) screen.done();
  };
  type Slot = 'map' | 'lightMap' | 'aoMap';
  /** Loads `path` into `material[slot]`; `set` tunes the texture once it exists. */
  const texture = (
    material: THREE.MeshBasicMaterial,
    slot: Slot,
    path: string,
    repeat: boolean,
    set: (t: THREE.Texture) => void = () => undefined,
  ): void => {
    asked += 1;
    const tune = (t: THREE.Texture): THREE.Texture => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false; // the UVs come through glTF, which counts v from the top
      t.anisotropy = 16;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      set(t);
      return t;
    };
    if (!ktx) {
      material[slot] = tune(textures.load(folder + path, settle, undefined, settle));
      return;
    }
    ktx.load(
      `${folder}ktx-${codec}/${path.replace(/\.webp$/, '.ktx2')}`,
      (t) => {
        material[slot] = tune(t);
        material.needsUpdate = true;
        settle();
      },
      undefined,
      settle, // a failed texture still ends its item, so the screen always lifts
    );
  };
  gltf.scene.traverse((node) => {
    const extras = (node.userData.albedo ? node.userData : node.parent?.userData) as
      | {
          albedo?: string;
          lightmap?: string;
          tint?: number[];
          pile?: string;
          pile_repeat?: number[];
          light_scale?: number;
        }
      | undefined;
    if (node instanceof THREE.Mesh && extras?.albedo && extras.lightmap) {
      // Light-only bake (lightmaps.py): the sharp texture on UV0, the soft light on UV1,
      // stored at 1 / light_scale (half, or a quarter beside the lamp); MeshBasicMaterial
      // divides a light map by PI.
      const [r = 1, g = 1, b = 1] = extras.tint ?? [];
      (node.material as THREE.Material).dispose();
      const material = new THREE.MeshBasicMaterial({
        lightMapIntensity: (extras.light_scale ?? 2) * Math.PI,
        color: new THREE.Color(r * exposure, g * exposure, b * exposure),
      });
      node.material = material;
      texture(material, 'map', extras.albedo, true);
      texture(material, 'lightMap', extras.lightmap, false, (t) => {
        t.channel = 1;
      });
      // the rug's pile grain (rug.py): a tiling occlusion finer than the photograph, on UV0
      // with its own repeat; its average darkening is given back by the tint
      if (extras.pile) {
        const [ru = 1, rv = 1] = extras.pile_repeat ?? [];
        texture(material, 'aoMap', extras.pile, true, (t) => {
          t.colorSpace = THREE.NoColorSpace;
          t.repeat.set(ru, rv);
        });
      }
      node.castShadow = false;
      node.receiveShadow = false;
      draws += 1;
    } else if (node instanceof THREE.Mesh) {
      const old = node.material as THREE.MeshStandardMaterial;
      // The baked atlas is a file of its own (`userData.baked`), never packed in the GLB: a packed
      // image is read through a blob: URL, which the site's CSP refuses, and the mesh drew white.
      // `texture` sets the anisotropy: seen at a glancing angle, a mip chosen for the blurrier
      // axis smears the leather's grain into streaks along the other.
      const baked = (node.userData.baked ?? node.parent?.userData.baked) as string | undefined;
      const material = new THREE.MeshBasicMaterial({
        map: baked ? null : old.map,
        color: new THREE.Color(exposure, exposure, exposure),
      });
      if (baked) texture(material, 'map', baked, false);
      else if (old.map) {
        old.map.colorSpace = THREE.SRGBColorSpace;
        old.map.anisotropy = 16;
      }
      node.material = material;
      old.dispose();
      node.castShadow = false;
      node.receiveShadow = false;
      draws += 1;
    } else if (node.name.startsWith('flame_')) {
      flames.push(node);
    } else if (node.name.startsWith('slot_')) {
      // the turn about y read off where +x went: an Euler's y alone folds any turn past a quarter
      // into a half-turn about x and z, and the floor's stacks are turned every which way
      const along = new THREE.Vector3(1, 0, 0).applyQuaternion(node.quaternion);
      slots[node.name] = {
        position: node.position.toArray(),
        rotationY: Math.atan2(-along.z, along.x),
        ...node.userData,
      };
    }
  });
  draws += addCandleFlames(flames); // after the walk: it adds children to the nodes it found
  scene.add(gltf.scene);
  // the walk is done: lift the screen now if every texture already settled, else the last settle does
  walked = true;
  if (settled === asked) screen.done();

  const room = { bytes: buffer.byteLength, loadMs: performance.now() - started, draws, slots };
  window.__room = room;
  window.__roomScene = scene;
  console.info('[room-593]', room);
  return room;
}

/**
 * three's KTX2Loader, with its transcoder worker started from `basis/ktx2-worker.js`
 * (make_ktx2_worker.mjs) rather than from a blob: URL it builds in the page. A blob: worker takes the
 * page's CSP, and the transcoder's embind glue builds functions with `new Function`, which that policy
 * refuses: the room drew white. A worker loaded from its own URL takes its policy from its own
 * response instead (`public/_headers`), so eval is allowed in the worker alone and the page keeps none.
 */
function ktx2Loader(
  manager: THREE.LoadingManager,
  basis: string,
  renderer: THREE.WebGLRenderer,
): KTX2Loader {
  const loader = new KTX2Loader(manager).detectSupport(renderer);
  // KTX2Loader's own members, which its types leave out; `load` waits on `init()` before each texture
  const inner = loader as unknown as {
    transcoderPending: Promise<void> | null;
    workerConfig: unknown;
    workerPool: { setWorkerCreator(create: () => Worker): void };
    init(): Promise<void>;
  };
  inner.init = () => {
    inner.transcoderPending ??= new THREE.FileLoader(manager)
      .setResponseType('arraybuffer')
      .loadAsync(`${basis}basis_transcoder.wasm`)
      .then((binary) => {
        inner.workerPool.setWorkerCreator(() => {
          const worker = new Worker(`${basis}ktx2-worker.js`);
          const transcoderBinary = (binary as ArrayBuffer).slice(0);
          worker.postMessage({ type: 'init', config: inner.workerConfig, transcoderBinary }, [
            transcoderBinary,
          ]);
          return worker;
        });
      });
    return inner.transcoderPending;
  };
  return loader;
}

/** The GLB, its bytes counted as they arrive; `total` is 0 when the server sends no length. */
async function download(
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  const total = Number(response.headers.get('content-length') ?? 0);
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}
