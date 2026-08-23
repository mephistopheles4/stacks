/**
 * G46 — `astro check` runs inside `pnpm build`, so `.astro` frontmatter is
 * typechecked by something.
 *
 * ## The gap this closes
 *
 * G7 (`astro-no-logic`) reads the `<script>` blocks of an `.astro` file as
 * text. The compiler does not read `.astro` files at all: the root tsconfig
 * excludes `**\/.astro` and lists only `.ts` sources. So the **frontmatter** —
 * the fenced block at the top of every page, which is real TypeScript that
 * really runs at build time — was read by no gate and typechecked by nothing.
 *
 * Measured, not supposed. `absoluteUrl(42, Astro.site)` planted in
 * `packages/site/src/pages/index.astro` passed `pnpm typecheck`, passed G7 five
 * of five, passed `pnpm build`, and shipped `<meta property="og:image"
 * content="42">` **and** `<meta name="twitter:image" content="42">` into
 * `dist/index.html`. A broken share card through every gate this repository
 * has. See docs/log/2026-08-23-the-terrain-for-astro-check.md.
 *
 * ## What this file asserts, and what runs the actual check
 *
 * ⚠️ **The gate is `astro check`; this file is the pin that keeps it wired.**
 * The check itself runs as the first half of `packages/site`'s `build` script,
 * inside `pnpm build`, which the `suite` matrix already runs — verified, not
 * quoted: `.github/workflows/gates.yml:81-82` is a `build` step running
 * `pnpm build`, on every Node version in the matrix. So a type error in an
 * `.astro` page fails CI at the build, not here.
 *
 * That leaves the wiring, and a gate living only as a substring of one npm
 * script is exactly G45's finding: `--skip-gates` skipped the whole four-gate
 * contract and lived for nineteen of its twenty-one days in two lines of one
 * file, both the implementation. So three things are pinned, and each is
 * separately sufficient to un-wire the check:
 *
 * 1. `packages/site`'s `build` script runs `astro check` **before** `astro
 *    build`. Order matters: after it, a red type error still ships a `dist/`.
 * 2. `@astrojs/check` is a dependency of that package, pinned exact. Without
 *    it `astro check` is not a command and the script fails for the wrong
 *    reason on a fresh checkout.
 * 3. The root `build` script still delegates to it, so `pnpm build` reaches
 *    the check at all.
 *
 * ⚠️ **It proves the wiring, never the checker's verdict** — G40's stated
 * limit and G44's, reached again. Nothing offline can make this file observe
 * `astro check` finding a real error; that observation is the perturbation
 * recorded on this row in `docs/gate-register.md`, and it is why the register
 * requires an Observed-red line rather than trusting a green suite.
 *
 * ⚠️ **`typescript` is pinned to 6.x and that is load-bearing here.**
 * `@astrojs/check@0.9.10` declares `peerDependencies: { typescript: '^5.0.0 ||
 * ^6.0.0' }`, so it does not support TypeScript 7. ADR-0066's revisit
 * condition is TypeScript 7.1, and moving that pin un-runs this gate unless
 * `@astrojs/check` has widened by then. Asserted below so the coupling cannot
 * be discovered by a red build in a branch about something else.
 *
 * See docs/gates.md, row G46 (astro-types).
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './repo.ts';

const SITE_MANIFEST = 'packages/site/package.json';
const ROOT_MANIFEST = 'package.json';

interface Manifest {
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function manifest(path: string): Manifest {
  return JSON.parse(readRepoFile(path)) as Manifest;
}

describe('G46 — the check is wired into the build', () => {
  it('runs `astro check` in the site build script, before `astro build`', () => {
    const script = manifest(SITE_MANIFEST).scripts?.build ?? '';
    const check = script.indexOf('astro check');
    const build = script.indexOf('astro build');

    expect(
      check,
      `${SITE_MANIFEST}'s \`build\` script must run \`astro check\`. Without it .astro ` +
        'frontmatter is typechecked by nothing, and a wrong-typed value reaches dist/ ' +
        `through a green build. Script is: ${script}`,
    ).toBeGreaterThanOrEqual(0);

    // Order, not merely presence. `astro build && astro check` still reports the
    // error, and still writes the dist/ that carries it — which is the failure
    // this row exists for rather than a tidier arrangement of the same one.
    expect(
      build,
      `${SITE_MANIFEST}'s \`build\` script must still run \`astro build\`: ${script}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      check,
      '`astro check` must run BEFORE `astro build`. Ordered the other way the check ' +
        'still reports the error and the build has already written the output carrying ' +
        `it: ${script}`,
    ).toBeLessThan(build);
  });

  it('reaches the site build from `pnpm build`', () => {
    // The clause above is a fact about a script nothing calls unless this holds.
    const script = manifest(ROOT_MANIFEST).scripts?.build ?? '';

    expect(
      script,
      "the root `build` script must delegate to @stacks/site's build, or `pnpm build` " +
        `never reaches \`astro check\` and the clause above pins an orphan: ${script}`,
    ).toMatch(/--filter\s+@stacks\/site\s+run\s+build/);
  });
});

describe('G46 — the checker is installed, and installable', () => {
  it('declares `@astrojs/check` on the site package, pinned exact', () => {
    const site = manifest(SITE_MANIFEST);
    const version = site.devDependencies?.['@astrojs/check'] ?? site.dependencies?.['@astrojs/check'];

    expect(
      version,
      `\`astro check\` is not a command without @astrojs/check. ${SITE_MANIFEST} must ` +
        'declare it, or the build script above fails on a fresh checkout for a reason ' +
        'that looks nothing like the one it exists for.',
    ).toBeDefined();

    // Exact, per docs/spec/static-analysis-and-style.md §9: a tool upgrade that
    // adds rules reddens an unchanged tree, and every tool this rollout adopts
    // is pinned so that arrives as a diff somebody chose.
    expect(
      version,
      `@astrojs/check must be pinned exact, not "${version}". A range lets a minor bump ` +
        'redden a tree nobody touched, which is how a gate gets weakened to make it pass.',
    ).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps `typescript` inside the range @astrojs/check supports', () => {
    // The coupling ADR-0066 does not carry yet. Its revisit condition is
    // TypeScript 7.1; @astrojs/check@0.9.10's peer range is `^5 || ^6`, so the
    // pin moving to 7 un-runs this gate. Asserted here rather than left for a
    // branch about the compiler to discover.
    const version = manifest(ROOT_MANIFEST).devDependencies?.typescript ?? '';

    expect(
      version,
      'the root `typescript` pin must stay on 5.x or 6.x while @astrojs/check is the ' +
        `checker: its peerDependencies are \`^5.0.0 || ^6.0.0\`, so "${version}" leaves ` +
        'this gate running against an unsupported compiler or not running at all. ' +
        'Moving the pin (ADR-0066 revisits at TypeScript 7.1) means checking that ' +
        '@astrojs/check has widened first.',
    ).toMatch(/^[\^~]?[56]\./);
  });
});
