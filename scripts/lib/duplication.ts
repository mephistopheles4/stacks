/**
 * Duplication over two populations, as four counts each.
 *
 * **The counting rule is jscpd's, not this repo's** — `complexity.ts`'s opening
 * position, for `complexity.ts`'s reason. What lives here is the population
 * rule, the attribution of a clone to a scope, the ignored-line sweep, and the
 * translation from a jscpd report into numbers. No counting of its own, and
 * that restraint is **measured rather than preferred**: a first draft counted
 * lines by hand and disagreed with jscpd on three of ninety-five files —
 * `packages/core/src/enrich.ts` by one, `packages/site/src/shelf/boot.ts` by
 * one, and `scripts/lib/repo-root.ts` by twenty-seven, because jscpd declines
 * that file entirely and reports it as no source at all. A denominator this
 * module invented would have been wrong on day one and silent about it.
 *
 * ⚠️ **jscpd 5 is a Rust binary with a command line and no programmatic API**,
 * unlike the ESLint the complexity counter imports. So this module spawns it and
 * reads the JSON report, and every number below is jscpd's own arithmetic —
 * `statistics.total` for a population's totals, and the `duplicates` array for
 * the per-scope share. See `docs/spec/static-analysis-and-style.md` §5.
 *
 * **Two populations, because a clone is a relation between two places.** The
 * eight declared scopes cannot express a clone whose halves sit in two of them,
 * and `gates/` is read by no scope at all — so a whole-tree TypeScript number
 * sits beside the eight, and no scope list can shrink it.
 * [ADR-0072](../../docs/adr/0072-a-clone-is-a-relation-between-two-places.md).
 *
 * **Pure where it can be, with the disk and the subprocess at the edge**, which
 * is `complexity.ts`'s split and `scope-check.ts`'s before it: `attributeClones`,
 * `ignoredLinesIn` and `treePopulationOf` take what they need and touch nothing,
 * so `duplication.test.ts` exercises them against planted inputs rather than
 * against whatever this tree happens to hold today.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { globToRegExp, type Scope } from './mutation-score.ts';
import { REPO_ROOT } from './repo-root.ts';
import { walkSource } from './walk.ts';

/**
 * The three thresholds, and the whole of what makes a number mean something.
 *
 * ⚠️ **Without the pin these counts are not comparable to their own past.**
 * [#232](https://github.com/mephistopheles4/stacks/issues/232) measured **12
 * clones at 50/5 and 82 at 20/3 over the identical tree** — one threshold step
 * is a 7× move with no code written. So all three are hash ingredients, beside
 * the tool version, and `duplicationHashOf` in `floors.ts` is what stamps them.
 *
 * `mild` is jscpd's default mode: comments are tokens. The alternative `weak`
 * skips them, which would let a clone be cleared by rewording a comment above
 * it — a change to the number with no change to the code, which is the shape
 * every counter in this repo is arranged against.
 */
export const THRESHOLDS = {
  minTokens: 50,
  minLines: 5,
  mode: 'mild',
} as const;

/** One population's four counts. */
export interface DuplicationCounts {
  /** Clones found. A clone is one relation; a self-clone counts once. */
  clones: number;
  /** Duplicated lines, jscpd's own figure — Σ over clones of the first half's span. */
  duplicatedLines: number;
  /** Lines inside a terminated ignore block, both directive lines included. */
  ignoredLines: number;
  /**
   * Lines **scanned**, jscpd's own figure — the denominator the other three are
   * read against.
   *
   * ⚠️ **Not the number of lines in the population, and the gap is real.** A
   * file whose token count falls under `minTokens` is declined *whole*: jscpd
   * reports it as no source at all, contributing zero lines.
   * `scripts/lib/repo-root.ts` is one such file today — twenty-seven lines, one
   * statement — which is why a hand-rolled denominator disagreed with jscpd by
   * exactly its length. Suppressing a region can push a file under that floor
   * and take the rest of it out too, which is one more reason the suppressed
   * lines are declared rather than inferred.
   */
  totalLines: number;
}

// ── the ignore sweep ─────────────────────────────────────────────────────────

/**
 * The suppression directive, assembled rather than written.
 *
 * ⚠️ **This module must never contain the directive it looks for, and the
 * hazard is doubled compared with the one `floors.ts` records.** That file's
 * widened pattern once made its own prose count itself, which was a wrong
 * number. Here the same slip would *also* be honoured by jscpd — this file is
 * inside both populations, so a literal opener would open a real suppression
 * region in the tree run and shrink the denominator of the very series it
 * implements. Two failures from one typo, and the second is silent.
 *
 * So the token is built from halves at runtime and appears nowhere in this
 * source, contiguously or otherwise. The spellings are enumerated in
 * `duplication.test.ts`, which builds them the same way — and never in a
 * committed file that either sweep reads as source.
 */
const MARKER = 'jscpd:ignore';

/**
 * The directive **anywhere a comment could carry it** — deliberately wider than
 * what this repository permits below.
 *
 * `floors.ts`'s `DIRECTIVE` rule and the direction it chose: *a directive this
 * misses is a suppression with the counter green — silent, which is the failure
 * the row exists to prevent. A false positive is a red build somebody
 * investigates.* Matching only the one permitted spelling would make every
 * other spelling invisible **to this sweep while jscpd still honoured it** —
 * measured, all four forms below — so detection over-matches and the narrowing
 * happens as a refusal rather than as a blind spot.
 *
 * The pattern contains no unescaped comment opener in its own source.
 */
const DETECT = new RegExp(`(?:\\/\\/|\\/\\*|\\*)\\s*${MARKER}-(start|end)\\b`);

/**
 * The one form a suppression may be written in here: a whole-line `//` comment.
 *
 * ⚠️ **Narrowed because the removal rule is not one rule, and that is
 * measured.** jscpd honours four spellings and takes a *different span* for
 * each. Twelve live lines and three hidden ones, jscpd 5.0.16 at 50/5/mild:
 *
 * | Written as | Raw lines | jscpd removed |
 * |---|---|---|
 * | `//` on its own line | 17 | **5** — the three, and both directive lines |
 * | a `/** … *\/` block carrying the word on its continuation line | 21 | **9** — both comment blocks entire |
 * | trailing after code on a live line | 17 | **4** — the line with code on it survives |
 *
 * So *"lines a block withholds"* has no single arithmetic across the forms, and
 * a counter that picked one would be wrong about the other two while looking
 * right. One form is permitted instead; the other three are a **red build**,
 * not a wrong number.
 */
const PERMITTED = new RegExp(`^\\s*\\/\\/\\s*${MARKER}-(start|end)\\s*$`);

/** Which half of a pair a line is, or nothing. */
function directiveOn(line: string): 'start' | 'end' | undefined {
  const found = DETECT.exec(line);
  return found === null ? undefined : (found[1] as 'start' | 'end');
}

/**
 * Whether the line **after** this one begins inside a `/* … *\/` block comment.
 *
 * ⚠️ **Deliberately not a lexer, and the limit is stated rather than hidden.**
 * It counts block-comment openers and closers and knows nothing about string
 * literals, so a `'/*'` inside a string would fool it. That is accepted because
 * of which way it fails: a line wrongly believed to be inside a comment makes a
 * directive there **invisible to this sweep while jscpd still honours it**,
 * which is the silent direction — and it takes a string containing a
 * block-comment opener *and* a suppression directive in the same file to reach
 * it. The permitted form is a whole-line `//` comment, so the realistic case
 * this exists for is the one that was actually observed: a directive planted
 * into the middle of a file's header comment.
 */
function commentStateAfter(line: string, inside: boolean): boolean {
  let open = inside;
  for (let i = 0; i < line.length - 1; i += 1) {
    const pair = line.slice(i, i + 2);
    if (!open && pair === '/*') {
      open = true;
      i += 1;
    } else if (open && pair === '*/') {
      open = false;
      i += 1;
    } else if (!open && pair === '//') {
      // A line comment runs to end of line, so nothing after it can open a
      // block. Without this, `// see /* below` would open one that never shuts.
      break;
    }
  }
  return open;
}

/** One suppression block, 1-based and inclusive of both directive lines. */
export interface IgnoreBlock {
  path: string;
  start: number;
  end: number;
}

/**
 * Every suppression block in a file, with the lines it spans.
 *
 * **Ranges rather than a bare count, because the emitter has a second reader.**
 * The count is what `jscpd.floors.json` declares and the gate sweeps; the
 * ranges are what a **permalink** is built from at emit time.
 *
 * ⚠️ **Permalinks are generated and never stored.** A pinned link stays valid
 * while it stops describing a block that moved, and a stale link that still
 * resolves reads as current — silence that looks like health. Nothing here can
 * check that a link resolves either: G21 records any request the suite makes
 * and fails the test that made it, so a stored link would be shape-checked
 * only, which `AGENTS.md` already calls *a typo guard and explicitly not a
 * correctness guarantee*. The run knows its own commit, so it can spell a
 * current link every time and keep none.
 *
 * ⚠️ **And never as a metrics label.** Pushgateway never forgets a series, so
 * a per-block label would mint a new series every time a block moved a line and
 * leave the old one drawing a confident flat line.
 */
export function ignoreBlocksIn(source: string, path = '<source>'): IgnoreBlock[] {
  const lines = source.split('\n');
  const blocks: IgnoreBlock[] = [];
  let openedAt: number | undefined;
  let inBlockComment = false;

  for (const [index, line] of lines.entries()) {
    const wasInBlockComment = inBlockComment;
    inBlockComment = commentStateAfter(line, inBlockComment);

    // ⚠️ **A directive inside a `/* … */` block is not a directive, and this
    // was found by planting rather than by reading.** A mechanical plant put an
    // `ignore-end` in the middle of a file's header comment: the sweep counted
    // six lines and **jscpd removed none** — its denominator went *up* by the
    // two lines added, not down. So without this, the declared counter would
    // state a suppression that never happened, and the gate would demand an
    // entry for a block that does nothing.
    //
    // The over-count direction is the safe one either way — it is a red build
    // somebody reads, where a missed directive is silence — but a counter that
    // is knowably wrong is not the "real count" this row promises.
    if (wasInBlockComment) continue;

    const half = directiveOn(line);
    if (half === undefined) continue;
    const number = index + 1;

    if (!PERMITTED.test(line)) {
      throw new Error(
        `${path}:${String(number)} writes a jscpd suppression in a form this repository ` +
          'does not permit. Measured: jscpd removes a different number of lines for each ' +
          'comment form it honours, so only a whole-line `//` comment is allowed — the one ' +
          'form whose span is the directive line, the region, and the closing directive line. ' +
          `Rewrite it as a comment alone on its line. Found: ${line.trim()}`,
      );
    }

    if (half === 'start') {
      if (openedAt !== undefined) {
        throw new Error(
          `${path}:${String(number)} opens an ignore block while the one at line ` +
            `${String(openedAt)} is still open. jscpd does not nest them, so the inner ` +
            'pair reads as noise and the counter below would describe neither region.',
        );
      }
      openedAt = number;
      continue;
    }

    if (openedAt === undefined) {
      throw new Error(
        `${path}:${String(number)} closes an ignore block that was never opened. ` +
          'Nothing is suppressed and nothing is counted, so the file is not what it ' +
          'looks like — repair the pair rather than the counter.',
      );
    }
    blocks.push({ path, start: openedAt, end: number });
    openedAt = undefined;
  }

  if (openedAt !== undefined) {
    throw new Error(
      `${path}:${String(openedAt)} opens an ignore block that is never closed. Measured: ` +
        'jscpd suppresses nothing at all for an unterminated opener, so the region the ' +
        'author believes is excluded is fully counted, and no number anywhere says so.',
    );
  }
  return blocks;
}

/**
 * Lines a file **declares** suppressed, both directive lines included.
 *
 * ⚠️ **Declared, not honoured — and the gap is a defect in jscpd 5.0.16 that
 * this counter is the only thing in the repository able to see.** Measured this
 * session, fourteen live lines and a three-line block, varying only what
 * follows the closing directive:
 *
 * | After the closing directive | jscpd removed |
 * |---|---|
 * | nothing — the block ends the file | **5**, the block |
 * | a blank line, or a comment | **6**, the block *and* the trailing line |
 * | **one line of code** | **0 — the directive is not honoured at all** |
 *
 * So a suppression block in the middle of a file **does nothing, silently**:
 * the author believes a region is excluded, jscpd counts every line of it, and
 * nothing else anywhere says which of the two happened. Where it *is* honoured
 * it truncates to end of file rather than stopping at the closing directive, so
 * it can take more than the block as well.
 *
 * ⚠️ **Every earlier measurement of this feature had the block at the end of a
 * file, this repository's and the ticket's alike, so all of them agreed and all
 * of them were the special case.** The general shape was found by planting a
 * block into a real file and comparing the two numbers — which is the whole
 * argument for a declared counter rather than an inferred one.
 *
 * **This counts the block as written**, which is what
 * `docs/spec/static-analysis-and-style.md` §5 asks for — *lines inside
 * `jscpd:ignore` blocks* — and it is the right quantity either way: a block is
 * an **intent** to take code out of a measurement, and that intent belongs in a
 * diff whether or not the tool acts on it.
 *
 * ⚠️ **So `totalLines + ignoredLines` is an approximation, not an identity.**
 * An earlier draft of this module claimed it reconstructed the raw total
 * exactly; it over-states where jscpd ignored the block and under-states where
 * jscpd truncated past it.
 */
export function ignoredLinesIn(source: string, path = '<source>'): number {
  return ignoreBlocksIn(source, path).reduce((sum, block) => sum + block.end - block.start + 1, 0);
}

/** Every suppression block in a population, from the disk. */
export function sweepIgnoreBlocks(
  files: readonly string[],
  root: string = REPO_ROOT,
): IgnoreBlock[] {
  return files.flatMap((file) => ignoreBlocksIn(readFileSync(join(root, file), 'utf8'), file));
}

/** The ignored-line total over a population, from the disk. */
export function sweepIgnoredLines(files: readonly string[], root: string = REPO_ROOT): number {
  return sweepIgnoreBlocks(files, root).reduce(
    (sum, block) => sum + block.end - block.start + 1,
    0,
  );
}

/**
 * A block's permalink, spelled at emit time from the commit the run is at.
 *
 * Built here rather than in the emitter so the one `#L<a>-L<b>` spelling has
 * one home — and so a spec can hold it, which nothing in `emit-metrics.ts` can.
 */
export function permalinkFor(block: IgnoreBlock, commit: string): string {
  return (
    `https://github.com/mephistopheles4/stacks/blob/${commit}/${block.path}` +
    `#L${String(block.start)}-L${String(block.end)}`
  );
}

// ── the populations ──────────────────────────────────────────────────────────

/**
 * Every TypeScript file in the tree — the population no scope list can shrink.
 *
 * ⚠️ **`sourceFiles()` is deliberately not used, and reaching for it is the
 * trap this comment exists to close.** That walk drops `*.test.ts` and reads
 * only `packages`, `scripts` and `gates` — so it would silently exclude exactly
 * the code duplication is loudest in.
 * [#239](https://github.com/mephistopheles4/stacks/issues/239) measured the
 * inversion: test code is the *flattest* population for complexity (the maximum
 * across all 1931 test functions is exactly 10) and the *loudest* for
 * duplication (`gates/` moves 4 → 119 clones across one threshold step). A
 * population that is right for one measure is wrong for the other.
 *
 * ⚠️ **An explicit list rather than jscpd's own `--format typescript`, and the
 * two were measured equal before this was chosen**: 190 files, 188 of them
 * scanned, 35 clones, 363 duplicated lines, 45,384 lines, either way. The
 * explicit list is what lets the ignore sweep describe *the same* population
 * the counts are taken over — with jscpd choosing, the two would be separate
 * rules free to drift, and the drift would be invisible.
 *
 * `.d.ts` is out because a declaration carries no statement; everything else
 * TypeScript is in, `gates/` and `fixtures/` included.
 */
export function treePopulationOf(root: string = REPO_ROOT): string[] {
  return walkSource(['.'], isTypeScript, root);
}

/** A file jscpd would call `typescript`. `.d.ts` carries no statement and is out. */
export function isTypeScript(path: string): boolean {
  return /\.(ts|tsx|mts|cts)$/.test(path) && !/\.d\.[cm]?ts$/.test(path);
}

/** The population every declared scope's numbers are taken over, deduplicated. */
export function scopedPopulationOf(
  scopes: readonly Scope[],
  populationOfScope: (scope: Scope) => readonly string[],
): string[] {
  return [...new Set(scopes.flatMap((scope) => [...populationOfScope(scope)]))].sort();
}

// ── the report ───────────────────────────────────────────────────────────────

/** One clone, as jscpd's JSON report carries it. */
export interface ReportedClone {
  firstFile: { name: string; start: number; end: number };
  secondFile: { name: string; start: number; end: number };
  lines: number;
}

/** The half of jscpd's report this module reads. */
export interface Report {
  duplicates: ReportedClone[];
  statistics: { total: { clones: number; duplicatedLines: number; lines: number } };
}

/**
 * jscpd's own duplicated-line arithmetic for one clone.
 *
 * ⚠️ **The first half's span, and *not* `clone.lines`.** Measured against the
 * union run: `Σ (firstFile.end − firstFile.start)` is **133**, which is exactly
 * `statistics.total.duplicatedLines`, while `Σ clone.lines` is 145 and
 * `Σ` over both halves is 306. Neither of the other two is the number jscpd
 * publishes, so neither is the number a per-scope share may be built from —
 * a scope total that did not sum to the repository total under the same rule
 * would be two measures wearing one name.
 */
function duplicatedLinesOf(clone: ReportedClone): number {
  return clone.firstFile.end - clone.firstFile.start;
}

/**
 * A path from jscpd's report, as a repo-relative POSIX path.
 *
 * ⚠️ **The report is run with `--absolute` for one measured reason:** without
 * it jscpd strips a common prefix that is neither the repo root nor stable —
 * over the eight populations it reported `covers/cover-budget.ts`, `library.ts`
 * and `deploy.ts` in one run, three different prefixes removed — and two files
 * called `types.ts` collapsed onto one name. Attribution keyed on that is
 * attribution keyed on a coincidence.
 *
 * The `\\?\` prefix is Windows' extended-length form and carries no meaning
 * here, so it is removed first.
 *
 * ⚠️ **Separator normalisation, then a prefix strip — never `isAbsolute` and
 * `relative`, and CI is what said so.** Those two answer by the *host*
 * platform: on Linux `isAbsolute('C:/repo/x.ts')` is false and
 * `split(sep).join('/')` leaves a backslash untouched, so the first draft passed
 * on Windows and failed three ways on both CI runners. The counter reads paths a
 * different program wrote, which is exactly where a host-dependent rule has no
 * business — normalising both sides to forward slashes gives one answer
 * everywhere, and a path outside the root comes back whole rather than as a
 * chain of `..` no scope glob would match.
 */
export function repoRelative(reported: string, root: string = REPO_ROOT): string {
  const normalise = (path: string): string => path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/');

  const cleaned = normalise(reported);
  const base = normalise(root);
  return cleaned.startsWith(`${base}/`) ? cleaned.slice(base.length + 1) : cleaned;
}

/**
 * Each scope's clone count and duplicated-line count, from one union run.
 *
 * ⚠️ **One run over the union, never eight runs over eight populations**, and
 * the difference is the whole of [ADR-0072](../../docs/adr/0072-a-clone-is-a-relation-between-two-places.md).
 * Eight independent runs are structurally blind to a clone whose halves sit in
 * two scopes — which is precisely the cross-file duplication a largely
 * agent-written repository is expected to grow. The hole is latent rather than
 * hypothetical: [#232](https://github.com/mephistopheles4/stacks/issues/232)'s
 * combined run and its eight separate runs agree **today**, so closing it costs
 * nothing now and cannot be closed cheaply later.
 *
 * ⚠️ **A clone in two scopes is counted by both, so the eight numbers do not
 * sum to a repository total.** That is deliberate and it is what the whole-tree
 * population exists beside. A clone is a relation, and a relation does not
 * partition.
 *
 * A self-clone — both halves in one file, which is **8 of the 12** this tree
 * holds today — counts once, because it is one relation.
 */
export function attributeClones(
  clones: readonly ReportedClone[],
  scopes: readonly Scope[],
  root: string = REPO_ROOT,
): Map<string, { clones: number; duplicatedLines: number }> {
  const matchers = scopes.map((scope) => ({ name: scope.name, match: globToRegExp(scope.glob) }));
  const counted = new Map(
    scopes.map((scope) => [scope.name, { clones: 0, duplicatedLines: 0 }]),
  );

  for (const clone of clones) {
    const halves = [clone.firstFile.name, clone.secondFile.name].map((name) =>
      repoRelative(name, root),
    );

    for (const owner of matchers) {
      if (!halves.some((half) => owner.match.test(half))) continue;
      const tally = counted.get(owner.name);
      if (tally === undefined) continue;
      tally.clones += 1;
      tally.duplicatedLines += duplicatedLinesOf(clone);
    }
  }
  return counted;
}

// ── the subprocess ───────────────────────────────────────────────────────────

/**
 * Where the jscpd command line lives, resolved rather than assumed.
 *
 * `run-jscpd.js` is the package's own `bin`, and resolving it through the
 * module graph rather than hardcoding `node_modules/jscpd/…` is what makes this
 * work under pnpm's virtual store, where the real directory is nested.
 */
function jscpdEntry(): string {
  return repoRequire(REPO_ROOT).resolve('jscpd/run-jscpd.js');
}

/**
 * Module resolution anchored at the repository, not at this file.
 *
 * ⚠️ **`createRequire(import.meta.url)` is the obvious spelling and G24
 * forbids it**, anchoring on `import.meta` itself rather than on a helper's
 * name so that every route to a module's own location is caught. The rule is
 * right here for a second reason of its own: the jscpd whose version is hashed
 * has to be **the repository's**, and resolving from this file's location would
 * find whatever copy happens to sit nearest it in a nested install.
 */
function repoRequire(root: string): NodeRequire {
  return createRequire(join(root, 'package.json'));
}

/**
 * jscpd over an explicit file list, as the parsed JSON report.
 *
 * **An explicit list and never a glob**, so the population is decided in this
 * repository's code and read back by the ignore sweep — one population, two
 * readers. The report goes to a temporary directory and is deleted: it is an
 * intermediate, and writing it into the tree would put a JSON file full of
 * duplicated fragments *inside the population being measured*.
 *
 * An empty population is `null` rather than four zeros, which is
 * `countsFrom`'s rule and its reason: a population with no file has not
 * measured a tree with no duplication in it, and `0` is a legal value for every
 * count here.
 */
export function runJscpd(files: readonly string[], root: string = REPO_ROOT): Report | null {
  if (files.length === 0) return null;

  const out = mkdtempSync(join(tmpdir(), 'stacks-jscpd-'));
  try {
    execFileSync(
      process.execPath,
      [
        jscpdEntry(),
        ...files,
        '--min-tokens',
        String(THRESHOLDS.minTokens),
        '--min-lines',
        String(THRESHOLDS.minLines),
        '--mode',
        THRESHOLDS.mode,
        '--reporters',
        'json',
        '--output',
        out,
        '--absolute',
      ],
      { cwd: root, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8')) as Report;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/**
 * One population's four counts, or `null` where the population is empty.
 *
 * The clone count and the duplicated-line count are **jscpd's own totals** here,
 * which is right for a population read as one thing — the tree. A *scope's*
 * share comes from `attributeClones` instead, because the union run's totals
 * describe the union and not any scope in it.
 */
export function countsOf(report: Report | null, ignoredLines: number): DuplicationCounts | null {
  if (report === null) return null;
  return {
    clones: report.statistics.total.clones,
    duplicatedLines: report.statistics.total.duplicatedLines,
    ignoredLines,
    totalLines: report.statistics.total.lines,
  };
}

/** Every population's counts, from one pass over the tree. */
export interface AllCounts {
  scopes: Map<string, DuplicationCounts | null>;
  tree: DuplicationCounts | null;
}

/**
 * The whole measurement: eight scopes and the tree, in one call.
 *
 * ⚠️ **Extracted because the duplication counter reported it duplicated**, like
 * `walkSource` one file over and on the same commit: `scripts/emit-metrics.ts`
 * and `scripts/duplication-report.ts` held three clones of this loop between
 * them, 6, 6 and 8 lines. Both callers now pass through here.
 *
 * ⚠️ **And it belongs here for a second reason that outlives the clone.**
 * `emit-metrics.ts` is excluded from the `scripts` mutation scope and imported
 * by no spec, so a rule written there is a rule nothing holds — the argument
 * `complexityFactsOf`'s own comment makes about living in `lib/`. This is the
 * measurement; the two callers are a record and a print.
 *
 * ⚠️ **Ten jscpd runs, and each is there for something the others cannot do.**
 * One over the **union**, because a clone is a relation between two places and
 * eight separate runs are structurally blind to one spanning two scopes — that
 * run is where every clone count and duplicated-line count comes from. Eight
 * more, one per scope, because jscpd publishes no per-file line count and **its
 * denominator must not be reimplemented**: a hand-rolled one disagreed with
 * jscpd on three of ninety-five files, once by twenty-seven lines. And one over
 * the whole tree.
 */
export function countAllPopulations(
  scopes: readonly Scope[],
  populationOfScope: (scope: Scope) => readonly string[],
  root: string = REPO_ROOT,
): AllCounts {
  const populations = new Map(scopes.map((scope) => [scope.name, populationOfScope(scope)]));

  const unionRun = runJscpd(
    scopedPopulationOf(scopes, (scope) => populations.get(scope.name) ?? []),
    root,
  );
  if (unionRun === null) {
    throw new Error(
      'no file in any declared scope for jscpd to run over. Eight scopes are declared, so ' +
        'nothing to measure is a broken declaration rather than a tree with no duplication.',
    );
  }
  const attributed = attributeClones(unionRun.duplicates, scopes, root);

  const counted = new Map<string, DuplicationCounts | null>();
  for (const scope of scopes) {
    const population = populations.get(scope.name) ?? [];
    const own = runJscpd(population, root);
    const share = attributed.get(scope.name);

    counted.set(
      scope.name,
      own === null || share === undefined
        ? null
        : {
            clones: share.clones,
            duplicatedLines: share.duplicatedLines,
            ignoredLines: sweepIgnoredLines(population, root),
            totalLines: own.statistics.total.lines,
          },
    );
  }

  const tree = treePopulationOf(root);
  return { scopes: counted, tree: countsOf(runJscpd(tree, root), sweepIgnoredLines(tree, root)) };
}

// ── the counting rule ────────────────────────────────────────────────────────

/**
 * Everything that decides what a duplication count *means*, in hash order.
 *
 * ⚠️ **Kept apart from `CounterInputs`, and folding the two together is the
 * mistake this separation exists to prevent.** `fixtureHash` covers the ESLint
 * version, the parser version, the `complexity` rule's options and the
 * inventory totals. jscpd reads none of them — so one hash over both would make
 * an ESLint upgrade refuse every duplication record, and a jscpd upgrade refuse
 * every complexity record, in each case over a number that did not move.
 *
 * The version is read **as installed**, never from `package.json`, which is
 * `counterInputs()`'s rule verbatim: *`package.json` states an intention and
 * `node_modules` states a fact, and only one of them is an input to the number.*
 */
export interface DuplicationInputs {
  jscpdVersion: string;
  minTokens: number;
  minLines: number;
  mode: string;
}

// ── the declaration file ─────────────────────────────────────────────────────

/**
 * The whole-tree population's key in `jscpd.floors.json`.
 *
 * Spelled once, and deliberately not a path: every other key there is a
 * declared mutation scope's name, and this population is not one and never will
 * be. A key that looked like a glob would invite somebody to try to make
 * `correspondence` read this file too.
 */
export const TREE_POPULATION = 'whole-tree';

/** One population's declared suppression, as `jscpd.floors.json` carries it. */
export interface PopulationDeclaration {
  /** Lines inside a suppression block, both directive lines included. */
  ignoredLines: number;
  /** Append-only, one line per block added, never cleared. */
  notes: string[];
}

export interface Declarations {
  /** The counting rule these counters were recorded under. */
  duplicationHash: string;
  populations: Map<string, PopulationDeclaration>;
}

/**
 * The declaration document, or a throw.
 *
 * `parseFloors`' rule verbatim: **a malformed declaration file is never a
 * partial one.** Every judgement built on this file reads the file, so a parse
 * that dropped an unreadable entry would turn a corrupted counter into a
 * population nothing checks — the failure the piece exists to prevent, arriving
 * through the reader.
 */
export function parseDeclarations(document: unknown): Declarations {
  if (typeof document !== 'object' || document === null) {
    throw new Error('the jscpd declaration file is not an object');
  }
  const { duplicationHash, populations } = document as {
    duplicationHash?: unknown;
    populations?: unknown;
  };

  if (typeof duplicationHash !== 'string' || duplicationHash === '') {
    throw new Error('the jscpd declaration file carries no duplicationHash');
  }
  if (typeof populations !== 'object' || populations === null) {
    throw new Error('the jscpd declaration file carries no populations object');
  }

  const parsed = new Map<string, PopulationDeclaration>();
  for (const [name, entry] of Object.entries(populations as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`the declaration for ${name} is not an object`);
    }
    const { ignoredLines, notes } = entry as Record<string, unknown>;

    if (typeof ignoredLines !== 'number' || !Number.isInteger(ignoredLines) || ignoredLines < 0) {
      throw new Error(
        `the ignoredLines counter for ${name} is not a count: ${String(ignoredLines)}`,
      );
    }
    if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
      throw new Error(`the notes for ${name} are not a list of lines`);
    }
    parsed.set(name, { ignoredLines, notes: notes as string[] });
  }
  return { duplicationHash, populations: parsed };
}

/** `jscpd.floors.json`, from the disk. */
export function readDeclarations(root: string = REPO_ROOT): Declarations {
  return parseDeclarations(JSON.parse(readFileSync(join(root, 'jscpd.floors.json'), 'utf8')));
}

/** A population where the sweep and the declared counter disagree, and by how much. */
export interface IgnoredMismatch {
  population: string;
  /** Lines the sweep actually found. */
  swept: number;
  /** What the declaration file says. */
  recorded: number;
}

/**
 * Every population whose declared counter is not what the tree holds.
 *
 * **Both directions, and neither is the redundant one** —
 * `ignoredMismatches` in `floors.ts`, whose reasoning transfers without
 * editing. A block arriving with the counter left alone is the route this file
 * was minted to close. A counter raised with no block under it is the file
 * drifting away from the tree in the direction that would otherwise never fire,
 * and it is what stops the counter being pre-raised, once, quietly, so a later
 * block lands green.
 *
 * ⚠️ **A population the file does not name at all is still reported when the
 * sweep found something.** Iterating only the declared entries would leave this
 * silent in precisely the case where the file is already wrong. Reported only
 * when the sweep found lines, so a merely missing entry is the completeness
 * check's finding rather than this one's too.
 */
export function ignoredMismatches(
  swept: ReadonlyMap<string, number>,
  declared: Declarations,
): IgnoredMismatch[] {
  const found: IgnoredMismatch[] = [];

  for (const [population, entry] of declared.populations) {
    const counted = swept.get(population);
    if (counted === undefined || counted === entry.ignoredLines) continue;
    found.push({ population, swept: counted, recorded: entry.ignoredLines });
  }

  for (const [population, counted] of swept) {
    if (declared.populations.has(population) || counted === 0) continue;
    found.push({ population, swept: counted, recorded: 0 });
  }
  return found;
}

/** Populations one side names and the other does not. Both directions, always. */
export function declarationCorrespondence(
  measured: readonly string[],
  declared: Declarations,
): { undeclared: string[]; orphaned: string[] } {
  const named = new Set(declared.populations.keys());
  const real = new Set(measured);
  return {
    undeclared: measured.filter((name) => !named.has(name)).sort(),
    orphaned: [...named].filter((name) => !real.has(name)).sort(),
  };
}

export function duplicationInputs(): DuplicationInputs {
  const manifest = repoRequire(REPO_ROOT).resolve('jscpd/package.json');
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };

  if (typeof version !== 'string' || version === '') {
    throw new Error(
      'jscpd is installed without a version string. A hash over its absence would claim ' +
        'these counts were produced under a known rule when nothing knows which.',
    );
  }
  return { jscpdVersion: version, ...THRESHOLDS };
}
