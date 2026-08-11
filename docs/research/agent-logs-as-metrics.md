# Can agent session logs become a dashboard series?

Research for [#123](https://github.com/mephistopheles4/stacks/issues/123), which
blocks [#118](https://github.com/mephistopheles4/stacks/issues/118). Nothing here
is implemented and nothing here is decided — #118 decides. Every count in this
file was measured on the owner's machine on 2026-08-11 against this repo's own
session history; every claim about the format is quoted from Anthropic's
published docs and marked as such.

**No transcript content appears in this file.** Field names, record types, counts
and byte sizes only — never a prompt, a file body, or a command's output. That is
a constraint of the ticket and also the finding of §5.

**Short answer: the join key exists, at pull-request granularity, as a
first-class structured record — and it is 1:1 in the direction the panel needs.**
A `type: "pr-link"` record carries `{sessionId, prNumber, prRepository, prUrl,
timestamp}`. In this repo, 49 of 50 pull requests carry one, and **every one of
those 49 PRs resolves to exactly one session**. GitHub supplies `mergeCommit.oid`
for all 50 merged PRs, so the chain *metric point → commit → PR → session* closes
end to end.

**But it closes on a surface Anthropic explicitly disclaims.** The same docs that
document the *capability* (`claude --from-pr`) say the on-disk entry format "is
internal to Claude Code and changes between versions, so scripts that parse these
files directly can break on any release." The join key is real; the thing you
would read it from is not a contract. §6 is about what to do with that, and the
answer is *read it once, at session end, through the supported hook* — not have a
dashboard parse transcripts forever.

**Commit-level joining does not exist and should not be manufactured.** No record
type carries a commit SHA. Scraping SHAs out of captured stdout works and reaches
~19% of commits; §3.3 explains why that number is not the reason to reject it.

---

## 1. Where the logs live, and in what format

### 1.1 Path and granularity

Documented, primary source — [Manage sessions](https://code.claude.com/docs/en/sessions):

> By default, transcripts are stored as JSONL at
> `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is your
> working directory path with non-alphanumeric characters replaced by `-`. Each
> line is a JSON object for a message, tool use, or metadata entry.

Confirmed on this machine. **One file per session, one directory per working
directory** — not per project. That distinction matters here more than it would
in most repos, because this one uses worktrees heavily: `stacks`, and each of the
worktrees under `.claude/worktrees/`, each get their own sibling directory under
`~/.claude/projects/`. A query that wants "all sessions for stacks" must glob
across them; there is no repo identifier in the path, only a flattened absolute
path.

Measured layout across all projects on this machine:

| | Count |
| --- | --- |
| Project directories | 32 |
| Directories whose flattened path contains `stacks` | 11 |
| `.jsonl` session files, all projects | 191 |
| `.jsonl` session files, stacks + its worktrees | 127 |
| Distinct `sessionId` values seen in stacks files | 59 |

The gap between 127 files and 59 sessionIds is subagent transcripts: sidechains
are written as their own files, and records carry `isSidechain` to mark them.
Each session directory may also hold a same-named subdirectory
(`<session-id>/`) used for spilled tool results — this document was written in a
session that produced one, when a `WebFetch` result exceeded the inline limit and
was persisted to `<session-id>/tool-results/<tool-use-id>.txt`. **Those sidecar
files are transcript content living outside the `.jsonl`**, which matters for
§5's deletion story.

### 1.2 Retention

Documented — [Data usage](https://code.claude.com/docs/en/data-usage):

> Local caching: Claude Code clients store session transcripts locally in
> plaintext under `~/.claude/projects/` for 30 days by default to enable session
> resumption. Adjust the period with `cleanupPeriodDays`.

Two consequences for a trend layer, and they point opposite ways:

- **30 days is shorter than a trend.** A mutation-score series that wants a
  quarter of history cannot get its context from transcripts that expire monthly.
  Anything worth keeping must be extracted and stored elsewhere *before* cleanup
  runs — which is an argument for extraction-at-session-end regardless of the
  format question.
- **"plaintext" is the word the docs chose.** §5.

The storage location moves with `CLAUDE_CONFIG_DIR`, and writes can be
suppressed entirely with `CLAUDE_CODE_SKIP_PROMPT_HISTORY` or, per-run,
`--no-session-persistence`. A design that assumes the files exist is assuming a
default nobody promised to keep.

### 1.3 What is stable, and what is implementation detail

This is the part the ticket asked to be said plainly, so:

> The entry format is internal to Claude Code and changes between versions, so
> scripts that parse these files directly can break on any release. To build on
> session data, use `/export` or the [script interfaces] instead.
> — [Manage sessions](https://code.claude.com/docs/en/sessions)

That is unambiguous and it is first-party. Treat the following as the honest
split:

| Surface | Status |
| --- | --- |
| The path `~/.claude/projects/<project>/<session-id>.jsonl` | **Documented.** Stated in the docs, with the slug rule spelled out. |
| JSONL, one JSON object per line | **Documented.** |
| 30-day retention, `cleanupPeriodDays` | **Documented.** |
| `--from-pr`, and the picker's PR-URL search | **Documented capability.** The docs describe filtering sessions by pull request as a supported feature. |
| Every field name in §2, including `pr-link` | **Observed only.** Explicitly disclaimed as internal and version-varying. |
| The `SessionEnd` hook's `transcript_path` input | **Documented, and named as the supported route.** |
| `claude -p --output-format json` (session id, usage, cost) | **Documented, and named as the supported route.** |

The interesting shape here is that the **capability is supported while the record
is not**. Claude Code ships `claude --from-pr <number>`, and the session picker
lets you "paste a GitHub, GitHub Enterprise, GitLab, or Bitbucket pull or merge
request URL to find the session that created it." So the session↔PR association
is a product feature Anthropic maintains — it is unlikely to simply vanish. What
is disclaimed is the *spelling on disk*: the type string `pr-link`, the key
`prNumber`. A design that depends on the association surviving is on firmer
ground than one that depends on the field name.

---

## 2. What is actually in them

Record types observed in this repo's sessions, with their top-level keys. Names
only.

| `type` | Top-level keys |
| --- | --- |
| `user` | `cwd, entrypoint, gitBranch, isSidechain, message, origin, parentUuid, permissionMode, promptId, promptSource, sessionId, sourceToolAssistantUUID, timestamp, toolUseResult, type, userType, uuid, version` |
| `assistant` | `cwd, effort, entrypoint, gitBranch, isSidechain, message, parentUuid, requestId, sessionId, timestamp, type, userType, uuid, version` |
| `system` | `cwd, entrypoint, gitBranch, hasOutput, hookAdditionalContext, hookCount, hookErrors, hookInfos, isSidechain, level, parentUuid, preventedContinuation, sessionId, stopReason, subtype, timestamp, toolUseID, type, userType, uuid, version` |
| `attachment` | `attachment, cwd, entrypoint, gitBranch, isSidechain, parentUuid, sessionId, timestamp, type, userType, uuid, version` |
| **`pr-link`** | **`prNumber, prRepository, prUrl, sessionId, timestamp, type`** |
| `custom-title` | `customTitle, sessionId, type` |
| `last-prompt` | `lastPrompt, leafUuid, sessionId, type` |
| `queue-operation` | `content, operation, sessionId, timestamp, type` |

Records form a DAG through `uuid` / `parentUuid`, so turn structure and
branching (`/branch`, `--fork-session`) are reconstructible.

### 2.1 The fields a dashboard would want

**Present and directly usable:**

- **Timestamps** — ISO 8601 on every substantive record. Session duration is
  last-minus-first; per-turn latency is derivable. Note this is wall-clock and
  includes the human thinking, so "duration" is not "work".
- **Model** — `message.model`. Every assistant record in the sampled sessions
  read `claude-opus-5`.
- **Token usage** — `message.usage` carries `input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`, plus
  `cache_creation`, `server_tool_use`, `service_tier`, `iterations`, `speed`,
  `inference_geo`.
- **Tool calls** — `message.content[]` blocks of `type: "tool_use"`, countable
  and groupable by tool name. Content block types seen: `text`, `thinking`,
  `tool_use`.
- **Files touched** — `toolUseResult.filePath`, and `structuredPatch` for edits.
- **Branch** — `gitBranch`, see §3.2.
- **Effort / permission mode** — `effort` on assistant records, `permissionMode`
  on user records. Both are plausibly interesting as context and neither is
  documented.

**Absent:**

- **Cost.** No `costUSD` or equivalent field in any record, searched across all
  127 stacks session files. Token counts are there; the money is not. This is a
  real gap versus the OTel path, which *does* emit `claude_code.cost.usage` —
  §4. The two sources are not substitutes.
- **Commit SHA.** No record type carries one. §3.3.

### 2.2 `toolUseResult` is where the sensitivity lives

Observed shapes and their frequency in one representative session:

| Count | Shape |
| --- | --- |
| 25 | `interrupted, isImage, stderr, stdout` |
| 8 | `answers, questions` |
| 8 | `file, type` |
| 3 | `content, filenames, mode, numFiles, numLines, totalLines` |
| 2 | `content, filePath, originalFile, structuredPatch, type, userModified` |
| 1 | `filePath, newString, oldString, originalFile, replaceAll, structuredPatch, userModified` |
| 1 | `countIsComplete, durationMs, filenames, numFiles, totalMatches, truncated` |

`stdout`, `stderr`, `originalFile`, `content`, `oldString`/`newString` and
`structuredPatch` mean **whole file contents and whole command outputs are in
these files verbatim**. Not summaries of them. §5.

---

## 3. The join key — the central question

A metric series is keyed on a commit or a CI run. A session log is keyed on a
session. Three candidate bridges, and they are not equally good.

### 3.1 `pr-link` — this is the one

A dedicated record type exists for exactly this:

```
type: "pr-link"
keys: sessionId, prNumber, prRepository, prUrl, timestamp
```

Measured across this repo's 127 session files:

| | |
| --- | --- |
| `pr-link` records | 806 |
| Distinct PR numbers | 49 |
| Distinct sessions carrying one | 22 |
| Repositories named | `mephistopheles4/stacks` (only) |
| PRs in the repo, all states | 50 |
| **Coverage** | **49 / 50 = 98%** |

The 806-vs-49 ratio is re-appending: the link is written repeatedly through a
session, not once. Deduplicate on `(sessionId, prNumber)`.

**Cardinality, both directions** — this is what decides whether a panel can be
built, and the two directions give different answers:

| Direction | Result |
| --- | --- |
| **PR → sessions** | **49 PRs map to exactly 1 session each. Zero map to 2 or more. Maximum: 1.** |
| session → PRs | 16 sessions map to 1 PR; 6 map to 2 or more; maximum 18; median 1. |

**The direction the panel needs is the clean one.** A dashboard annotation starts
at a metric point — a commit, a CI run — and asks "what was being done here?".
That is PR → session, and in this corpus it is unambiguous every single time. The
messy direction (one long session spanning 18 PRs) only matters if you wanted to
ask "what did this session produce?", which is not what #118 is for.

That 1:1 is a property of this repo's working style — one PR per session — not a
guarantee from the format. A repo where several sessions iterate on one PR would
get a list, and the panel would degrade to "one of these contexts". Worth
re-measuring before relying on it elsewhere; for stacks, today, it holds
perfectly.

**Closing the chain to a commit.** `pr-link` gives a PR number, not a SHA. GitHub
supplies the rest: `gh pr list --state merged --json number,mergeCommit` returns
`mergeCommit.oid` for **50 of 50** merged PRs in this repo. So:

```
commit SHA  ──(GitHub API: mergeCommit.oid)──▶  PR number
            ──(pr-link, 1:1)──▶  sessionId
            ──▶  timestamps, model, tokens, tool counts, files touched
```

Every hop is measured, none is inferred. **The join key exists.**

Its granularity is the honest caveat: this joins to the **merge commit**, so a
series keyed on individual commits within a branch gets annotation only at the
merge point. For a nightly mutation-score trend on `main`, that is the right
granularity anyway — `main` only moves at merges.

### 3.2 `gitBranch` — 100% populated, and a weak key

Present on every `user`, `assistant`, `system` and `attachment` record:

| | |
| --- | --- |
| Records with non-empty `gitBranch` | 41,649 |
| Records with the key but empty | **0** |
| Distinct branches | 86 |
| Branches mapping to exactly 1 session | 74 |
| Branches mapping to 2+ sessions | 12 |
| Max sessions on one branch | 6 |
| Sessions on `main` | 5 |

**Do not mistake 100% populated for 100% discriminating.** It is perfectly
populated and still a poor join: `main` alone carries 5 sessions and 9,164
records, so any metric point on `main` — which is every point a release-
confidence dashboard cares about — resolves to five candidate contexts, not one.
Worktrees make this worse, since several can sit on similarly-named branches at
once. `gitBranch` is good for *filtering* and bad for *joining*. Use it to
narrow, never to identify.

### 3.3 Scraping commit SHAs from stdout — works, and should still be rejected

Commits appear in captured command output. Measured:

| | |
| --- | --- |
| `tool_use` inputs containing `git commit` | 299 |
| Distinct SHAs recovered by regex over captured stdout | 45 |
| Of those, resolving to a real commit object (`git cat-file -t`) | **45 / 45** |
| Commits in the repo, all refs | 241 |
| Coverage | ~19% |

So it works, with zero false positives, and reaches about a fifth of commits.
**The coverage number is not the reason to reject it. This is:**

The first probe written for this question returned **0** — it reported zero
recoverable SHAs, and that looked exactly like a finding. It was a filter bug:
the probe only examined tool-*result* records whose text contained the literal
string `git commit`, but the record carrying the SHA is the result of the commit
command, and its output does not repeat the command. A raw-text scan over the
same files immediately returned 79 matches.

That is the argument. A join built by regex over captured stdout is one where a
plausible-looking implementation silently returned nothing and presented it as an
answer — and it was caught here only because the number was surprising enough to
re-check. On a dashboard, "no annotation" is indistinguishable from "no session",
and nobody would re-check it. `pr-link` is a structured field; this is text
archaeology against output formats owned by `git`, by `gh`, and by whatever shell
wrapper captured them. It is recorded here as measured, and recommended against.

---

## 4. What already aggregates this — and it is not the transcripts

**Claude Code ships a first-party OpenTelemetry exporter, with native Prometheus
support.** This is documented
([Monitoring usage](https://code.claude.com/docs/en/monitoring-usage)) and is the
sanctioned answer to "does anything already aggregate them":

```
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=prometheus     # → http://localhost:9464/metrics
```

Metrics emitted:

| Metric | Unit |
| --- | --- |
| `claude_code.session.count` | count |
| `claude_code.lines_of_code.count` | count (attrs: `type` added/removed, `model`) |
| `claude_code.pull_request.count` | count |
| `claude_code.commit.count` | count |
| `claude_code.cost.usage` | USD |
| `claude_code.token.usage` | tokens |
| `claude_code.code_edit_tool.decision` | count |
| `claude_code.active_time.total` | s |

Plus events (`user_prompt`, `tool_result`, `api_request`, `api_error`, …),
correlated by `prompt.id` and ordered by `event.sequence`, and beta tracing
behind `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`.

**Three things follow, and they are the useful part of this section.**

**(a) The sanctioned path cannot do the join.** Verified against the docs:
`claude_code.commit.count` and `claude_code.pull_request.count` carry *standard
attributes only* — `session.id`, `app.version`, `app.entrypoint`, org/user ids,
`terminal.type`. **There is no attribute anywhere carrying a commit SHA, a branch
name, a repository name, or a PR number**, on those metrics or on the
`tool_result` event. `commit.count` counts commits; it cannot say *which*. So the
supported telemetry path gives good numbers with no way to tie them to a code
point, and the unsupported transcript path is the only place the tie exists. That
is the sharp finding of this ticket, and #118 should not discover it later.

**(b) It has the cost number the transcripts lack.** `claude_code.cost.usage` is
emitted; no cost field exists on disk. If cost is wanted, OTel is the only
source. The two paths are complementary, not alternatives, and #118 must pick one
or run both deliberately.

**(c) Prometheus is already the answer for half of this.** Which resolves the
ticket's last bullet — see §7.

Note also that enabling telemetry is a data-egress decision by default: metrics
go to Anthropic and third-party logging unless `DISABLE_TELEMETRY=1`. A localhost
Prometheus exporter is a separate switch from Anthropic-bound telemetry, but the
distinction is easy to get wrong.

Beyond first-party, the community has built transcript readers
(`claude-code-log`, `simonw/claude-code-transcripts`, a Rust `claude_code_transcripts`
parser). They render transcripts for humans. **None of them aggregates to a
metric series, and all of them carry the §1.3 version-fragility.**

---

## 5. What is sensitive, and what survives reduction

The docs say "plaintext" and mean it. In these files, verbatim:

- **Whole file contents** — `toolUseResult.originalFile`, `content`.
- **Whole command output** — `stdout`, `stderr`, including anything a command
  printed that it should not have.
- **Every prompt the owner typed** — plus `~/.claude/history.jsonl` separately,
  keyed `display, pastedContents, timestamp, project, sessionId`.
- **The model's reasoning** — `thinking` content blocks.
- **Absolute filesystem paths**, including the owner's username, in `cwd` and in
  every directory name under `~/.claude/projects/`.
- **Spilled tool results** in `<session-id>/tool-results/*.txt` sidecars, which a
  naive "delete the .jsonl" would miss.

For this repo specifically, that includes the vault-adjacent work: transcripts of
sessions that read real book notes hold note-body text that
[invariant 2](../../CLAUDE.md) exists to keep out of every build. **A dashboard
that shipped raw log lines would be a second, unguarded publishing path around
the project's most absolute rule** — and one no existing gate watches, because
every gate watches `library.json` and `dist/`, not `~/.claude`.

### 5.1 The reduction

A log line reduced to this could leave the machine:

```
{ sessionId, prNumber, startTs, endTs, durationMs,
  toolCallCount, toolCountsByName, filesTouchedCount,
  inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
  model, gitBranch }
```

Ids, counts, timestamps, an enum. No free text. Roughly 200–300 bytes.

**What survives:** enough to say *the score moved, and what was happening was a
3-hour session on PR #107, 240 tool calls, 40 files touched, Opus, one branch*.
That is real context and it is what the map asked for — "the score moved, and
here is what was being done when it moved."

**What does not survive: anything answering *why*.** The prompt, the reasoning,
the review that changed direction, the argument that produced the fix — those are
the parts that would actually explain a movement, and every one is free text that
cannot be sanitised into a number. The reduction keeps the *shape* of the work
and loses its *content*.

Three residual leaks even in the reduced form, worth stating because they are
easy to miss:

- **`gitBranch` is free text** the owner wrote. Branch names describe work.
- **`filesTouchedCount` is safe; a file *list* is not** — paths disclose repo
  structure, and in this repo a vault path discloses what is being read.
- **Timestamps are a working-hours record.** Benign for a solo owner on their own
  machine; not benign in general, and #118's transferable-design half should say
  so.

This is the argument for localhost, which the map already permits. Not because
the reduced form is dangerous — it is fine — but because the reduction is the
only thing standing between a dashboard and a plaintext archive of everything,
and a localhost dashboard does not need to be trusted to have done the reduction
correctly. **Off-machine hosting makes the reduction load-bearing; localhost does
not.** For a single-maintainer project that is a large difference in how much
must go right.

---

## 6. The shape that survives the format warning

Recorded as an option, not a recommendation to build — #118 decides.

The docs disclaim the on-disk format *and* name the supported alternatives in the
same breath. One of them fits this problem exactly:

> **React to session events**: read the `transcript_path` field that
> [hooks](https://code.claude.com/docs/en/hooks) and status line commands receive
> as input. **A `SessionEnd` hook can archive the transcript when a session
> ends.** — [Manage sessions](https://code.claude.com/docs/en/sessions)

So: a `SessionEnd` hook reads the transcript **once**, at the moment it is
freshest, emits the §5.1 reduced record to a durable append-only file, and the
dashboard reads only that. The properties this buys are the ones the objections
in this document ask for:

- **Format fragility is bounded to one small script**, run against the version
  that just wrote the file. A dashboard never parses a transcript. When the
  format shifts, the hook breaks loudly at session end; already-extracted history
  is unaffected.
- **The 30-day expiry stops mattering** (§1.2) — extraction happens well inside
  the window, and the reduced records are small enough to keep indefinitely.
- **The reduction happens at the boundary**, once, in a reviewable place, rather
  than being re-derived by every consumer.
- **It composes with OTel** rather than competing: OTel supplies cost and
  counters, the hook supplies the `prNumber` join that OTel structurally cannot
  (§4a).

The obvious failure mode, stated so it is not discovered later: **`SessionEnd`
does not fire on a crash, a `kill`, or a machine losing power**, so extraction is
lossy in exactly the sessions that went worst. A periodic sweep over transcripts
still inside the retention window is the backstop, and it re-introduces the
parsing that the hook was meant to confine — to one scheduled job rather than to
a dashboard, which is better but not free.

Also worth weighing against all of it: **the repo's own rule that "a contributor
with no agent skills installed must be able to pass every gate."** Nothing under
`docs/agents/` is read by any gate. A hook that must be installed for a dashboard
to have data is machine-local configuration of the same kind, and #118 should be
explicit that this is owner-machine instrumentation and never a contribution
requirement.

---

## 7. Volume, and whether Prometheus is the right store

Measured on this machine:

| | |
| --- | --- |
| All projects, all sessions | 191 files, **350 MB** |
| stacks + worktrees | 127 files, **261 MB** |
| Span of the stacks corpus | 10.5 days |
| **Rate** | **~25 MB/day, ~750 MB/month** |
| Per-session: median | **401 KB** |
| Per-session: mean | 2.1 MB |
| Per-session: max | **58 MB** |
| Per-session: min | 86 KB |

The mean being 5× the median, and the max being 145× it, is the whole story:
**session size is heavy-tailed**, driven by how much file content and command
output got captured, not by how long or how valuable the session was. Anything
sized on the average will be wrong.

Against that, **the reduced record of §5.1 is ~250 bytes.** At this repo's rate —
59 sessions in ~11 days, call it 150/month — that is **under 40 KB/month**, a
~20,000× reduction. The extracted series is free to store forever; the raw
transcripts are the only thing that is big, and they already expire in 30 days.

**Is Prometheus right? Split the question, because the answer differs:**

| The data | Right store? |
| --- | --- |
| Counters and gauges — session count, duration, tool calls, tokens, cost, lines changed | **Yes.** Genuinely time-series shaped, and Claude Code already exports exactly these to Prometheus natively (§4). Nothing needs building. |
| The join and the annotation — *this metric point ↔ PR #107 ↔ that session* | **No.** This is an event with high-cardinality identifiers (`sessionId` is a UUID, `prNumber` grows without bound). Putting them in Prometheus labels is the textbook cardinality mistake — it would multiply series per session forever. |
| Prompts, reasoning, file contents | **No, and also §5 says never.** |

So the honest answer to the ticket's last bullet: **Prometheus is the right store
for the numbers and the wrong store for the context** — and the context is the
entire reason #123 exists. The map wants "the score moved, and here is what was
being done", and *what was being done* is precisely the part Prometheus should
not hold.

The conventional resolution is Grafana annotations rather than series: a sparse
event list keyed by timestamp, rendered as vertical markers over the metric
graph, each linking out to `prUrl`. That is a small table — 150 rows/month, ~40
KB — and needs no time-series database at all. A flat JSONL file next to the
Pushgateway would do, which is a pleasing answer for a localhost dashboard and
worth #118 considering before any store is chosen.

---

## 8. Summary for #118

1. **The join key exists.** `pr-link` → `prNumber` → GitHub `mergeCommit.oid`.
   49/50 PRs covered, **1:1 in the panel's direction**. The panel is buildable.
2. **It is PR-granular, not commit-granular.** Fine for a `main` trend; not fine
   for per-commit series. No commit SHA exists in any record.
3. **It sits on a disclaimed format.** Documented capability, undocumented
   record. Read it once via `SessionEnd`, never from the dashboard (§6).
4. **`gitBranch` is 100% populated and a bad join.** Filter with it; do not
   identify with it. `main` → 5 sessions.
5. **Don't scrape SHAs from stdout.** It works, reaches ~19%, and the first
   attempt at it here silently returned zero (§3.3).
6. **OTel already exports Prometheus metrics first-party**, including the cost
   number the transcripts lack — and structurally cannot do the join.
7. **Reduction to ids and counts is safe and ~250 bytes**; it keeps the shape of
   the work and loses every explanation of it. Localhost makes the reduction
   non-load-bearing, which is the real argument for it.
8. **Prometheus for the numbers, annotations for the context.** ~40 KB/month of
   context; do not put UUIDs in labels.

**Nothing here recommends building it.** The ticket asked whether it could be
built and what it would cost to be honest about; the answer is yes, at PR
granularity, on a foundation that needs one small piece of insulation. Whether
that is worth it is #118's call.
