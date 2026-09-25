import * as THREE from 'three';

/**
 * Which surfaces **read** the real-time shadow map, decided per program.
 *
 * `?shadows=1` loses the WebGL context on the Pixel 10 Pro XL (PowerVR
 * DXT-48-1536, driver 25.3) a few thousand draws in — and stops losing it the
 * moment only **one** program samples the map. Measured on the live site with
 * shader hooks, 120 s a run:
 *
 * | what samples the map | result |
 * | --- | --- |
 * | the bookcase's program only | survived 3/3, then 300 s, then 120 s of orbiting |
 * | the four book programs only | lost 2/2, frame 8 |
 * | all five, `receiveShadow` sent as `0` everywhere | lost 2/2, frames 8 and 9 |
 * | nothing | survived 2/2 |
 *
 * So under `shadows.receivers: 'bookcase'` a book keeps **casting** — its page
 * block still draws into the map, and that pass is untouched — and stops
 * **receiving**: its programs are compiled with no shadow sampler at all.
 *
 * ⚠️ **`mesh.receiveShadow = false` is not this, and it is the obvious thing to
 * try.** three 0.185 sends `receiveShadow` to the GPU only as a uniform
 * (`WebGLRenderer.js:2690`) and keys `USE_SHADOWMAP` on the renderer alone
 * (`WebGLPrograms.js:359`), so the program still declares the sampler, binds
 * the map and may still execute the fetch. That configuration is the table's
 * third row, and it died like the unmodified page. `receiveShadows` does set
 * the flag, so the scene graph says what the programs do — but the flag is the
 * label, and `withoutShadowFetch` is the mechanism.
 *
 * ⚠️ **PCF only.** `?shadowtype=basic` with only the bookcase receiving still
 * lost the context, at frame 11 after 132 sampling draws, so `basic` has a
 * trigger of its own; `vsm` was never run this way.
 *
 * ⚠️ **One program is not enough on its own: it also has to draw little.** The
 * surviving program held at 12 sampling draws a frame and died at 13, which is
 * why the woodwork is one mesh (`joinWoodwork`) and the bookcase samples in two
 * draws at every library size. Anything new that reads the map adds a program,
 * a draw, or both. See
 * [ADR-0088](../../../../docs/adr/0088-one-program-samples-the-shadow-map-in-two-draws.md).
 *
 * This is what every visitor runs: real-time shadows are the default since
 * [ADR-0090](../../../../docs/adr/0090-real-time-shadows-are-the-default.md),
 * and G60 (`one-shadow-reader`) counts, on the default page, the programs that
 * read the map and the draws they make — a book program that starts reading it
 * again is red there on a desktop.
 */

/**
 * The cache key every shielded material's program is filed under.
 *
 * three shares one compiled program between every material whose parameters
 * produce the same key, and calls `onBeforeCompile` only for a key it has not
 * seen — so a shielded material whose key matched an unshielded one would be
 * handed the unshielded program, sampler and all, and nothing would say so.
 * The default key is `onBeforeCompile.toString()` (`Material.js:545`), which
 * happens to differ, but a minifier decides what that string is. A constant
 * says it on purpose.
 */
export const NO_SHADOW_FETCH_KEY = 'stacks:no-shadow-fetch';

/**
 * The one line every shielded fragment shader starts with.
 *
 * It lands **between** three's prefix and the material's own body, which is
 * exactly where it must: `onBeforeCompile` is handed the body before the prefix
 * is prepended (`WebGLProgram.js:833`) and before any `#include` is resolved
 * (`:794`), so it follows the prefix's `#define USE_SHADOWMAP` (`:752`) and
 * precedes `shadowmap_pars_fragment` and `lights_fragment_begin`, the two
 * chunks that declare and read the sampler. Nothing in the prefix after that
 * `#define` tests it. `SHADOWMAP_TYPE_PCF` stays defined and is inert, since
 * every test of it sits inside a `USE_SHADOWMAP` block.
 *
 * The vertex shader is left alone, as it was on the phone: it still writes the
 * shadow coordinate, the fragment shader no longer reads it, and an unread
 * output is legal GLSL ES 3.00 — every run linked.
 */
export const NO_SHADOW_FETCH_LINE = '#undef USE_SHADOWMAP';

/**
 * Compiles this material with no shadow sampler, while the renderer goes on
 * drawing the map for every material that is not shielded.
 *
 * Idempotent across recompiles: three builds a fresh parameters object from
 * `ShaderLib` for every new program, so a material recompiled for a loaded
 * cover, a live shadow toggle or a restored context is shielded once, not once
 * per compile. And inert without a shadow map — `#undef` of a macro nobody
 * defined is legal, so the painted fallback, `?shadows=0` and `?solo` (whose
 * renderer never enables a shadow map) compile the shader they always did,
 * under a different key.
 *
 * Does not touch casting. The shadow pass draws through three's own
 * `MeshDepthMaterial`, or an object's `customDepthMaterial`, and never reads
 * this material's `onBeforeCompile` (`WebGLShadowMap.js:418`).
 */
export function withoutShadowFetch<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = shieldFragment;
  material.customProgramCacheKey = noShadowFetchKey;
  return material;
}

/** Whether `withoutShadowFetch` has been applied to this material. */
export function isShielded(material: THREE.Material): boolean {
  return material.customProgramCacheKey() === NO_SHADOW_FETCH_KEY;
}

/**
 * Sets whether every **lit** part of `group` receives the shadow map — the flag
 * and, when it is off, the program.
 *
 * Lit parts only, which is three's own rule for which materials take lights
 * (`materialNeedsLights`): an unlit material declares no sampler to take away,
 * and shielding one would only file its program under a new key — the painted
 * planes would stop sharing one program and gain a second. And an unlit part's
 * `receiveShadow` is left as it was, because under VSM three draws every
 * receiver *into* the map (`WebGLShadowMap.js:515`), and a painted shadow plane
 * casting a shadow is the one thing it must not do.
 *
 * Applied once, last, over the whole group, so a part added to a book later
 * cannot be missed by forgetting a call at its own construction.
 */
export function receiveShadows(group: THREE.Object3D, receive: boolean): void {
  group.traverse((object) => {
    const mesh: THREE.Mesh | undefined = object instanceof THREE.Mesh ? object : undefined;
    if (mesh === undefined) return;

    const lit = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      takesLights,
    );
    if (lit.length === 0) return;

    mesh.receiveShadow = receive;
    if (!receive) for (const material of lit) withoutShadowFetch(material);
  });
}

function takesLights(material: THREE.Material): boolean {
  return (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshToonMaterial ||
    material instanceof THREE.ShadowMaterial
  );
}

function shieldFragment(shader: { fragmentShader: string }): void {
  shader.fragmentShader = `${NO_SHADOW_FETCH_LINE}\n${shader.fragmentShader}`;
}

function noShadowFetchKey(): string {
  return NO_SHADOW_FETCH_KEY;
}
