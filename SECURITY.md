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
  handed to `sharp`, a native decoder. Currently without a size cap or a
  content-type check — a known gap, recorded rather than hidden.
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
