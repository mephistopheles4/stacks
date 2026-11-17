import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { chooseCodec, codecSession, loadWithFallback } from './room-codec.ts';
import { type Empty, readRoomData, type RoomData } from './room-data.ts';
import { ktx2Textures } from './room-ktx2.ts';
import { addCandleFlames } from './room-flames.ts';
import { createSettler, type LoadState } from './room-loading.ts';
import type { PreparedRoom, RoomSource } from './room-load.ts';
import { roomFolder, roomGlbUrl, type RoomEntry, type RoomId } from './room-mode.ts';

/**
 * The half of a room's load that touches three and the network (#602, spec S3, S4, S7): the GLB, its
 * meshopt decoder, the textures through the codec the page chose, and the room's data off its
 * empties. `room-load.ts` decides what a failure here means.
 *
 * The room is unlit: each mesh is a `MeshBasicMaterial` with its light baked in (S7.1), which reads
 * no light and no shadow map, so the one program that samples it stays the bookcase's woodwork.
 */

export interface LoadedRoom extends PreparedRoom {
  readonly group: THREE.Group;
  readonly data: RoomData;
  /** Draws the room adds to a frame. */
  readonly draws: number;
  readonly bytes: number;
  /** Which texture set the room reads, as the codec session stands when it settles. */
  readonly codec: () => string;
}

/** The packed GLB's extras that say how a baked piece is dressed (`build_room.py`, `lightmaps.py`). */
interface PieceExtras {
  albedo?: string;
  lightmap?: string;
  tint?: number[];
  pile?: string;
  pile_repeat?: number[];
  light_scale?: number;
  baked?: string;
}

/** The names of the empties the page reads. Everything else without a mesh is left alone. */
const EMPTY_NAME = /^(slot_|view_open$|bounds_(min|max)$|live_)/;

export interface AssetOptions {
  readonly id: RoomId;
  /** The entry the id was found on: the page fetches this room's GLB and no other room's file. */
  readonly entry: RoomEntry;
  readonly renderer: THREE.WebGLRenderer;
  /** `location.search`: only `?tex=` is read from it. */
  readonly search: string;
  readonly warn: (message: string) => void;
}

export function roomAssets(options: AssetOptions): RoomSource<LoadedRoom> {
  return { prepare: (report) => prepare(options, report) };
}

async function prepare(
  options: AssetOptions,
  report: (state: Partial<LoadState>) => void,
): Promise<LoadedRoom> {
  const { id, entry, renderer, search, warn } = options;
  const folder = roomFolder(id);
  const url = roomGlbUrl(id, entry);
  const buffer = await download(url, (loaded, total) => {
    report({ glbLoaded: loaded, glbTotal: total });
  });
  report({ glbDone: true });

  // The room's meshes are meshopt-compressed (build_room.py --pack): three's own decoder, in WebAssembly.
  try {
    await MeshoptDecoder.ready;
  } catch (error) {
    throw new Error(`the meshopt decoder did not start (${describe(error)})`, { cause: error });
  }
  let gltf;
  try {
    gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
  } catch (error) {
    throw new Error(`the GLB did not parse (${describe(error)})`, { cause: error });
  }

  const empties: Empty[] = [];
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh || !EMPTY_NAME.test(node.name)) return;
    empties.push({
      name: node.name,
      position: node.position.toArray(),
      quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
      userData: node.userData,
    });
  });
  const data = readRoomData(empties);

  // ---- textures: one codec for the page load, WebP behind KTX2 (spec S5) -----------------------
  const manager = new THREE.LoadingManager();
  const session = codecSession(chooseCodec(search), warn);
  const webp = new THREE.TextureLoader(manager);
  let ktx: ReturnType<typeof ktx2Textures> | undefined;
  const textureOf = (path: string): Promise<THREE.Texture> =>
    loadWithFallback<THREE.Texture>(session, (codec) => {
      if (codec === 'webp') return webp.loadAsync(folder + path);
      ktx ??= ktx2Textures(manager, renderer);
      return ktx.load(`${folder}ktx-etc1s/${path.replace(/\.webp$/, '.ktx2')}`);
    });

  // The screen lifts once every texture is ON the room, not once its file has arrived: a KTX2 file
  // still has to go through the transcoder's worker (spec S3.2).
  let resolveSettled: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  const settler = createSettler(resolveSettled);
  type Slot = 'map' | 'lightMap' | 'aoMap';
  const texture = (
    material: THREE.MeshBasicMaterial,
    slot: Slot,
    path: string,
    repeat: boolean,
    set: (t: THREE.Texture) => void = () => undefined,
  ): void => {
    settler.ask();
    void textureOf(path)
      .then(
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = false; // the UVs come through glTF, which counts v from the top
          t.anisotropy = 16;
          if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
          set(t);
          material[slot] = t;
          material.needsUpdate = true;
        },
        () => {
          // A texture that fails counts as settled, and says which (spec S3.3).
          warn(`room: the texture ${path} did not load`);
        },
      )
      .finally(() => {
        settler.settle();
        const { settled: done, asked } = settler.counts();
        report({ texLoaded: done, texTotal: asked });
      });
  };

  let draws = 0;
  const flames: THREE.Object3D[] = [];
  gltf.scene.traverse((node) => {
    const extras = (node.userData.albedo ? node.userData : node.parent?.userData) as
      PieceExtras | undefined;
    if (node instanceof THREE.Mesh && extras?.albedo && extras.lightmap) {
      // Light-only bake (lightmaps.py): the sharp texture on UV0, the soft light on UV1, stored at
      // 1 / light_scale (half, or a quarter beside the lamp); MeshBasicMaterial divides a light map
      // by PI.
      const [r = 1, g = 1, b = 1] = extras.tint ?? [];
      (node.material as THREE.Material).dispose();
      const material = new THREE.MeshBasicMaterial({
        lightMapIntensity: (extras.light_scale ?? 2) * Math.PI,
        color: new THREE.Color(r, g, b),
      });
      node.material = material;
      texture(material, 'map', extras.albedo, true);
      texture(material, 'lightMap', extras.lightmap, false, (t) => {
        t.channel = 1;
      });
      // The rug's pile grain (rug.py): a tiling occlusion finer than the photograph, on UV0 with its
      // own repeat; its average darkening is given back by the tint.
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
      // `texture` sets the anisotropy: seen at a glancing angle, a mip chosen for the blurrier axis
      // smears the leather's grain into streaks along the other.
      const baked = (node.userData.baked ?? node.parent?.userData.baked) as string | undefined;
      const material = new THREE.MeshBasicMaterial({ map: baked ? null : old.map });
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
    }
  });
  draws += addCandleFlames(flames); // after the walk: it adds children to the nodes it found

  const group = gltf.scene;
  report({ texTotal: settler.counts().asked });
  settler.walked();

  return {
    group,
    data,
    draws,
    bytes: buffer.byteLength,
    codec: () => session.codec(),
    settled,
    dispose: () => {
      ktx?.dispose();
      group.removeFromParent();
      group.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const mesh = node as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material instanceof THREE.MeshBasicMaterial) {
            material.map?.dispose();
            material.lightMap?.dispose();
            material.aoMap?.dispose();
          }
          material.dispose();
        }
      });
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** The GLB, its bytes counted as they arrive; `total` is 0 when the server sends no length. */
async function download(
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`the GLB did not load (${describe(error)})`, { cause: error });
  }
  if (!response.ok) throw new Error(`the GLB did not load (HTTP ${String(response.status)})`);
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
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out.buffer;
}
