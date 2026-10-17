# Close the release-age window's remaining side doors

The spec for [#459](https://github.com/mephistopheles4/stacks/issues/459),
follow-up to [#399](https://github.com/mephistopheles4/stacks/issues/399) and
[#449](https://github.com/mephistopheles4/stacks/pull/449) (adversarial-lens
findings F3 to F6). Standard tier: planned on Opus at medium effort, to be built
on Sonnet at medium. Written on 2026-10-17 by session `spec-459`. The owner
settled §S4's decisions the same day: D1 to D3 in a grilling, D4 and D5 after the
spec lenses' review, and D6 after the security pair's. The spec as a whole waits for the owner's sign-off.

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

Each door is closed by a setting or a pin, and G67 holds each one, except
door 4, which is one line of `dependabot.yml`. Two of the issue's premises were
wrong when measured, and §S3 corrects them, so the build closes the doors that
actually exist:

| Door | Setting or change | G67 holds |
| --- | --- | --- |
| 1 | `minimumReleaseAgeIgnoreMissingTime: false`, plus a lockfile rule: every resolution is integrity-only | the key at `false`; every `resolution:` line in `pnpm-lock.yaml` |
| 2 | `trustPolicy: no-downgrade`, with an exact `trustPolicyExclude` for three entries | the key at `no-downgrade`; the excludes as exact versions; no `trustPolicyIgnoreAfter` |
| 3 | wrangler becomes an exact-pinned root devDependency, run through `pnpm exec`, so the lockfile's age and trust checks cover it (D4, which replaces D2) | the exact pin in `package.json`; no `dlx` in `scripts/deploy.ts` |
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
no argument puts it in reach. D4 closes that gap.

**Door 3, pinned (for D4).** In the scratch copy under §S5's final settings,
`pnpm add -D -w wrangler@4` resolved **4.149.0**, so the window held. It added
48 lockfile packages, passed the trust check with no new exclude, and left
every resolution integrity-only. `--save-exact` still wrote `^4.149.0`, so the
builder writes the exact version into `package.json` by hand. A frozen install
then **fails** with `ERR_PNPM_IGNORED_BUILDS` on `workerd@1.20261006.1`'s
install script. With `allowBuilds` set to `workerd: false`, and also with
`workerd: true`, the frozen install exits 0, and both `pnpm exec wrangler
--version` (4.149.0) and `pnpm exec wrangler pages deploy --help` work.
Whether `pages deploy` itself needs workerd's binary can't be checked without a
real deploy. The pinned lockfile holds the same single `esbuild@0.28.2` and
`sharp@0.35.5` as today, so wrangler brings no new version of a package
`allowBuilds` admits by name, and workerd is its only new install script.
wrangler's usage telemetry is **on by default**: its CLI reads
`WRANGLER_SEND_METRICS`, and has `wrangler telemetry disable`.

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
  **What the acceptance covers:** these packages run on the deploy machine,
  with the Cloudflare credential in reach. chromium-bidi runs inside the
  deploy's own `smoke:render` gate, and every child process of the deploy
  inherits its whole environment. G67's chromium-bidi rule in §S5 is the
  control that answers this, since a look at the publisher can't tell a
  takeover from a normal release.
- **D2, door 3: pass the window on the dlx call.** The owner said yes in chat.
  ⚠️ **Replaced by D4**, after the lens review measured that dlx doesn't apply
  the trust policy. It is kept here so the reasoning stays visible.
- **D4, door 3: wrangler becomes an exact-pinned root devDependency, run
  through `pnpm exec`, in this build, with an ADR.** The owner's answer,
  relayed by the lead: "Pin wrangler, in this build". The credentialed fetch is
  the one install that matters most, and only the lockfile puts it under the
  age and trust checks and the lockfile rule. The objection D2 raised, that
  Dependabot can't see a version inside a script string, no longer applies: a
  `package.json` pin is exactly what Dependabot bumps, under the npm entry's
  seven-day cooldown.
- **D5: the stale-exclude rule, in this build, as C11.** The owner's answer,
  relayed by the lead: "Yes, as C11". The spec had deferred it, and the
  executability lens raised the deferral as high. It costs one claim and one
  test.
- **D6: the wrangler upload gets no `.env` key it doesn't need, in this
  build, as C14.** The owner's answer, relayed by the lead: "Yes, as C14". The
  deploy loads `.env` into `process.env` and `runShell` passes the whole of it
  to every child, so the upload received the Google Books key and the vault
  path. That predates this change, and data-lens raised it under the security
  bar.
- **D3, door 1: the key, plus the lockfile rule.** The owner's answer, relayed
  by the lead: "Key + lockfile check". The key is defence in depth and costs
  nothing. The lockfile rule closes the door the issue meant.

## S5. Implementation decisions

**`pnpm-workspace.yaml`**, beside `minimumReleaseAge`:

- `minimumReleaseAgeIgnoreMissingTime: false`. Its comment corrects the
  premise: it does not stop git or tarball dependencies, which is what G67's
  lockfile rule is for. pnpm's docs say the same key also governs the trust
  policy, making it fail on a package the registry can't date rather than skip
  it. That was read, not measured, and the comment says so.
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
  one accepts a possible package takeover. Likewise, if the lockfile gains a
  new version of a package `allowBuilds` admits by name, stop: its install
  script would run with no new answer. The log lists the lockfile keys
  wrangler adds, and says yes or no on new allowed builds.
- **The hatch text** gains one line, in this file and in the Dependabot npm
  note: before excluding a version from the window, check how it was published.
  A token publish where earlier releases had provenance is the stolen-token
  signature, and the trust policy stays on for an excluded version, so a
  failing install is the signal to look, not to add a trust exclude by reflex.
  The Dependabot note also names the expected failure: a `dev-tooling` group
  pull request that moves chromium-bidi goes red on `ERR_PNPM_TRUST_DOWNGRADE`,
  and its remedy is the owner's decision to move the exact exclude. And one
  limit, in both files: the trust policy only fails a version when an earlier
  release had stronger evidence. For a package that never published with
  provenance, a passing install says nothing about who published it, and the
  window is the only control the age hatch removes.

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
- **The stale-exclude rule (D5).** Every `minimumReleaseAgeExclude` and
  `trustPolicyExclude` entry must name a `name@version` that `pnpm-lock.yaml`
  holds as a package key: a line reading `  name@version:`, or
  `  'name@version':` for a scoped name, at two spaces' indent. An entry the
  lockfile no longer holds fails, naming it. Otherwise an old exclude would let
  that exact version back in, unreviewed, the day a later lockfile resolved it.
- **The lockfile rule.** Every `resolution` key in `pnpm-lock.yaml`, read in
  any quoting and spacing as `switchProblems` reads a key, must read
  `{integrity: sha512-<value>}`, with no other key and no other hash type.
  Anything else fails, naming the line. Then the count check: the number of
  package keys in the `packages:` section must equal the number of
  integrity-only resolutions, so a resolution spelled some way the reader
  misses still fails. A lockfile with no resolution at all fails as well.
  Split lines on `\r?\n`, as the workspace reader does, since a Windows
  checkout may carry CRLF.
- **The chromium-bidi rule.** A `trustPolicyExclude` entry for
  `chromium-bidi` must name exactly the version `puppeteer-core`'s lockfile
  snapshot depends on, and `puppeteer-core` must be the only snapshot that
  depends on `chromium-bidi`. Today that snapshot reads `chromium-bidi:
  157.0.8090-0(devtools-protocol@0.0.1696802)`, so strip the parenthesised
  peer suffix before comparing. The exclude can then only follow a
  provenance-published puppeteer-core, which a stolen chromium-bidi token can't
  fake. The owner's word is still needed on every move (§S4).
- **Config that changes pnpm at runtime.** A top-level `configDependencies` or
  `pnpmfile` key in `pnpm-workspace.yaml` fails, and so does any `.pnpmfile.*`
  at the repository root. pnpm's docs say their hooks can rewrite settings, and
  that a pinned config dependency skips the window. Neither exists today.
- **The deploy rule.** The root `package.json` must carry `wrangler` in
  `devDependencies` as one exact version: no range, tag or protocol. And
  `scripts/deploy.ts` must hold one allowed form: the upload's argument list
  starts `'exec', 'wrangler'`, and the printed `--dry-run` command starts
  `pnpm exec wrangler`. Anything else fails: `dlx`, `npx`, `pnpx`, `bunx` or
  `--package` anywhere in the file, or `wrangler` run as a command any other
  way. This is an allowlist, following invariant 2's rule, not a ban on one
  word. The script
  runs at import, so read its source text, as G67 already reads
  `pnpm-workspace.yaml`. A form the reader doesn't recognise fails closed.

**`package.json`** gains `"wrangler": "<exact version>"` in `devDependencies`.
Take the newest 4.x release that is at least seven days old at build time
(4.149.0 when this was written), and write it by hand: `pnpm add
--save-exact` still wrote a caret (§S3). Then let pnpm update the lockfile, and
check the stop conditions above.

**`pnpm-workspace.yaml`'s `allowBuilds`** gains `workerd: false`, with a
comment. A frozen install fails without an answer for workerd's install script
(§S3). `false` runs no new install script and fails safe: if `pages deploy`
ever turns out to need workerd's binary, the upload fails and nothing is
published. Changing it to `true` is the remedy, and it is the owner's.

**`scripts/deploy.ts`** drops `WRANGLER = 'wrangler@4'`. The upload runs
`pnpm exec wrangler pages deploy …`, and the `--dry-run` print shows the same
command. Its comment says why: the lockfile holds wrangler to the window and
the trust policy, and dlx holds it to the window only. **Before the upload it
refuses** unless the version in the repository's own
`node_modules/wrangler/package.json` equals the exact pin in `package.json`.
`pnpm exec` puts `node_modules/.bin` first on the PATH, and
`verifyDepsBeforeRun: warn` doesn't stop a stale install, so without this
refusal the upload could run some other wrangler from the PATH. No flag
clears the refusal. `--dry-run` prints the version it checked. If G45 lists
the deploy's refusals in `docs/commands.md`, add this one there.

**The upload's environment (D6).** `loadEnv` (`packages/cli/src/env.ts`)
returns nothing today, and sets each `.env` key that the shell hasn't already
set. It gains a return value: the names of the keys it set. The upload's child
environment is then `process.env` with those names removed, **except** any
name starting `CLOUDFLARE_` or `WRANGLER_`, which wrangler reads. That way, if
the owner keeps the Cloudflare credential in `.env`, the upload still finds it.
Everything else stays, the shell's own variables included, so wrangler still
finds its login store through the user-profile variables. Today that removes
`STACKS_VAULT`, `GOOGLE_BOOKS_API_KEY`, `STACKS_LANGUAGE`, `PORT`,
`STACKS_DEV_HOST`, `SITE_URL` and `CF_PAGES_PROJECT` where `.env` sets them.
The deploy reads `CF_PAGES_PROJECT` and `SITE_URL` itself, before the upload,
and passes the project as an argument. `runShell` needs a way to take a whole
environment rather than merging over `process.env`. The deploy's other steps
are unchanged.

**`.github/dependabot.yml`** gives the github-actions entry `cooldown:
default-days: 7`, with a comment pointing at the npm entry's note, and saying
that security updates ignore it.

**Documents, in the same commit as the code:** the G67 row in `docs/gates.md`
grows to the new rules, and G19 holds the row. `docs/progress.md` gets one
index line, and `docs/log/2026-10-17-release-age-side-doors.md` gets §S3's
measurements as the investigation narrative.

**One ADR, for the new dependency**, as AGENTS.md requires for any added
dependency: wrangler is a devDependency so that the deploy's credentialed fetch
sits under the lockfile's checks. It records the cost: wrangler's 48 packages
join every install, CI's included, and Dependabot opens wrangler bumps. It
also says what's in reach of the deploy's tools: the Cloudflare credential,
where it lives (an environment variable or wrangler's own login store, as
the owner states), that it never enters the repository, `.env` or CI, and the
point in D1. Take
the next number free on `main` and on open pull requests at build time. On
2026-10-17, open pull requests held 0111, 0113 and 0115.

**The log and the ADR carry no local path and no user name.** Describe the
scratch copy generically, and trim command output to the lines that matter.
pnpm's errors print absolute paths, and two earlier log files already carry a
local path naming an account. Search both files for a drive-letter path
before committing. The settings
themselves need no ADR: each is cheap to reverse, and the reasoning lives in
the comments and the log.

**Rollback.** The build lands as one squash commit, and reverting it removes
the keys, the G67 rules, the wrangler pin and the cooldown together. No
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
  resolution, a `sha1-` integrity, a resolution under a quoted or oddly spaced
  key, an extra package key with no integrity-only resolution, and a lockfile
  with no resolutions. All of these go in one parameterised case.
- **C6.** G67 fails a `package.json` whose `wrangler` is a range, a tag or
  absent. It fails a `deploy.ts` that holds `dlx`, an `npx` form or a
  `--package` form, or runs wrangler other than through `pnpm exec`. `pnpm
  deploy:site --dry-run` prints a `pnpm exec wrangler` command and the
  wrangler version it checked.
- **C7.** The github-actions entry in `dependabot.yml` carries `cooldown:
  default-days: 7`. **This one is not gated**, matching the npm entry, which
  nothing gates either. A reviewer checks it by reading the diff.
- **C8.** The hatch text in both files says to check how a version was
  published, and names the trust policy's limit for a package that never had
  provenance. Door 1's comment carries §S3's correction and the trust-policy
  clause from pnpm's docs.
- **C9.** On the Windows workstation, with the final `pnpm-workspace.yaml` and
  after a frozen install, `pnpm exec wrangler --version` exits 0 and prints the
  pinned version, and `pnpm exec wrangler pages deploy --help` exits 0.
  The log records the command, its output and the exit code. **No real deploy
  runs in this work**; the next one is the owner's.
- **C10.** Each of these exits 0 on the Windows workstation, and CI's `gates`
  job is green on the pull request, on Linux: `pnpm test`, `pnpm lint`,
  `pnpm typecheck`, `pnpm build`, `pnpm format:check` and `pnpm lint:md`.
  `pnpm lint:md` reads tracked files only, so `git add` the new log file
  first.
- **C11.** G67 passes the repository's excludes, since all three trust excludes
  name lockfile packages. It fails an age or trust exclude whose version the
  lockfile doesn't hold, a scoped one included.
- **C12.** G67 passes today's chromium-bidi exclude. It fails one naming a
  version `puppeteer-core` doesn't depend on, and a lockfile where a second
  package depends on `chromium-bidi`. It also fails a `configDependencies` key,
  a `pnpmfile` key, and a root `.pnpmfile.cjs`.
- **C13.** In a scratch copy where the installed wrangler's version differs from
  the pin, the deploy refuses before the upload, naming both versions, and
  uploads nothing. The refusal is tested through the function that compares
  the two, with no deploy.
- **C14.** The environment built for the upload lacks every key `loadEnv` set,
  with `GOOGLE_BOOKS_API_KEY` and `STACKS_VAULT` planted in the test. It keeps
  a planted `CLOUDFLARE_API_TOKEN` that `loadEnv` set, and a variable the shell
  set before `loadEnv` ran. One test, on the function that builds that
  environment.

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
- **Security against install weight, at D4.** Pinning wrangler puts the
  credentialed fetch under the trust check and makes every deploy
  reproducible. The cost is 48 more packages in every install, plus Dependabot
  bumps to review. The owner took security, under the pact's security bar: the
  fix is due unless its cost is grossly out of proportion. D2's dlx argument
  was the cheaper option, and it left the trust check out.

## S8. Out of scope

- Finding out what `minimumReleaseAgeIgnoreMissingTime` covers beyond what
  pnpm's docs say. G67 requires the key, and per the docs it also governs the
  trust policy (§S5), so it must not be dropped as dead.
- Proving whether pnpm config from environment variables or the command line
  overrides `pnpm-workspace.yaml`. Pull-request review of the workflows is the
  control for that.
- A gate on `dependabot.yml`'s cooldowns, for either entry.
- Investigating chromium-bidi's change of publisher beyond the evidence in §S3.

## S9. Needs a human

- **Sign-off**: proceed, fix or kill.
- **Accepting the change and merging it are the owner's.** So is the next real
  deploy, and so is every new trust or age exclude (§S5).
- **The three trust excludes stay an unrecorded acceptance** until the
  repository has a threat model. Creating one is the owner's decision, and not
  part of this work.
- **`allowBuilds` `workerd: true`**, if a real deploy ever shows that `pages
  deploy` needs workerd's binary (§S5), is the owner's call.
- **Where the Cloudflare credential lives**, for the ADR (§S5): the owner tells
  the builder. The builder reads no credential store.
- **The security pair at Test** is an offer the build makes once (§S6). The
  choice of the standard tier over the sensitive route reached this session by
  relay, through the lead, so it stays open until the owner answers it.
