# 2026-08-08 — the update that reported success and changed nothing

`main` had been red since G26 landed, on the `audit` job rather than on anything
in the code: `js-yaml` 4.3.0 (GHSA-5p4m-2wfm-xmqj, via astro) and `nanoid` 3.3.16
(GHSA-2v37-7h3g-55p8, via vite>postcss), both high. It also blocked both open
Dependabot pull requests, whose own `suite` legs were green on every Node version
— the audit failure was inherited from the base, and a bump of a GitHub Action
SHA failed identically to prove it.

Both advisories had patches published. Only one installed. **`pnpm update nanoid`
exited 0, printed a normal resolution summary, and left the tree on 3.3.16** —
because pnpm 11 quarantines newly published versions for seven days by default
(`minimumReleaseAge`), and 3.3.17 was five days old. `js-yaml` 4.3.1 was eight
days old and moved without help, which is what made the failure look like a
package-specific quirk rather than a clock.

The policy is worth keeping — seven days is the window in which a compromised
release gets caught — but it declines *security* patches inside it, silently, and
the silence is the problem. An explicit `overrides` entry is honoured where
auto-resolution is not: the policy governs which version pnpm will pick, not one
it is told to use.

**Not an `ignoreGhsas` entry**, though the gate's own comment offers that hatch.
It is for an advisory with no fix published; here the fix existed and only needed
naming. Ignoring it would have suppressed a solvable problem for seven days, and
`ignoreGhsas` entries outlive their reasons.

Verified green locally before pushing: `pnpm audit --audit-level=high` clean,
`pnpm install --frozen-lockfile` accepting a lockfile whose transitive versions
moved while no manifest did, 429 tests, typecheck, build, `gate:public`.
