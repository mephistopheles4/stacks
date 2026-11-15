/**
 * PROTOTYPE for #593 — throwaway, never for `main`.
 *
 * The candle flames, drawn live so they move. The bake keeps the light they
 * throw on the wax and the table (a still pool: baked light cannot flicker);
 * the flame itself is one quad per candle, turned to face the camera and kept
 * upright, whose fragment shader draws a teardrop and a faint halo. It reads
 * no light and no shadow map, so G61's one reader stays the bookcase.
 *
 * The shelf already draws every frame, so the motion costs a uniform update
 * and three small additive draws, nothing more. A visitor who asks for reduced
 * motion gets the flames still.
 */
import * as THREE from 'three';

export interface Flicker {
  /** How far the tip leans, in flame heights. */
  readonly sway: number;
  /** The flame's height against its rest height. */
  readonly stretch: number;
  /** The halo's brightness against its rest brightness. */
  readonly glow: number;
}

/**
 * A flame's motion at `t` seconds: sums of sines at rates with no common
 * period, so it never visibly repeats, and a rare draught that stretches it
 * and pushes it over. Each seed burns out of step with the others.
 */
export function flicker(t: number, seed: number): Flicker {
  const p = seed * 1.7 + 0.4;
  const draught = Math.max(0, Math.sin(t * 0.31 + p)) ** 8;
  const sway =
    0.05 * Math.sin(t * 1.3 + p) +
    0.03 * Math.sin(t * 3.7 + p * 2.1) +
    0.012 * Math.sin(t * 9.1 + p * 0.7) +
    0.08 * draught * Math.sin(t * 7.0 + p);
  const stretch =
    1 + 0.06 * Math.sin(t * 5.3 + p) + 0.035 * Math.sin(t * 11.7 + p * 1.3) + 0.1 * draught;
  const glow =
    1 + 0.08 * Math.sin(t * 6.1 + p * 0.9) + 0.05 * Math.sin(t * 14.3 + p) - 0.1 * draught;
  return { sway, stretch, glow };
}

/** The motion a flame holds when the visitor asked for none. */
export const STILL: Flicker = { sway: 0, stretch: 1, glow: 1 };

// The quad spans 3 flame heights across and 3.2 up, its foot 0.8 below the
// flame's root, so the halo has room round the flame.
const VERTEX = /* glsl */ `
  uniform float uH;
  varying vec2 vP;
  void main() {
    vP = vec2(position.x * 3.0, position.y * 3.2 - 0.8);
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // face the camera, but keep the flame's axis on the world's up
    vec2 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy);
    vec2 right = vec2(up.y, -up.x);
    c.xy += (right * vP.x + up * vP.y) * uH;
    gl_Position = projectionMatrix * c;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uSway;
  uniform float uStretch;
  uniform float uGlow;
  varying vec2 vP;
  void main() {
    float y = vP.y / uStretch;                // 0 at the root, 1 at the tip
    float x = vP.x - uSway * y * y;           // it bends from the tip, not the wick
    float yc = clamp(y, 0.0, 1.0);
    float w = 0.26 * pow(yc, 0.45) * pow(1.0 - yc, 0.9);  // the teardrop's half-width
    float inside = step(0.0, y) * step(y, 1.0) * (1.0 - smoothstep(w * 0.5, w + 1e-4, abs(x)));
    float core = (1.0 - smoothstep(0.0, w * 0.55 + 1e-4, abs(x)))
               * smoothstep(0.06, 0.22, y) * (1.0 - smoothstep(0.3, 0.65, y));
    float root = 1.0 - smoothstep(0.0, 0.2, y);
    vec3 body = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.62, 0.22), 1.0 - smoothstep(0.2, 0.9, y));
    vec3 colour = mix(body, vec3(0.12, 0.2, 0.85), root * 0.75);
    colour = mix(colour, vec3(1.0, 0.9, 0.68), core);
    float alpha = inside * mix(0.95, 0.3, root);
    float d = length(vec2(vP.x, (vP.y - 0.4) * 0.8));
    float halo = exp(-d * d * 3.5) * 0.2 * uGlow;
    gl_FragColor = vec4(colour * alpha + vec3(1.0, 0.5, 0.18) * halo, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Puts a moving flame at each `flame_*` node the room carries. Each node's
 * `userData` holds `flame_h`, the flame's height in shelf units, and `seed`.
 * Returns the draws added.
 */
export function addCandleFlames(nodes: readonly THREE.Object3D[]): number {
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  for (const node of nodes) {
    const { flame_h: height = 0.09, seed = 0 } = node.userData as {
      flame_h?: number;
      seed?: number;
    };
    const uniforms = {
      uH: { value: height },
      uSway: { value: 0 },
      uStretch: { value: 1 },
      uGlow: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(geometry, material);
    flame.name = `${node.name}_live`;
    flame.frustumCulled = false; // the quad is placed in the shader; its geometry's box is not where it draws
    flame.renderOrder = 10;
    flame.onBeforeRender = () => {
      const f = reduced.matches ? STILL : flicker(performance.now() / 1000, seed);
      uniforms.uSway.value = f.sway;
      uniforms.uStretch.value = f.stretch;
      uniforms.uGlow.value = f.glow;
    };
    node.add(flame);
  }
  return nodes.length;
}
