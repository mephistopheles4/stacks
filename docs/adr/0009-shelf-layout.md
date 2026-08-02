# Books flow continuously and wrap, at real bookcase proportions

Books fill each shelf and wrap to the next, newest first, with a bookend-sized gap at a year change. Proportions come from a real bookcase — a hardback is ~3cm thick and ~23cm tall, a shelf ~90cm wide — so a shelf holds about thirty books.

The brief sketched one row per year; in 3D that leaves every shelf two-thirds empty wood, which reads as a chart rather than as furniture. Wishlist books stay off the shelf entirely: you do not own them.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **Books flow continuously and wrap, rather than one shelf row per year.** The brief sketched year-per-row; in 3D that leaves every shelf two-thirds empty wood, which reads as a chart and not as furniture. Directed by the owner at the aesthetics review ("I want a real bookcase feel"). Chronological order is kept — newest first — and a year change opens a bookend-sized gap, so the grouping stays legible.

- **2026-07-31** — **Shelf proportions taken from a real bookcase**, not chosen to look tidy: a hardback is ~3cm thick and ~23cm tall and a shelf ~90cm wide, so shelf width is ~4× book height and a shelf holds ~30 books. Matching that ratio is what makes it read as furniture.

- **2026-07-31** — **Wishlist books stay off the shelf** — owner's call. You do not own them yet. Print and audiobook editions of one title still render as two spines.

- **2026-07-31** — Camera distance is **computed to fit** the case in the vertical FOV rather than hardcoded — a guessed distance drops the top shelf out of frame as soon as the shelf grows a row.

- **2026-07-31** — `mountShelf` exposes `projectBook(index)` so the click test can aim at a real book. A hardcoded pixel coordinate stops pointing at anything the moment the layout changes, and would keep passing while testing nothing.
