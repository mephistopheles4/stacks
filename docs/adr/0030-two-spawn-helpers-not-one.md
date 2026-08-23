# Two spawn helpers, one of which refuses a shell

[`scripts/lib/run.ts`](../../scripts/lib/run.ts) exports `runShell` and `runExe`.
They differ in exactly one respect — whether the child gets a shell — and the
difference is not configurable. There is no `{ shell }` option and no single
`run` that takes one.

`runShell` joins the command and its arguments into one string and passes
`shell: true`. `runExe` passes the arguments as an array and no shell at all.
`shellCommand`, the joiner, is exported separately for the two callers that own
their child's lifecycle and spawn it themselves.

## Why there are two

Both answers are correct, for different commands, and each was independently
re-derived and re-explained in this repo before this file existed — twice for
the first, once for the second:

**`pnpm` needs a shell.** It is a `.cmd` shim on Windows and will not spawn
without one. Node then deprecates passing an args _array_ alongside `shell: true`
(DEP0190), because the two are concatenated rather than escaped — so the command
has to be built as a single string. That was written out in `deploy.ts`,
`check-public-build.ts` and `worktree.ts`, three times, in three wordings.

**`git` must not have one.** A branch name reaches
[`worktree.ts`](../../scripts/worktree.ts)'s `git()`, and under a shell an args
array is concatenated rather than escaped. `BRANCH` already rejects the
characters that would matter, but — in that file's own words, kept — _a
validation regex and a shell are two chances to be wrong where no shell is one._
`git` is a real executable on every platform and needs nothing.

## The trade-off

Against two functions: a caller now has to pick, and picking wrong is possible.
`runShell('git', [...])` compiles.

For two functions: the alternative is one `run` with a `shell` flag, and a flag
makes that same mistake **one word long and invisible in review** — `shell: true`
next to a `git` call reads as configuration rather than as a decision being
reversed. It also gives the wrong answer a name that sounds neutral. Two
functions make the choice a different call site, a different import, and a
different word in the diff.

The deeper reason is that the value of this file is not the deduplicated body.
Each body is four lines; sharing them saves almost nothing. **The value is that
the two halves of the decision are adjacent and can be read against each other.**
Apart, they read as an inconsistency, and the next person to make them consistent
would have to pick one and be wrong about half the callers. That is not
hypothetical — it is the shape the repo was already in, with three copies of one
half and one copy of the other, and nothing in the tree that mentioned both.

## What this deliberately does not absorb

**Process lifecycle.** `dev-watch.ts` keeps two long-lived children and takes the
other down when one dies; `smoke-render.ts` wraps a build in a promise. Both
spawn asynchronously and own their children afterwards. They take `shellCommand`
and spawn for themselves. Folding them in would mean one function with four
modes — `pipe` versus `inherit`, void versus promise, kill-on-exit or not — to
save two lines each.

That split is also the change's most concrete win. Both of those callers were
passing an args array alongside `shell: true`: the exact shape the two scripts
carrying the comment wrote a paragraph each about avoiding. The knowledge was
not duplicated and agreeing — it was written three times and **missing from the
two places that also needed it**.

**Failure presentation.** Both helpers throw. `deploy.ts` and `worktree.ts` catch
and re-report in their own style, because a deploy that stops and a worktree that
cannot be created should say so the way the rest of those scripts do, not as a
stack trace. The message is identical either way; only the framing differs, and
framing is the caller's.

**Capturing output, and running for an exit code that may be non-zero on
purpose.** These are a different contract — `runExe` throws, and these must not
— _and_ they are git-specific, since "a ref that is absent exits 1" is git's
vocabulary and `run.ts` has none. They live in
[`scripts/lib/git.ts`](../../scripts/lib/git.ts) as `gitOutput` and `gitStatus`.

**This file first said they simply stayed in `worktree.ts`, and that was
wrong** — the correction is the more useful half of the record. A code review of
the commit found six bare `spawnSync` calls still standing, of which this ADR
accounted for two. The one that mattered was `deploy.ts`'s branch check, which
had re-derived `gitOutput`'s exact contract inline in a second file: capture
stdout, treat any failure as "no answer", carry on. **A commit arguing that one
piece of knowledge should have one home shipped with a fresh second copy of a
different one**, which is worth more as a logged miss than as a quietly amended
list. `branchExists` was a third: it asked precisely the question `onOrigin`
asked eight lines below it, with its own `spawnSync` and a different `stdio`.

## How this was decided

- **2026-08-03** — **Two named exports, not one function with a `shell` flag.**
  Argued above. The deciding consideration was that the flag turns "which of the
  two right answers does this command need" — a question with a paragraph behind
  it — into a boolean, and booleans do not carry paragraphs.

- **2026-08-03** — **`shellCommand` is exported on its own.** The alternative was
  to let the two asynchronous callers keep doing it by hand, since they cannot
  use `runShell` anyway. They were already doing it by hand, and both were doing
  it wrong. Exporting the rule without the spawn is what lets a caller take the
  platform knowledge without taking a lifecycle it cannot use.

- **2026-08-03** — **Joining is safe here only because nothing variable reaches
  a joined command line**, and that is a property of the call sites rather than
  of the helper. Every argument at every `shellCommand` call site is a literal, a
  path this repo computed, or a value from the owner's own environment. Anything
  originating outside — a branch name, an argv, a vault — belongs in `runExe`,
  which is why `runExe` offers no way to opt into a shell even for a command that
  would tolerate one.

- **2026-08-04** — **`gitOutput` and `gitStatus` went to `scripts/lib/git.ts`,
  not into `run.ts`.** Four call sites and one whole file's worth of reasoning
  argued for keeping git's vocabulary out of the general helper, and that
  argument survives the correction above: what changed is _where they live
  together_, not whether `run.ts` should know about refs. A third export on
  `run.ts` returning a status instead of throwing would also have been the flag
  in a different costume — same function, two meanings, picked by return type
  instead of a boolean.

- **2026-08-04** — **`shellCommand` quotes nothing, and that is stated rather
  than fixed.** The obvious repair is to quote every argument inside the joiner.
  It was rejected: `deploy.ts` already passes `"${vault}"` pre-quoted, so the
  joiner would double-quote it, and finding every existing pre-quoted argument
  to unpick is a wider change than the one defect warrants. The rule is now in
  `run.ts`'s doc comment, and the one bare absolute path — `check-public-build`'s
  `--assets` — is quoted. Ungated, and said out loud for that reason.

- **2026-08-03** — **No gate covers the shell/no-shell split**, deliberately.
  G24 gates the repo root, which is a clean textual property. Detecting "an args
  array passed alongside `shell: true`" means matching the options object of a
  spawn call with a regex, and `codeOf` blanks comments but not strings — a check
  that brittle would produce false reds in a file nobody had touched. The
  argument lives here and in the doc comment instead, which is the honest status:
  stated, not enforced.
