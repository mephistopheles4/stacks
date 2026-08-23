/**
 * G19 — the constitution ↔ the scoreboard.
 *
 * `AGENTS.md`'s "Invariants — never violate these" is this project's
 * constitution: the short list of rules nothing may break. `docs/gates.md` is
 * the scoreboard that claims each one is either gated in CI or visibly not.
 *
 * That claim was, until this file existed, prose. **Nothing read
 * `docs/gates.md`.** Every gate that mentioned it did so in a comment. The
 * scoreboard tracking which rules are enforced was the only unenforced thing in
 * the repo — which is precisely the failure it opens by describing:
 *
 *   > A rule nothing can fail on is a comment.
 *
 * **Every assertion here anchors to the cell that carries the claim**, never to
 * the row and never to the document. The first version of this gate did neither
 * consistently and shipped three holes, each found by review and each recorded
 * in `docs/gates.md`: a citation satisfied by the word "invariant" appearing in
 * any cell, a spec path invisible unless it began with one of three directory
 * names, and a gate counted as scored because its filename appeared in a
 * paragraph. A gate that matches loosely matches anything.
 *
 * See docs/gates.md, row G19 (constitution-scoreboard).
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  AGENTS_DOC,
  expectFound,
  filesUnder,
  markdownSection,
  readRepoFile,
  REPO_ROOT,
  tableCells,
  trackedFiles,
} from "./repo.ts";

const CONSTITUTION = AGENTS_DOC;
const SCOREBOARD = "docs/gates.md";

/** The three tables that carry rows. Each has its own columns. */
const TABLES = [
  "Invariants → gates",
  "Contract seams → gates",
  "Defect gates",
] as const;

/**
 * The index of a named column in a table, by reading its header row.
 *
 * Every column read here used to be positional — `cells[2]` for **Source** —
 * which was already fragile across three tables of differing widths and became
 * wrong the moment a **Name** column was inserted. Positional reads fail in the
 * worst way available: `cells[2]` on a shifted table returns a real string from
 * the wrong column, so the citation check silently starts asking the Gate cell
 * whether it mentions an invariant.
 *
 * **Throws when the header is gone**, rather than returning `-1` and letting
 * `cells[-1]` be `undefined` — that would report "no invariant is cited"
 * when the truth is "the Source column was renamed". Same argument as
 * `markdownSection`, one level further in.
 */
function columnIndex(table: string, column: string): number {
  const section = markdownSection(readRepoFile(SCOREBOARD), table, SCOREBOARD);
  const header = section
    .split("\n")
    .find((line) => /^\|\s*Row\s*\|/.test(line));
  const index = header === undefined ? -1 : tableCells(header).indexOf(column);

  if (index < 0) {
    throw new Error(
      `no "${column}" column in the "${table}" table of ${SCOREBOARD}. A gate reads it ` +
        "by name, so a renamed column must fail here rather than silently read another one.",
    );
  }
  return index;
}

/** The rows of one table, as `{ id, cells }`. */
function rowsOf(table: string): { id: string; cells: string[] }[] {
  const section = markdownSection(readRepoFile(SCOREBOARD), table, SCOREBOARD);
  const rows = section
    .split("\n")
    .filter((line) => /^\|\s*\*\*G\d+\*\*\s*\|/.test(line))
    .map((line) => ({
      id: /\*\*(G\d+)\*\*/.exec(line)?.[1] ?? "",
      cells: tableCells(line),
    }));

  expectFound(rows, `rows in the "${table}" table`, 5);
  return rows;
}

/** Every row's declared slug, from the **Name** column of whichever table holds it. */
function slugByRow(): Map<string, string> {
  const slugs = new Map<string, string>();

  for (const table of TABLES) {
    const nameAt = columnIndex(table, "Name");
    for (const row of rowsOf(table)) {
      slugs.set(row.id, (row.cells[nameAt] ?? "").replace(/`/g, "").trim());
    }
  }

  expectFound([...slugs.keys()], "rows carrying a Name cell", 20);
  return slugs;
}

/**
 * The `gates/<stem>.test.ts` stems a row names, per row.
 *
 * Used by the derivation rule below, which is what stops a slug being a third
 * hand-maintained name for the same gate.
 */
function stemsByRow(): Map<string, string[]> {
  const stems = new Map<string, string[]>();

  for (const row of scoreboardRows()) {
    const line = row.cells.join(" | ");
    stems.set(
      row.id,
      [...line.matchAll(/`gates\/([^`\s/]+)\.test\.ts`/g)].map(
        (m) => m[1] ?? "",
      ),
    );
  }
  return stems;
}

/** `1.`, `2.`, … — the article numbers, in the order the constitution lists them. */
function articleNumbers(): number[] {
  const section = markdownSection(
    readRepoFile(CONSTITUTION),
    "Invariants",
    CONSTITUTION,
  );
  const found = [...section.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  expectFound(found, "numbered invariants in AGENTS.md", 3);
  return found;
}

/** Every `| **G7** | … |` row in the scoreboard, whichever table it sits in. */
function scoreboardRows(): { id: string; cells: string[] }[] {
  const rows = readRepoFile(SCOREBOARD)
    .split("\n")
    .filter((line) => /^\|\s*\*\*G\d+\*\*\s*\|/.test(line))
    .map((line) => {
      const cells = tableCells(line);
      return { id: /\*\*(G\d+)\*\*/.exec(cells[0] ?? "")?.[1] ?? "", cells };
    });

  expectFound(rows, "scoreboard rows in docs/gates.md", 10);
  return rows;
}

/**
 * The **Source** cell of each row in the `Invariants → gates` table — the only
 * place in this repo where "this row protects invariant N" is actually claimed.
 *
 * Scoped this tightly because the looser versions are demonstrably wrong. Over
 * the whole file, G19's own commentary — which cites `invariant 9` as an example
 * of what makes it go red — reads as a claim. Over whole rows, an incidental
 * mention in a Failure-mode cell of an unrelated gate satisfies "invariant 6 is
 * protected". `docs/gates.md` already recorded that lesson once, about G14: a
 * gate that matches prose matches anything.
 */
function invariantSourceCells(): string[] {
  const sourceAt = columnIndex("Invariants → gates", "Source");
  const sources = rowsOf("Invariants → gates").map(
    (row) => row.cells[sourceAt] ?? "",
  );

  expectFound(sources, "Source cells in the Invariants → gates table", 5);
  return sources;
}

/**
 * The statuses the scoreboard's own key defines, rather than a list hardcoded
 * here — otherwise adding a fourth symbol to the key would leave this gate
 * asserting against a vocabulary the document no longer uses.
 */
function allowedStatuses(): string[] {
  const key = markdownSection(
    readRepoFile(SCOREBOARD),
    "Status key",
    SCOREBOARD,
  );
  const symbols = [...key.matchAll(/^\|\s*([^|\s]+)\s*\|\s*[a-z]/gm)].map(
    (m) => m[1] ?? "",
  );
  expectFound(symbols, "status symbols in the scoreboard key", 2);
  return symbols;
}

/**
 * Every backticked path naming a file, taken from scoreboard **rows** only.
 *
 * Any path with a directory separator and a `.ts` ending counts. An earlier
 * version required the path to start with `gates/`, `packages/` or `scripts/`,
 * which made every other root invisible — and the repo's one real instance of a
 * row naming a file that does not exist, G10's `covers/cover-path.test.ts`, sat
 * in exactly that blind spot. An allowlist of directory names was the wrong
 * shape for "does this resolve": the filesystem already answers that.
 */
function specPathsNamed(): string[] {
  const rows = scoreboardRows()
    .map((row) => row.cells.join(" | "))
    .join("\n");

  const paths = new Set<string>();
  for (const match of rows.matchAll(/`([^`\s*]+\/[^`\s*]+\.ts)`/g)) {
    if (match[1] !== undefined) paths.add(match[1]);
  }

  const found = [...paths].sort();
  expectFound(found, "spec files named in docs/gates.md rows", 10);
  return found;
}

describe("G19 — every article of the constitution is scored", () => {
  it("cites every numbered invariant in a Source cell", () => {
    const sources = invariantSourceCells().join("\n");
    const uncited = articleNumbers().filter(
      (n) => !new RegExp(`invariant ${n}\\b`, "i").test(sources),
    );

    expect(
      uncited,
      "invariants in AGENTS.md that no row of the Invariants → gates table claims to " +
        `protect. Add a row — ⬜ "no gate yet" is an acceptable answer and the honest ` +
        `one: ${uncited.join(", ")}`,
    ).toEqual([]);
  });

  it("cites no invariant that does not exist", () => {
    // The reverse direction. Deleting invariant 5 while a row still cites it
    // leaves the scoreboard protecting a rule the constitution no longer has.
    const articles = new Set(articleNumbers());
    const cited = [
      ...invariantSourceCells()
        .join("\n")
        .matchAll(/invariant (\d+)/gi),
    ].map((m) => Number(m[1]));
    expectFound(
      cited,
      "invariant citations in the Invariants → gates table",
      3,
    );

    const dangling = [...new Set(cited)]
      .filter((n) => !articles.has(n))
      .sort((a, b) => a - b);

    expect(
      dangling,
      `scoreboard cites invariants that AGENTS.md does not define: ${dangling.join(", ")}`,
    ).toEqual([]);
  });

  it("numbers the articles uniquely and without gaps", () => {
    // The scoreboard's row numbers are held to this below; the constitution's
    // article numbers were not, which let two rules both be "invariant 2" —
    // and a citation of 2 would then be ambiguous about what it protects.
    const numbers = articleNumbers();
    const expected = numbers.map((_, i) => i + 1);

    expect(
      numbers,
      "AGENTS.md invariants must be numbered 1..n with no repeats or gaps, because " +
        "the scoreboard cites them by number",
    ).toEqual(expected);
  });
});

describe("G19 — the scoreboard describes files that exist", () => {
  it("names no spec that has been moved or deleted", () => {
    const missing = specPathsNamed().filter(
      (path) => !existsSync(join(REPO_ROOT, path)),
    );

    expect(
      missing,
      "docs/gates.md names spec files that do not exist. A row pointing at a moved " +
        `file reads as protection and is none: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("scores every gate in gates/ in a row, not merely in prose", () => {
    // The direction nobody thinks of: writing a gate and never scoring it. This
    // reads rows rather than the file for the same reason the citation check
    // does — a filename that happens to appear in a paragraph is not a row, and
    // counting it as one lets a gate be "scored" by commentary about something
    // else entirely.
    const rows = scoreboardRows()
      .map((row) => row.cells.join(" | "))
      .join("\n");
    const specs = filesUnder("gates", [".test.ts"]);
    expectFound(specs, "gate specs under gates/", 10);

    const unscored = specs.filter((path) => !rows.includes(path));

    expect(
      unscored,
      `gates that no row in docs/gates.md names: ${unscored.join(", ")}`,
    ).toEqual([]);
  });
});

describe("G19 — every row has a name, and the name means something", () => {
  it("gives every row a kebab-case slug", () => {
    const wrong = [...slugByRow()]
      .filter(([, slug]) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      .map(([id, slug]) => `${id} ("${slug}")`);

    expect(
      wrong,
      "rows whose Name is missing or is not a kebab-case slug. The slug is what " +
        `citations elsewhere in the repo spell, so it has to be spellable: ${wrong.join(", ")}`,
    ).toEqual([]);
  });

  it("gives no two rows the same slug", () => {
    const slugs = [...slugByRow().values()];
    const duplicated = [
      ...new Set(slugs.filter((slug, i) => slugs.indexOf(slug) !== i)),
    ];

    expect(
      duplicated,
      `slugs used by more than one row — a name that names two things names neither: ${duplicated.join(", ")}`,
    ).toEqual([]);
  });

  it("matches the spec stem wherever a row uniquely claims one", () => {
    // The rule that keeps a slug anchored instead of being a third
    // hand-maintained name for the same gate — ADR-0026's objection.
    //
    // It applies only where a row names exactly one `gates/*.test.ts` AND no
    // other row names that same stem, which self-exempts the rows where
    // derivation is impossible rather than needing an allowlist: G5 and G13
    // share `repo-hygiene`, and G16, G18, G25, G28, G35 and G42 name no
    // `gates/` spec at all — G35's gate is `scripts/smoke-render.ts` and G42's
    // is a workflow job. Those declare their slug; every other row is forced to
    // move with its file.
    //
    // ⚠️ **The count is gone rather than corrected, on this file's own
    // advice.** It read "the six rows" and "the other 23", and both were wrong:
    // G35 had already made it seven when `enhanced-card` landed naming a script
    // instead of a spec, and `dependency-audit` makes it eight. `docs/gates.md`
    // says it two tables away — *"A positional reference to a table that grows
    // is the same species as the count in the next paragraph"* — and naming the
    // rows breaks loudly where a number just goes quietly stale.
    //
    // ⚠️ **A row can un-anchor another row's slug by mentioning its spec in
    // prose, and that is not hypothetical.** G42's row cited
    // `gates/constitution-scoreboard.test.ts` while explaining which table it
    // was promoted out of; two rows then claimed that stem, and **G19 dropped
    // out of its own derivation rule** with nothing going red. Cite a row by
    // number and slug, never by another row's spec path.
    const stems = stemsByRow();
    const claims = new Map<string, number>();
    for (const list of stems.values()) {
      for (const stem of list) claims.set(stem, (claims.get(stem) ?? 0) + 1);
    }

    const derived = [...slugByRow()].filter(([id]) => {
      const list = stems.get(id) ?? [];
      return list.length === 1 && claims.get(list[0] ?? "") === 1;
    });
    expectFound(derived, "rows whose slug is derivable from a spec stem", 15);

    const wrong = derived
      .filter(([id, slug]) => slug !== (stems.get(id) ?? [])[0])
      .map(
        ([id, slug]) =>
          `${id} names gates/${(stems.get(id) ?? [])[0]}.test.ts but is called "${slug}"`,
      );

    expect(
      wrong,
      `rows whose slug contradicts the one spec they name: ${wrong.join("; ")}`,
    ).toEqual([]);
  });
});

describe("G19 — citations elsewhere spell the current name", () => {
  /**
   * Every row cited by the repo's cross-reference idiom — a line saying
   * `docs/gates.md, row G7 (astro-no-logic)`.
   *
   * Scoped to the *line* rather than to `row G7` directly, because
   * `gates/repo-hygiene.test.ts` cites **two** rows in one sentence — "rows G5
   * and G13" — and a pattern anchored to the word `row` sees only the first.
   * The second would then be neither right nor wrong but unchecked, which is
   * the silent-skip this file's own comments call *matching loosely*.
   *
   * Bare `G8` mentions in ordinary prose are deliberately out of scope:
   * `docs/gates.md` is full of them and forcing a slug onto every one would
   * make the document worse to read for no protection — the citation idiom is
   * what a reader follows.
   */
  function citations(): {
    file: string;
    id: string;
    slug: string | undefined;
  }[] {
    const found: { file: string; id: string; slug: string | undefined }[] = [];

    for (const path of trackedFiles()) {
      if (!/\.(ts|md)$/.test(path)) continue;
      for (const line of readRepoFile(path).split("\n")) {
        if (!/gates\.md, rows? /.test(line)) continue;
        for (const match of line.matchAll(/\b(G\d+)\b(?: \(([^)]*)\))?/g)) {
          found.push({ file: path, id: match[1] ?? "", slug: match[2] });
        }
      }
    }
    return found;
  }

  it("finds enough citations to be checking anything", () => {
    expectFound(citations(), "row citations across the repo", 20);
  });

  it("carries a well-formed slug on every citation", () => {
    // Asserted as the complement of the check below, because a citation the
    // slug pattern cannot parse — `row G21 (no live network)` — is not wrong,
    // it is *unchecked*, and a silent skip is how a gate that matches loosely
    // matches anything.
    const malformed = citations()
      .filter(
        (c) => c.slug === undefined || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug),
      )
      .map(
        (c) =>
          `${c.file}: "row ${c.id}${c.slug === undefined ? "" : ` (${c.slug})`}"`,
      );

    expect(
      malformed,
      "citations of a row that do not carry a parseable slug. Spell it " +
        `"row G7 (astro-no-logic)" so this gate can check it: ${malformed.join(", ")}`,
    ).toEqual([]);
  });

  it("names each row by its current slug", () => {
    const slugs = slugByRow();
    const stale = citations()
      .filter(
        (c) =>
          c.slug !== undefined && slugs.has(c.id) && slugs.get(c.id) !== c.slug,
      )
      .map(
        (c) =>
          `${c.file}: row ${c.id} is "${slugs.get(c.id)}", cited as "${c.slug}"`,
      );

    expect(
      stale,
      "citations naming a row by a slug it no longer has. This is the second copy " +
        `that ADR-0026 is about, which is why it is gated: ${stale.join("; ")}`,
    ).toEqual([]);
  });
});

describe("G19 — the scoreboard is well formed", () => {
  it("gives every row a status from its own key", () => {
    const allowed = allowedStatuses();
    const wrong = scoreboardRows()
      .filter((row) => {
        const status = row.cells.at(-1) ?? "";
        return !allowed.some((symbol) => status.startsWith(symbol));
      })
      .map((row) => `${row.id} ("${row.cells.at(-1) ?? ""}")`);

    expect(
      wrong,
      `rows whose status is not one of ${allowed.join(" ")} — the key at the top of ` +
        `docs/gates.md defines the vocabulary: ${wrong.join(", ")}`,
    ).toEqual([]);
  });

  it("numbers every row uniquely", () => {
    const ids = scoreboardRows().map((row) => row.id);
    const duplicated = [
      ...new Set(ids.filter((id, i) => ids.indexOf(id) !== i)),
    ];

    expect(
      duplicated,
      `row numbers used twice: ${duplicated.join(", ")}`,
    ).toEqual([]);
  });

  it("leaves no gap in the row numbering", () => {
    // The scoreboard documents this rule under "Retiring a row"; it is asserted
    // here rather than invented here.
    const numbers = scoreboardRows()
      .map((row) => Number(row.id.slice(1)))
      .sort((a, b) => a - b);
    const gaps = [];
    for (let n = 1; n < (numbers.at(-1) ?? 0); n += 1) {
      if (!numbers.includes(n)) gaps.push(`G${n}`);
    }

    expect(
      gaps,
      `row numbers missing from docs/gates.md. Retire a row by marking it, not by ` +
        `deleting it: ${gaps.join(", ")}`,
    ).toEqual([]);
  });
});
