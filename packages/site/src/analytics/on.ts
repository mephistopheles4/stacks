/**
 * Whether this build has analytics on, for the `.astro` files.
 *
 * Reads the build literal `__PLAUSIBLE_DOMAIN__` (`""` when off), which Rollup
 * folds, so a page that branches on this carries nothing in an off build. Lives
 * apart from `switch.ts` because that file is imported by tools that have no
 * `define` (docs/spec/optional-plausible.md S3).
 */
declare const __PLAUSIBLE_DOMAIN__: string;

export const analyticsOn: boolean = __PLAUSIBLE_DOMAIN__ !== '';
