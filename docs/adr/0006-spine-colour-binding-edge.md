# Spine colour is sampled from the cover's binding edge

A book's spine colour is extracted from the strip of the cover nearest the binding, not from the whole image, because on a real hardback the printed sheet wraps continuously around the spine. Near-white and near-black pixels are set aside first.

Sharp's own `stats().dominant` was rejected: it bins colours and returns the bin representative, which is close enough to look right and useless to assert on.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **Own dominant-colour algorithm rather than sharp's `stats().dominant`**, which bins colours and returns the bin representative (`#286878` for a cover that is exactly `#2f6d7a`) — close enough to look right, useless to assert on. Ours bins coarsely to find the winning region, then averages the real pixels in it.

- **2026-07-31** — **Near-white and near-black pixels are set aside when picking a spine colour.** Found by running `stacks add` for real: the first live cover produced `spine_color: "#fefffe"`, because real covers are printed on and photographed against white. Extremes are used only if nothing else survives, so a genuinely white cover still gets a white spine. Regression fixtures: `white-bordered.png`, `all-white.png`.

- **2026-07-31** — **Spine colour is sampled from the cover's left edge, not the whole cover.** On a real book the printed sheet wraps continuously around the spine, so the strip nearest the binding *is* the spine — a cover that is mostly white with a colour band down one side has a coloured spine. Falls back to the whole cover when the edge is nothing but paper (padded cover images). Owner's call: "as close as possible to the real book spine".
