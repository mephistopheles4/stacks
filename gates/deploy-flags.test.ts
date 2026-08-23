/**
 * G45 — every flag `pnpm deploy:site` reads is a documented flag.
 *
 * `--skip-gates` skipped the whole four-gate contract on a path that still
 * uploaded to the live address, and for **19 of the 21 days it existed** `git
 * grep` found it in **two lines of one file, both the implementation** — not in
 * `AGENTS.md`, not in `docs/`, not in the command's own usage text, reachable by
 * anyone who read the source and by nobody who read the docs. That is the state
 * [#152](https://github.com/mephistopheles4/stacks/issues/152) was filed against;
 * `docs/commands.md` gained a sentence about it two days later, which fixed the
 * ticket's title and not its subject.
 *
 * ⚠️ **The mechanism for pinning a deploy flag existed and was aimed one flag
 * to the left.** G17 (`deploy-branch`) asserts exactly which spellings override
 * the branch guard — `--any-branch` yes, `--any` and `--anybranch` no — while
 * the override that cleared the entire contract was pinned by nothing. This row
 * is that mechanism aimed at the roster instead of at one flag, which is the
 * class rather than the instance: the next undocumented `--fast` is red the day
 * it lands, not the day somebody greps.
 *
 * ## Both directions, because the two failures are different
 *
 * An undocumented flag is invisible — the #152 defect exactly. A documented
 * flag nothing reads sends whoever trusted the file typing something inert at
 * the most irreversible command in the repo, and inert is the good case: it
 * reads as an escape hatch that is not there.
 *
 * ## The roster is only as wide as one regex, so the regex is pinned too
 *
 * Both directions above are worth exactly as much as the extraction under them,
 * and the way out is not devious: `process.argv.slice(2)`, `argv[2] === '--x'`
 * or an options object parsed once would each add a flag neither direction could
 * ever learn about — the whole defect arriving *through* the gate written for it.
 * So every `process.argv` occurrence in the script must be a literal `--flag`
 * test. ⚠️ **A helper under `scripts/lib/` reading argv on the deploy's behalf is
 * still outside this**, and widening the sweep to `scripts/` would gate every
 * other script's flags as a side effect of this row.
 *
 * ## What this row pins, and what it deliberately does not
 *
 * ⚠️ **The roster, never a flag's reach.** That `--dry-run` runs all four gates
 * while `--check-only` never reaches them is not asserted here and cannot be:
 * the four gate commands sit past step 0, and every harness that drives this
 * script — G17's, G39's, and this file's if it tried — stops the run at step 0
 * so it cannot spend two minutes and a network. What holds reach is the
 * convention `scripts/deploy.ts` adopted at `fail()`: a refusal says which flags
 * clear it, written at the refusal. A comment, and named as one.
 *
 * See docs/gates.md, row G45 (deploy-flags).
 */

import { describe, expect, it } from "vitest";
import {
  codeOf,
  expectFound,
  extractAll,
  readRepoFile,
  sectionsOf,
} from "./repo.ts";

const DEPLOY_SCRIPT = "scripts/deploy.ts";
const COMMANDS_DOC = "docs/commands.md";

/**
 * `process.argv.includes('--dry-run')` — the one shape this script reads flags
 * in, for every one of them.
 *
 * Read out of `codeOf`, so the comments naming these flags cannot supply one.
 * *A gate that matches prose matches anything*, logged three times in
 * `docs/gates.md` and once more here: this file's subject is a flag whose only
 * two lines were code, in a file whose commentary discussed it at length.
 */
const ARGV_FLAG = /process\.argv\.includes\(\s*'(--[a-z][a-z-]*)'\s*\)/;

/** A flag as `docs/commands.md` writes one: in backticks. */
const DOCUMENTED_FLAG = /`(--[a-z][a-z-]*)`/;

/** `## ` headings in `docs/commands.md`, each naming the command it explains. */
const COMMAND_HEADING = /^## (`pnpm [^`\n]+`[^\n]*)$/gm;

function flagsRead(): string[] {
  return extractAll(codeOf(DEPLOY_SCRIPT), ARGV_FLAG);
}

/**
 * The prose of every `## \`pnpm deploy:site\` — …` section, concatenated.
 *
 * Scoped to those sections rather than swept from the whole file, which today
 * would give the same three and would not tomorrow: `pnpm stacks build` takes
 * `--public`, `covers` takes `--backfill`, and a section here explaining either
 * would make this gate demand that the deploy script read them.
 *
 * ⚠️ **Scoping narrows that trap and does not close it, because the deploy
 * *forwards* six flags it never reads**: `--public`, `--vault` and `--assets` to
 * `stacks build`, `--filter` to pnpm, `--project-name` and `--branch` to
 * wrangler. A deploy section explaining what the gates stage could name one in
 * backticks and go red here, because passing a flag on is not reading one. **The
 * failure is a false red and the message names the flag**, which is the safe
 * direction — and `docs/commands.md` carries the note where somebody would hit
 * it. Not closed by widening the script side to any `'--flag'` literal: that
 * would let a documented flag be satisfied by a string the deploy hands to a
 * different command, which is the escape hatch that is not there.
 */
function flagsDocumented(): string[] {
  const deploySections = sectionsOf(readRepoFile(COMMANDS_DOC), COMMAND_HEADING)
    .filter(
      (section) =>
        section.captures[0]?.startsWith("`pnpm deploy:site`") === true,
    )
    .map((section) => section.body);

  expectFound(
    deploySections,
    `\`pnpm deploy:site\` sections in ${COMMANDS_DOC}`,
    4,
  );
  return extractAll(deploySections.join("\n"), DOCUMENTED_FLAG);
}

describe("G45 — the deploy flag roster", () => {
  it("extracts a plausible roster from each side", () => {
    // Two regexes over two formats, either of which could stop matching after a
    // refactor or a reformat and reduce both checks below to a comparison
    // between two empty sets — where "every flag is documented" is true and
    // means nothing.
    expectFound(flagsRead(), `flags read by ${DEPLOY_SCRIPT}`, 3);
    expectFound(flagsDocumented(), `flags documented in ${COMMANDS_DOC}`, 3);
  });

  it("documents every flag the deploy reads", () => {
    const documented = new Set(flagsDocumented());
    const undocumented = flagsRead().filter((flag) => !documented.has(flag));

    expect(
      undocumented,
      `${DEPLOY_SCRIPT} reads ${undocumented.join(", ")}, which ${COMMANDS_DOC} does not ` +
        "document. A flag on the publish path that only the source mentions is #152 again: " +
        "reachable by whoever reads the code and by nobody who reads the docs",
    ).toEqual([]);
  });

  it("reads argv in the one shape this gate can see, and in no other", () => {
    // Without this the roster is only as wide as the regex above, and the way
    // out is not even devious: `process.argv.slice(2)`, `argv[2] === '--x'`, or
    // an options object parsed once would each add a flag the two checks above
    // would never learn about — an undocumented flag on the publish path, which
    // is the entire defect, arriving through the gate written for it.
    //
    // Counted rather than extracted, because `extractAll` deduplicates and the
    // question here is whether *every* mention is accounted for.
    const source = codeOf(DEPLOY_SCRIPT);
    const reads = [...source.matchAll(/process\.argv/g)].length;
    const roster = [...source.matchAll(new RegExp(ARGV_FLAG.source, "g"))]
      .length;

    expect(
      roster,
      `${DEPLOY_SCRIPT} touches process.argv ${String(reads)} time(s) and only ` +
        `${String(roster)} of those is a literal --flag test. The rest are invisible to ` +
        "this gate, so a flag read that way is undocumented by construction",
    ).toBe(reads);
  });

  it("reads every flag the deploy sections document", () => {
    const read = new Set(flagsRead());
    const inert = flagsDocumented().filter((flag) => !read.has(flag));

    expect(
      inert,
      `${COMMANDS_DOC} documents ${inert.join(", ")} under \`pnpm deploy:site\`, which the ` +
        "script does not read. A documented flag that does nothing reads as an escape hatch " +
        "and is not one",
    ).toEqual([]);
  });
});
