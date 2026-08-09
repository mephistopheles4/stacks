# ADR-0032: The shelf's look is one settings object, and moving it reports back

**Status:** accepted
**Context:** [#39](https://github.com/mephistopheles4/stacks/issues/39) (map),
[#40](https://github.com/mephistopheles4/stacks/issues/40),
[#41](https://github.com/mephistopheles4/stacks/issues/41)

## What was decided

Everything the shelf's look depends on now lives in one total object,
`ShelfSettings` in `packages/site/src/shelf/shelf-settings.ts`, and
`ShelfHandle.applySettings` moves the live scene to a new one and **reports what
it could not move**.

## Why one object

The debug panel exports a **JSON blob** you can paste back as the shipped
defaults. That forces a single thing to serialise, and there was not one: the
tunables were spread across `COLOURS` and three light intensities written inline
in `scene.ts`, nine probe switches in `RendererOverrides`, and a dozen alphas in
`contact-shadow.ts`. Nothing could ask "what is the shelf running", so nothing
could answer it.

It is a `.ts` file rather than a `.json` fetched at runtime because JSON is a
subset of TypeScript object-literal syntax: dial, copy, paste between the braces,
and `pnpm build` typechecks what you pasted. A key you invented is a red build
rather than a silent default. A runtime `.json` would also be a new artifact in
`public/` for `gate:public` to reason about, and a fetch on the boot path for
data that cannot change without a redeploy.

## Why two types and not one

`RendererOverrides` stays, stays partial, and stays named after query parameters.
`ShelfSettings` is total. They mean different things:

- A **partial** says what a URL had an opinion about. Absent is not the same as
  "asked for the default" — `flag()` in `boot.ts` returns `undefined` for a
  missing parameter precisely so a typo shows the whole shelf rather than a
  silently defaulted one.
- A **total** says what the shelf is running. A blob with a missing key cannot be
  pasted back and reproduce what you saw.

`toSettingsPatch` is the one place they meet. This is the same shape
[Cover acquisition — G22](../log/2026-08-03-cover-acquisition-g22.md) records: `writeBook` speaks
the domain (`coverSource`), `updateBook` speaks the file (`cover_source`), and
letting the boundary show in one named place beat collapsing the vocabularies.

## What is deliberately excluded

**The case's geometry.** `SHELF` stays in `case.ts`. It is not an aesthetic knob:
`placement.ts` packs against `USABLE_WIDTH`, and G25 / [ADR-0031](0031-one-usable-width.md)
exist *because* that number had five live answers which disagreed by 0.162 across
a row. Putting it in a hand-editable blob re-creates that defect with a slider on
it, and a control that silently re-places every book is not what was asked for.

**Anything derived.** `caseLight()` computes the two ratios the painted shadows
are drawn from, out of the key light's position. Derived values stay functions of
the settings and are never stored, or a hand-edited blob could describe a light
that does not exist.

## Why `applySettings` returns a report

This is the part that is hard to reverse, and the reason is a rule this project
has already paid for:

> A probe that silently did nothing would be worse than no probe.

Every one of the original ten probes was verified to have a real measured effect
before it shipped, because a probe that appears to work and does not sends the
owner off to rule out the actual cause. A panel control is the same hazard
wearing a nicer UI. So `ApplyReport` has three lists — `applied`, `needsRebuild`,
`needsReload` — and every branch of `applyLive` either changes something and says
so, or refuses and says so. Nothing is silently dropped.

Three faults were caught this way rather than by a test, and each would have been
a control that lied:

1. **The shadow toggle.** `shadowMap.enabled` alone is not enough — the key
   light's `castShadow` is what allocates the depth target and what gets anything
   drawn into it, and it was set once at mount. Turning shadows on without it
   leaves the shelf looking identical.
2. **The shadow frustum.** `far` is measured from the light to its target, so
   moving the light left the frustum sized for where it used to be. A shadow
   clipped by its own frustum ends in a hard straight line across the wood, which
   reads as a rendering fault rather than a stale setting. `fitShadowCamera` is
   extracted so it can run again.
3. **The program set.** Three decides what to recompile through
   `materialNeedsLights()`, which returns **false** for `MeshBasicMaterial`. So a
   live shadow toggle relinks the lit materials and leaves the painted shadow
   planes alone — and those planes are the entire point, because the program that
   will not link on the Pixel 10 *is* one of them. A live toggle would have
   appeared to work on the device that cannot hold the shipped default. The
   control dirties every material explicitly, which restores the equivalence
   between the panel and the URL it writes.

## Consequences

- `profile` is now a getter reading current state rather than a string built at
  mount. It had to be: it is written into every black box snapshot, and a
  `profile` naming the settings the page *started* with would lie on the one
  instrument that survives a tab death.
- `mountShelf` gained a mutable `settings` binding. Everything that reports on
  the shelf reads through it.
- **A remount is not free**, and the panel must not treat it as such:
  `TextureCache` is per-mount and `dispose()` frees it, so a rebuild re-pays
  ~24 MB of cover upload on the real vault. Lifting the cache out of the mount is
  a prerequisite for making rebuild-on-change routine.
- No pixels moved. Every default is the literal that used to sit at the call
  site, and `pnpm smoke:render` reports the same 49 books, the same 0.0012 case
  overflow and the same 1285 distinct colours at 25.3%.
