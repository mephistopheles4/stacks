# Architecture Decision Records

One file per decision: what was decided, and why. Numbered in the order the
decisions were made, so reading top to bottom is roughly the project's history.

Each record carries the original Decision Log entries that produced it, verbatim,
under **How this was decided**. That section is the valuable half — several of
these were expensive to learn, and a few record a first answer that turned out
wrong. Where an entry corrects an earlier one, both are kept.

**Adding one.** A new decision earns a record when all three are true: it is
hard to reverse, it would be surprising to a reader without the context, and it
was a real trade-off with alternatives. If any is missing, it probably belongs
in a commit message, or in [`gates.md`](../gates.md) if it is about a gate.
Number it one past the highest here, and append rather than editing an old one —
a decision that turned out wrong earns a new record that says so.

Two other files hold what these deliberately do not:

- [`../gates.md`](../gates.md) — which rule each gate protects, what it caught,
  and which rules are protected by nothing.
- [`../progress.md`](../progress.md) — where the project actually is, and the
  environment findings that only matter while working on it.

| # | Decision |
| --- | --- |
| [0001](./0001-vanilla-threejs.md) | Vanilla Three.js, not react-three-fiber |
| [0002](./0002-no-build-step.md) | No build step for `core` and `cli` |
| [0003](./0003-site-import-type-only.md) | The site may only `import type` from `@stacks/core` |
| [0004](./0004-fixtures-invented.md) | Fixtures are entirely invented, and no third-party material is ever committed |
| [0005](./0005-three-metadata-providers.md) | Three metadata providers, in a fixed order (four since 0038) |
| [0006](./0006-spine-colour-binding-edge.md) | Spine colour is sampled from the cover's binding edge |
| [0007](./0007-fuzzy-book-matching.md) | Matching a book is fuzzy, not exact |
| [0008](./0008-book-geometry.md) | A book is a case wrapped round a page block, not one painted box |
| [0009](./0009-shelf-layout.md) | Books flow continuously and wrap, at real bookcase proportions |
| [0010](./0010-private-fails-closed.md) | `private:` fails closed, alone among the optional keys |
| [0011](./0011-frontmatter-ordering-and-updates.md) | What outranks `shelf_order`, and what `updateBook` will not touch |
| [0012](./0012-public-build-staging.md) | A public build ships exactly its own covers, and only books you own |
| [0013](./0013-cover-provenance-and-rehosting.md) | Cover provenance comes from the bytes, and all of it is re-hosted knowingly |
| [0014](./0014-invariant-2-splits.md) | Invariant 2 splits: a public build may ship one allowlisted section |
| [0015](./0015-cover-texture-budget.md) | Covers are resized to 512px, under a per-cover cap and a total budget |
| [0016](./0016-painted-shadows.md) | Shadows are painted, not rasterised |
| [0017](./0017-books-stay-in-case.md) | Every book stays inside its own case |
| [0018](./0018-bounded-cover-downloads.md) | Bounded cover downloads: the magic-byte allowlist matters more than the size cap |
| [0019](./0019-deploying-is-local.md) | Deploying is a local operation, and `deploy:site` publishes `main` |
| [0020](./0020-one-env-every-worktree.md) | One `.env` in the main checkout, read by every worktree — never copied |
| [0021](./0021-audible-via-libation.md) | Audible via Libation, not Audiobookshelf |
| [0022](./0022-invariants-get-gates.md) | The invariants get gates, and the gates get a scoreboard |
| [0023](./0023-ci-shape.md) | CI: one required check named `gates`, on `pull_request` |
| [0024](./0024-decision-record-is-adrs.md) | The decision record is ADRs, extracted from a chronological log |
| [0025](./0025-history-not-rewritten.md) | The git history was checked by inspection, and not rewritten |
| [0026](./0026-constitution-is-gated-not-duplicated.md) | The constitution is CLAUDE.md's invariants, gated rather than duplicated |
| [0027](./0027-deploy-check-reports-refusal.md) | The deploy's live check reports what it cannot verify, and is never routed around |
| [0028](./0028-one-inspector-for-the-public-build.md) | One inspector for the folder about to be published; `gate:public` and `deploy:site` are callers |
| [0029](./0029-placement-imports-the-case.md) | The shelf's placement arithmetic imports the case rather than being handed one |
| [0030](./0030-two-spawn-helpers-not-one.md) | Two spawn helpers, one of which refuses a shell — never one with a `shell` flag |
| [0031](./0031-one-usable-width.md) | One usable width, and the packer charges what the placer spends |
| [0032](./0032-shelf-settings-are-one-object.md) | Everything the shelf looks like is one settings object |
| [0033](./0033-painters-follow-the-light.md) | The painters follow the light |
| [0034](./0034-bloom-behind-a-composer.md) | Bloom, behind a composer that costs the multisampling |
| [0035](./0035-books-is-a-settings-category.md) | `books` is a settings category, and the line is shape against shading |
| [0036](./0036-printed-faces-are-decals.md) | The printed faces are decals, not floats |
| [0037](./0037-ranking-does-not-reward-a-sparse-record.md) | Ranking scores brevity over the title alone, and breaks ties on completeness |
| [0038](./0038-oreilly-is-a-fourth-provider.md) | O'Reilly is a fourth provider, consulted last, covers included |
| [0039](./0039-a-book-after-a-year-gap-props-against-its-neighbour.md) | A book after a year gap leans across it, pivoting on its base |
| [0040](./0040-the-log-is-one-file-per-episode.md) | `progress.md` is a spine; the log is one file per episode, and a gate keeps the links honest |
| [0041](./0041-a-gate-has-a-number-and-a-name.md) | A gate has a number *and* a name, and the name is anchored to its spec |
| [0042](./0042-the-packer-runs-the-placer.md) | The packer runs the placer instead of estimating it |
| [0043](./0043-codeql-is-a-second-required-gate.md) | CodeQL is a second required gate, as a ruleset rule rather than a check name |
| [0044](./0044-precedence-is-a-table-not-a-judgement.md) | Precedence is a table of fixed provider orders, never a rule about the value |
| [0045](./0045-a-description-lives-in-the-note-body.md) | A provider's description lives in the note body, not in frontmatter |
| [0046](./0046-absent-only-holds-unconditionally.md) | Absent-only holds unconditionally, so a merge change cannot rewrite a correct book |
| [0047](./0047-the-contributor-set-is-the-id-keys.md) | The contributor set *is* the set of id keys, and they are ids rather than URLs |
| [0048](./0048-google-attribution-is-a-vendored-page-element.md) | Google's attribution binds this site, and is discharged by a vendored page element |
| [0049](./0049-the-card-is-a-non-modal-bottom-sheet.md) | The card is a non-modal bottom sheet below one breakpoint, and focus never moves |
| [0050](./0050-provider-marks-are-redrawn-monotone.md) | The provider marks are redrawn monotone glyphs, not the providers' artwork |
| [0051](./0051-the-staging-resize-chooses-its-encoder.md) | The staging resize chooses its encoder, and it is chosen per format |
| [0052](./0052-the-enlarged-cover-is-a-real-dialog.md) | The enlarged cover is a real `<dialog>`, and the card is still not one |
| [0053](./0053-stryker-measures-eight-declared-scopes.md) | Stryker measures eight declared scopes, pinned exactly, and gates nothing |
| [0054](./0054-a-check-is-a-gate-or-a-trend.md) | A check is a gate or a trend, and the taxonomy is binary |
| [0055](./0055-ci-writes-a-durable-record.md) | CI writes a durable record; the machine pulls it |
| [0056](./0056-the-constitution-is-agents-md.md) | The constitution is AGENTS.md, and CLAUDE.md imports it |
| [0057](./0057-the-pull-request-title-is-the-commit-subject.md) | The pull request title is the commit subject, so the convention lands there |
| [0058](./0058-the-trend-store-is-a-container.md) | The trend store is a pinned container the sync owns |
| [0059](./0059-the-sync-refuses-a-rewritten-record.md) | `trend:sync` refuses a rewritten record |
| [0060](./0060-the-deploy-reads-the-mirror-and-the-probe-never-moves-it.md) | The deploy reads the mirror, and the disambiguating probe never moves it |
| [0061](./0061-the-mutation-floor-refuses-deploy.md) | The mutation floor refuses `deploy:site`, and there is no override |
