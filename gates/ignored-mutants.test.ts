/**
 * G43 — the floors file's `ignored` counter ↔ a real sweep of the mutated source.
 *
 * **`// Stryker disable next-line` deletes a mutant from the denominator**, in
 * a source file, nowhere near the Stryker config and nowhere near the floors
 * file. It is one of three routes down and the only one that leaves no trace in
 * either file the deploy reads — so without this, a disable comment lands in a
 * pull request and nothing says a word until somebody deploys, if then.
 *
 * This closes it **at merge instead of at deploy**, and that is the whole point
 * of the row rather than a convenience: `main-protection` carries
 * `required_approving_review_count: 0`, so the gate suite and CodeQL are the
 * only two things in this repo that can stop a merge. A `gates/` row is not the
 * belt to review's braces here; it is the only pre-merge surface there is.
 *
 * ⚠️ **The slug names what is counted, not the document.** `mutation-floors`
 * was the alternative and was rejected: this asserts **one field** of
 * `stryker.floors.json` and says nothing whatever about the floors beside it. A
 * breached floor, an unaccounted scope, an orphan entry and a config-hash
 * mismatch are all `pnpm deploy:site`'s refusals, and none of them is a merge
 * blocker — a merge is never blocked by a metric.
 *
 * ⚠️ **A note-presence check was declined.** Any string satisfies it, so it
 * would catch the honest omission and not the adversary — and a check asserting
 * note-*presence* while reading as note-*quality* states a scope exceeding its
 * real one, which is the exact fault this row was minted to repair.
 *
 * ⚠️ **The judgement this file asserts is not tested by this file.** It reads
 * the real tree and the real floors file and expects them to agree, which an
 * `ignoredMismatches` returning `[]` unconditionally would satisfy forever.
 * Both directions are planted against synthetic inputs in
 * `scripts/lib/floors.test.ts`; what is left here is the question only the disk
 * can answer, plus the floors that stop it being asked of nothing.
 *
 * See docs/gates.md, row G43 (ignored-mutants), and
 * docs/spec/the-ratchet.md §4.
 */

import { describe, expect, it } from "vitest";
import {
  countDisableDirectives,
  ignoredMismatches,
  readFloors,
  readMutatedSource,
} from "../scripts/lib/floors.ts";
import { readScopes } from "../scripts/lib/mutation-score.ts";
import { expectFound } from "./repo.ts";

const floors = readFloors();
const scopes = readScopes();
const source = readMutatedSource();

describe("G43 — the counter is asserted against something", () => {
  it("finds the floors entries and the source they are counted over", () => {
    // Two floors, because the two lists are separately deletable and either one
    // going empty makes the comparison below true of nothing. Emptying `scopes`
    // in the floors file would otherwise leave "every counter matches" green
    // with no counter left to match — the vacuous green every one of these
    // gates is written against.
    expectFound([...floors.scopes.keys()], "scopes in stryker.floors.json", 8);
    expectFound(
      source,
      "mutated source files swept for disable directives",
      60,
    );
    // ⚠️ **Three floors, and this is the one whose absence was a real hole.**
    // The counter is keyed on the *declared* scopes: empty `stryker.scopes.json`
    // and `countDisableDirectives` returns an empty map, every floors entry is
    // skipped for having no swept value, and this gate passes having swept
    // nothing — with the two floors above still green, because the floors file
    // and the source tree are both untouched. Demonstrated, not reasoned:
    // emptying `scopes` left G43 at 2 of 2 before this line existed. G38 would
    // redden on the same edit, and *another row covers it* is exactly the
    // argument this repo's vacuity floors exist to refuse.
    expectFound(scopes, "declared mutation scopes", 8);
  });
});

describe("G43 — every recorded counter is what the tree actually holds", () => {
  it("agrees with the sweep, in both directions", () => {
    const counted = countDisableDirectives(source, scopes);
    const mismatched = ignoredMismatches(counted, floors);

    expect(
      mismatched.map(
        (one) =>
          `${one.scope}: the tree holds ${String(one.swept)} disable directive(s), ` +
          `stryker.floors.json records ${String(one.recorded)}`,
      ),
      "stryker.floors.json no longer describes the mutated source. A disable directive " +
        "takes a mutant out of the denominator without moving any number that says so, " +
        "so the count belongs beside the floor it changes the meaning of. Update the " +
        "`ignored` field for the scope named — and if you did not add the directive, " +
        "find out who did before you update anything",
    ).toEqual([]);
  });
});
