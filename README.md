# Stacks

A local-first reading tracker where **the Obsidian vault is the database**.

A CLI writes book notes with structured frontmatter into your vault; a static
site renders that vault as a 3D bookshelf. Public builds ship covers and
metadata only — never note bodies.

```
packages/core    vault adapter, metadata fetchers, library.json builder
packages/cli     the `stacks` command
packages/site    Astro site + vanilla Three.js shelf
fixtures/vault   a miniature vault used by every test and gate
```

## Getting started

```bash
pnpm install
cp .env.example .env    # then set STACKS_VAULT to your vault path
```

With `STACKS_VAULT` set, every command finds your vault without `--vault`.

### Live editing

```bash
pnpm dev:watch
```

Watches the vault and serves the shelf together. Edit a note in Obsidian and the
shelf follows about a second later — the page reloads itself when the library is
rebuilt. Rebuilds are debounced, because Obsidian autosaves while you type.

There is no background daemon and deliberately so: the build is cheap and
explicit, and a process watching your vault forever is a thing to babysit. For a
*published* shelf the right automation is a scheduled build or a git hook, since
the interesting event is "share this now", not "a file changed".

### The CLI

| `pnpm stacks …` | What it does |
| --- | --- |
| `add` | fetch metadata and a cover, then write a note into the vault |
| `build` | parse the vault into `library.json` (`--public`, `--watch`) |
| `status` | books this year, in progress, covers still missing |
| `covers` | report where each cover came from, or record it (`--backfill`) |
| `enrich` | fill missing metadata on existing notes, never overwriting |
| `order` | show the shelf order, or renumber it (`--renumber`) |
| `import` | import a library export into the vault (`audible`) |

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` across every `.ts` in the repo |
| `pnpm test` | vitest, all workspaces and the gates |
| `pnpm build` | typecheck + static site build |
| `pnpm dev` | site dev server |
| `pnpm dev:watch` | vault watcher + dev server, live-reloading |
| `pnpm worktree <branch>` | a second checkout, installed and pointed at your `.env` |
| `pnpm fixtures:50` | regenerate the 50-book fixture vault |
| `pnpm smoke:render` | headless shelf screenshot gate |
| `pnpm gate:public` | proves the public build leaks no note text |
| `pnpm deploy:site` | gates, then build from the real vault, then publish |

Both lists are documented in full in [CLAUDE.md](CLAUDE.md), which
`gates/commands.test.ts` holds to reality in both directions — adding a command
without documenting it there is a red build.

## Sharing your shelf

```bash
pnpm stacks build --public --vault /path/to/your/vault
pnpm --filter @stacks/site build
```

The first command stages `library.json`, the covers it actually references, and
an `og.png` link preview into `packages/site/public/`. The second folds those
into `packages/site/dist/` — a plain static folder with no server behind it, so
it deploys as-is to GitHub Pages, Cloudflare Pages, Netlify, or anything that
serves files.

The public build carries covers and frontmatter only: no note bodies, no vault
paths. `pnpm gate:public` proves it by grepping the built output for a phrase
planted in the fixture notes, rather than trusting that it is so.

## Where things are documented

- **[docs/progress.md](docs/progress.md)** — where the project actually is. Start here.
- **[docs/plan.md](docs/plan.md)** — the execution plan and its rules.
- **[docs/library-brief.md](docs/library-brief.md)** — the full product spec.
- **[CLAUDE.md](CLAUDE.md)** — invariants, contracts, and the decision log.

`library.json` is a build artifact. It is always regenerable from the vault,
never hand-edited, and gitignored.

## Status

All five phases are green and tagged (`phase-0` … `phase-4`), and the tool runs
against a real vault rather than only fixtures. Every invariant has a named gate
that can go red, scored in [docs/gates.md](docs/gates.md).

This is **developer-friendly personal software**, not a packaged application.
There is no npm release and no installer: the CLI runs from TypeScript source
through `tsx`, so using it means cloning the repo and having Node 22+, pnpm and
git. It is offered in the hope it is useful, not as a product.

[docs/progress.md](docs/progress.md) is the file that says where things actually
are. This line said "Phase 0 (scaffold)" for months after that stopped being
true, which is the exact drift [docs/gates.md](docs/gates.md) exists to score.
