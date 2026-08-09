# Security

## What this project is, in threat terms

`stacks` is a local-first tool. It reads and writes Markdown notes in a vault on
your own disk, fetches book metadata and cover images over HTTPS from three
public APIs, and generates a static site with no server behind it. There is no
account, no database, no authentication, and nothing is uploaded anywhere.

So the realistic risks are narrow, and worth naming precisely:

- **Something private reaching a public build.** The vault is somebody's reading
  notes. Note bodies must never leave it — see invariant 2 in
  [`CLAUDE.md`](CLAUDE.md) and row G2 in [`docs/gates.md`](docs/gates.md).
- **A vault-supplied value escaping its directory.** `cover:` comes from a
  hand-edited note and gets joined to a path. That rule has been wrong before;
  it is now one implementation with a containment check (row G10).
- **Hostile bytes from a metadata provider.** Cover images are downloaded and
  handed to `sharp`, a native decoder, from a URL that came out of a third-party
  API response. The download is bounded — a 15s timeout, a 20 MB cap counted as
  the body arrives rather than trusted from `Content-Length`, and an allowlist
  of three magic-byte signatures so an SVG or an HTML error page never reaches
  the decoder (row G18). It was none of those things until August 2026, and
  this list said so.
- **Data loss in a vault.** The tool writes to files somebody edits by hand.
  `updateBook` has overwritten a value it should have left alone (row G4), and
  the public build deletes files it does not recognise inside its own staging
  folder.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** — the "Report a
vulnerability" button under this repository's Security tab. It goes to the
maintainer and nobody else.

Do not open a public issue for anything in the list above, or anything that
would let a crafted note, a crafted API response, or a crafted import file reach
outside the vault.

This is a personal project maintained by one person. There is no SLA and no
bounty. What you will get is an honest answer and, if the finding is real, a
gate that keeps it fixed — this repository's habit is that a defect earns a
named test that goes red, not just a patch.

## Scope

**In scope:** anything in this repository — the CLI, the core library, the site,
the build scripts, the CI workflow.

**Out of scope:** the metadata providers themselves (Open Library, Google Books,
Apple), your Obsidian vault's own security, and wherever you choose to host a
generated site.

## What the platform is relied on for

Some of this project's dependency defence is a GitHub setting rather than a file
in this repository, and that distinction matters more than it looks:

| | |
| --- | --- |
| Dependabot alerts | vulnerabilities in the dependency tree |
| Dependabot security updates | a pull request per alert with an available patch |
| Grouped security updates | those PRs arriving as one, not one per package |
| Dependabot malware alerts | a dependency found to be malicious, not merely vulnerable |
| CodeQL (default setup) | static analysis of the TypeScript, on push and on pull requests |
| Branch protection on `main` | pull request required, `gates` must pass, CodeQL must find no new high alert, no bypass |

**Nothing in this repository can check that any of them is switched on.** They
live in repository settings, outside the tree, so a clone cannot read them —
and a test that asked GitHub would need the network, which
[G21 (`no-live-network`)](docs/gates.md) forbids for the whole suite. Recorded
in [`docs/gates.md`](docs/gates.md) under *"Not gated, deliberately"* rather
than left as an assumption.

So this section is a statement of what the project **relies on**, not a claim
about what is currently true. If you are auditing this repo and that distinction
matters to you, check the settings themselves; the file cannot tell you.

**CodeQL is now a required check**, once its first batch of findings had been
triaged to zero — which was the condition this paragraph set when it said the
opposite. It blocks a pull request that introduces a **new** security alert at
high or above; pre-existing alerts are not the question, since merge protection
compares against the base branch.

It is a ruleset `code_scanning` rule rather than a required status context,
because that is the mechanism built for it and it states its thresholds where
you can read them instead of hiding them behind a check name.

**The alert threshold is `errors`, not warnings, and that is a judgement call
with evidence behind it.** CodeQL rated all twelve of its first findings here
*high*; one was a real bug. A check that blocks on that ratio is one you learn
to route around rather than read, which would be worse than not having it. See
[`docs/gates.md`](docs/gates.md) — *"Triaging a CodeQL finding"* — for how that
call was reached and what the other eleven turned out to be.

Two things this list is *not* covering twice. `pnpm audit --audit-level=high` is
a required CI check and lives in [`.github/workflows/gates.yml`](.github/workflows/gates.yml)
— that one is in the tree and does go red. And the `groups:` block in
[`.github/dependabot.yml`](.github/dependabot.yml) groups **version** updates;
grouping **security** updates is the separate setting above, which is why both
exist.

## What is deliberately not defended against

Stated plainly, because a threat model that claims everything is defended is not
a threat model:

- **A hostile vault.** The vault is yours. A `cover:` value pointing somewhere
  odd is guarded because the rule is cheap and the guard was already claimed to
  exist — but a person who can write arbitrary files into your vault can already
  do worse than confuse this tool.
- **A malicious dependency.** `pnpm` blocks install scripts by default and
  exactly two packages are opted in, each with a recorded reason. Actions are
  pinned to commit SHAs. That is the mitigation; it is not immunity.
- **What you publish.** A public build ships your titles, authors, reading dates
  and ratings. That is the product working as intended. Deciding whether you
  want that public is yours, and it is worth deciding on purpose.
