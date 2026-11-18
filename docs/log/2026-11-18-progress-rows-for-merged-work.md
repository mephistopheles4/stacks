# Two rows cut from `progress.md`'s Current state once their pull requests merged

**Date:** 2026-11-18. **Why:** both rows read "in review" or "draft" after their pull requests merged ([#579](https://github.com/mephistopheles4/stacks/pull/579) for #450, [#568](https://github.com/mephistopheles4/stacks/pull/568) for #558), and `docs/progress.md` is held to a word budget (G71). They are kept here as they stood; the rules they describe live in `AGENTS.md`, `docs/gates.md` (G70) and ADR-0147.

| | |
| --- | --- |
| **O'Reilly provider removed (#450), in review** | Lookups go Open Library, then Google, with Apple for covers only. `oreilly_ourn` and `cover_source: oreilly` stay as provenance on older notes and no provider writes them. A cover added by hand needs `cover_source: unknown` written by hand. [ADR-0147](../adr/0147-oreilly-is-removed.md); the spec is [revision 4 on #450](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728372984) |
| **Mutation dry run on every pull request (#558), draft** | G70 (`mutation-dry-run`): a `mutation-dry-run` job in `gates.yml` runs `pnpm exec stryker run --dryRunOnly` on every event and is listed in the `gates` aggregator. The structural gate (the issue's option 2) is not built and waits with the owner. [#558](https://github.com/mephistopheles4/stacks/issues/558) carries the record |
