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
 * ⚠️ **`hidden` sits on line 21, and both counters' tests assert that line.**
 * Growing this comment moves it; update the two regexes in the same edit.
 */

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function hidden(a: boolean, b: boolean): number {
  if (a) return 1;
  if (b) return 2;
  return 3;
}
