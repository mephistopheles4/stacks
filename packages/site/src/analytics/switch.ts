/**
 * The analytics switch, as one pure predicate that imports nothing.
 *
 * `astro.config.mjs`, `scripts/deploy.ts` and vitest all import this file, and
 * none of them has the `__PLAUSIBLE_DOMAIN__` define, so it must never name it.
 * See docs/spec/optional-plausible.md S3.
 */
export const SWITCH_VARIABLE = 'PUBLIC_PLAUSIBLE_DOMAIN';

export type Switch = { on: false } | { on: true; domain: string };

const DOMAIN = /^[a-z0-9.-]+$/;

/**
 * Unset, empty or whitespace-only is off; a trimmed value matching the pattern
 * is on; anything else throws. The message names the variable and never echoes
 * the value: a typo must not ship a tracker reporting to a site nobody reads.
 */
export function readSwitch(raw: string | undefined): Switch {
  const value = raw?.trim() ?? '';
  if (value === '') return { on: false };
  if (!DOMAIN.test(value)) {
    throw new Error(
      `${SWITCH_VARIABLE} must be a Plausible site name (lowercase letters, digits, dots and hyphens), or unset to turn analytics off.`,
    );
  }
  return { on: true, domain: value };
}
