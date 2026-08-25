/**
 * G40 — `gates.yml`'s pinning argument ↔ every `uses:` line under `.github/`.
 *
 * `.github/workflows/gates.yml` argues the case carefully — *"A tag is mutable:
 * whoever controls the action repository can repoint v7 at anything, and it
 * would run here with the workflow's token"* — and until this row **nothing
 * held the file to its own argument.** The alternative has a name: *a
 * preference with good documentation*.
 *
 * **The rule is stated over the pin and the comment together**, because the
 * bind is two-sided: it must not go red when Dependabot bumps both, and it must
 * not be satisfiable by deleting the comment. Clause 2 is what closes that —
 * **deleting the comment to satisfy clause 1 goes red.**
 *
 * ⚠️ **Clause 2 is a bet, recorded as a cost rather than left implicit.** It
 * pins the *shape* of Dependabot's comment; if Dependabot ever emits `# 7.0.1`
 * without the `v`, this gate goes red on a bot commit. Measured rather than
 * assumed against `93730e1` (`dependabot[bot]`, `# v6.0.9` → `# v6.0.10`): pin
 * and comment were rewritten together, both occurrences. Judged acceptable — a
 * one-character diff, and a gate that goes red on an unexpected format change
 * is behaving correctly.
 *
 * ⚠️ **`docker://` is not exempted, and that is a reversal to honour rather
 * than a gap.** This repo uses Docker for nothing, so the exempted population
 * is zero, and `docker://alpine:latest` is a mutable third-party reference —
 * precisely what the pinning argument is against. A pre-written rule over
 * `docker://image@sha256:…` was specified and declined: *an exemption that
 * arrives with a legitimate first instance gets argued about; one written into
 * the spec before any instance exists never does.*
 *
 * ## What this gate cannot check — the limit, written here and beside the row
 *
 * It proves every third-party action is referenced by something **shaped like**
 * an immutable ref, and that every one carries a human-readable version claim.
 * **It cannot prove the version claim is true.** That `3d3c42e…` really is
 * `v7.0.1` of `actions/checkout` is a fact living at GitHub, and G21 forbids
 * the whole suite from asking. **Actions have no lockfile**, so there is no
 * offline route either; the limit is structural. A hand-edit swapping in a
 * *different valid SHA* under `# v7.0.1` **passes cleanly** — which is
 * `cover_source`'s failure verbatim: *swapping the bytes under a note that
 * still says `apple-books` is the one way this key can state something false,
 * and it is the only failure here nothing would notice.*
 *
 * Duplicated on purpose in `docs/gates.md` beside row G40. G19 does not read
 * spec comments, so a limit recorded only here is a limit only a reader of this
 * file finds; the reverse is also true, which is why both.
 *
 * ## The `audit` job's teeth — row G42 (`dependency-audit`) lives here too
 *
 * G42 names a **mechanism** rather than a `gates/*.test.ts`, and promoting a
 * claim into the table G19 reads is *visibility*, not *enforcement*:
 * `specPathsNamed()` only existence-checks `.ts` paths, so as first written G42
 * was **a row nothing can fail on** — delete the `audit` job and its `needs:`
 * entry and the ✅ still stands. Closed inside this sweep's existing read of
 * `gates.yml` at no new cost. See docs/spec/supply-chain.md §3.
 *
 * **Population, measured — not remembered.** 13 `uses:` lines across two
 * workflow files at `3e2fc88` (2026-08-20): 7 in `gates.yml`, 6 in
 * `metrics.yml`. The floor is **4**, this repo's own ratio — `gates/commands.test.ts`
 * floors at 4 against seven CLI subcommands — and a **loose anti-vacuity bound,
 * not a deletion tripwire.** No `expectFound` in this repo has ever caught a
 * deletion. What goes red when the `audit` job disappears is the clause below
 * that names it.
 *
 * See docs/gates.md, rows G40 (action-pins) and G42 (dependency-audit), and
 * docs/spec/supply-chain.md §§2-3, 5.
 */

import { describe, expect, it } from 'vitest';
import { expectFound, readRepoFile, sectionsOf, trackedFiles } from './repo.ts';

/**
 * The workflow that defines the required check.
 *
 * Named as one path rather than swept for, and the limit is stated rather than
 * implied: `gates` is a single required status check defined in a single file,
 * so a second file declaring another job called `audit` would not be it. That
 * is G14's demonstrated hole — *a single regex against one named file* — met
 * here by the fact being asserted genuinely living in one place.
 */
const GATES_WORKFLOW = '.github/workflows/gates.yml';

/**
 * Every `.yml`/`.yaml` file under `.github/`, not just `.github/workflows/`.
 *
 * **The routing-around answer.** A second workflow, or a composite action under
 * `.github/actions/`, is the cheap way past a narrow glob — and G19's own
 * register entry records that exact shape: *a real path sat outside the
 * allowlisted roots and was invisible to the checker*. Sweeping the whole
 * directory costs nothing today and needs no edit when the second file arrives.
 * **The trend layer already added one**, `metrics.yml`.
 *
 * Both extensions, because G6's named-and-unbuilt remedy is this failure one
 * level down: a sweep saying *scan `.ts`* in a tree holding `.mjs` and `.astro`.
 *
 * ⚠️ **`trackedFiles()` rather than `filesUnder()`, and the reason is an
 * incident rather than a preference.** `repo.ts` already documents the choice —
 * *"it cannot pick up a stray untracked file and fail a gate on it"* — and on
 * 2026-08-20 a read-only review agent dropped a scratch
 * `.github/actions/zztest/action.yml` into the tree and **reddened this gate on
 * a file that was never committed and would never have run.** What CI executes
 * is what git tracks; an unpinned action nobody staged cannot reach a runner.
 * The cost is G13's verdict, inherited knowingly: a local `pnpm test` before
 * `git add` passes over a new workflow, so the rule there is the rule here —
 * **stage, then run.**
 */
function githubYamlFiles(): string[] {
  return trackedFiles().filter(
    (path) => path.startsWith('.github/') && (path.endsWith('.yml') || path.endsWith('.yaml')),
  );
}

interface UsesLine {
  readonly file: string;
  readonly line: number;
  /** The reference itself — everything between `uses:` and the trailing comment. */
  readonly ref: string;
  /** Whatever followed the reference on that line, comment included. */
  readonly trailer: string;
  readonly text: string;
}

/**
 * Every `uses:` line under `.github/`, with its file and line number.
 *
 * Read from the **raw** file rather than through `codeOf`: clause 2 asserts
 * something about a comment, and a helper that blanks comments would erase the
 * thing being checked.
 *
 * ⚠️ **The key may be quoted, and may carry space before its colon.** `"uses":`
 * and `'uses':` are valid YAML for the same key, and GitHub's parser reads them
 * identically — so a pattern anchored on the bare word is **routed around by
 * one character of quoting**, which is a category-3 hole and not a formatting
 * nicety. Found by review; it is the **third** near-miss form in this one
 * change, after the register's colon-less disposition field and its
 * backtick-less entry heading. ⚠️ **The species is worth naming above the
 * instances: a check that reads one spelling of something the format lets you
 * write several ways.** Each was invisible to a plant table, because a plant
 * table asks for the wrong *value* and these are all the right value in an
 * unexpected *shape*.
 *
 * ⚠️ **This is still a regex and not a YAML parser, and the limit is stated
 * rather than implied.** It reads a `uses` key written on one line in block
 * mapping form, which is the only form this tree uses and the only form anyone
 * writes by hand; a key delivered through an anchor, a merge key, or a flow
 * mapping would not be seen. **A real parse would need a YAML dependency**, and
 * this repo prefers zero-dep for small utilities — so the choice is recorded
 * here rather than made silently. The floor below is what stops the residual
 * becoming a vacuous pass.
 */
function usesLines(): UsesLine[] {
  const found: UsesLine[] = [];

  for (const file of githubYamlFiles()) {
    const lines = readRepoFile(file).split('\n');
    lines.forEach((text, index) => {
      const match = /^\s*(?:-\s*)?(?:uses|'uses'|"uses")\s*:\s*(\S+)(.*)$/.exec(text);
      if (match === null) return;
      found.push({
        file,
        line: index + 1,
        ref: match[1] ?? '',
        trailer: match[2] ?? '',
        text: text.trim(),
      });
    });
  }

  return found;
}

/** `owner/repo[/subpath]@<40 lowercase hex>`. Nothing else is a pin. */
const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w.\-/]+)?@[0-9a-f]{40}$/;

/**
 * A trailing `# v<digits>[.digits…]` — **version-shaped, not merely
 * non-empty.** `# latest` is not a version claim, and neither is an empty
 * comment; both would satisfy a check for *some* trailer while telling a reader
 * nothing about what the SHA is.
 */
const VERSION_COMMENT = /^\s+#\s*v\d+(?:\.\d+)*\s*$/;

/**
 * `uses: ./…` — a **local** composite action, the one exemption.
 *
 * Definitional rather than judged: a local action **has no third party to
 * pin**, so unlike the withdrawn `docker://` exemption it cannot turn out to be
 * wrong. Zero instances today, and that objection does not transfer — dropping
 * it would mean a false red on something genuinely unpinnable.
 *
 * ⚠️ **`./` and not `../`.** The first draft accepted both; the spec says *"One
 * exemption: `uses: ./…`"* and nothing else, and an exemption is a permission —
 * widening one past its written scope is the category-1 move, however small the
 * population. Found in review, at zero instances either way.
 */
const LOCAL = /^\.\//;

function where(use: UsesLine): string {
  return `${use.file}:${use.line} — ${use.text}`;
}

describe('G40 — the sweep reaches something', () => {
  it('finds the workflow files and the `uses:` lines in them', () => {
    // A glob that stops matching — a workflow renamed, the tree moved — makes
    // every clause below true of nothing. Shipping a vacuous green inside the
    // effort about vacuous green would write its own joke, which is why this
    // floor is stated rather than left at `expectFound`'s default of one.
    expectFound(githubYamlFiles(), 'YAML files under .github/', 2);
    expectFound(usesLines(), '`uses:` lines under .github/', 4);
  });
});

describe('G40 — every third-party action is pinned, and says which version', () => {
  it('resolves every third-party `uses:` to a 40-character commit SHA', () => {
    const unpinned = usesLines()
      .filter((use) => !LOCAL.test(use.ref))
      .filter((use) => !PINNED.test(use.ref))
      .map(where);

    expect(
      unpinned,
      'these `uses:` lines do not resolve to `owner/repo[/subpath]@<40 lowercase hex>`. ' +
        'A tag or a branch is mutable: whoever controls the action repository can ' +
        "repoint it at anything, and it would run here with the workflow's token. " +
        `${unpinned.join('; ')}`,
    ).toEqual([]);
  });

  it('carries a version-shaped comment on every pinned line', () => {
    // The clause that closes the hole. Without it, clause 1 is satisfied by
    // deleting the comment, which trades a readable pin for an opaque one and
    // reads in review as tidying up.
    const unlabelled = usesLines()
      .filter((use) => PINNED.test(use.ref))
      .filter((use) => !VERSION_COMMENT.test(use.trailer))
      .map(where);

    expect(
      unlabelled,
      'these pinned `uses:` lines carry no trailing `# vN[.N…]` comment. The pin is ' +
        'unreadable without it, and deleting the comment must not be a way to satisfy ' +
        `the pinning rule: ${unlabelled.join('; ')}`,
    ).toEqual([]);
  });

  it('exempts a local composite action, and nothing else', () => {
    // Reverse-asserted in the only way a zero-population exemption can be: the
    // lines it would exempt are the lines that carry no `@`, so an entry that
    // stopped being local would fall straight into the clause above rather than
    // through a hole.
    const local = usesLines().filter((use) => LOCAL.test(use.ref));

    expect(
      local.filter((use) => use.ref.includes('@')).map(where),
      'a `uses: ./…` line carrying an `@` ref. The exemption is for a local composite ' +
        'action, which has no third party to pin — not for a local path with a ref on it',
    ).toEqual([]);
  });

  it('refuses `docker://` outright', () => {
    // The withdrawn exemption, honoured rather than restated. `docker://` is a
    // mutable third-party reference; the justification once given for exempting
    // it — "not a git ref at all" — is a judgement about syntax. The population
    // is zero, so this is written against the first instance rather than around
    // it, and the first legitimate one gets argued about with an instance in
    // front of whoever argues it.
    const docker = usesLines()
      .filter((use) => use.ref.startsWith('docker://'))
      .map(where);

    expect(
      docker,
      'a `docker://` reference under .github/. It is a mutable third-party reference, ' +
        'which is what the pinning argument is against. No rule over ' +
        '`docker://image@sha256:…` is pre-written: bring the instance and argue it. ' +
        `${docker.join('; ')}`,
    ).toEqual([]);
  });
});

/**
 * The jobs of a workflow, by name.
 *
 * Split on two-space-indented `name:` keys under `jobs:` so a clause about the
 * `audit` job is asserted against the `audit` job — G22's lesson, whose row
 * "gated the wrong half" by proving one thing and claiming another.
 */
function jobsOf(source: string): Map<string, string> {
  const body = /^jobs:\n([\s\S]*)$/m.exec(source)?.[1];
  if (body === undefined) {
    throw new Error(
      `no \`jobs:\` block in ${GATES_WORKFLOW}. A gate reads it, so a restructured ` +
        'workflow must fail here rather than reduce every clause below to nothing.',
    );
  }

  return new Map(
    sectionsOf(body, /^ {2}([\w-]+):$/gm).map((section) => [
      section.captures[0] ?? '',
      section.body,
    ]),
  );
}

describe('G42 — the `audit` job exists, runs, and is required', () => {
  // Called per test rather than once in the describe body. `jobsOf` throws by
  // design when the `jobs:` block is gone, and a throw during collection aborts
  // the whole file — taking G40's four clauses down with G42's, so one
  // restructured workflow would report as five unrelated gates vanishing.
  const jobs = (): Map<string, string> => jobsOf(readRepoFile(GATES_WORKFLOW));

  it('finds the jobs it is about to make claims about', () => {
    expectFound([...jobs().keys()], `jobs in ${GATES_WORKFLOW}`, 3);
  });

  it('declares a job named `audit`', () => {
    expect(
      jobs().has('audit'),
      `no job named \`audit\` in ${GATES_WORKFLOW}. Its row in docs/gates.md says the ` +
        'dependency tree is checked for known advisories on every pull request; delete ' +
        'the job and that row is a claim nothing can fail on',
    ).toBe(true);
  });

  it('runs `pnpm audit` at the threshold its row claims', () => {
    // `high` and above, and the threshold is the assertion rather than the
    // command: lowering it to `moderate` is noise, raising it to `critical` is
    // a silent weakening, and neither shows up anywhere else.
    expect(
      jobs().get('audit') ?? '',
      `the \`audit\` job in ${GATES_WORKFLOW} no longer runs ` +
        '`pnpm audit --audit-level=high`. The threshold is a judgement with a written ' +
        'reason — a threshold inherited without its reason is a preference with good ' +
        'documentation',
    ).toContain('pnpm audit --audit-level=high');
  });

  it('makes the required check depend on it', () => {
    const gates = jobs().get('gates') ?? '';

    expect(
      /needs:\s*\[[^\]]*\baudit\b[^\]]*\]/.test(gates),
      `the \`gates\` aggregator in ${GATES_WORKFLOW} no longer lists \`audit\` in its ` +
        '`needs:`. `gates` is the single required status check, so a job it does not ' +
        'need is a job whose failure merges',
    ).toBe(true);
  });

  it('tests that dependency against `success`, not merely for failure', () => {
    // Skipped and cancelled must fail the gate rather than pass it by omission.
    // A `needs:` entry with no `result` test is a dependency that reports
    // nothing when it is skipped, which is the shape a required check that
    // never reports has already cost this repo once.
    expect(
      gatesResultTests(jobs().get('gates') ?? ''),
      `the \`gates\` aggregator in ${GATES_WORKFLOW} does not compare ` +
        "`needs.audit.result` against 'success'. Comparing against 'failure' instead " +
        'would let a skipped or cancelled audit through',
    ).toContain('audit');
  });
});

/** The job names whose `result` the aggregator compares against `'success'`. */
function gatesResultTests(gates: string): string[] {
  return [...gates.matchAll(/needs\.([\w-]+)\.result\s*\}\}"\s*=\s*"success"/g)].map(
    (match) => match[1] ?? '',
  );
}
