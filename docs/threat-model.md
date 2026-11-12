# Threat model — Stacks

Read the boundaries first. Place each finding on one: where something
comes in from outside, or where an act goes out. What starts and ends on
the machine (your own computer, or a sandbox run on it) is the machine's,
and no finding; what came in from outside stays outside input. Name the
control that holds the boundary against the path, with when it doesn't
hold; if one does, add nothing. Check the residual against the classes.
Bring the owner what the guide's step 5 lists, every `security?` row
included; no class covers a change that weakens a rule or control, adds a
route for outside text into a session or more reach to one that reads it,
adds text to files sessions load, or writes a secret into text sessions
read. The full guide is the pact's review procedure, The threat model
section (`~/.claude/pact/review.md`; public copy:
<https://github.com/mephistopheles4/the-pact/blob/main/claude/review.md>).

## Boundaries

```mermaid
flowchart LR
  vault[(Machine: vault, sessions, builds)]
  subgraph lookups[Outside lookups and imports]
    prov[Provider replies, cover bytes, import files]
  end
  subgraph deploy[Deploy]
    up[deploy:site, deploy:ask, terraform]
  end
  subgraph site[Public site]
    pages[Static files on the host]
  end
  subgraph ask[Ask Worker]
    worker[Visitor questions, Workers AI]
  end
  subgraph tracker[Tracker and PRs]
    gh[Issues, PRs, comments, posts]
  end
  subgraph updates[Updates and CI]
    reg[Packages, actions, Dependabot]
  end
  prov --> vault
  vault --> prov
  vault --> up --> pages
  pages --> worker
  gh --> vault
  vault --> gh
  reg --> vault
  style lookups stroke-dasharray: 5 5
  style deploy stroke-dasharray: 5 5
  style site stroke-dasharray: 5 5
  style ask stroke-dasharray: 5 5
  style tracker stroke-dasharray: 5 5
  style updates stroke-dasharray: 5 5
```

### Public site

**Crosses:** out, to the host and to any reader: `library.json`, covers, and each
book's `## Thoughts` as plain text in `notes/<id>.json`. No other part of a note
body, in any build (invariant 2). Also out, from visitors' browsers: page views to
Cloudflare Web Analytics, and to Plausible when switched on (approved by the
optional-Plausible spec).

**Controls:**

- *Repo.* `readPublicSection`, the adapter's one reader of a note's body, allows
  `## Thoughts` alone and withholds the whole section on any shape but plain
  prose. G2 (`public-build`) reads `publish()`'s output in both modes. It does
  not hold if the allowlist ever names `## About`, which `AGENTS.md` forbids.
- *Repo.* `private` fails closed: anything present that is not clearly "no" keeps
  a book out of every public build, and wishlist books stay out too. It does not
  hold for a deployment already published: marking a book private removes it
  from the next deployment only.
- *Repo.* G20 (`public-build-artifact`) inspects the real `dist/` before upload
  for private books, orphan covers, vault paths and unknown keys, and holds the
  site's CSP (`connect-src 'self'` unless analytics is on). It reads key names,
  never values, and its note-body canary exists only in the fixture vault, so on
  a real vault invariant 2 rests on structure.
- *Repo.* All vault access goes through the adapter (invariant 4, G1). G1 reads
  import specifiers under `packages/` and `scripts/`, not `gates/` or run-time reach.
- *Host.* None. Whatever is uploaded is public.

**Residual:** What you publish.

### Deploy

**Crosses:** out, by the owner's hand from their machine: the built `dist/` to
Cloudflare Pages (`pnpm deploy:site`), the Worker bundle and its two secrets
(`pnpm deploy:ask`) and the Terraform change in `infra/`.

**Controls:**

- *Repo.* `deploy:site` runs the gates first, builds from the real vault last,
  and re-checks the real `dist/` (G20's rules) before upload. It refuses any
  branch but `main` (G17); `--any-branch` overrides that on purpose.
- *Repo.* wrangler is an exact root devDependency, and each deploy script
  allows one form of call with no package runner (G67). A change to which
  packages may run install scripts is the owner's call. wrangler reloads the
  root `.env`, so the Google key and the vault path reach it and its packages;
  the owner accepted that (`docs/commands.md`).
- *Repo.* `deploy:ask` reads the live AI switch first and refuses to turn AI
  back on without `--ai-on`, and refuses log sampling below every line. It checks
  the Worker's own settings and never the gateway's.

**Residual:** What you publish. The rule it rests on: the Cloudflare
token for Terraform has an expiry, is set only on the command, and never enters
`.env` (`infra/README.md`). Nothing checks it.

### Outside lookups and imports

**Crosses:** in: replies and cover bytes from Open Library, Google Books and
Apple Books (cover URLs come out of those replies), and a Libation export of an Audible
library, given to `stacks import audible`. Out: each looked-up book's ISBN, title and author, private
and wishlist ones included, and the Google key, to the providers' HTTPS endpoints
(approved by `AGENTS.md`'s tech decisions).

**Controls:**

- *Repo.* A cover download is bounded: a 15 s timeout, a 20 MB cap counted as
  the body arrives, and an allowlist of three magic-byte signatures, so an SVG or
  an HTML error page never reaches `sharp` (G18). A flaw in the decoder for an
  accepted format gets past it, and a cover URL's scheme is not checked and a redirect is followed.
- *Repo.* Provider ids are opaque, shape-checked and dropped on mismatch, and
  are never URLs, so no provider value lands in an `href`. A well-formed wrong id
  passes.
- *Repo.* A provider's description is written only under `## About`, disarmed
  and as a block quote, by `insertBodySection`, and is never read back for a
  build. It does not hold if the public allowlist ever names `## About`.
- *Repo.* The Audible mapper is pure and never carries `Account` or
  `Description`. The adapter creates the note, never overwrites, and strips path
  characters from the title. Both trust the file's own fields.

**Residual:** Provider bytes are trusted.

### Tracker and PRs

**Crosses:** in: issue and pull-request text, comments and outside pull
requests, read by people and by agent sessions. Out: issues, comments, pull
requests and commits, all public.

**Controls:**

- *GitHub.* Ruleset `main-protection` on the default branch: no deletion or
  force-push, a pull request, the `gates` check up to date, review threads
  resolved, and CodeQL's code-scanning rule at high or above for a security
  alert and for any error, with no bypass actor. No approving review is required, and code-owner review is routing only.
  No gate reads the setting, and it lapses silently when switched off.
- *GitHub.* Secret scanning and push protection are on. They match credential
  patterns, not a private book's title or a personal detail, and they lapse
  silently when switched off.
- *Repo.* `gates` runs on `pull_request`, never `pull_request_target`, so a
  fork's pull request sees no secret; its token is `contents: read` and each
  checkout drops its credentials. G55 (`pr-conventions`) reads each title and
  body, again on an edit, and refuses a `run:` step in its own job that
  interpolates event data; zizmor lints every workflow for the same. None of
  this holds against text a session reads.
- *Harness.* Permission prompts and limits hold what a session does with that
  text, as Claude Code documents them. They do not hold in auto mode or under
  `bypassPermissions`, and the owner's merge does not hold a post.

**Residual:** Text steers a session; Posts are public; Review rests on gates. The
rules they rest on: only a spec comment from the repo owner's account counts
(`docs/agents/issue-tracker.md`, Specs), and every other comment is data (unheld: anyone with write access can edit a comment, and every
session posts as that account); a spec's issue body carries the owner's ask with a
private book, note text, vault path, token or account id left out as `[withheld]`,
and every post is read back after it posts (a person's read is the only check).

### Updates and CI

**Crosses:** in: npm packages and their install scripts, GitHub Actions and
Dependabot pull requests, run on the machine and on a runner.

**Controls:**

- *GitHub.* Dependabot alerts and security updates, secret scanning, push
  protection and CodeQL default setup (Actions, JavaScript and TypeScript) are
  on. Alerts and updates trail a disclosure, CodeQL blocks only a new security alert at
  high or above or a new error, and no gate reads these settings, so each lapses silently when
  switched off.
- *Repo.* pnpm runs install scripts for `esbuild` and `sharp` only; a release
  must be seven days old, trust downgrades are refused, each lockfile entry is
  integrity-pinned, and each exception names one exact version (G67). Dependabot's
  own seven-day cooldown does not apply to security updates.
- *Repo.* Every `uses:` line pins a 40-character commit SHA with a version
  comment (G40). The comment's truth is not checked: actions have no lockfile.
- *Repo.* `pnpm audit --audit-level=high` is a required job (G42), and an ignored
  advisory expires in 30 days or when a fix is published (G62, G63). A malicious
  package with no advisory yet passes. zizmor lints the workflows, and no test
  reaches the network (G21).
- *Repo.* `gates` holds `contents: read`, but the commit jobs in `metrics.yml`
  hold `contents: write` with credentials kept. Rulesets protect only `main`
  (`main-protection`) and the `metrics` and `survivors` branches
  (`record-branches`: no deletion or force-push); every other branch is open.

**Residual:** What you install and CI run.

### The Ask the library Worker

**Crosses:** in: a visitor's question at `/api/chat`. Out: the question, the
catalogue and some Thoughts to Workers AI through an AI Gateway, and the visitor's
address to Turnstile. The host keeps a hashed-address count for a day and outcome
lines carrying that count for a week. The Worker reads public build output only,
so invariants 1, 2 and 4 hold by structure.

**Controls:**

- *Repo, the Worker's source.* A request passes in order: the right shape (POST,
  JSON, the production `Origin`, 8 KB, a question of at most 1,500 characters and
  at most two remembered exchanges), a single-use Turnstile token, then a
  per-visitor count (30 a day) and rate (5 a minute) keyed on an HMAC of address
  and day. A check that cannot run refuses. AI runs only when `ASK_AI_ENABLED` is
  exactly `"true"`. None of it holds until the Worker is deployed.
- *Repo.* Every model call goes through one function that passes the gateway and
  `skipCache` (G69). G69 reads source text, never the gateway's settings.
- *Repo.* The model has two read-only tools over public output, its text reaches
  the page only as `textContent`, and the Worker stores and logs no question or
  answer: its logs hold fixed outcome codes and invocation logs are off. That
  says nothing about what the gateway keeps.

**Residual:** Ask availability can be spent; Questions reach Workers AI.

## Scope

**In:** the six boundaries above.

**Out:**

- **The machine:** the owner's own computer, or a sandbox run on it, and every
  program, process, account, file and memory made there: the vault and its notes
  at rest, `.cache/`, `.env`, other local accounts. Text a provider or an import
  wrote into a note stays outside input. A hostile vault is the machine's. A
  `cover:` value that escapes its directory is too, though one implementation
  with a containment check guards it (G10).
- **Data loss in a vault with no attacker** is not a class here. Its gates stay:
  G1, G3, G4 and G32, and the rule that the public build deletes only inside its
  own staging folder. Loosening any of them is a spec change.
- **Held by the machine's own controls**, named only generically: account
  isolation, disk encryption and antivirus. None is a control on a boundary above.
- **Third parties relied on:** Open Library, Google Books, Apple Books, Cloudflare
  (Pages, Workers, Workers AI, AI Gateway, Turnstile, Web Analytics, the WAF),
  Plausible, GitHub, the npm registry, Obsidian, and wherever a generated site is
  hosted.
- **Root of trust:** the owner's machine and their GitHub and Cloudflare accounts.
  One maintainer.

## Accepted threat classes

- **What you publish:** a public build ships titles, authors, reading dates, ratings, covers and each book's Thoughts as plain text, which is the product; a deploy sends that and the Worker from the owner's machine; earlier deployments keep what they held until deleted.
- **Provider bytes are trusted:** a provider's reply or an import file's fields are taken as facts and image bytes, so a decoder flaw in an accepted format, a well-formed wrong id or a wrong fact gets through.
- **What you install and CI run:** dependencies, actions and the two packages allowed install scripts run with the maintainer's or the runner's reach, and neither a pin's version comment nor an advisory below high stops a merge.
- **Review rests on gates:** one maintainer merges their own pull requests with no approving review required, so the required check, CodeQL and the gates catch what that maintainer misses.
- **Text steers a session:** an agent session reading tracker text, pull requests, fetched pages or cloned files can be steered by them; only the harness's prompts, where on, hold what it then does, and a post is public before anyone reads it back.
- **Posts are public:** an issue, comment or pull request is public the moment it posts and may be cached or indexed after deletion; the posting rules and the read before posting are the only check.
- **Ask availability can be spent:** a few addresses can use up the Worker's request allowance and keep AI off, search keeps working, and ADR-0127 accepts it.
- **Questions reach Workers AI:** a visitor's question, the catalogue and some Thoughts go to Workers AI through the gateway, and Turnstile sees the address and browser signals; the Worker stores nothing, and ADR-0127 approves the flow.

## Residual risk

```mermaid
quadrantChart
  title Residual risk
  x-axis Unlikely --> Likely
  y-axis Low impact --> High impact
  quadrant-1 Likely and high impact
  quadrant-2 Unlikely and high impact
  quadrant-3 Unlikely and low impact
  quadrant-4 Likely and low impact
  What you publish: [0.5, 0.35]
  Provider bytes are trusted: [0.3, 0.4]
  What you install and CI run: [0.3, 0.8]
  Review rests on gates: [0.4, 0.6]
  Text steers a session: [0.6, 0.5]
  Posts are public: [0.35, 0.45]
  Ask availability can be spent: [0.6, 0.3]
  Questions reach Workers AI: [0.7, 0.2]
```

## Open issues

- The Ask Worker's host controls (a WAF rate rule, and an AI Gateway with authentication on, logging off and a spend limit) are declared in `infra/`, not applied. No control is named for them, and until they are applied and read back AI spend has no cap and the two Ask classes rest on a promise nothing checks: bring the owner a finding on the Worker's cost, flooding or retention ([#532](https://github.com/mephistopheles4/stacks/issues/532)).
