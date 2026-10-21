# ADR-0118 — The settings diff rides in `?debug=<json>`, and `?tune=` is retired

**Date:** 2026-10-21
**Status:** accepted
**Issue:** [#492](https://github.com/mephistopheles4/stacks/issues/492), carrying out the fold resolved in [#490](https://github.com/mephistopheles4/stacks/issues/490)

## Decision

The URL-encoded JSON diff from the defaults, which rode in `?tune=`, rides in
the value of `?debug`. `readSettings` reads it from there and from nowhere else;
`writeSettings` writes it there, and writes bare `debug` when the diff is empty.
A page ignores `?tune=` and prints one console line naming the new spelling
(`retiredTuneHint`, called from `boot.ts`). `?woodSeed` and the flat probes stay
where they were, and no setting writes `tune`.

`carriesSettings` moved from `diagnostics.ts` to `shelf-url.ts`, beside the
reader it must agree with, and is exported so a Node test can fail on it. A
`?debug=<json>` whose diff changes a setting counts as carrying settings, bare
`?debug` and a value that reads as no diff do not, and any other parameter still
does. It used to delete `debug` first, which would have made the crash warning
silent for every link that now carries its settings in that value.

## Why

A page without `?debug` can no longer be tuned by a link. The pane, the black box
and the pickup tuner all mount behind `?debug`, and a diff that applied without
it would configure a shelf with nothing on the page that shows it did. One
parameter now says both that the instruments are on and what they changed.

## Consequences

Old `?tune=` links are history. They open the shipped shelf, with the console
line as the only trace, which sits beside the acceptance
in [ADR-0092](0092-the-fog-range-is-measured-in-framing-distances.md) that old
`?tune=` links can change meaning when a default moves. The cost is a shelf that
looks untuned to someone holding an old link, who has to retype the value. The
console line says so, and nothing is converted.

`smoke:render`'s fog plant for G59 moved to `?debug=<json>`, so the planted frame
now also mounts the instruments; the large-library check reads the bookcase and
must keep finding the fog with them present.
