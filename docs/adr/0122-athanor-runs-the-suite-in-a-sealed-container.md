# ADR-0122 — athanor runs the suite in a sealed container, from an image that holds the installed workspace

**Date:** 2026-10-21
**Status:** accepted

## Decision

The root `package.json` carries an `athanor` key, and
`docker/athanor/Dockerfile` is the image it builds. athanor is not a
dependency and not a `pnpm` script: it is installed on the machine, and
nothing in CI or in any gate needs it. Five commands are named: `test`,
`typecheck`, `lint`, `build` and `smoke`.

The image installs the workspace with `pnpm install --frozen-lockfile` into
`/home/node/work`, the folder athanor unpacks the snapshot into, and is keyed on
the six manifests alone. Its `/usr/bin/google-chrome` is a wrapper that starts
Debian's Chromium with `--no-sandbox`, and the `smoke` command sets `CI=true`.

## Why

athanor gives each run a container with `--network none`, so nothing can be
installed when the test runs. The installed `node_modules` has to be in the
image, and it has to be where the run's tree lands: `node_modules` is
gitignored, so the snapshot never carries one and unpacks over it untouched.
Keying the image on the manifests rather than the source keeps a source edit
from rebuilding it.

**`--no-sandbox` is the surprising part, and it was measured, not assumed.**
The first `smoke` run failed at launch with Chromium's "No usable sandbox!":
athanor starts every container with `no-new-privileges`, and Chromium cannot
make its user-namespace sandbox under it. The other ways out were worse.
Changing athanor's container options is a security-sensitive change to athanor
itself (its ADR 0005), and leaving `smoke` out loses the one gate that drives a
browser. The container carries the isolation the sandbox would: no network,
no mount, and the only page loaded is the fixture site that same run built.

`CI=true` is what already makes `smoke-render.ts` choose SwiftShader. With no
GPU in the container the second run failed on "A WebGL context could not be
created", and the third, with `CI=true`, passed in 242 s with G60 and G61
included.

## Consequences

- A dependency change rebuilds the image on the next run; the build has the
  network and obeys the release-age window and the trust policy as CI does.
- The `--no-sandbox` wrapper lives only in this image. If `smoke` is ever
  pointed at a page from outside the run, the reasoning above stops holding.
- The screenshot stays in the container. `athanor run smoke` is a pass or a
  fail, not a picture to review.
- Git in the container is a single commit with no remote. Every gate passes
  against that today.

## Alternatives rejected

- **Installing at run time** from a store baked into the image. It needs pnpm's
  offline install to pass the release-age check with no registry to ask, which
  was not tried, and it costs an install on every run for no gain.
- **A pnpm script for athanor.** It would name a tool that is not installed by
  `pnpm install`, and G14 would hold `AGENTS.md` to it.
