/**
 * `stryker.floors.json`'s `configHash`, re-derived from the Stryker config
 * beside it and written back.
 *
 * **This exists because G56 needs a remedy a stranger can run.**
 * [`docs/spec/gate-or-trend.md`](../docs/spec/gate-or-trend.md) Clause A asks
 * that somebody hitting a red can clear it without knowing this repository, and
 * until this landed the remedy for a stale stamp was *copy a hash out of a
 * script by hand* — which nothing checked until the next run.
 * [ADR-0079](../docs/adr/0079-the-floors-stamp-is-compared-at-merge.md) names
 * the gap in its Consequences.
 *
 * ⚠️ **It re-derives and never re-scores.** The stamp says which configuration
 * the floors beside it were measured under, so running this after a scoring
 * change makes the file *self-consistent*, not *correct*: every floor in it is
 * still a number from the old configuration. That is exactly the right cost
 * while every floor is `unarmed` — there is no derived floor to re-derive, and
 * the floors file's own comment says so. **Once a scope is armed, running this
 * is a re-derivation and owes a `notes` entry like any other lowering**, which
 * this script cannot check and does not pretend to.
 *
 * ⚠️ **`fixtureHash` is not touched, and that is not an oversight.** It pins the
 * *installed* eslint and parser versions rather than a file in the tree, so
 * re-deriving it needs the counter to run; the gate deliberately does not watch
 * it either, for the reason ADR-0079 records.
 *
 * ⚠️ **There is no `--check`, and one was written and removed.** *Is the stamp
 * stale* is a question G56 already answers, in the place a stranger meets it,
 * and a second answer here would be a flag with no reader — the objection
 * `stryker.config.d.mts` states about its own fields: *a field arrives here
 * with its reader, never in anticipation of one*.
 *
 * ```sh
 * pnpm mutation:stamp
 * ```
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import strykerConfig from '../stryker.config.mjs';
import { configHashOf, FLOORS_FILE, restampConfigHash } from './lib/floors.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

function main(): void {
  const path = join(REPO_ROOT, FLOORS_FILE);
  const source = readFileSync(path, 'utf8');
  const hash = configHashOf(strykerConfig);
  const rewritten = restampConfigHash(source, hash);

  if (rewritten === source) {
    console.log(`${FLOORS_FILE} already records ${hash}`);
    return;
  }

  writeFileSync(path, rewritten);
  console.log(`${FLOORS_FILE} restamped to ${hash} — commit it beside the configuration change`);
}

main();
