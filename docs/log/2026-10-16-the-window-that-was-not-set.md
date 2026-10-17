# 2026-10-16 — the window that was not set

[#399](https://github.com/mephistopheles4/stacks/issues/399). For two months
this repository's comments called pnpm's `minimumReleaseAge` *seven days by
default*. Nothing set it. On 2026-10-02 pnpm 11.18.0, left to itself, resolved
a release two days old. The issue asked for three things: set seven days, find
out which of two explanations for the August nanoid decline was true, and check
what the setting does to an install. Every probe below ran on pnpm 11.18.0
through `pnpm dlx pnpm@11.18.0`, in scratch folders outside the repository.

## The August decline was not the window

[The August log](./2026-08-08-the-update-that-reported-success-and-changed-nothing.md)
says `pnpm update nanoid` exited 0 and left 3.3.16 because a seven-day window
held back 3.3.17, which was five days old. A window under two days would have
let it through. So either the default changed between that pnpm and 11.18.0, or
the August diagnosis was wrong.

**The default did not change, because the pnpm did not.** `package.json` has
pinned `"packageManager": "pnpm@11.18.0"` since the scaffold commit on
2026-07-31, and pnpm 11 switches to that version inside the repository.

**The diagnosis was wrong.** The manifests and lockfile from `718bfd7^`, the
tree just before the August fix, were copied to scratch and the commands
replayed today. Every nanoid release named here is now months old, so no window
of any length can hold one back:

| Run | Window | nanoid after |
| --- | --- | --- |
| `pnpm update nanoid --lockfile-only` | default | 3.3.16 |
| `pnpm update nanoid --recursive --lockfile-only` | default | 3.3.16 |
| `pnpm update nanoid js-yaml --recursive --depth Infinity --lockfile-only` | default | 3.3.16 (js-yaml moved, 4.3.0 → 4.3.2) |
| `pnpm update nanoid --recursive --depth Infinity --lockfile-only` | **0** | **3.3.16** |
| `pnpm update --recursive --depth Infinity --lockfile-only` | 0 | 3.3.20 |
| `pnpm update --recursive --depth Infinity --lockfile-only` | default | 3.3.20 |

Exit 0 every time. With the window switched off, the named update still leaves
3.3.16, and an update that names nothing moves it. The named update never
reached nanoid's transitive copy under `postcss`. The window was not involved.
⚠️ **Why a named update moves js-yaml and not nanoid was not isolated.** postcss
8.5.25 asks for `^3.3.16`, which admits every later 3.3 release, so the range is
not the reason.

The August override fits a window of about a day. `^3.3.17` resolved 3.3.17
that morning while 3.3.18 was about 21 hours old. That fits; it is not a
measurement of the default.

## What pnpm's default is

**Consistent with 1440 minutes, not measured as 1440.** Two probes today:

- A fresh resolution of `postcss@^8.5.29` takes 8.5.30, four days old, under the
  default, and 8.5.29 under `minimumReleaseAge: 10080`.
- A full `pnpm update --recursive --depth Infinity` over this repository's own
  manifests leaves **53 lockfile entries younger than seven days** under the
  default. The youngest is about 26 hours old. Under 10080 it leaves **0**.

The second probe is also the evidence that `pnpm update` respects the window.

## What the setting does to an install

The issue expected a frozen install to be unaffected. **It is not.** pnpm 11
checks the lockfile against the window before it installs:

- The lockfile on `main` at `0a458e7` passes `pnpm install --frozen-lockfile`
  with the key set, 731 entries, and stays byte-identical (sha256
  `8f28aedf…` before and after). That is true only because no entry is under
  seven days old today.
- **The canary**: a scratch lockfile holding postcss 8.5.30 (four days old)
  fails a frozen install under 10080 with
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.

So a lockfile that gains a young entry turns CI red until the entry ages. That
is the reason for Dependabot's `cooldown: default-days: 7`, decided by the owner
through the head chef as q1 (A). ⚠️ **Security updates ignore cooldown**, so a
security bump inside the window still fails CI.

## The override escape hatch was false

The nanoid block said an explicit override is honoured where auto-resolution is
not. Under an explicit 10080 window:

| Override | Result |
| --- | --- |
| `postcss: 8.5.30` (exact, four days old) | `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, exit 1 |
| `postcss: ^8.5.30` | the same |
| `^8.5.30` plus `minimumReleaseAgeExclude: [postcss@8.5.30]` | resolves 8.5.30, and a frozen install of that lockfile passes |

**The hatch for a security fix inside the window is `minimumReleaseAgeExclude`,
naming the exact version, beside the override.** It takes patterns too, and they
are dangerous: under `minimumReleaseAgeExclude: ['*']`, and under a bare
`postcss`, the same probe resolved 8.5.30 inside the window. One wildcard
switches the policy off with the key still at 10080, so G67 refuses any entry
that is not one exact `package@version`. integrity-lens found this.

Two neighbouring settings also switch the window off, and adversarial-lens named
both. Under `minimumReleaseAgeStrict: false`, pnpm wrote
`postcss@8.5.30` into `minimumReleaseAgeExclude` by itself and resolved it.
Under `trustLockfile: true`, the four-day-old lockfile that failed a frozen
install above went through. G67 refuses both. A duplicate key is not a third
route: pnpm refuses to parse a file holding `minimumReleaseAge` twice, quoted or
not. The claim in the nanoid block
could not be tested under the default window; no override probe here named a
version younger than a day.

## What is unverified

- **Dependabot.** It reads its configuration from `main` only, so the cooldown
  and its interaction with the window cannot be seen before this merges.
- **The mechanism of the named update**, above.

## What changed

- `pnpm-workspace.yaml`: `minimumReleaseAge: 10080`, with a comment giving the
  reason and the hatch. The nanoid, fast-uri and http-cache-semantics blocks are
  marked corrected in place.
- `.github/dependabot.yml`: `cooldown: default-days: 7` on the npm entry.
- `docs/gates.md`: row G67 (`release-age`), and the nanoid lesson marked
  corrected. `docs/gate-register.md`: G67's entry.
- [The August log](./2026-08-08-the-update-that-reported-success-and-changed-nothing.md)
  gained a pointer here and nothing else.
- Two ADRs make the old claim and are left as written, since an ADR records the
  reasoning of its day:
  [ADR-0095](../adr/0095-a-comment-carries-the-date-and-an-ignore-expires-in-30-days.md)
  ("a fix inside pnpm's 7-day quarantine") and
  [ADR-0107](../adr/0107-thoughts-are-read-by-a-commonmark-parser.md)
  ("checked by hand until #399 lands"). ADR-0104 calls the window seven days in
  passing.
