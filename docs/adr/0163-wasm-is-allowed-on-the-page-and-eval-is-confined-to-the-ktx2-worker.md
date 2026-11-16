# ADR-0163 — WebAssembly is allowed on the page, and eval is confined to the KTX2 worker

**Date:** 2026-11-15
**Status:** accepted, built in [#601](https://github.com/mephistopheles4/stacks/issues/601)
**Issue:** [#601](https://github.com/mephistopheles4/stacks/issues/601), ticket T2 of the room spec ([#593](https://github.com/mephistopheles4/stacks/issues/593), revision 3, S5 and S6)
**Amends:** [ADR-0065](0065-the-csp-is-generated-not-written.md): two additions to the page policy, one block in `_headers`
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)

## Decision

1. **The page's `script-src` gains `'wasm-unsafe-eval'`.** The room's meshopt decoder and its
   KTX2 transcoder compile WebAssembly, which a CSP refuses without it. Injected scripts are still
   refused by the hashes. Astro emits one policy for the whole site, so the keyword applies on every
   page, Turnstile's and the analytics script's included.
2. **The page's policy gains `worker-src 'self'`**, and no `blob:` source appears anywhere in it.
3. **The page never gains `'unsafe-eval'`.** three's basis transcoder glue builds functions with
   `new Function`. That code runs only in a dedicated worker loaded from its own same-origin file,
   `public/rooms/basis/ktx2-worker.js`, never from a `blob:` URL: a `blob:` worker inherits the
   page's policy, and a worker loaded from a URL takes its own from its response.
4. **That response carries its own policy**, in `public/_headers` for that one path:
   `default-src 'none'; script-src 'unsafe-eval' 'wasm-unsafe-eval'`. The worker can fetch nothing:
   the page fetches the wasm and posts the bytes in. The `/*` block's `frame-ancestors` policy also
   reaches that path; two policies both apply, and each is enforced.
5. **The worker is generated, not written.** `packages/site/rooms/basis/make_ktx2_worker.mjs`
   builds it from three's `KTX2Loader` and `basis_transcoder.js` at the installed three version,
   and is rerun on every three upgrade. The generated file is excluded from Prettier and ESLint, so
   the committed bytes are the tested bytes and the served bytes.
6. **Both texture sets ship and WebP is the default.** The default is one constant,
   `DEFAULT_ROOM_CODEC` in `room-codec.ts`, and the owner flips it to `'etc1s'` by a typed word, in a
   commit of its own, after the device matrix passes. A KTX2 failure (the worker will not start or
   stays silent, the wasm does not load, a transcode fails) drops that page load to the WebP set and
   warns once.
7. **G20 holds all of it** in `dist/`: the page's `script-src` with `'wasm-unsafe-eval'` and never
   `'unsafe-eval'`; `worker-src 'self'` and nothing else in it; no `blob:` in any directive;
   `'unsafe-eval'` in exactly one `_headers` block, keyed on exactly the worker's path, under
   exactly the policy above; the worker and the wasm present; and no confinement-probe file or
   script in a production build.

## Why

The room's meshes are meshopt-compressed and its textures are KTX2 ETC1S: about 190 MB of GPU
memory against about 1.5 GB for the WebPs unpacked (measured on bake 10, 49 textures), for 8 MB more
download. Both decoders compile WebAssembly, and the transcoder's glue calls `new Function`.

The prototype showed the obvious route fails: three starts the worker from a `blob:` URL, the
worker takes the page's policy, `default-src 'none'` refuses the eval, and the room draws white.
Allowing `'unsafe-eval'` on the page would have fixed it by giving every script on every page an
eval. Loading the worker from its own file moves the one grant onto a response whose policy says
the worker can reach nothing, so what eval can do there is bounded by what the worker can touch.

## What stays open

- **Eval inside a worker that can reach nothing, and the confinement is the response header.** A
  worker loaded from a URL takes its policy from its own response, so if that header is not served
  or not applied, nothing else confines the worker: the file is this project's own generated one,
  but it could then fetch, import and use eval. G20 reads `_headers`, not the served response, so
  a host that changes how it serves that header is not seen; the check that the served response
  carries it, and that the worker fails to `fetch`, start a worker or `importScripts`, is made once
  by hand on a preview (T6). Whether Safari on iOS applies the worker's response policy, and
  whether Cloudflare Pages serves the `_headers` block on that path, are unverified until then. If
  a browser applies the page's policy instead, eval is refused inside the worker and nothing
  reaches the page: no `error` event fires (measured in headless Chrome). The loader treats a first
  worker silent for 15 seconds (`KTX2_STALL_MS`) as a KTX2 failure and drops that page load to
  WebP, and the flip waits for a fix.
- **`worker-src 'self'` admits any same-origin script as a worker.** Before this change a worker
  fell back to `script-src`, which admitted the same origin and two Cloudflare origins, so this
  narrows the page and was already true of it. It matters only after the page is compromised,
  which the page's hashes are there to prevent.
- **`'wasm-unsafe-eval'` is on every page**, because Astro emits one policy. It admits
  `WebAssembly.compile` and nothing that turns a string into JavaScript.
- **Nothing binds the generated worker and wasm to three byte for byte.** An accepted risk under
  the Hardening limit of 0 (spec S23, E42): a three upgrade that is not followed by a rerun leaves
  the older worker in place. The page's policy and the worker's response policy do not change with
  it. The loader also reaches into three's own members (`transcoderPending`,
  `workerPool.setWorkerCreator`, `workerConfig`) and the worker's `init` message, which its tests
  fake; a three release that renames them is the same accepted risk.
- **`_headers` rules that detach a header.** G20 reads the worker's own block, not a later, broader
  one that removes headers with `!` (Cloudflare applies rules in file order). Such an edit could
  strip the worker's policy with G20 green. It matters only after the page is compromised, so it is
  an accepted-risk candidate under the Hardening limit of 0 and nothing guards it.
- **Three's `WorkerPool` never rejects**, so a worker that fails to start, dies or sends an unreadable
  message, and a wasm that does not load, would leave every transcode pending. The loader turns
  each into a rejection, and the silent worker into one after `KTX2_STALL_MS`, so a KTX2 failure
  always reaches `loadWithFallback`. A silence on a slow device that is not a failure costs only
  the WebP download.

## Provenance

`basis_transcoder.js` and `basis_transcoder.wasm` are the Basis Universal transcoder (Binomial
LLC, Apache-2.0) as three 0.185.1 ships it under `examples/jsm/libs/basis/`; the worker body is
three's own (MIT). Both licences allow redistribution. Neither file is a binary the G13
(`no-third-party-material`) extension list reads, and the room's own `SOURCES.md` is T1's.

Apache-2.0 §4(a) makes a copy of the licence part of redistributing the binary, so the licence
text is served beside it, as `/rooms/basis/LICENSE-basis-universal.txt`, and G20 refuses a build
that serves the wasm without it. The file also carries three's MIT notice, which the generated worker body needs, the repository's `NOTICE`, which asks
redistributions to include it (§4(d)), and the BSD-3-Clause text for Zstandard, which the
transcoder contains and whose binary redistribution must reproduce it. The wasm is served as
three ships it, so §4(b) has nothing to mark. The licence file is copied by hand from the
repository, so it moves with a three upgrade, as the wasm does.

## Not built here

The confinement probe (it tries `fetch`, a second worker and `importScripts`, and is served from a
scratch folder alone) and the Pages fixture preview are T6's. G20 already refuses a probe in a
production build, by a file under `rooms/` named `*probe*` (a book's cover may be called
"The Space Probe", so a name elsewhere is no probe) and by the marker string
`stacks-confinement-probe` in any text file the build holds; T6's probe carries that marker.

## How this was decided

Spec revision 3 on #593, S5 and S6, signed off by the owner in chat on 2026-11-15 after two review
rounds, with the security pair's findings taken (E23, E37, E46, E51). The prototype branch
`prototype/593-baked-room` holds the worker setup this takes: the generator, the `_headers` block
and the loader's own-worker start.
