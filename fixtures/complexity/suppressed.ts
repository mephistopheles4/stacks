/**
 * A function hidden from both counters by one comment — the fixture for #244.
 *
 * ⚠️ **Not part of the inventory, and it must never become part of it.** Each
 * counter must *refuse* this file rather than count it, so no declared number
 * describes it and `INVENTORY` does not name it.
 *
 * The directive names both counting rules, so one file serves both counters,
 * and each config reads the other half differently. The cognitive config
 * defines `complexity`, so that half is an *unused* directive (`ruleId: null`).
 * The cyclomatic config has no sonarjs plugin, so that half is an error, "rule
 * not found", carrying `ruleId: 'sonarjs/cognitive-complexity'`. Neither can
 * pass for a count: each counter reads only its own rule. Registering the
 * plugin to quieten it would edit a hashed counting config (#244, #357).
 *
 * ⚠️ **Both counters' tests assert the line `hidden` sits on, and read it from
 * this file rather than pinning a number.** Stryker's sandbox inserts
 * `// @ts-nocheck` into its copy and moves the function, so a literal passed
 * `pnpm test` and failed the 2026-09-22 nightly's dry run.
 */

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function hidden(a: boolean, b: boolean): number {
  if (a) return 1;
  if (b) return 2;
  return 3;
}
