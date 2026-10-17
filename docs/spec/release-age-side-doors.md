# Close the release-age window's remaining side doors

The spec for [#459](https://github.com/mephistopheles4/stacks/issues/459),
follow-up to [#399](https://github.com/mephistopheles4/stacks/issues/399) and
[#449](https://github.com/mephistopheles4/stacks/pull/449) (adversarial-lens
findings F3 to F6). Standard tier: planned on Opus at medium effort, to be built
on Sonnet at medium. Written on 2026-10-17 by session `spec-459`. The owner
settled the three decisions in §S4 in a grilling the same day; the spec as a
whole waits for the owner's sign-off.

Every measurement below was taken on pnpm 11.18.0 against a scratch copy of the
manifests and lockfile on `main` at `4e97f22`. The real lockfile was never
touched, and its hash was compared after every run.

## S1. Problem statement

#449 set pnpm's release-age window to seven days and held it with G67
(`release-age`). Its adversarial review left four side doors open, each one low
severity:

1. **No publish time.** `minimumReleaseAgeIgnoreMissingTime` defaults to `true`,
   so a package with no publish time installs with no age check. The issue
   says this lets git and tarball dependencies in.
2. **A hijacked fix under advisory pressure.** The documented hatch for a
   security fix inside the window is `minimumReleaseAgeExclude`. A stolen-token
   publish can arrive as that fix.
3. **The deploy's wrangler fetch.** `scripts/deploy.ts` runs
   `pnpm dlx wrangler@4` with the Cloudflare credentials and no lockfile.
   Nobody knew whether the window applied to it.
4. **The github-actions Dependabot entry has no cooldown**, unlike the npm entry.

## S2. Solution

Each door is closed by a setting or an argument, and G67 holds each one, except
door 4, which is one line of `dependabot.yml`. Two of the issue's premises were
wrong when measured, and §S3 corrects them, so the build closes the doors that
actually exist:

| Door | Setting or change | G67 holds |
| --- | --- | --- |
| 1 | `minimumReleaseAgeIgnoreMissingTime: false`, plus a lockfile rule: every resolution is integrity-only | the key at `false`; every `resolution:` line in `pnpm-lock.yaml` |
| 2 | `trustPolicy: no-downgrade`, with an exact `trustPolicyExclude` for three entries | the key at `no-downgrade`; the excludes as exact versions; no `trustPolicyIgnoreAfter` |
| 3 | `--config.minimum-release-age=10080` on the deploy's dlx call | the argument on the call |
| 4 | `cooldown: default-days: 7` on the github-actions entry | nothing (§S6) |

## S3. What was measured

The method behind every install run is `pnpm install --frozen-lockfile
--ignore-scripts` with `node_modules` removed first. The **canary** is the same
command with `minimumReleaseAge` raised to ten years: it failed with
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on 729 entries, so that invocation
does check the window.

**Door 1: the issue's premise is wrong.** With
`minimumReleaseAgeIgnoreMissingTime: false`, and `pnpm config get` reading it
back as `false`, a `github:` dependency and a codeload.github.com tarball
dependency **both installed**, exit 0. The setting does not stop git or tarball
dependencies. What it does cover, presumably registry packages whose metadata
has no `time` field, was not observed. The frozen install of today's lockfile
passes with it set. What closes the real door is a lockfile rule. pnpm writes a
tarball as `resolution: {integrity: …, tarball: …}` and a git-hosted package as
`resolution: {gitHosted: true, tarball: …}`, while **all 735** `resolution:`
lines in today's lockfile are `{integrity: …}` and nothing else.

**Door 2: the trust policy fails today's lockfile.** `trustPolicy:
no-downgrade` fails the frozen install with `ERR_PNPM_TRUST_DOWNGRADE` on three
entries, each one called a "possible package takeover":

| Entry | Published | Why it trips |
| --- | --- | --- |
| `semver@6.3.1` | 2023-07-10 | an old line, published after later lines carried provenance |
| `chokidar@4.0.3` | 2024-12-18 | the same shape |
| `chromium-bidi@157.0.8090-0` | 2026-10-07 | 19 of its 177 versions were trusted-published from GitHub Actions, the last being 17.0.2 on 2026-07-06. Every 157.x and 158.x release since has been token-published by `chrome-devtools-npm`. It arrives through `puppeteer-core@25.13.0`, which **is** published with provenance and pins exactly this version |

Four more results:

- With those three as exact `trustPolicyExclude` entries, the install passes.
  With two of the three, it fails on the third.
- `trustPolicyIgnoreAfter: 43200` clears the two old entries but not
  chromium-bidi.
- `trustPolicyExclude` takes a bare name and `'*'` as wildcards, so it shares
  the age hatch's hole.
- **Naming chromium-bidi in `minimumReleaseAgeExclude` does not skip the trust
  check.** The install still fails. The trust policy therefore stays on for a
  version let through the age hatch, which is the case door 2 is about.

**Door 3: the issue's premise is wrong too.** dlx applies the workspace window.
wrangler 4.151.1 was published on 2026-10-16. Inside the workspace copy, `pnpm
dlx wrangler@4 --version` printed **4.149.0**, from 2026-10-08, and printed the
same with a fresh cache directory and `dlx-cache-max-age=0`. Outside any
workspace it printed 4.151.1. `deploy.ts` passes no `cwd`, so its call runs
from the repository root, where the window applies. With
`--config.minimum-release-age=10080` on the call, dlx printed 4.149.0 from
outside the workspace too, with the flag placed either before or after `dlx`.

**Door 3 and the trust policy: dlx does not apply it.** This was measured
after the spec's lens review asked. Under the final settings of §S5 (both new
keys and the three excludes), `pnpm dlx wrangler@4 --version` from the
workspace exits 0. As a canary, `semver@6.3.1`, which the frozen install
refuses as a trust downgrade, runs through `pnpm dlx` and exits 0, even with
`--config.trust-policy=no-downgrade` passed on the call. So the new settings
can't break the deploy's fetch. The flip side is that **the credentialed
wrangler fetch is the one install the stolen-token check doesn't reach**, and
no argument puts it in reach. §S9 carries that as an open question.

The measurements ran on the Windows 11 workstation. CI installs on
`ubuntu-latest`, where platform-only optional packages can resolve that a
Windows install skips, so C4 is proved there.

**Door 4.** GitHub's Dependabot options reference supports `cooldown`
`default-days` for the `github-actions` ecosystem, though not its semver-day
options. It also says cooldown does not apply to security updates.

## S4. Decisions

Each decision was put to the owner as a question with a recommendation, one at
a time.

- **D1, door 2: turn the trust policy on, with an exact exclude for the three.**
  The owner chose A in chat. The policy is the only control that checks a
  version let in through the age hatch, and that was measured, not assumed.
  The three entries are let through on the owner's word. **The repository has
  no threat model**, so the acceptance is not recorded as an accepted risk
  anywhere. It stays flagged, and the comment beside the exclude carries the
  evidence from §S3. The cost, also accepted: chromium-bidi no longer publishes
  with provenance, so each `puppeteer-core` bump that moves it will fail CI
  until someone adds the new exact version. puppeteer-core travels in
  Dependabot's weekly `dev-tooling` group, with typescript, vitest and tsx, so
  that failure holds back the whole group's pull request, not just one bump.
- **D2, door 3: pass the window on the dlx call**, not just a comment and not
  an exact pin. The owner said yes in chat. It is one argument, it removes the
  dependence on the working directory, and it adds no upkeep. An exact pin was
  declined because Dependabot can't see a version inside a script string.
- **D3, door 1: the key, plus the lockfile rule.** The owner's answer, relayed
  by the lead: "Key + lockfile check". The key is defence in depth and costs
  nothing. The lockfile rule closes the door the issue meant.

## S5. Implementation decisions

**`pnpm-workspace.yaml`**, beside `minimumReleaseAge`:

- `minimumReleaseAgeIgnoreMissingTime: false`. Its comment corrects the
  premise: it does not stop git or tarball dependencies, which is what G67's
  lockfile rule is for.
- `trustPolicy: no-downgrade` and a block-list `trustPolicyExclude` holding the
  three exact versions. Each entry gets a comment with its removal condition:
  `semver` and `chokidar` come out when the lockfile stops holding that
  version. chromium-bidi's entry moves to the new exact version on each
  puppeteer-core bump, but **only on the owner's word**, with the evidence of
  who published it. If chromium-bidi publishes with provenance again, the
  entry comes out.
- **Stop conditions, for the build and for every later bump.** If any install
  fails on an entry other than these three exact versions, or the lockfile
  holds a resolution that isn't integrity-only, stop and bring it to the owner.
  Never add or change a trust or age exclude without the owner's word: each
  one accepts a possible package takeover.
- **The hatch text** gains one line, in this file and in the Dependabot npm
  note: before excluding a version from the window, check how it was published.
  A token publish where earlier releases had provenance is the stolen-token
  signature, and the trust policy stays on for an excluded version, so a
  failing install is the signal to look, not to add a trust exclude by reflex.
  The Dependabot note also names the expected failure: a `dev-tooling` group
  pull request that moves chromium-bidi goes red on `ERR_PNPM_TRUST_DOWNGRADE`,
  and its remedy is the owner's decision to move the exact exclude.

**`gates/release-age.test.ts` (G67)**, extending its existing readers, still
with no YAML parser:

- `minimumReleaseAgeIgnoreMissingTime` must be present and exactly `false`.
  This is a required key rather than a `SAFE_VALUES` switch, because pnpm's
  default is the unsafe value.
- `trustPolicy` must be present and exactly `no-downgrade`.
- `trustPolicyExclude`, if present, gets `excludeProblems`'s rule: a block list
  of exact versions. Generalise the reader over the key name.
- `trustPolicyIgnoreAfter`, if present, fails. Any value narrows the check, and
  nothing here needs it.
- **The lockfile rule.** Every line of `pnpm-lock.yaml` that holds
  `resolution:` must read `resolution: {integrity: <value>}`, with no other key.
  Anything else fails, naming the line. A lockfile with no `resolution:` line
  at all fails as well, so a renamed field can't read as a pass. Split lines on
  `\r?\n`, as the workspace reader does, since a Windows checkout may carry
  CRLF.
- **The deploy rule.** `scripts/deploy.ts` must pass
  `--config.minimum-release-age=` with a value of 10080 or more in the argument
  list of its `dlx` upload call, and in the printed `--dry-run` command. The
  script runs at import, so read its source text, as G67 already reads
  `pnpm-workspace.yaml`. A form the reader doesn't recognise fails closed.

**`scripts/deploy.ts`** adds the argument right after `'dlx'`. Its comment says
why: the workspace window already applies from the root, and this keeps it
applying from anywhere.

**`.github/dependabot.yml`** gives the github-actions entry `cooldown:
default-days: 7`, with a comment pointing at the npm entry's note, and saying
that security updates ignore it.

**Documents, in the same commit as the code:** the G67 row in `docs/gates.md`
grows to the new rules, and G19 holds the row. `docs/progress.md` gets one
index line, and `docs/log/2026-10-17-release-age-side-doors.md` gets §S3's
measurements as the investigation narrative. **No ADR**: each setting is cheap
to reverse, and the reasoning lives in the comments and the log.

**Rollback.** The build lands as one squash commit, and reverting it removes
the keys, the G67 rules, the deploy argument and the cooldown together. No
data is touched. If `main` goes red after the merge, revert first, then
diagnose.

## S6. Testing decisions

The acceptance claims, for the build and for the QA pair at Test:

- **C1.** `pnpm-workspace.yaml` sets `minimumReleaseAgeIgnoreMissingTime:
  false`. G67 fails it absent, `true`, quoted, or in a comment.
- **C2.** It sets `trustPolicy: no-downgrade`. G67 fails it absent, or holding
  any other value.
- **C3.** `trustPolicyExclude` names exactly the three versions in §S3. G67
  fails a wildcard, a bare name, a range, or a flow list there, and fails any
  `trustPolicyIgnoreAfter`.
- **C4.** A frozen install of the build's lockfile passes under the new
  settings, which CI's install step proves on the pull request. With the three
  trust excludes removed, the same install fails with `ERR_PNPM_TRUST_DOWNGRADE`.
  That run is done by hand once, in a scratch copy, and recorded in the log.
- **C5.** G67 passes today's lockfile and the same text with CRLF line
  endings. It fails a planted `tarball:` key, a `gitHosted:` key, a `type: git`
  resolution, and a lockfile with no resolutions.
- **C6.** G67 fails `deploy.ts` with the window argument removed, or set under
  10080. `--dry-run` prints a command that carries the argument.
- **C7.** The github-actions entry in `dependabot.yml` carries `cooldown:
  default-days: 7`. **This one is not gated**, matching the npm entry, which
  nothing gates either. A reviewer checks it by reading the diff.
- **C8.** The hatch text in both files says to check how a version was
  published, and door 1's comment carries §S3's correction.
- **C9.** On the Windows workstation, with the final `pnpm-workspace.yaml` and
  run from the repository root, `pnpm dlx --config.minimum-release-age=10080
  wrangler@4 --version` exits 0 and prints a version at least seven days old.
  The log records the command, its output and the exit code. **No real deploy
  runs in this work**; the next one is the owner's.
- **C10.** Each of these exits 0 on the Windows workstation, and CI's `gates`
  job is green on the pull request, on Linux: `pnpm test`, `pnpm lint`,
  `pnpm typecheck`, `pnpm build`, `pnpm format:check` and `pnpm lint:md`.
  `pnpm lint:md` reads tracked files only, so `git add` the new log file
  first.

Each G67 rule is proved the way G67 already proves its own: synthetic workspace
text, one passing and one failing per form. Count the test cases against the
pact's Tests added limit of two beyond one per claim. C1, C3 and C5 each list
several forms, and the build should fold those into one parameterised case per
claim rather than one case per form.

**Security, at Test.** Door 3 changes the deploy call that carries the
Cloudflare credentials, and the whole change is supply-chain input validation.
The owner chose the standard tier over the sensitive route, so the build
**offers the security pair, `adversarial-lens` and `data-lens`, once at Test**.

## S7. Trade-off points

- **Security against maintainability, at D1.** The trust policy catches a
  stolen-token fix, at the cost of a hand-edited exclude on every puppeteer-core
  bump while chromium-bidi stays token-published. The owner took security.
  **No business driver is written** in a spec or under a "Business drivers"
  heading in `AGENTS.md`, so this is flagged. The side taken is also the
  cheaper one to reverse: delete two keys.
- **Reproducibility against upkeep, at D2.** An exact wrangler pin would make
  every deploy reproducible, but nothing would move it. The window argument
  keeps wrangler current, at seven days old or more. The owner took the
  argument.

## S8. Out of scope

- A G67 rule that fails a stale `trustPolicyExclude` or
  `minimumReleaseAgeExclude` entry naming a version the lockfile no longer
  holds. It would be worth having, but it is a new rule nobody asked for and
  would cost tests beyond the limit.
- Finding out what `minimumReleaseAgeIgnoreMissingTime` covers. Nothing turns
  on it once the lockfile rule exists.
- A gate on `dependabot.yml`'s cooldowns, for either entry.
- Investigating chromium-bidi's change of publisher beyond the evidence in §S3.

## S9. Needs a human

- **Sign-off**: proceed, fix or kill.
- **Accepting the change and merging it are the owner's.** So is the next real
  deploy, and so is every new trust or age exclude (§S5).
- **The three trust excludes stay an unrecorded acceptance** until the
  repository has a threat model. Creating one is the owner's decision, and not
  part of this work.
- **The wrangler fetch is outside the trust check** (§S3). Whether to accept
  that, or bring wrangler into the lockfile as a pinned devDependency, is the
  owner's call. It is open as this spec's lens review closes.
- **The security pair at Test** is an offer the build makes once (§S6). The
  choice of the standard tier over the sensitive route reached this session by
  relay, through the lead, so it stays open until the owner answers it.
