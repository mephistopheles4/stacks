import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShelfBook } from './books.ts';
import { buildBook, COVERS } from './scene.ts';
import {
  isShielded,
  NO_SHADOW_FETCH_KEY,
  NO_SHADOW_FETCH_LINE,
  receiveShadows,
  withoutShadowFetch,
} from './shadow-receivers.ts';
import { DEFAULT_SETTINGS, resolveSettings, type ShadowReceiverName } from './shelf-settings.ts';

/**
 * Which programs sample the shadow map, pinned without a GPU.
 *
 * What only a phone can show is whether the shelf *survives* — that was
 * measured on the device and is recorded in `shadow-receivers.ts`. What these
 * pin is that the site still builds the configuration that survived: every lit
 * part of a book compiled with no sampler, under one shared cache key, and the
 * cast left alone. Each of those is a line somebody could delete with every
 * frame on a desktop still looking right.
 */

/** Three's own parameters object, reduced to the two strings a hook may touch. */
function compile(material: THREE.Material, fragmentShader: string): string {
  const shader = { vertexShader: 'void main() {}', fragmentShader, uniforms: {} };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    undefined as unknown as THREE.WebGLRenderer,
  );
  return shader.fragmentShader;
}

/** `#include <chunk>`, resolved the way `WebGLProgram` resolves it, recursively. */
function resolveIncludes(source: string): string {
  return source.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name: string) =>
    resolveIncludes((THREE.ShaderChunk as Record<string, string>)[name] ?? ''),
  );
}

describe('withoutShadowFetch', () => {
  it('undefines the flag at the top of the body three hands it', () => {
    const body = compile(withoutShadowFetch(new THREE.MeshStandardMaterial()), 'BODY');
    expect(body).toBe(`${NO_SHADOW_FETCH_LINE}\nBODY`);
  });

  it('lands before the sampler is declared, in the body a MeshStandardMaterial compiles', () => {
    // The premise the whole fix rests on: three declares the sampler in the
    // *body*, after the seam `onBeforeCompile` writes at. If a three upgrade
    // moved it into the prefix, the undef would arrive too late and this goes
    // red. It cannot see the prefix itself — that is built inside
    // `WebGLProgram` and needs a context — so it pins the half it can reach.
    const raw = THREE.ShaderLib.physical.fragmentShader;
    const shielded = resolveIncludes(
      compile(withoutShadowFetch(new THREE.MeshStandardMaterial()), raw),
    );

    expect(shielded.startsWith(`${NO_SHADOW_FETCH_LINE}\n`)).toBe(true);
    expect(shielded).toContain('uniform sampler2DShadow directionalShadowMap');
  });

  it('is shielded once however many times three compiles it', () => {
    // A cover arriving, a live toggle and a restored context each recompile;
    // three builds a fresh body from `ShaderLib` every time.
    const material = withoutShadowFetch(withoutShadowFetch(new THREE.MeshStandardMaterial()));
    compile(material, 'BODY');
    expect(compile(material, 'BODY')).toBe(`${NO_SHADOW_FETCH_LINE}\nBODY`);
  });

  it('files every shielded program under one key, and never under an unshielded one', () => {
    const plain = new THREE.MeshStandardMaterial();
    const a = withoutShadowFetch(new THREE.MeshStandardMaterial());
    const b = withoutShadowFetch(new THREE.MeshStandardMaterial({ roughness: 0.2 }));

    expect(a.customProgramCacheKey()).toBe(NO_SHADOW_FETCH_KEY);
    expect(b.customProgramCacheKey()).toBe(a.customProgramCacheKey());
    expect(plain.customProgramCacheKey()).not.toBe(NO_SHADOW_FETCH_KEY);
    expect(isShielded(plain)).toBe(false);
    expect(isShielded(a)).toBe(true);
  });
});

describe('receiveShadows', () => {
  const scene = (): { group: THREE.Group; lit: THREE.Mesh; basic: THREE.Mesh } => {
    const group = new THREE.Group();
    const lit = new THREE.Mesh(undefined, [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshLambertMaterial(),
    ]);
    lit.receiveShadow = true;
    lit.castShadow = true;
    const basic = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial());
    group.add(lit, basic);
    return { group, lit, basic };
  };

  it('shields every lit material and clears the flag, and leaves casting alone', () => {
    const { group, lit } = scene();
    receiveShadows(group, false);

    expect(lit.receiveShadow).toBe(false);
    expect(lit.castShadow).toBe(true);
    expect((lit.material as THREE.Material[]).map(isShielded)).toEqual([true, true]);
  });

  it('leaves an unlit part exactly as it was', () => {
    // A painted plane has no sampler to lose, and under VSM a receiver is
    // drawn into the map — so neither its program key nor its flag may move.
    const { group, basic } = scene();
    receiveShadows(group, false);
    expect(isShielded(basic.material as THREE.Material)).toBe(false);
    expect(basic.receiveShadow).toBe(false);

    receiveShadows(group, true);
    expect(basic.receiveShadow).toBe(false);
  });

  it('under `all`, only sets the flag', () => {
    const { group, lit } = scene();
    lit.receiveShadow = false;
    receiveShadows(group, true);

    expect(lit.receiveShadow).toBe(true);
    expect((lit.material as THREE.Material[]).map(isShielded)).toEqual([false, false]);
  });
});

describe('a built book', () => {
  // Every canvas the book would paint reports no 2D context, which each maker
  // already answers with `undefined` — so the book builds under `node` with its
  // flat fallbacks, and every part is still there to be walked.
  const noCanvas = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const hardback: ShelfBook = {
    book: { id: 'receivers-probe', title: 'Probe', status: 'read', tags: [] },
    thickness: 0.1,
    height: 0.9,
    binding: 'hardback',
    colour: '#7a4a2a',
    faceOut: false,
    footprint: 0.1,
    coverWidth: 0.6,
  };

  const build = (receivers: ShadowReceiverName): THREE.Group => {
    vi.stubGlobal('document', noCanvas);
    const settings = resolveSettings({ shadows: { receivers } }, DEFAULT_SETTINGS);
    return buildBook(hardback, 0.6, COVERS, false, settings);
  };

  const litParts = (group: THREE.Group): THREE.Mesh[] =>
    group.children.filter(
      (part): part is THREE.Mesh =>
        part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial,
    );

  it('reads the map nowhere by default: all five materials of a hardback are shielded', () => {
    const parts = litParts(build(DEFAULT_SETTINGS.shadows.receivers));
    const materials = new Set(parts.map((part) => part.material as THREE.Material));

    // spine, pages, boards, cover and the head cap's covering. The covering is
    // the one a hand-applied list would miss, and a fifth sampling program is
    // not a configuration anybody has seen survive.
    expect(materials.size).toBe(5);
    for (const material of materials) expect(isShielded(material)).toBe(true);
    for (const part of parts) expect(part.receiveShadow).toBe(false);
  });

  it('still casts: the page block alone, exactly as before', () => {
    const casters = litParts(build('bookcase')).filter((part) => part.castShadow);
    expect(casters).toHaveLength(1);
  });

  it('under `all`, is the book it always was', () => {
    const parts = litParts(build('all'));
    for (const part of parts) {
      expect(part.receiveShadow).toBe(true);
      expect(isShielded(part.material as THREE.Material)).toBe(false);
    }
  });
});
