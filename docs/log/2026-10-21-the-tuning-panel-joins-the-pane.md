# The tuning panel joins the pane

[#496](https://github.com/mephistopheles4/stacks/issues/496), on the map
[#486](https://github.com/mephistopheles4/stacks/issues/486) for
[#485](https://github.com/mephistopheles4/stacks/issues/485).

`debug-panel.ts` is deleted. `tuning-panel.ts` is a loop over `panel-model.ts`
that copies each row onto a Tweakpane binding inside the debug pane's second
folder. Measured in a real browser on Tweakpane 4.0.5 while building it:

- A rebuild disposes the tuning folder from inside its own button's click handler
  and nothing throws, so no `queueMicrotask` deferral is needed. The pickup tuner's
  folder element survives the rebuild, and the tuning folder returns at index 1.
- Set `binding.min` and `binding.max` on a slider and the control draws the new
  range at once: its knob moves from 18% to 31% of the track when 5 on a 0.1–3
  slider is reset to 1. That is how the shrink-back is read from the page.
- A list option's `value` attribute is its text, so the stray entry reads
  `walnut — not on the list` as both.
- The widening half of the range copy (a value that arrives beyond the range
  *after* mount) cannot be reached from the page: every control stays inside its
  own range, and a reset only shrinks. It is held by `tuning-panel.test.ts`
  against a fake of the pane, with a canary: removing the widening turns that
  test red.

Canaries run against `smoke:render`'s new tuning-panel check (a copy line removed
from the view, the check read red, the line restored): label, disabled, the
shadows folder's title and its disabled state, status text, the rebuild button's
hidden flag, list options, the written-back value, the narrowing, and a monitor
getter. Each went red.
