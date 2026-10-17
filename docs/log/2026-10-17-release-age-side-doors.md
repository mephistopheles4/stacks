# 2026-10-17 — the release-age window's side doors

[#459](https://github.com/mephistopheles4/stacks/issues/459), built from
[`docs/spec/release-age-side-doors.md`](../spec/release-age-side-doors.md),
follow-up to [#399](https://github.com/mephistopheles4/stacks/issues/399) and
[#449](https://github.com/mephistopheles4/stacks/pull/449). #449's adversarial
review left four low-severity doors open. **Two of the issue's premises were wrong
when measured**, so the build closes the doors that exist.

Every run below is pnpm 11.18.0, a frozen install with scripts ignored, in a
scratch copy of the manifests and lockfile unless it says otherwise. The canary
for "that invocation checks the window" is the same command with
`minimumReleaseAge` raised to ten years, which failed with
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on 729 entries.

## Door 1 — no publish time

With `minimumReleaseAgeIgnoreMissingTime: false`, read back as `false` by `pnpm
config get`, a `github:` dependency and a codeload.github.com tarball dependency
**both installed**, exit 0. The key does not stop git or tarball dependencies.
pnpm writes a tarball as `resolution: {integrity: …, tarball: …}` and a
git-hosted package as `resolution: {gitHosted: true, tarball: …}`, while all 735
`resolution:` lines in the lockfile before this change were `{integrity: …}` and
nothing else. G67 now requires that of every resolution, and that the count of
integrity-only resolutions equals the count of package keys. What the key does
cover beyond that, presumably packages whose registry metadata has no `time`
field, was not observed. It stays at `false` as defence in depth.

## Door 2 — the trust policy

`trustPolicy: no-downgrade` fails today's lockfile on three entries, each
reported as a "possible package takeover":

| Entry | Published | Why it trips |
| --- | --- | --- |
| `semver@6.3.1` | 2023-07-10 | an old line, published after later lines carried provenance |
| `chokidar@4.0.3` | 2024-12-18 | the same shape |
| `chromium-bidi@157.0.8090-0` | 2026-10-07 | 19 of 177 versions were trusted-published from GitHub Actions, the last 17.0.2 on 2026-07-06; every 157.x and 158.x release since is token-published |

chromium-bidi arrives through `puppeteer-core@25.13.0`, which is published with
provenance and pins exactly that version. Results:

- **C4, by hand, once:** the build's lockfile under the final settings passes a
  frozen install. With the three `trustPolicyExclude` entries removed, the same
  install fails with `ERR_PNPM_TRUST_DOWNGRADE: 3 lockfile entries failed
  verification`, naming `chokidar@4.0.3`, `chromium-bidi@157.0.8090-0` and
  `semver@6.3.1`.
- With two of the three excluded it fails on the third.
- `trustPolicyIgnoreAfter: 43200` clears the two old entries and not
  chromium-bidi.
- `trustPolicyExclude` takes a bare name and `'*'`, so it shares the age hatch's
  hole. G67 holds it to exact versions.
- Naming chromium-bidi in `minimumReleaseAgeExclude` does not skip the trust
  check: the install still fails. The policy stays on for a version let through
  the age hatch, which is the case door 2 is about.

The three entries are let through on the owner's word. The repository has no
threat model, so the acceptance is recorded nowhere but the comment beside the
exclude. G67 holds the chromium-bidi entry to the version `puppeteer-core`'s
lockfile snapshot depends on, and every exclude to a package the lockfile holds.

## Door 3 — the deploy's wrangler fetch

`pnpm dlx` **applies the workspace's release-age window**. wrangler 4.151.1 was
published on 2026-10-16, and inside the workspace `pnpm dlx wrangler@4 --version`
printed 4.149.0; outside any workspace it printed 4.151.1. It did not apply the
trust policy: `semver@6.3.1`, which the frozen install refuses, ran through `pnpm
dlx` with exit 0 even with `--config.trust-policy=no-downgrade` on the call. So the
credentialed wrangler fetch was the one install the stolen-token check did not
reach, which is why wrangler became a root devDependency (ADR-0116).

- 4.149.0 is the newest 4.x at least seven days old (4.150.0 is from 2026-10-13).
  `pnpm add --save-exact` still wrote a caret in the measurement, so the pin is
  written by hand.
- Lockfile change from adding it: **27 package keys added, none removed** (735 to
  762). The snapshot section also rewrites 27 entries whose peer suffix gained
  `supports-color@7.2.0` variants; no version changed. Added: wrangler, miniflare,
  workerd and its five platform packages, `@cloudflare/kv-asset-handler`,
  `@cloudflare/unenv-preset`, `@cspotcode/source-map-support`,
  `@jridgewell/trace-mapping@0.3.9`, `@poppinss/colors`, `@poppinss/dumper`,
  `@poppinss/exception`, `@sindresorhus/is`, `@speed-highlight/core`, blake3-wasm,
  cookie, error-stack-parser-es, path-to-regexp, supports-color@10.2.2, undici, unenv,
  ws, youch and youch-core. Every resolution stays integrity-only.
- **New allowed builds: no.** The lockfile holds the same single `esbuild@0.28.2`
  and `sharp@0.35.5` as before. workerd is the only new install script, and a
  frozen install fails with `ERR_PNPM_IGNORED_BUILDS` without an answer, so
  `allowBuilds` gains `workerd: false`.
- **C9, on the Windows workstation, after the frozen install:** `pnpm exec wrangler
  --version` printed `4.149.0`, exit 0; `pnpm exec wrangler pages deploy --help`
  printed the usage, exit 0. Whether `pages deploy` itself needs workerd's binary
  cannot be checked without a real deploy, which this work did not run, and neither
  can wrangler reaching its login. Both are the owner's next deploy.
- wrangler's usage telemetry is on by default; its CLI reads
  `WRANGLER_SEND_METRICS`. The upload sets it to `false`.

## Door 4 — Dependabot

GitHub's Dependabot options reference supports `cooldown` `default-days` for the
`github-actions` ecosystem, and says cooldown does not apply to security updates.
The entry gets `default-days: 7`. Not gated, matching the npm entry.

## What the build changed beyond the spec's text

- `loadEnv` returns the names it set; `runShell` can take a whole environment.
  Both serve C14, which keeps the Google Books key and the vault path out of the
  upload.
- **The Thoughts parser's resolved closure moved**, as a side effect of the
  wrangler pin: `debug`'s optional peer under micromark now links
  `supports-color@10.2.2` (published 2025-09) instead of 7.2.0, and `has-flag`
  drops out. N67's list was updated on the owner's word (q1). No micromark, debug
  or parser code changed, and the default build never loads `debug`. It departs
  from the letter of ADR-0107, which wants a closure move as its own change.
- C6's dry-run, against a one-note scratch vault (the fixture vault trips the
  stale-fixtures check, as it should): all four gates ran, then `--dry-run`
  printed `checked: the installed wrangler is 4.149.0, its pin` and `to publish:
  pnpm exec wrangler pages deploy packages/site/dist --project-name stacks`.
- Expected failure to expect: a `dev-tooling` Dependabot pull request that moves
  chromium-bidi goes red on `ERR_PNPM_TRUST_DOWNGRADE` until the owner moves the
  exact exclude.
