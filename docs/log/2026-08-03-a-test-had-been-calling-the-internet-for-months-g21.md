# A test had been calling the internet for months — G21

`packages/core/src/enrich.test.ts` downloaded a real cover from
`covers.openlibrary.org` on every run. It surfaced as an intermittent CI timeout
on `suite (node 22)` — 1290ms locally against 5ms for its six siblings, at a
quarter of vitest's 5s cap, and a loaded 2-core runner needs only a ~4x
slowdown to blow that. The leading theory was sharp's native binding load; it
was wrong, and cheaply so — that import costs ~290ms and vitest charges it to
`import`, not to whichever test runs first.

The seam: the metadata layer takes an injected `HttpGet` so lookups stay off the
network, but `covers/cache-cover.ts`'s `download` reaches for the global
`fetch`, so the injection stops short of the bytes. The fixture response carries
an ISBN and no `cover_i`, so the adapter guesses a `covers.openlibrary.org` URL
and that URL was really being fetched. Fixed by stubbing `fetch` in that file:
1448ms → 62ms, with the cover path still exercised rather than quietly dropped.

**The belief that this could not happen was written down in three places**, and
this file was one of them — the note under worktrees explains that `.cache/` is
safe to keep per-checkout _because_ tests inject a fixture-backed `HttpGet`. The
claim is true; the reasoning is the incomplete model that let this through, and
it is left standing above as the record of what everyone thought. The other two
are `CLAUDE.md`'s Phase 1 gate and `covers/download.test.ts`'s opening comment.

G21 makes it mechanical. Two findings worth carrying, both in
[`gates.md`](../gates.md) in full: a guard that only _throws_ is swallowed by
`download`'s deliberate `catch { return undefined }` and reports **7 passed**,
so the gate records attempts and asserts in an `afterEach` instead; and the
gate's own spec was vacuous until the installation was split into its own file,
because the spec installed the guard merely by importing it.
