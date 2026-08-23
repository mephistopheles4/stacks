# The mutation floor refuses `deploy:site`, and there is no override

An armed scope scoring under its floor **refuses `pnpm deploy:site`**, and no
flag clears it. The only way past is a committed lowering: a one-line diff in
`stryker.floors.json`, in a pull request, through `gates` and CodeQL — because
deploy runs from `main`.

Three other refusals ship with it and none of them has a flag either: a declared
scope with no floors entry, a floors entry naming no declared scope, and a run
scored under a different configuration from the one the floors were derived
under.

**It ships with every scope `unarmed`**, so today it refuses nothing. Arming is a
human judgement, per scope, after that scope's calibration window fills. There is
no moment at which the ratchet becomes armed.

## Why no flag

`deploy:site` is about to carry two metric refusals — a stale record and a floor
breach — and **the flag would get reached for on the stale-record refusal.** A
dead pipe is the ordinary, blameless reason a deploy stops, so a blanket override
gets typed for that, and it silently clears the floor at the same time. Adding no
flag dissolves that problem rather than documenting it.

The alternative reasoning was _"removing the flag makes the adversary's move the
only move"_, and that is **false about this repo**:
[`scripts/deploy.ts`](../../scripts/deploy.ts) already defines an undocumented
`--skip-gates` ([#152](https://github.com/mephistopheles4/stacks/issues/152)). The
three metric refusals are placed outside every flag's reach **on the merits**, so
they survive whatever that issue decides. The conclusion held; its stated reason
did not, and the replacement is recorded rather than the original quietly kept.

## What it costs

- ⚠️ **A legitimate refactor can stop you shipping today, and this is not
  softened.** The day you add a book to the vault and `deploy:site` refuses
  because a refactor last Tuesday dropped a scope below its floor, there is no
  way to publish that book today: you open a pull request, wait for gates, merge,
  and deploy. **That pressure is exactly what produces a hurried lowering with a
  rubber-stamped justification.** The design's answer is that the lowering is
  _visible_, not that it is avoidable. `packages/cli/src` is named in the spec as
  where the first lowering will land — 68 mutants, so one mutant is worth about
  1.5 points.
- ⚠️ **The anti-weakening guarantee is weakest in the repo relying on it most.**
  All of the no-override design rests on the lowering being a permanent,
  self-describing record. It does _not_ rest on anyone reading it before merge,
  and here nobody is required to: `main-protection` carries
  `required_approving_review_count: 0`, `bypass_actors: []`, and GitHub does not
  let a pull request's author approve it — so requiring a review was struck as
  **unavailable**, not declined as costly. What survives is a claim about a
  record read whenever somebody next opens the file. In a repo with real
  reviewers the same diff meets CODEOWNERS and someone with no stake in the
  deploy being unblocked. **Here it meets nobody.**
- **Nothing enforces the note.** `gates/ignored-mutants.test.ts` asserts the
  `ignored` counter and says nothing about the `notes` beside it. A
  note-presence check was declined: any string satisfies it, so it catches the
  honest omission and not the adversary. **The file makes the omission visible;
  it does not make it impossible.**
- **You only see any of it if you deploy.** This is the third place that shape
  appears in this layer, after the trend layer's _no deploys means no learning_
  and surface D's fold — which makes it a pattern rather than a third caveat.
- ⚠️ **The floor will probably never be raised**, and that is an accepted risk
  rather than a caveat. A ratchet whose only prompt is a print line, actioned by
  the one person deploying because they wanted to ship something else, will sit
  at its calibration value indefinitely. **That is a worse failure than a slack
  floor, because it is silent** — the piece looks armed and does nothing.

## What was rejected

- **Print-only, indefinitely.** A test-quality fact refusing a content deploy is
  a real category mismatch, and consult-only stayed an acceptable outcome to the
  end. It lost to the same argument that killed the flag: a number nobody is
  obliged to act on is a number nobody acts on.
- **Refuse, with a flag** in `--any-branch`'s shape. Above.
- **Auto-raising the floor.** Out on the standing constraint — a nightly
  committing a new high-water mark is a job acting on a metric movement — and out
  mechanically, which is the better guard: `main-protection` has zero bypass
  actors and the floors file lives on `main`, so **a job physically cannot commit
  a raise.** _"An auto-opened pull request that a human merges"_ is the same
  thing wearing a review.
- **A target the floor rises toward.** There is no target. A target is strictly
  more arbitrary than a floor, _"the ratchet retires"_ is indistinguishable from
  _"the ratchet stopped being maintained"_, and a target reintroduces the
  global-percentage goal this effort bans — **mutation score is still gameable by
  adding trivially-killable code, and a target is what makes gaming it worth
  someone's afternoon.**
- **A size exemption for `packages/cli/src`.** _"This scope doesn't get a floor
  because its number is jumpy"_ is deriving policy from the measurement, and a
  size threshold is a number nobody can derive.
- **Floor it but mark it advisory.** _Advisory_ is a second, quieter tier that
  any scope can be argued into once the precedent exists, and nothing is ever
  argued out of it.

## The hash, and why its allowlist runs backwards

`stryker.floors.json` carries one hash of the score-affecting Stryker
configuration; each run stamps its own; deploy compares. A mismatch refuses with
_these floors were derived under a different configuration_ rather than silently
comparing two numbers that do not mean the same thing. This is what closes
`timeoutMS`: **lowering it raises the score 0.36 points with no test touched**,
because a timeout counts as _detected_.

⚠️ **A different hash and a missing hash are different findings, and only one of
them is evidence.** A run stamped with a hash that is not the floors file's means
somebody changed the configuration without re-deriving — that refuses whatever is
armed, because it is evidence of the thing the guard exists for. A run carrying
**no** hash is a record from before the stamp existed, which is evidence of
nothing; it refuses only once some scope is armed and there is a comparison to
protect.

**Without that split the first `deploy:site` after this landed would have
refused**, because every record already on the `metrics` branch predates the
stamp — and _the first thing the new machinery would teach you would be how to
get past it_, which is the precise habit the no-override decision exists to
prevent. The configuration route stays shut either way: the calibration window
refuses to **derive** a floor from a run it cannot place under this
configuration, so no floor can ever come from runs nothing can vouch for.

⚠️ **It is computed by a denylist, in a repo whose doctrine is allowlists, and
the direction is the whole reason.** `private:` fails closed by treating anything
unrecognised as private. This fails closed by treating anything unrecognised as
**score-affecting**: only a named list of output, logging and scratch options is
dropped, and every other key — including one a future Stryker release adds — is
hashed. The two failure modes are not symmetric. A field wrongly hashed produces
a loud refusal costing one re-derivation; a field wrongly ignored produces two
numbers that do not mean the same thing and nothing that says so.

## How this was decided

Charted across [#115](https://github.com/mephistopheles4/stacks/issues/115) (the
design), [#122](https://github.com/mephistopheles4/stacks/issues/122) (the
calibration window and arming),
[#140](https://github.com/mephistopheles4/stacks/issues/140) (what deploy refuses
and on what numbers) and
[#147](https://github.com/mephistopheles4/stacks/issues/147) (the two guards),
and locked in [`docs/spec/the-ratchet.md`](../spec/the-ratchet.md), whose §§1, 5,
8 and 9 carry the full reasoning and its counter-arguments verbatim. Implemented
in [#163](https://github.com/mephistopheles4/stacks/issues/163).

**The surface does not transfer, and that is stated rather than smoothed.**
`deploy:site` works here because it is human-invoked, from `main`, by the one
person who can act on the refusal. In a production codebase with continuous
deployment every one of those is false, and **a deploy floor with no override
converts a test-quality regression into an availability incident** — you cannot
ship a hotfix because a mutation score dropped last Tuesday. The transferable
form is a required pull-request check with no override, remedied by the same
visible lowering in the same pull request, and **explicitly not at deploy**.
