# The survivor set diffs cleanly, and the cross-tree pair did not cross a tree

**2026-09-21** — [#344](https://github.com/mephistopheles4/stacks/issues/344),
decision B split out of [#243](https://github.com/mephistopheles4/stacks/issues/243):
should the set of surviving mutants outlive a 30-day workflow artifact? This
entry is the measurement the ticket's Agent Brief asked for. The recommendation
itself is posted on the issue, as a choice for the maintainer.

## The answer first

- **A content key works on every tree it could be tested on.** File +
  `mutatorName` + original source text + `replacement`, compared as a
  **multiset**, matched **3,713 of 3,713** survivors across three reports of
  byte-identical source. The control the brief demands is green.
- **The cross-tree half is not measured, because no qualifying pair exists.**
  The pair the triage addendum named sits on two commits that change **no
  mutated file**. It is a third identical-tree control, not a cross-tree one.
- **An identical tree does not give an identical survivor set.** Across seven
  nightly reports of one mutated tree, the set moved by at most **one mutant per
  pair**, always a `Survived`↔`Timeout` flip on a loop decrement in
  `packages/site/src/shelf/head-cap.ts`. A diff reader must expect that noise.
- **16.9% of survivors share their key with another survivor** in the same run.
  Under multiset matching the counts stay exact. What a collision costs is
  *attribution*: which of two identical `'cover'` literals is the survivor.

## The reports

Every report is the `mutation-report-<run id>` artifact of a scheduled
`metrics.yml` run. Letters are the names used below.

| | Run | Created | Head commit | Survivors |
| --- | --- | --- | --- | --- |
| **A** | `34947998738` | 2026-09-15 | `34385b52` | 3,713 |
| **B** | `35074303919` | 2026-09-16 | `34385b52` | 3,712 |
| | `35200581455` | 2026-09-17 | `34385b52` | 3,713 |
| | `35323165911` | 2026-09-18 | `34385b52` | 3,713 |
| | `35430813371` | 2026-09-19 | `34385b52` | 3,713 |
| **C** | `35499820231` | 2026-09-20 | `c52cc9f0` | 3,713 |
| | `35580168633` | 2026-09-21 | `c52cc9f0` | 3,713 |

"Survivors" is `Survived` plus `NoCoverage`, the job summary's own definition.
Every report carries **10,644 mutants in 74 files**; A has 2,489 `Survived`
and 1,224 `NoCoverage`.

## ⚠️ Why C is not a cross-tree report

The addendum said five commits separate A and C, *"so lines moved in files that
stayed mutated."* They did not.

```sh
git diff --name-only 34385b52 c52cc9f0
```

```text
package.json
packages/site/package.json
packages/site/src/assets/github-mark.svg
packages/site/src/components/Attribution.astro
pnpm-lock.yaml
```

Every scope glob in `stryker.scopes.json` ends `*.ts`, so none of those five is
mutated. The reports agree: the source of all **74** mutated files and all
**84** test files is byte-identical between A and C. What did move is four
dependencies — `astro` 7.2.10→7.3.2, `prettier` 3.9.6→3.9.7, `@types/node` and
`puppeteer-core`. **`@stryker-mutator/*` stayed at 9.6.1 and `vitest` did not
move**, so C also shows that those bumps changed no survivor.

`main` has not moved past `c52cc9f0` at the time of writing, so no nightly on
a changed mutated tree exists yet. The brief forbids manufacturing one locally.

## ⚠️ The trap: aligning mutants by array position

The first control compared A and B mutant by mutant, by index in each file's
`mutants[]`. It reported **997 status flips** on an identical tree, 482 of them
`Survived→Killed`. **Every one was an artefact.**

- In **70 of 74 files**, the `mutants[]` array is not in `id` order, and the
  order differs from run to run.
- Aligned by `id` instead, A and B hold the **same 10,644 mutants** with the
  same file, mutator, replacement and full start-and-end location. One status
  differs.

So a comparison must key on something, never on position. Anyone repeating
this measurement from `mutants[i]` gets a confident, wrong answer.

## The control: identical trees

**Aligned by id**, A against each other report:

| Against | Same identity | Status flips |
| --- | --- | --- |
| B `35074303919` | 10,644 / 10,644 | `head-cap.ts:128:34` `i -= 1`, `Survived→Timeout` |
| `35200581455` | 10,644 / 10,644 | none |
| `35323165911` | 10,644 / 10,644 | none |
| `35430813371` | 10,644 / 10,644 | `head-cap.ts:247:37` `j -= 1`, `Timeout→Survived` |
| C `35499820231` | 10,644 / 10,644 | none |
| `35580168633` | 10,644 / 10,644 | none |

"Identity" is file + mutator + replacement + start and end line and column. It
has **zero** collisions within a run, so it is a true identity on one tree.

**Matched by content key**, as a multiset:

| Pair | Older | Newer | Matched | Older only | Newer only |
| --- | --- | --- | --- | --- | --- |
| A vs `35200581455` | 3,713 | 3,713 | **3,713** | 0 | 0 |
| A vs C | 3,713 | 3,713 | **3,713** | 0 | 0 |
| A vs B | 3,713 | 3,712 | 3,712 | 1 | 0 |

The one unmatched survivor in A vs B is the `head-cap.ts:128` status flip that
id alignment found independently. It is a real status difference, not a key
failure. **Every survivor present in both runs was matched**, which is the 100%
the brief asks for before any cross-tree number is read.

**Changed-file versus unchanged-file split.** The brief asks for unmatched
survivors split by whether their file changed. Here the split is degenerate:
**no mutated file changed**, so every file is unchanged, and the only unmatched
survivor is the status flip above.

## Collisions

A **collision** is two survivors in one run with the same key. Counted in A; C
gives identical numbers.

| Key | Distinct keys | Keys shared | Survivors sharing a key |
| --- | --- | --- | --- |
| **Base**: file + mutator + original + replacement | 3,334 | 247 | **626** (16.9%) |
| Base, whitespace runs collapsed to one space | 3,333 | 247 | 627 |
| **Refinement**: base + the full source line(s) the mutant spans | 3,630 | 77 | **160** (4.3%) |
| Contrast: file + mutator + replacement + start line and column | 3,638 | 61 | 136 |
| `id` | 3,713 | 0 | 0 |

- **The colliding mutators** are mostly `StringLiteral` (293 survivors),
  `ConditionalExpression` (116), `EqualityOperator` and `ArrayDeclaration` (47
  each).
- **The refinement's residue cannot be keyed away by content.** It is lines
  that are textually identical: `'cover'` at `enrich.ts:228` and `:234`, and
  `typeof value === 'number'` at `frontmatter.ts:273`, `:280` and `:302`.
- **A start position alone does not identify a mutant either** — 136 survivors
  share one. Adding the end position is what brings the identity above to zero.
- **Per scope, base key:** `packages/core/src` 86 of 354, `adapters` 20 of 121,
  `covers` 29 of 186, `import` 21 of 87, `metadata` 58 of 364, `shelf` 149 of
  927, `cli` 9 of 37, `scripts` 254 of 1,637.

**Why collisions do not break the diff.** Matching is by count per key, so two
survivors sharing a key in both runs match as two. A survivor killed in the
newer run shows as one *older only* on that key, which is the correct count.
The one thing lost is *which line* it was, among the lines sharing the key.

## Multi-line originals

**303** of A's 3,713 survivors span more than one line, which confirms the
triage count. By mutator: `BlockStatement` 222, `MethodExpression` 29,
`ConditionalExpression` 15, `ObjectLiteral` 14, then 23 more across five
mutators. The longest original is **3,787 characters**. Four replacements also
span lines.

**The rule chosen: the original is kept verbatim, newlines included.**

- **Line endings are safe.** No mutated file's `source` contains a `\r`, so a
  split on `\n` is exact.
- **Normalising whitespace changes almost nothing.** It moved collisions from
  626 to 627 and changed no match count. Verbatim is the simpler rule.
- **The cost is on the cross-tree side, and it is unmeasured.** A
  `BlockStatement` survivor's original is the whole block, so any edit inside
  that function unmatches it. That is arguably a real change. But it means one
  edit in a large function can read as *one survivor gone, one survivor new*.
- **A stored record may hash the original** rather than carry 3,787 characters
  of it. The hash keys exactly as the text does.

## Canaries

Each ran through the identical code path as the measurement.

- **Collision counter.** Duplicating one survivor that had a unique key moved
  collisions from 247 keys / 626 survivors to **248 / 628**. Plus one and plus
  two, as it must.
- **Diff counter.** Dropping one survivor from a copy of A gave matched 3,712,
  older only **1**.
- **A synthetic line move.** Prepending one line to every mutated file and
  shifting every location down by one gave: base key **3,713 of 3,713**,
  refinement 3,713, location key **201**. The content key survives a pure line
  move by construction, and the location key does not.

⚠️ **The synthetic line move is not the cross-tree measurement.** It shows the
key ignores position. It cannot show what Stryker generates after a real edit.
That still needs a real pair.

## Sizes, re-measured

Measured on A. "gzip" is Node's `zlib.gzipSync` at the default level.

| File | Raw bytes | gzip bytes |
| --- | --- | --- |
| `mutation.json` | 6,257,368 (5.97 MiB) | 927,668 (906 KiB) |
| `mutation.html` | 6,493,267 (6.19 MiB) | 1,002,470 (979 KiB) |
| Stripped, triage's field set: file, mutator, replacement, `location`, status, original | 981,459 (958 KiB) | 92,825 (90.6 KiB) |
| Stripped, key form: file, scope, mutator, original, replacement, start line, status | 837,396 (818 KiB) | **74,495 (72.7 KiB)** |

⚠️ **The triage comment's raw sizes mix units.** Its *6.11 MiB* and *6.34 MiB*
are these byte counts divided by 1,024 × 1,000. Its gzip figures are correct
KiB. Neither changes a conclusion.

**A year of the key form** is at most 25.9 MiB, before git finds any similarity
between nights. On an unchanged tree consecutive nights differ by zero or one
survivor, so a sorted record deltas to almost nothing. A year of full gzipped
JSON would be about 323 MiB.

## What is still unmeasured, and its deadline

**The cross-tree numbers** — matched, older only, newer only, split by changed
and unchanged files — for the base key and the refinement. They need the
nightly after the first merge to `main` that changes a mutated `.ts` file,
paired with a `c52cc9f0` report.

⚠️ `35499820231` expires **2026-10-20** and `35580168633` **2026-10-21**. The
`34385b52` control set expires between **2026-10-15** and **2026-10-19**. A
`.ts` change that lands before then gives a pair against a tree measured here.

## Commands

Run from the repository root in PowerShell. `$d` is a scratch directory outside
the repository. The two scripts are reproduced in full below; they import the
repository's own `assignFiles` and `survivorsOf` from
`scripts/lib/mutation-score.ts` rather than re-deriving them, and the script
asserts its survivor count against `survivorsOf`'s (3,713 / 3,712 / 3,713 on
both sides).

```powershell
gh run list --workflow metrics.yml --limit 15 --json databaseId,headSha,createdAt,conclusion,event
gh api "repos/mephistopheles4/stacks/actions/artifacts?per_page=50" --jq '.artifacts[] | [.name, .workflow_run.id, .workflow_run.head_sha[0:8], .expires_at, .expired] | @tsv'
foreach ($r in '34947998738','35074303919','35200581455','35323165911','35430813371','35499820231','35580168633') { gh run download $r -n "mutation-report-$r" -D "$d\r$r" }
foreach ($r in '34947998738','35074303919','35499820231') { gh run view $r --json headSha,createdAt,event,conclusion }
git diff --name-only 34385b52 c52cc9f0
git diff 34385b52 c52cc9f0 -- package.json packages/site/package.json
pnpm exec tsx "$d\survivor-key.mts" "$d\r34947998738\mutation.json" "$d\r35074303919\mutation.json" "$d\r35499820231\mutation.json"
pnpm exec tsx "$d\survivor-key.mts" "$d\r34947998738\mutation.json" "$d\r35200581455\mutation.json" "$d\r35499820231\mutation.json"
$all = '34947998738','35074303919','35200581455','35323165911','35430813371','35499820231','35580168633' | ForEach-Object { "$d\r$_\mutation.json" }
pnpm exec tsx "$d\id-align.mts" @all
```

⚠️ **`survivor-key.mts`'s `positional*` output is the trap described above.**
It is kept in the script so the 997 can be reproduced. It is not a result.

### `survivor-key.mts`

```ts
// #344: can a content key diff the survivor sets of two nightly reports?
// Run from the repository root:  pnpm exec tsx <scratchpad>/survivor-key.mts <A.json> <B.json> <C.json>
// A and B: same head commit (the control). C: the later commit.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// The repository's own scope assignment and survivor listing, imported rather than re-derived.
const lib = await import(pathToFileURL(join(process.cwd(), 'scripts/lib/mutation-score.ts')).href);

interface Loc { line: number; column: number }
interface Mutant {
  id: string; mutatorName: string; replacement?: string; status: string;
  location: { start: Loc; end: Loc }; statusReason?: string;
}
interface Report { files: Record<string, { source: string; mutants: Mutant[] }>; testFiles?: Record<string, { source?: string }> }

const [pathA, pathB, pathC] = process.argv.slice(2);
if (pathC === undefined) throw new Error('usage: survivor-key.ts A.json B.json C.json');
const load = (p: string): Report => JSON.parse(readFileSync(p, 'utf8')) as Report;
const A = load(pathA), B = load(pathB), C = load(pathC);
const scopes = lib.readScopes();

// ---- slicing the original text: 1-based line, 1-based column, end exclusive
function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}
function original(src: string, starts: number[], m: Mutant): string {
  const s = starts[m.location.start.line - 1] + m.location.start.column - 1;
  const e = starts[m.location.end.line - 1] + m.location.end.column - 1;
  return src.slice(s, e);
}
function enclosingLines(src: string, starts: number[], m: Mutant): string {
  const s = starts[m.location.start.line - 1];
  const e = m.location.end.line < starts.length ? starts[m.location.end.line] : src.length;
  return src.slice(s, e).trim();
}

// ---- the survivor definition the job summary uses (`surviving` in mutation-score.ts)
const isSurvivor = (m: Mutant): boolean => m.status === 'Survived' || m.status === 'NoCoverage';

interface Survivor { file: string; scope: string; mutant: Mutant; original: string; context: string }
function survivors(r: Report): Survivor[] {
  const out: Survivor[] = [];
  const assigned = lib.assignFiles(r as unknown as Parameters<typeof lib.assignFiles>[0], scopes);
  for (const [scope, files] of assigned.byScope) {
    for (const [file] of files) {
      const { source, mutants } = r.files[file];
      const starts = lineStarts(source);
      for (const m of mutants) if (isSurvivor(m)) {
        out.push({ file, scope, mutant: m, original: original(source, starts, m), context: enclosingLines(source, starts, m) });
      }
    }
  }
  return out;
}

type KeyFn = (s: Survivor) => string;
const SEP = ' ';
const keys: Record<string, KeyFn> = {
  base: (s) => [s.file, s.mutant.mutatorName, s.original, s.mutant.replacement ?? ''].join(SEP),
  baseWsNormalised: (s) => [s.file, s.mutant.mutatorName, s.original.replace(/\s+/g, ' '), (s.mutant.replacement ?? '').replace(/\s+/g, ' ')].join(SEP),
  refinedEnclosingLines: (s) => [s.file, s.mutant.mutatorName, s.original, s.mutant.replacement ?? '', s.context].join(SEP),
  // contrast only: a location key, which a line move must break
  location: (s) => [s.file, s.mutant.mutatorName, s.mutant.replacement ?? '', s.mutant.location.start.line, s.mutant.location.start.column].join(SEP),
  id: (s) => s.mutant.id,
};

function multiset(list: Survivor[], key: KeyFn): Map<string, Survivor[]> {
  const m = new Map<string, Survivor[]>();
  for (const s of list) { const k = key(s); const v = m.get(k); if (v) v.push(s); else m.set(k, [s]); }
  return m;
}
function collisions(list: Survivor[], key: KeyFn) {
  const m = multiset(list, key);
  let collidedKeys = 0, collidedSurvivors = 0;
  for (const v of m.values()) if (v.length > 1) { collidedKeys++; collidedSurvivors += v.length; }
  return { survivors: list.length, distinctKeys: m.size, collidedKeys, collidedSurvivors };
}
function diff(older: Survivor[], newer: Survivor[], key: KeyFn) {
  const a = multiset(older, key), b = multiset(newer, key);
  let matched = 0, olderOnly = 0, newerOnly = 0;
  for (const [k, v] of a) { const n = b.get(k)?.length ?? 0; matched += Math.min(v.length, n); olderOnly += Math.max(0, v.length - n); }
  for (const [k, v] of b) newerOnly += Math.max(0, v.length - (a.get(k)?.length ?? 0));
  return { older: older.length, newer: newer.length, matched, olderOnly, newerOnly };
}

const out: Record<string, unknown> = {};

// ---- 0. are the trees identical as the reports see them?
const sameSources = (x: Report, y: Report) => {
  const fx = Object.keys(x.files), fy = Object.keys(y.files);
  const differing = fx.filter((f) => y.files[f]?.source !== x.files[f].source);
  const tx = Object.keys(x.testFiles ?? {}), ty = Object.keys(y.testFiles ?? {});
  const testDiffering = tx.filter((f) => y.testFiles?.[f]?.source !== x.testFiles?.[f]?.source);
  return { files: [fx.length, fy.length], sourceDiffering: differing, testFiles: [tx.length, ty.length], testSourceDiffering: testDiffering };
};
out.sourcesAB = sameSources(A, B);
out.sourcesAC = sameSources(A, C);
out.crlfInSources = Object.values(A.files).filter((f) => f.source.includes('\r')).length;

// ---- 1. identical-tree nondeterminism, aligned by position
function positional(x: Report, y: Report) {
  const flips = new Map<string, number>();
  let mutants = 0, idDiff = 0, locDiff = 0, mutDiff = 0, replDiff = 0, reasonDiff = 0, countMismatch = 0;
  const flipped: string[] = [];
  for (const [f, fx] of Object.entries(x.files)) {
    const fy = y.files[f];
    if (fy === undefined || fy.mutants.length !== fx.mutants.length) { countMismatch++; continue; }
    fx.mutants.forEach((m, i) => {
      const n = fy.mutants[i]; mutants++;
      if (m.id !== n.id) idDiff++;
      if (JSON.stringify(m.location) !== JSON.stringify(n.location)) locDiff++;
      if (m.mutatorName !== n.mutatorName) mutDiff++;
      if (m.replacement !== n.replacement) replDiff++;
      if (m.statusReason !== n.statusReason) reasonDiff++;
      if (m.status !== n.status) {
        const t = `${m.status}->${n.status}`; flips.set(t, (flips.get(t) ?? 0) + 1);
        flipped.push(`${f}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName} ${t}`);
      }
    });
  }
  return { mutants, countMismatch, idDiff, locDiff, mutDiff, replDiff, reasonDiff, statusFlips: Object.fromEntries(flips), flipped };
}
out.positionalAB = positional(A, B);
out.positionalAC = positional(A, C);
out.positionalBC = positional(B, C);

const sA = survivors(A), sB = survivors(B), sC = survivors(C);

// guard: my survivor predicate must agree with the library's survivorsOf
const libCount = (r: Report) => [...lib.survivorsOf(r as never, scopes, Number.MAX_SAFE_INTEGER).values()].flat().reduce((n, f) => n + f.mutants.length, 0);
out.survivorCountGuard = { mine: [sA.length, sB.length, sC.length], library: [libCount(A), libCount(B), libCount(C)] };

// ---- 2. collisions per key, per report
out.collisions = Object.fromEntries(Object.entries(keys).map(([name, k]) => [name, { A: collisions(sA, k), C: collisions(sC, k) }]));
// per scope, base key
out.collisionsPerScopeBase = Object.fromEntries(scopes.map((sc) => [sc.name, collisions(sA.filter((s) => s.scope === sc.name), keys.base)]));
// what collides, base key: by mutator
{
  const m = multiset(sA, keys.base); const byMutator = new Map<string, number>();
  for (const v of m.values()) if (v.length > 1) byMutator.set(v[0].mutant.mutatorName, (byMutator.get(v[0].mutant.mutatorName) ?? 0) + v.length);
  out.collidedByMutatorBase = Object.fromEntries([...byMutator].sort((a, b) => b[1] - a[1]));
  const m2 = multiset(sA, keys.refinedEnclosingLines);
  out.refinedStillColliding = [...m2.values()].filter((v) => v.length > 1).slice(0, 5).map((v) => `${v.length}x ${v[0].file}:${v.map((s) => s.mutant.location.start.line).join(',')} ${v[0].mutant.mutatorName} ${JSON.stringify(v[0].original.slice(0, 60))}`);
}

// ---- 3. multi-line originals
{
  const multi = sA.filter((s) => s.mutant.location.start.line !== s.mutant.location.end.line);
  out.multiLine = {
    count: multi.length,
    withReplacementMultiline: multi.filter((s) => (s.mutant.replacement ?? '').includes('\n')).length,
    byMutator: Object.fromEntries([...multi.reduce((m, s) => m.set(s.mutant.mutatorName, (m.get(s.mutant.mutatorName) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])),
    maxOriginalChars: Math.max(...multi.map((s) => s.original.length)),
  };
}

// ---- 4. three-way diffs
out.diffs = Object.fromEntries(Object.entries(keys).map(([name, k]) => [name, { AB: diff(sA, sB, k), AC: diff(sA, sC, k), BC: diff(sB, sC, k) }]));

// ---- canaries through the identical code path
{
  const unique = multiset(sA, keys.base); const lone = [...unique.values()].find((v) => v.length === 1)![0];
  const dup = [...sA, lone];
  out.canaryCollision = { before: collisions(sA, keys.base), afterDuplicatingOne: collisions(dup, keys.base) };
  out.canaryDiffDrop = diff(sA, sA.filter((s) => s !== lone), keys.base);
  // synthetic line move: prepend one line to every file, shift every location down by one
  const shifted: Report = { files: Object.fromEntries(Object.entries(A.files).map(([f, e]) => [f, {
    source: '// planted\n' + e.source,
    mutants: e.mutants.map((m) => ({ ...m, location: { start: { ...m.location.start, line: m.location.start.line + 1 }, end: { ...m.location.end, line: m.location.end.line + 1 } } })),
  }])) };
  const sS = survivors(shifted);
  out.canaryLineMove = Object.fromEntries(['base', 'refinedEnclosingLines', 'location'].map((n) => [n, diff(sA, sS, keys[n])]));
  // synthetic real change: edit the original text of one survivor's first char region -> must be unmatched
}

// ---- 5. sizes
{
  const bytes = (p: string) => readFileSync(p).length;
  const gz = (b: Buffer | string) => gzipSync(b).length;
  const stripped = (list: Survivor[]) => JSON.stringify(list.map((s) => ({ file: s.file, mutatorName: s.mutant.mutatorName, replacement: s.mutant.replacement, location: s.mutant.location, status: s.mutant.status, original: s.original })));
  const strippedKeyed = (list: Survivor[]) => JSON.stringify(list.map((s) => ({ file: s.file, scope: s.scope, mutatorName: s.mutant.mutatorName, original: s.original, replacement: s.mutant.replacement, line: s.mutant.location.start.line, status: s.mutant.status })));
  const html = pathA.replace(/mutation\.json$/, 'mutation.html');
  out.sizes = {
    json: { raw: bytes(pathA), gzip: gz(readFileSync(pathA)) },
    html: { raw: bytes(html), gzip: gz(readFileSync(html)) },
    strippedLikeTriage: { raw: Buffer.byteLength(stripped(sA)), gzip: gz(stripped(sA)) },
    mutants: Object.values(A.files).reduce((n, f) => n + f.mutants.length, 0),
    files: Object.keys(A.files).length,
    survived: sA.filter((s) => s.mutant.status === 'Survived').length,
    noCoverage: sA.filter((s) => s.mutant.status === 'NoCoverage').length,
    strippedWithScope: { raw: Buffer.byteLength(strippedKeyed(sA)), gzip: gz(strippedKeyed(sA)) },
  };
}

console.log(JSON.stringify(out, null, 2));
```

### `id-align.mts`

```ts
// #344, part two: align mutants by id instead of by array position, and look at
// what identifies a mutant exactly. Usage: tsx id-align.mts A.json B.json [C.json ...]
import { readFileSync } from 'node:fs';

interface Loc { line: number; column: number }
interface Mutant { id: string; mutatorName: string; replacement?: string; status: string; location: { start: Loc; end: Loc } }
interface Report { files: Record<string, { source: string; mutants: Mutant[] }> }
const load = (p: string): Report => JSON.parse(readFileSync(p, 'utf8')) as Report;
const paths = process.argv.slice(2);
const reports = paths.map(load);

const identity = (f: string, m: Mutant) =>
  [f, m.mutatorName, m.replacement ?? '', m.location.start.line, m.location.start.column, m.location.end.line, m.location.end.column].join(' ');

function byId(r: Report) {
  const map = new Map<string, { file: string; m: Mutant }>();
  for (const [file, e] of Object.entries(r.files)) for (const m of e.mutants) map.set(m.id, { file, m });
  return map;
}

const out: Record<string, unknown> = {};
const base = byId(reports[0]);
// exact identity is unique within a run?
{
  const seen = new Map<string, number>();
  for (const [file, e] of Object.entries(reports[0].files)) for (const m of e.mutants) seen.set(identity(file, m), (seen.get(identity(file, m)) ?? 0) + 1);
  out.identityCollisionsInA = [...seen.values()].filter((n) => n > 1).length;
  // does array order within a file follow id order?
  let unsortedFiles = 0;
  for (const e of Object.values(reports[0].files)) {
    const ids = e.mutants.map((m) => Number(m.id));
    if (ids.some((v, i) => i > 0 && v < ids[i - 1])) unsortedFiles++;
  }
  out.filesWhoseArrayIsNotInIdOrder = unsortedFiles;
}
reports.slice(1).forEach((r, i) => {
  const other = byId(r);
  let sameIdentity = 0, differentIdentity = 0, missing = 0;
  const flips = new Map<string, number>();
  const flipped: string[] = [];
  for (const [id, { file, m }] of base) {
    const o = other.get(id);
    if (o === undefined) { missing++; continue; }
    if (identity(file, m) === identity(o.file, o.m)) sameIdentity++; else differentIdentity++;
    if (m.status !== o.m.status) {
      const t = `${m.status}->${o.m.status}`;
      flips.set(t, (flips.get(t) ?? 0) + 1);
      flipped.push(`${file}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName} ${JSON.stringify(m.replacement)} ${t}`);
    }
  }
  out[`${paths[0]} vs ${paths[i + 1]}`] = { ids: base.size, sameIdentity, differentIdentity, missing, statusFlips: Object.fromEntries(flips), flipped };
});
console.log(JSON.stringify(out, null, 2));
```
