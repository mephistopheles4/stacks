/**
 * G56 — `stryker.floors.json`'s `configHash` ↔ the Stryker configuration beside it.
 *
 * **Two commits changed scoring configuration and carried only half their own
 * diff.** [`738ee75`](https://github.com/mephistopheles4/stacks/commit/738ee75)
 * and [`6478a69`](https://github.com/mephistopheles4/stacks/commit/6478a69) each
 * moved what a mutation score *means* and left the stamp recording the
 * configuration before it. Both reached `main` with every check green.
 *
 * ⚠️ **The drift was never silent, and the distinction is the whole warrant for
 * this row.** `floorRefusals` reads a run stamped with a *different* hash as
 * evidence that somebody changed scoring configuration without re-deriving, and
 * refuses whatever is armed — the `armed` predicate guards only the
 * absent-hash branch, so `unarmed` buys no quiet. What nothing did was catch it
 * **earlier**. *Not caught* and *not noticed* are different sentences, and the
 * cost of the first is that `pnpm deploy:site` stops with a release in hand.
 * Measured on `main`'s floors file with zero armed scopes: one refusal with the
 * stale stamp, zero with the refreshed one.
 *
 * This closes it **at merge**, which is G43's and G47's reason exactly:
 * `main-protection` carries `required_approving_review_count: 0`, so the gate
 * suite and CodeQL are the only two things in this repository that can stop a
 * merge. It needs no armed scope and no metrics record — it compares two files
 * that sit beside each other in the repository root, which is what lets it run
 * here at all rather than at deploy.
 *
 * ## `fixtureHash` is deliberately not watched, and this says so rather than staying quiet
 *
 * ⚠️ **The hole beside this one is the same shape and the cost is not.**
 * `fixtureHash` pins the resolved `eslint` and `@typescript-eslint/parser`
 * versions **as installed**, so a gate over it goes red on every Dependabot bump
 * — and a bot cannot re-derive a stamp, which makes it a weekly red only a human
 * can clear. Declined in
 * [ADR-0079](../docs/adr/0079-the-floors-stamp-is-compared-at-merge.md), and
 * named here for G47's reason: a gate that quietly covers one of two stamps
 * reads as covering both. Whether a detected change with no declared reason
 * should itself refuse is [#227](https://github.com/mephistopheles4/stacks/issues/227)'s
 * question, and deciding it here would answer it early.
 *
 * ## What it declines to assert
 *
 * ⚠️ **It compares two stamps and says nothing about the floors between them.**
 * Running `pnpm mutation:stamp` after a scoring change makes the file
 * *self-consistent*, not *correct*: every floor in it is still a number measured
 * under the old configuration. That is the right cost while every floor is
 * `unarmed` — there is no derived floor to re-derive — and it stops being free
 * the day a scope is armed. Nothing here can tell the two apart.
 *
 * ⚠️ **It reads the real tree and *does* run inside Stryker's dry run**, unlike
 * G47, which `vitest.stryker.config.ts` excludes. Both files it reads —
 * `stryker.floors.json` and `stryker.config.mjs` — are matched by no `mutate`
 * glob, since all eight end `*.ts`, so the sandbox holds them uninstrumented and
 * byte-identical to the checkout. G47's exclusion is about a gate asserting
 * counts over *rewritten source*; this asserts a hash over two files no mutant
 * can reach, and it reads two files rather than sweeping a tree, so neither the
 * timeout nor the instrumented-input fault applies. Stated rather than left to
 * be rediscovered: an exclusion added here later would be a change of fact, not
 * tidying.
 *
 * ⚠️ **The judgement is planted in `scripts/lib/floors.test.ts`**, G43's split:
 * `configHashOf`'s neutral list and `restampConfigHash`'s rewrite are put to
 * synthetic inputs there, because a comparison of two real files is satisfied
 * forever by an implementation that returns the same string twice. What is left
 * here is the question only the disk can answer, plus the floors that stop it
 * being asked of nothing.
 *
 * See docs/gates.md, row G56 (config-hash), docs/spec/the-ratchet.md §4, and
 * ADR-0079.
 */

import { describe, expect, it } from 'vitest';
import strykerConfig from '../stryker.config.mjs';
import { configHashOf, FLOORS_FILE, readFloors } from '../scripts/lib/floors.ts';
import { expectFound, readRepoFile } from './repo.ts';

/** The remedy this gate's red sends a stranger to. It has to exist. */
const REMEDY = 'mutation:stamp';

const floors = readFloors();
const derived = configHashOf(strykerConfig);

/** `sha256:` and 64 hex digits — the one spelling `digest` writes. */
const SHA256 = /^sha256:[0-9a-f]{64}$/;

describe('G56 — both sides of the comparison are real', () => {
  it('reads a stamp and a configuration, neither of them empty', () => {
    // ⚠️ **Two `undefined`s compare equal, and an empty object hashes to a
    // perfectly good string.** Every clause below is satisfied by a floors file
    // whose stamp was deleted and a config that failed to import, so the shapes
    // are asserted before the equality is — `expectFound`'s reason, applied to
    // a comparison rather than to a list.
    expect(floors.configHash, `the \`configHash\` field of ${FLOORS_FILE}`).toMatch(SHA256);
    expect(derived, 'the hash derived from stryker.config.mjs').toMatch(SHA256);

    // The population the hash is *about*. `configHashOf({})` is a valid hash of
    // nothing, so a config whose `mutate` derivation broke would still produce
    // a string for the clause below to compare — and it would compare unequal,
    // which reads as a stale stamp and is not one.
    expectFound(strykerConfig.mutate, "globs in the Stryker config's `mutate` array", 8);
    expectFound([...floors.scopes.keys()], `scopes in ${FLOORS_FILE}`, 8);
  });

  it('names a remedy that exists', () => {
    // ⚠️ **A message naming a command nobody wrote is worse than no message.**
    // `docs/spec/gate-or-trend.md` Clause A asks that somebody hitting this red
    // can clear it without knowing this repository, and the whole of that
    // promise here is one `package.json` line. Read rather than assumed: this
    // gate's failure text below names `pnpm mutation:stamp`, and G14 holds the
    // same script to `AGENTS.md`'s documented list from the other side.
    const scripts = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(
      Object.keys(scripts.scripts ?? {}),
      `the remedy this gate prints. \`pnpm ${REMEDY}\` is named in a failure message and ` +
        'has to be a command a stranger can actually run',
    ).toContain(REMEDY);
  });
});

describe('G56 — the stamp records the configuration that is really there', () => {
  it('agrees with `configHashOf(strykerConfig)`', () => {
    expect(
      floors.configHash,
      `${FLOORS_FILE} records a hash of a Stryker configuration this checkout does not ` +
        'have. A scoring-config change refreshes the stamp in its own diff — ' +
        "`docs/spec/the-ratchet.md` §4's route table requires both halves — and without " +
        'that second half every floor beside it is a number measured under something ' +
        'else.\n\n' +
        `  The remedy: run \`pnpm ${REMEDY}\` and commit ${FLOORS_FILE} beside the ` +
        'configuration change.\n\n' +
        '  ⚠️ That re-derives the stamp and re-scores nothing. While every floor is ' +
        '`unarmed` there is no derived floor to re-derive and the refresh costs no ' +
        '`notes` entry. Once a scope is armed, the same edit is a re-derivation and owes ' +
        "a justification like any other lowering — see the floors file's own comment.\n\n" +
        `  ⚠️ It also restarts every calibration window: \`calibration()\` counts only ` +
        'runs stamped with this hash, so every scope reads `0 of 10 trees` from the commit ' +
        'that moves it. That is the cost of closing the configuration route, and it is why ' +
        '`pnpm deploy:site` now prints the stamp it is counting under beside the count.\n\n' +
        '  ⚠️ Unless the renovation you write for it says otherwise. Since #227 an entry in ' +
        '`renovations.json` may declare `"preserves": true`, which carries the window across ' +
        'the change instead of restarting it — so `0 of 10 trees` is what happens when nothing ' +
        'preserves the previous stamp, which is every entry in the file today. Claim it only ' +
        'when you measured that the counts either side are comparable. G57 is the row that ' +
        'asks for that entry at all.',
    ).toBe(derived);
  });
});
