# ADR-0119 — One pane for every `?debug` instrument: a shell, and a view file and a model file per instrument

**Date:** 2026-10-21
**Status:** accepted; first built in [#493](https://github.com/mephistopheles4/stacks/issues/493), amending [ADR-0104](0104-tweakpane-tunes-the-pickup-behind-debug.md)
**Issue:** [#485](https://github.com/mephistopheles4/stacks/issues/485), [#489](https://github.com/mephistopheles4/stacks/issues/489)

## Decision

The `?debug` instruments share **one Tweakpane `Pane`**, the *debug pane*.
ADR-0104's sentence *"the rest of the `?debug` page stays plain code until
tuning the motion is done"* is amended: tuning the motion is done enough to
move the rest in, one instrument per ticket.

- **A shell owns the pane.** `debug-pane.ts` is the only file that imports
  `tweakpane`, `@tweakpane/plugin-essentials` and the stylesheet as values, and
  the only file `boot.ts` imports for `?debug`, by one dynamic import. So the
  tuner-split gate (G64) is unchanged: `.tp-rotv` stays in the shared Tweakpane
  code and stylesheet, and a page without `?debug` fetches none of it.
- **An instrument is a view file and, where it has logic, a model file.** The
  view takes a folder, imports Tweakpane not at all (a declared slice of its
  API, `pane-slots.ts`), and has a `mount` that returns its dispose. The model
  is pure and is unit-tested in Node. The pickup tuner's model is
  `pickup-motion.ts`, as before.
- **Ordering is a unit-tested module.** `pane-slots.ts` has no Tweakpane and no
  DOM: it adds a folder per instrument, and can dispose one and add it again at
  the same index while the others keep their folders and timers. The tuning
  panel's rebuild needs that.
- **The pane is titled and starts collapsed at 700px wide or less**, the rule
  the tuning panel already had.

## Why

Stryker allows a file two states only, excluded with a mechanism or measured, so
a file that mixes view and model fits neither. The shell and the views are
browser-only and carry exclusions in `stryker.scopes.json`; the model files and
`pane-slots.ts` are measured. The cost accepted: the honesty checks of an
instrument reach its model in Node, and its view only in `smoke:render`, which
must read the rendered state for each field the view writes (#489).

## Consequences

- An instrument leaves the pane by deleting its view file and its one
  `slots.add` line in the shell.
- `debug-panel.ts`'s module-level `written` flag (#426) must stay in a module
  that loads once per page, which the shell is.
- A new dependency is not added; Tweakpane and essentials are as ADR-0104 left
  them.
