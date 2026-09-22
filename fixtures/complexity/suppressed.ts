/**
 * A function hidden from both counters by one comment — the fixture for #244.
 *
 * ⚠️ **Not part of the inventory, and it must never become part of it.** Each
 * counter must *refuse* this file rather than count it, so no declared number
 * describes it and `INVENTORY` does not name it.
 *
 * The directive names both counting rules, so one file serves both counters:
 * each config enables one of the two, and sees the other half as an unused
 * directive — which reports with `ruleId: null` and is skipped, as it should be.
 */

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function hidden(a: boolean, b: boolean): number {
  if (a) return 1;
  if (b) return 2;
  return 3;
}
