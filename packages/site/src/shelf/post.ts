import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { ShelfSettings } from './shelf-settings.ts';

/**
 * Bloom, and the antialiasing it costs you.
 *
 * The shelf renders straight to the canvas — one `WebGLRenderer.render()` per
 * frame, no composer. Bloom needs one, and adding it is not free in a way that
 * matters here.
 *
 * ## The trap this module exists to not fall into
 *
 * **`EffectComposer` never sets `samples` on its render targets.** Its output is
 * an offscreen buffer, and that buffer is not the multisampled one the context
 * was created with — so the moment a composer is in the chain, the shelf's MSAA
 * is silently gone. On a scene that is mostly thin vertical spines, that is very
 * visible.
 *
 * Worse than visible: it would make `?aa` a probe that does nothing. Toggling it
 * would flip a context attribute nothing reads, on a page where `docs/progress.md`
 * records the rule that *"a probe that silently did nothing would be worse than
 * no probe"* — and where a probe reporting a filter that was not running has
 * already happened once (`SHADOW_TYPES`, where `soft` had silently been `pcf`).
 *
 * So when the composer is in use, antialiasing moves to an **SMAA pass** and the
 * profile says `aa=smaa` rather than on or off. The setting keeps meaning
 * something; it just means a different implementation of the same thing.
 *
 * ## Why this is its own module
 *
 * It is imported dynamically, so the ~4.7 KB gzipped that bloom costs is paid
 * only by a page that actually asked for it (measured under #42). The main
 * bundle never sees `three/examples/jsm/postprocessing`.
 *
 * The addons are not a new dependency: they ship inside the `three` package
 * already installed, and `scene.ts` has imported `OrbitControls` from the same
 * place since the shelf existed. What deserved a decision was the composer, and
 * that is [ADR-0034](../../../../docs/adr/0034-bloom-behind-a-composer.md).
 */

export interface Post {
  /** Renders one frame through the chain. Replaces `renderer.render`. */
  render(): void;
  setSize(width: number, height: number): void;
  /** Bloom's three numbers are uniforms — live, no rebuild. */
  update(settings: ShelfSettings): void;
  dispose(): void;
}

export function makePost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  settings: ShelfSettings,
): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getSize(new THREE.Vector2());

  const bloom = new UnrealBloomPass(
    size,
    settings.effects.bloom.strength,
    settings.effects.bloom.radius,
    settings.effects.bloom.threshold,
  );
  composer.addPass(bloom);

  /**
   * SMAA before `OutputPass`, which is where its own documentation puts it.
   *
   * This is the MSAA the composer took away, given back. Without it the spines —
   * which are the whole picture, and are thin and vertical and high-contrast —
   * crawl with stair-stepping the moment the camera moves.
   */
  const smaa = new SMAAPass();
  composer.addPass(smaa);

  /**
   * Not optional, and the reason is easy to get wrong.
   *
   * Everything inside a composer runs in linear space; `OutputPass` is what
   * converts back to sRGB and applies tone mapping at the end. Leaving it out
   * does not produce "no post-processing" — it produces a visibly washed-out
   * shelf, and it would silently disable the tone mapping control that #43 was
   * about.
   */
  composer.addPass(new OutputPass());

  return {
    render(): void {
      composer.render();
    },
    setSize(width: number, height: number): void {
      composer.setSize(width, height);
    },
    update(next: ShelfSettings): void {
      bloom.strength = next.effects.bloom.strength;
      bloom.radius = next.effects.bloom.radius;
      bloom.threshold = next.effects.bloom.threshold;
    },
    dispose(): void {
      bloom.dispose();
      smaa.dispose();
      composer.dispose();
    },
  };
}
