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
```

| Command | What it does |
| --- | --- |
| `pnpm stacks --help` | the CLI |
| `pnpm test` | all workspaces |
| `pnpm build` | typecheck + static site build |
| `pnpm dev` | site dev server |
| `pnpm smoke:render` | headless shelf screenshot gate |
| `pnpm gate:public` | proves the public build leaks no note text |

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

Phase 0 (scaffold). The shelf renders, and it is empty. Books arrive in phase 2.
