# The content key holds across a real edit

**2026-09-22** — [#344](https://github.com/mephistopheles4/stacks/issues/344),
the half [the previous entry](./2026-09-21-the-survivor-set-diffs-cleanly.md)
left owed: diff the survivor sets of two nightly reports whose trees differ in
mutated files, and count what the content key gets wrong.

## The answer first

- **The key made no mistakes on a real edit.** Between `c52cc9f0` and
  `60ba2696`, five mutated files changed. The base key matched **3,682**
  survivors and left **0** unmatched in the 69 files that did not change.
- **Every unmatched survivor has a cause that is not the key.** All 48 sit in
  the five changed files. 27 went `Killed`, and the same range added tests.
  The other 21 are text that an edit removed or added.
- **The refinement bought nothing here.** Adding the enclosing line(s) gave the
  identical counts, 3,682 / 31 / 17.
- **A position key would have failed badly.** Keyed on start and end location,
  only 3,155 matched, and 558 survivors read as gone, all of them in the changed
  files. The content key survives lines moving, and a location key does not.
- ⚠️ **Collisions misplace the line, as predicted.** Two unmatched survivors
  are reported on a line nobody touched. Both are one more copy of a string that
  already survived elsewhere in the file, and the new copy is inside a diff hunk.
  The count is right; the line the matcher names is not.

## The reports

| | Run | Event | Head commit | Mutants | Survivors |
| --- | --- | --- | --- | --- | --- |
| **Older** | `35580168633` | `schedule`, 2026-09-21 | `c52cc9f0` | 10,644 | 3,713 |
| older, second copy | `35499820231` | `schedule`, 2026-09-20 | `c52cc9f0` | 10,644 | 3,713 |
| **Newer** | `35797533269` | `workflow_dispatch`, 2026-09-22 | `60ba2696` | 10,710 | 3,699 |

"Survivors" is `Survived` plus `NoCoverage`, the job summary's definition. The
script's own count agrees with `survivorsOf` in `scripts/lib/mutation-score.ts`
on every report.

**Why a dispatched run, not a nightly.** The 2026-09-22 nightly (`35705057619`,
head `3b702f30`) died in Stryker's dry run after 13 seconds and uploaded no
report. [#364](https://github.com/mephistopheles4/stacks/pull/364) fixed that
cause, but merged five hours after the run. The maintainer chose to dispatch
`metrics.yml` on `main` rather than wait a night. A dispatch runs the same
`nightly` job on the same runner image (the job's condition is
`github.event_name != 'push'`), so this is the nightly's environment, not the
local run the brief forbids. It also wrote one extra record to the `metrics`
branch, which the workflow supports by design.

**What changed between the trees.** The source change is in five mutated files,
all in the `scripts` scope:

| File | Lines changed | Survivors, older → newer |
| --- | --- | --- |
| `scripts/lib/cognitive.ts` | 22 | 38 → 42 |
| `scripts/lib/complexity.ts` | 41 | 47 → 49 |
| `scripts/lib/duplication.ts` | 102 | 123 → 126 |
| `scripts/lib/floors.ts` | 58 | 319 → 295 |
| `scripts/lib/github-post.ts` | 23 | 41 → 42 |

Seven test files also changed, adding 431 lines. The only dependency change is
`github-slugger` 2.0.0, a new dev dependency used by a gate. `stryker.config.mjs`,
`stryker.scopes.json`, the Vitest configs, Stryker and Vitest did not change.

The script reads the changed set two ways: files whose `source` differs between
the reports, and `git diff --name-only` restricted to mutated files. **The two
agree exactly**, five files each.

## The control, repeated through the new script

The cross-tree numbers use a new script, so it had to pass the control first.

| Pair | Tree | Matched | Older only | Newer only |
| --- | --- | --- | --- | --- |
| `35499820231` vs `35580168633` | both `c52cc9f0` | **3,713 of 3,713** | 0 | 0 |
| `34947998738` vs `35580168633` | `34385b52` vs `c52cc9f0`, no mutated file differs | **3,713 of 3,713** | 0 | 0 |

**Canary, through the identical pipeline.** `plant.mts` copies
`35580168633`, prepends a line to one file (`packages/cli/src/enrich-report.ts`)
and shifts all its mutants down, then flips one `Survived` mutant to `Killed`
in a different file (`obsidian-adapter.ts:75`). Expected: one changed file, one
older-only survivor in an unchanged file. Measured:

| Key | Matched | Older only | Newer only |
| --- | --- | --- | --- |
| Base | 3,712 | 1, in an unchanged file | 0 |
| Refinement | 3,712 | 1, in an unchanged file | 0 |
| Position (contrast) | 3,677 | 36 | 35 |

So the script finds a planted key failure where it is, and does not invent one
from a line move.

## The cross-tree result

Older `35580168633` against newer `35797533269`. Running against the second
older copy, `35499820231`, gives **identical numbers** on every line.

| Key | Matched | Older only (changed / unchanged files) | Newer only (changed / unchanged files) |
| --- | --- | --- | --- |
| **Base**: file + mutator + original + replacement | **3,682** | 31 (31 / **0**) | 17 (17 / **0**) |
| **Refinement**: base + enclosing line(s) | 3,682 | 31 (31 / 0) | 17 (17 / 0) |
| Position (contrast) | 3,155 | 558 (558 / 0) | 544 (544 / 0) |

**Unmatched in an unchanged file: zero, for both keys.** That is the number the
brief called a key failure.

The head-cap noise from the previous entry did not appear. Its one or two
`Survived`↔`Timeout` flips on `head-cap.ts` are absent from this pair, so a
future pair can show them again.

### Why each unmatched survivor is unmatched

`classify.mts` looks each unmatched survivor's key up among **all** mutants of
the other report, not only the survivors. It also checks whether the survivor's
lines fall inside a `git diff -U0` hunk.

**Older only, 31:**

| Cause | Count | Where |
| --- | --- | --- |
| Same key, now `Killed`; the line was not edited | 27 | `floors.ts` 22, `duplication.ts` 3, `complexity.ts` 2 |
| Text removed by the edit; inside a hunk | 4 | `floors.ts:206` twice, `:364`, `:365` |

The 27 are real status changes. The same five files' specs gained 329 lines,
and `floors.test.ts` alone gained 65. A new test killing an old survivor on an
untouched line is exactly the "improvement" a durable record should show.

**Newer only, 17:**

| Cause | Count |
| --- | --- |
| New text, inside a hunk | 15 |
| One more copy of a string that already survived, reported outside the hunk | 2 |

The two in the second row are the collision cost, measured:

- **`floors.ts`, `', '` → `""`.** It survives 3 times in the older file (lines
  1765, 1777, 1789) and 4 times in the newer (227, 1805, 1817, 1829). The new
  copy is line 227, inside a hunk. The matcher reports the surplus as line
  1829, the same unchanged line that was 1789 before.
- **`github-post.ts`, `''` → `"Stryker was here!"`.** It survives twice in the
  older file and three times in the newer. The new copy is line 162, inside the
  hunk at 143–164; the matcher reports line 424.

So the counts per key are exact, and the reported line is one of the lines that
share the key, not necessarily the new one. Whether the refinement names the
right line in these two cases was not measured. Its totals are the same.

### Collisions and multi-line originals, on the newer report

| Key | Survivors sharing a key, older | Newer |
| --- | --- | --- |
| Base | 626 of 3,713 | 609 of 3,699 |
| Refinement | 160 | 140 |
| Position | 0 | 0 |

Multi-line survivors: 303 older, 300 newer. **Three of the 48 unmatched
survivors are multi-line**, all `BlockStatement`: `complexity.ts:166`,
`duplication.ts:754` and `floors.ts:180`, each spanning three lines. All three
are status changes to `Killed`, not text changes. The multi-line rule
from the previous entry, *keep the original verbatim*, cost nothing here.

## Sizes of the newer report

| File | Raw bytes | gzip bytes |
| --- | --- | --- |
| `mutation.json` | 6,317,400 | 938,479 |
| `mutation.html` | 6,553,296 | 1,013,036 |

Both are within 1.2% of the older report's, so the storage estimates in the
previous entry stand.

## What this changes

**The recommendation posted on #344 stands, and now rests on a cross-tree
measurement.** The base content key, matched as a multiset, is the key to use.
The refinement is still optional. It changed no count here, and its only use
is naming the right line for a collision.

What a reader of a survivor diff should expect, measured:

- **Unmatched survivors in unchanged files: up to two, all noise.** That is the
  identical-tree flip rate from the previous entry, and zero on this pair.
- **In changed files, older-only means killed or deleted, and newer-only means
  new text or newly surviving.** Both are real.
- **The line named for a colliding key can be the wrong copy.**

⚠️ **One pair, one scope.** Every change here is in `scripts`. A pair that edits
a large `BlockStatement` in `packages/core` or `shelf` would test the multi-line
cost the previous entry flagged, which this pair touched only three times.

## Commands

Run from the repository root in PowerShell. `$d` is a scratch directory outside
the repository.

```powershell
gh run list --workflow metrics --limit 12 --json databaseId,headSha,createdAt,conclusion,event
gh run view 35705057619 --log | Select-String -Pattern 'ERROR|Error:'
gh workflow run metrics --ref main
gh run watch 35797533269 --interval 60 --exit-status
foreach ($r in '35499820231','35580168633','34947998738','35797533269') { gh run download $r -n "mutation-report-$r" -D "$d\r$r" }
git diff --name-only 34385b52 c52cc9f0 | Set-Content "$d\changed-control.txt"
git diff --name-only c52cc9f0 60ba2696 | Set-Content "$d\changed-cross.txt"
git diff -U0 c52cc9f0 60ba2696 -- scripts/lib/cognitive.ts scripts/lib/complexity.ts scripts/lib/duplication.ts scripts/lib/floors.ts scripts/lib/github-post.ts | Set-Content "$d\cross-U0.diff"
pnpm exec tsx "$d\cross-tree.mts" "$d\r35499820231\mutation.json" "$d\r35580168633\mutation.json" "$d\changed-control.txt"
pnpm exec tsx "$d\cross-tree.mts" "$d\r34947998738\mutation.json" "$d\r35580168633\mutation.json" "$d\changed-control.txt"
pnpm exec tsx "$d\plant.mts" "$d\r35580168633\mutation.json" "$d\planted\mutation.json"
pnpm exec tsx "$d\cross-tree.mts" "$d\r35499820231\mutation.json" "$d\planted\mutation.json"
pnpm exec tsx "$d\cross-tree.mts" "$d\r35580168633\mutation.json" "$d\r35797533269\mutation.json" "$d\changed-cross.txt"
pnpm exec tsx "$d\cross-tree.mts" "$d\r35499820231\mutation.json" "$d\r35797533269\mutation.json" "$d\changed-cross.txt"
pnpm exec tsx "$d\classify.mts" "$d\r35580168633\mutation.json" "$d\r35797533269\mutation.json" "$d\cross-U0.diff"
pnpm mutation:stamp --check
```

The two collision rows were read by hand from both reports, listing every
`StringLiteral` mutant in `floors.ts` whose original is `', '` and every one in
`github-post.ts` whose original is `''`.

`cross-tree.mts` takes its scope assignment and its survivor count check from
`assignFiles` and `survivorsOf` in `scripts/lib/mutation-score.ts`. Its slicing
and key functions are `survivor-key.mts`'s from the previous entry, unchanged.

⚠️ **`classify.mts`'s "status now Killed" is read per key.** When a key collides,
it means *at least one mutant with this text is killed on the other side*, which
is how the `github-post.ts` row first read as a status change. Both collided
rows were checked by hand, above.

### `cross-tree.mts`

```ts
// #344, part four: the cross-tree diff. Matches the survivor sets of two reports
// by content key, as a multiset, and splits every unmatched survivor by whether
// its file changed between the two reports.
// Run from the repository root:
//   pnpm exec tsx <scratchpad>/cross-tree.mts <older.json> <newer.json> [<changed-files.txt>]
// changed-files.txt is `git diff --name-only <old> <new>` output. Without it, a
// file counts as changed when its `source` differs between the two reports; with
// it, both rules are applied and any disagreement between them is printed.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const lib = await import(pathToFileURL(join(process.cwd(), 'scripts/lib/mutation-score.ts')).href);

interface Loc { line: number; column: number }
interface Mutant { id: string; mutatorName: string; replacement?: string; status: string; location: { start: Loc; end: Loc } }
interface Report { files: Record<string, { source: string; mutants: Mutant[] }> }

const [olderPath, newerPath, changedPath] = process.argv.slice(2);
if (newerPath === undefined) throw new Error('usage: cross-tree.mts older.json newer.json [changed-files.txt]');
const load = (p: string): Report => JSON.parse(readFileSync(p, 'utf8')) as Report;
const O = load(olderPath), N = load(newerPath);
const scopes = lib.readScopes();

// ---- slicing: 1-based line, 1-based column, end exclusive (identical to survivor-key.mts)
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
const SEP = String.fromCharCode(0);
const keys: Record<string, KeyFn> = {
  base: (s) => [s.file, s.mutant.mutatorName, s.original, s.mutant.replacement ?? ''].join(SEP),
  refinedEnclosingLines: (s) => [s.file, s.mutant.mutatorName, s.original, s.mutant.replacement ?? '', s.context].join(SEP),
  // contrast only: exact identity including position, which any line move breaks
  identity: (s) => [s.file, s.mutant.mutatorName, s.mutant.replacement ?? '', s.mutant.location.start.line, s.mutant.location.start.column, s.mutant.location.end.line, s.mutant.location.end.column].join(SEP),
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

// ---- which files changed
const reportChanged = new Set<string>();
for (const f of new Set([...Object.keys(O.files), ...Object.keys(N.files)])) {
  if (O.files[f]?.source !== N.files[f]?.source) reportChanged.add(f);
}
let changed = reportChanged;
const out: Record<string, unknown> = {};
if (changedPath !== undefined) {
  const git = new Set(readFileSync(changedPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const mutated = new Set([...Object.keys(O.files), ...Object.keys(N.files)]);
  const gitMutated = new Set([...git].filter((f) => mutated.has(f)));
  out.changedFiles = {
    byReportSource: [...reportChanged].sort(),
    byGitAndMutated: [...gitMutated].sort(),
    inReportNotGit: [...reportChanged].filter((f) => !gitMutated.has(f)),
    inGitNotReport: [...gitMutated].filter((f) => !reportChanged.has(f)),
  };
  changed = new Set([...reportChanged, ...gitMutated]);
} else {
  out.changedFiles = { byReportSource: [...reportChanged].sort() };
}
out.filesOnlyOlder = Object.keys(O.files).filter((f) => !(f in N.files));
out.filesOnlyNewer = Object.keys(N.files).filter((f) => !(f in O.files));
out.mutants = {
  older: Object.values(O.files).reduce((n, f) => n + f.mutants.length, 0),
  newer: Object.values(N.files).reduce((n, f) => n + f.mutants.length, 0),
  olderInChanged: [...changed].reduce((n, f) => n + (O.files[f]?.mutants.length ?? 0), 0),
  newerInChanged: [...changed].reduce((n, f) => n + (N.files[f]?.mutants.length ?? 0), 0),
};

const sO = survivors(O), sN = survivors(N);
const libCount = (r: Report) => [...lib.survivorsOf(r as never, scopes, Number.MAX_SAFE_INTEGER).values()].flat().reduce((n, f) => n + f.mutants.length, 0);
out.survivorCountGuard = { mine: [sO.length, sN.length], library: [libCount(O), libCount(N)] };
out.survivorsInChanged = { older: sO.filter((s) => changed.has(s.file)).length, newer: sN.filter((s) => changed.has(s.file)).length };

const where = (s: Survivor) => `${s.file}:${s.mutant.location.start.line}:${s.mutant.location.start.column} ${s.mutant.mutatorName} ${s.mutant.status} ${JSON.stringify(s.original.slice(0, 50))} -> ${JSON.stringify((s.mutant.replacement ?? '').slice(0, 30))}`;

function diff(key: KeyFn, detail: boolean) {
  const a = multiset(sO, key), b = multiset(sN, key);
  let matched = 0;
  const olderOnly: Survivor[] = [], newerOnly: Survivor[] = [];
  for (const [k, v] of a) { const n = b.get(k)?.length ?? 0; matched += Math.min(v.length, n); if (v.length > n) olderOnly.push(...v.slice(n)); }
  for (const [k, v] of b) { const n = a.get(k)?.length ?? 0; if (v.length > n) newerOnly.push(...v.slice(n)); }
  const split = (list: Survivor[]) => ({ changedFile: list.filter((s) => changed.has(s.file)).length, unchangedFile: list.filter((s) => !changed.has(s.file)).length });
  const byScope = (list: Survivor[]) => Object.fromEntries([...list.reduce((m, s) => m.set(s.scope, (m.get(s.scope) ?? 0) + 1), new Map<string, number>())]);
  const byFile = (list: Survivor[]) => Object.fromEntries([...list.reduce((m, s) => m.set(s.file, (m.get(s.file) ?? 0) + 1), new Map<string, number>())].sort((x, y) => y[1] - x[1]));
  return {
    older: sO.length, newer: sN.length, matched,
    olderOnly: { total: olderOnly.length, ...split(olderOnly), byScope: byScope(olderOnly) },
    newerOnly: { total: newerOnly.length, ...split(newerOnly), byScope: byScope(newerOnly) },
    ...(detail ? {
      olderOnlyByFile: byFile(olderOnly),
      newerOnlyByFile: byFile(newerOnly),
      unchangedFileOlderOnly: olderOnly.filter((s) => !changed.has(s.file)).map(where),
      unchangedFileNewerOnly: newerOnly.filter((s) => !changed.has(s.file)).map(where),
    } : {}),
  };
}
out.diffs = Object.fromEntries(Object.entries(keys).map(([n, k]) => [n, diff(k, n !== 'identity')]));
out.collisions = Object.fromEntries(Object.entries(keys).map(([n, k]) => [n, { older: collisions(sO, k), newer: collisions(sN, k) }]));
out.multiLine = {
  older: sO.filter((s) => s.mutant.location.start.line !== s.mutant.location.end.line).length,
  newer: sN.filter((s) => s.mutant.location.start.line !== s.mutant.location.end.line).length,
};

// ---- per changed file, base key: how the edit moved its survivors
{
  const rows: Record<string, unknown> = {};
  for (const f of [...changed].sort()) {
    const o = sO.filter((s) => s.file === f), n = sN.filter((s) => s.file === f);
    const a = multiset(o, keys.base), b = multiset(n, keys.base);
    let matched = 0;
    for (const [k, v] of a) matched += Math.min(v.length, b.get(k)?.length ?? 0);
    rows[f] = { older: o.length, newer: n.length, matched, olderOnly: o.length - matched, newerOnly: n.length - matched };
  }
  out.perChangedFileBase = rows;
}

console.log(JSON.stringify(out, null, 2));
```

### `plant.mts`

```ts
// #344 canary: write a planted copy of a report. One file gets a line prepended
// (source changed, every location shifted by one), and one survivor in a
// DIFFERENT file is flipped to Killed. Expected through cross-tree.mts:
// changedFiles = [that one file], all its survivors matched, and exactly one
// older-only survivor in an unchanged file.
// Usage: tsx plant.mts in.json out.json
import { readFileSync, writeFileSync } from 'node:fs';

interface Loc { line: number; column: number }
interface Mutant { status: string; location: { start: Loc; end: Loc } }
interface Report { files: Record<string, { source: string; mutants: Mutant[] }> }

const [inPath, outPath] = process.argv.slice(2);
const r = JSON.parse(readFileSync(inPath, 'utf8')) as Report;
const files = Object.keys(r.files).sort();
const moved = files.find((f) => r.files[f].mutants.some((m) => m.status === 'Survived'))!;
const flippedIn = files.find((f) => f !== moved && r.files[f].mutants.some((m) => m.status === 'Survived'))!;
const e = r.files[moved];
e.source = '// planted\n' + e.source;
for (const m of e.mutants) { m.location.start.line += 1; m.location.end.line += 1; }
r.files[flippedIn].mutants.find((m) => m.status === 'Survived')!.status = 'Killed';
writeFileSync(outPath, JSON.stringify(r));
console.log(JSON.stringify({ moved, flippedIn }));
```

### `classify.mts`

```ts
// #344, part five: why is each unmatched survivor unmatched? For every survivor
// only one side has (base key, multiset), look the same key up among ALL mutants
// of the other report. Found with another status = the survivor's status moved
// (killed by a new test, or newly surviving). Not found = its text is gone or new,
// an edit. Also reports whether the survivor's line sits inside a diff hunk.
// Usage: tsx classify.mts older.json newer.json <git-diff-U0.txt>
import { readFileSync } from 'node:fs';

interface Loc { line: number; column: number }
interface Mutant { mutatorName: string; replacement?: string; status: string; location: { start: Loc; end: Loc } }
interface Report { files: Record<string, { source: string; mutants: Mutant[] }> }
const [oP, nP, diffP] = process.argv.slice(2);
const O = JSON.parse(readFileSync(oP, 'utf8')) as Report, N = JSON.parse(readFileSync(nP, 'utf8')) as Report;

// hunks: file -> { old: [start,end][], new: [start,end][] } from `git diff -U0`
const hunks = new Map<string, { old: [number, number][]; new: [number, number][] }>();
let cur = '';
for (const l of readFileSync(diffP, 'utf8').split(/\r?\n/)) {
  const f = /^\+\+\+ b\/(.*)$/.exec(l); if (f) { cur = f[1]; hunks.set(cur, { old: [], new: [] }); continue; }
  const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
  if (h && cur) {
    const oc = h[2] === undefined ? 1 : Number(h[2]), nc = h[4] === undefined ? 1 : Number(h[4]);
    hunks.get(cur)!.old.push([Number(h[1]), Number(h[1]) + Math.max(oc, 1) - 1]);
    hunks.get(cur)!.new.push([Number(h[3]), Number(h[3]) + Math.max(nc, 1) - 1]);
  }
}
const touches = (ranges: [number, number][] | undefined, s: number, e: number) => (ranges ?? []).some(([a, b]) => s <= b && e >= a);

const starts = (src: string) => { const r = [0]; for (let i = 0; i < src.length; i++) if (src[i] === '\n') r.push(i + 1); return r; };
const SEP = String.fromCharCode(0);
const isSurv = (m: Mutant) => m.status === 'Survived' || m.status === 'NoCoverage';
function all(r: Report) {
  const out: { file: string; key: string; m: Mutant }[] = [];
  for (const [file, e] of Object.entries(r.files)) {
    const st = starts(e.source);
    for (const m of e.mutants) {
      const orig = e.source.slice(st[m.location.start.line - 1] + m.location.start.column - 1, st[m.location.end.line - 1] + m.location.end.column - 1);
      out.push({ file, key: [file, m.mutatorName, orig, m.replacement ?? ''].join(SEP), m });
    }
  }
  return out;
}
const aO = all(O), aN = all(N);
function unmatched(mine: typeof aO, theirs: typeof aO) {
  const count = new Map<string, number>();
  for (const x of theirs) if (isSurv(x.m)) count.set(x.key, (count.get(x.key) ?? 0) + 1);
  const out: typeof aO = [];
  for (const x of mine) if (isSurv(x.m)) { const c = count.get(x.key) ?? 0; if (c > 0) count.set(x.key, c - 1); else out.push(x); }
  return out;
}
function classify(list: typeof aO, other: typeof aO, side: 'old' | 'new') {
  const byKey = new Map<string, string[]>();
  for (const x of other) { const v = byKey.get(x.key) ?? []; v.push(x.m.status); byKey.set(x.key, v); }
  const tally = new Map<string, number>();
  const rows = list.map((x) => {
    const st = byKey.get(x.key)?.filter((s) => s !== 'Survived' && s !== 'NoCoverage');
    const why = st && st.length > 0 ? `status now ${st.join('/')}` : 'text absent on other side';
    const inHunk = touches(hunks.get(x.file)?.[side], x.m.location.start.line, x.m.location.end.line);
    const t = `${why} | ${inHunk ? 'in a diff hunk' : 'outside every hunk'}`;
    tally.set(t, (tally.get(t) ?? 0) + 1);
    return `${x.file}:${x.m.location.start.line} ${x.m.mutatorName} ${x.m.status} -> ${t}`;
  });
  return { tally: Object.fromEntries(tally), rows };
}
console.log(JSON.stringify({
  olderOnly: classify(unmatched(aO, aN), aN, 'old'),
  newerOnly: classify(unmatched(aN, aO), aO, 'new'),
}, null, 2));
```
