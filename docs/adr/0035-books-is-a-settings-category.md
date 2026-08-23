# ADR-0035: `books` is a settings category, and the line is shape against shading

**Status:** accepted
**Context:** [#57](https://github.com/mephistopheles4/stacks/issues/57) and
[#65](https://github.com/mephistopheles4/stacks/issues/65), under map
[#50](https://github.com/mephistopheles4/stacks/issues/50)

## What was decided

`ShelfSettings` grows a seventh group, `books`, holding the knobs that change
what **shape** a book is. `materials` keeps the knobs that change how a book is
**lit**. Nothing straddles the line, and every future knob about a book has to
land on one side of it.

The first two occupants are `books.paperbackRatio` (#57) and, when the head cap
lands, `books.headCap` (#56/#66). Against them, `materials.spineProfile` (#65)
stays in `materials`: it is a normal map, so it only ever shades — no silhouette
changes and nothing moves.

## Why this needed a decision at all

Because there was nowhere for it to go, and the near-miss was a real one.

`ShelfSettings`' six groups are renderer, effects, shadows, lighting, scene and
materials. **Every dimension of a book is a module constant outside the settings
object**: `BOARD` and `SQUARE` in `scene.ts`, `MIN_HEIGHT`/`MAX_HEIGHT` and the
thickness bounds in `books.ts`. The one knob that shows on the books rather than
on the furniture is `materials.coverRoughness`, and its own comment says so —
which reads like an invitation to put the binding mixture beside it.

That would have been wrong, and the ticket that found it out is #56. It shipped
`softHinge` and `headCap` as **one** knob, and the single knob changed the
shading of all 49 books _and_ the silhouette of 20 — so the cap's +20 draw calls
could not be seen in any measurement, because a shading change was moving at the
same time. Splitting them is what made the cost legible. The category boundary is
that lesson written down: a group whose members all cost nothing but a recompile
is a group you can dial freely, and a group whose members change geometry is one
where a rebuild is doing real work.

## The knobs here are taste; the constants beside them are not

2.6mm of board and 3mm of binder's square are measurements of real bookbinding.
They are facts, and they stay constants in `scene.ts` where nobody can dial them.
What is in `books` is the opposite: the _mixture_, which is unknowable without
seeing it, and which #57 settled on a picture rather than on an argument.

That is the test for admitting anything else here. A number somebody could look
up is not a setting.

## Consequences

- **`toRows` takes the category**, and it is a required parameter with no
  default. Binding decides each book's height band; height decides a face-out
  book's cover width; cover width is its footprint — so the packer is downstream
  of the mixture and cannot be allowed to pack against a different one. A default
  parameter here would be a fifth live answer to a question G25 already cost this
  project a day over ([ADR-0031](0031-one-usable-width.md)).
- **`books` rides in `?tune=`**, like every other category with no historic
  spelling. `shelf-url.ts` gained a clause in both directions; the ten flat probe
  spellings are untouched.
- **Everything here is `needsRebuild`.** Geometry is built once inside
  `buildBook`, so a live update would move a slider over an unmoved shelf, which
  is the one thing [ADR-0032](0032-shelf-settings-are-one-object.md) does not
  permit.
