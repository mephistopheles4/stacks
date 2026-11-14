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
import type { SettingsPatch } from './shelf-settings.ts';

export type RoomMode = 'off' | 'match' | 'keep';

export function roomMode(params: URLSearchParams = new URLSearchParams(location.search)): RoomMode {
  if (!params.has('room')) return 'off';
  return params.get('room') === 'keep' ? 'keep' : 'match';
}

/** The room's lamp bulb, in three's coordinates (Blender (3.9, -1.9, 4.4)). */
const BULB = { x: 3.9, y: 4.4, z: 1.9 };

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
  }
}

/** Fetches and adds the room; resolves once it is in the scene. */
export async function addPrototypeRoom(scene: THREE.Scene, exposure = 1): Promise<LoadedRoom> {
  const started = performance.now();
  // `?chair=blocks|scripted|polyhaven|trellis` picks which baked room to load.
  const chair = new URLSearchParams(location.search).get('chair') ?? 'blocks';
  const file = /^[a-z]+$/.test(chair) ? `room-${chair}.glb` : 'room-blocks.glb';
  const url = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/room-prototype-593/${file}`;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, '');

  let draws = 0;
  const slots: Record<string, unknown> = {};
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const old = node.material as THREE.MeshStandardMaterial;
      const map = old.map;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      node.material = new THREE.MeshBasicMaterial({
        map,
        color: new THREE.Color(exposure, exposure, exposure),
      });
      old.dispose();
      node.castShadow = false;
      node.receiveShadow = false;
      draws += 1;
    } else if (node.name.startsWith('slot_')) {
      slots[node.name] = {
        position: node.position.toArray(),
        rotationY: node.rotation.y,
        ...node.userData,
      };
    }
  });
  scene.add(gltf.scene);

  const room = { bytes: buffer.byteLength, loadMs: performance.now() - started, draws, slots };
  window.__room = room;
  console.info('[room-593]', room);
  return room;
}
