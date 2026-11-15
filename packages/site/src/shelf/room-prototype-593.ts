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
import { FOV, type Framing } from './framing.ts';
import { addCandleFlames } from './room-flames-593.ts';
import type { SettingsPatch } from './shelf-settings.ts';

export type RoomMode = 'off' | 'match' | 'keep';

export function roomMode(params: URLSearchParams = new URLSearchParams(location.search)): RoomMode {
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
export async function addPrototypeRoom(scene: THREE.Scene, exposure = 1): Promise<LoadedRoom> {
  const started = performance.now();
  // `?chair=blocks|scripted|polyhaven|trellis|hero` picks which baked room to load.
  const chair = new URLSearchParams(location.search).get('chair') ?? 'blocks';
  const file = /^[a-z]+$/.test(chair) ? `room-${chair}.glb` : 'room-blocks.glb';
  // `BASE_URL` is vite's; the root typecheck sees only the slice boot.ts declares
  const base = (import.meta.env as unknown as { BASE_URL?: string }).BASE_URL ?? '/';
  const url = `${base.replace(/\/$/, '')}/room-prototype-593/${file}`;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, '');

  let draws = 0;
  const slots: Record<string, unknown> = {};
  const flames: THREE.Object3D[] = [];
  const folder = url.slice(0, url.lastIndexOf('/') + 1);
  const textures = new THREE.TextureLoader();
  const texture = (path: string, repeat: boolean): THREE.Texture => {
    const t = textures.load(folder + path);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // the UVs come through glTF, which counts v from the top
    t.anisotropy = 16;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
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
      const lightMap = texture(extras.lightmap, false);
      lightMap.channel = 1;
      const [r = 1, g = 1, b = 1] = extras.tint ?? [];
      // the rug's pile grain (rug.py): a tiling occlusion finer than the photograph, on UV0
      // with its own repeat; its average darkening is given back by the tint
      let aoMap: THREE.Texture | null = null;
      if (extras.pile) {
        aoMap = texture(extras.pile, true);
        aoMap.colorSpace = THREE.NoColorSpace;
        const [ru = 1, rv = 1] = extras.pile_repeat ?? [];
        aoMap.repeat.set(ru, rv);
      }
      (node.material as THREE.Material).dispose();
      node.material = new THREE.MeshBasicMaterial({
        map: texture(extras.albedo, true),
        lightMap,
        lightMapIntensity: (extras.light_scale ?? 2) * Math.PI,
        aoMap,
        color: new THREE.Color(r * exposure, g * exposure, b * exposure),
      });
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
      const map = baked ? texture(baked, false) : old.map;
      if (map && !baked) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 16;
      }
      node.material = new THREE.MeshBasicMaterial({
        map,
        color: new THREE.Color(exposure, exposure, exposure),
      });
      old.dispose();
      node.castShadow = false;
      node.receiveShadow = false;
      draws += 1;
    } else if (node.name.startsWith('flame_')) {
      flames.push(node);
    } else if (node.name.startsWith('slot_')) {
      slots[node.name] = {
        position: node.position.toArray(),
        rotationY: node.rotation.y,
        ...node.userData,
      };
    }
  });
  draws += addCandleFlames(flames); // after the walk: it adds children to the nodes it found
  scene.add(gltf.scene);

  const room = { bytes: buffer.byteLength, loadMs: performance.now() - started, draws, slots };
  window.__room = room;
  window.__roomScene = scene;
  console.info('[room-593]', room);
  return room;
}
