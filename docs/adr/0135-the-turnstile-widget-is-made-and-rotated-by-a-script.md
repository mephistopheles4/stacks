# ADR-0135 — The Turnstile widget is made and rotated by a script, outside Terraform

**Date:** 2026-11-05
**Status:** accepted. The owner asked for it ("Could we write a script that will be creating the
turnstile secret, and we could use it to rotate that secret in the future if we need?", then "Yes,
build it") and signed off the spec after two security-pair rounds on issue
[#537](https://github.com/mephistopheles4/stacks/issues/537). **Changes** the mechanism of the Ask
spec's S14 Q4 ("the widget by hand"), and S13 steps 8 to 11. The decision itself, that the widget and
its secret stay out of Terraform state, stands.

## Decision

The Ask the library Turnstile widget is created, and its secret rotated, by `pnpm turnstile`
(`scripts/turnstile.ts`, with its logic in `scripts/lib/turnstile.ts`), through Cloudflare's
Turnstile API, in place of the dashboard. It sets the secret on the Worker as `TURNSTILE_SECRET`
with `wrangler secret put`, the secret on standard input and nowhere else.

- **Outside Terraform, still.** The provider could create the widget, but its `secret` attribute
  would then sit in the local state file. A script keeps the secret in one process's memory for one
  run, so it never rests on this machine.
- **After `deploy:ask`.** `--create` sets the secret on the Worker straight away, so the Worker has
  to exist: the script checks for it, read-only, before any Turnstile call. S13 step 9 therefore
  runs `deploy:ask`, then `VISITOR_KEY`, then `pnpm turnstile --create`.
- **Rotation sends `invalidate_immediately: false`** every time. Cloudflare keeps the old secret
  valid for two hours and refuses a second rotation inside that window; its docs name no default.
- **`--sync`** sets the widget's current secret without rotating. Cloudflare's widget GET returns
  `result.secret`, so a put that fails after a create or rotate loses nothing: the secret is read
  back. The list response does not carry it.
- **Transport settings are refused, not just forced.** Node reads `NODE_EXTRA_CA_CERTS`,
  `NODE_USE_SYSTEM_CA`, `NODE_USE_ENV_PROXY` and the `--use-env-proxy`, `--use-system-ca` and
  `--use-openssl-ca` options of `NODE_OPTIONS` for the script's own `fetch`, which carries the typed
  token, so forcing wrangler's environment does not cover it. Step 1 refuses each in the shell, in any
  letter case, naming the variable and never its value, beside the refusal of
  `NODE_TLS_REJECT_UNAUTHORIZED` unless it is `1`.
- **The token is typed.** A short-lived API token (Account > Turnstile > Edit, expiry within 24
  hours, checked by `GET /user/tokens/verify` or its account form) is read from a no-echo prompt on
  Node's raw-mode stdin, never from an environment variable, flag or file; the script refuses when
  stdin is not a terminal. Every successful run ends by telling the owner to delete the token.

## Why

- **The secret must never rest here.** Terraform state is a file on disk the plan reads and apply
  rewrites; the S14 Q4 reasoning is unchanged. A dashboard click had the same property but left the
  owner copying a secret by hand into a terminal, which is the step most likely to land in shell
  history or a screen share. A script that pipes it removes that step.
- **A script handling a live secret has to be built to be unable to print it.** Revision 5 of the
  spec lists the ways it could go wrong. The ones that shaped the code:
  - **wrangler is the larger surface.** In the pinned 4.149.0 it loads `.env` and `.env.local` from its
    working directory into its own environment (`cli.js` 366300, 190958–190970), reads the API base
    URL, the OAuth refresh endpoint, telemetry, error-report and log-file settings from that
    environment, and asks to create a draft Worker, answering yes by itself off a terminal, when
    `secret put` finds none (`createDraftWorker`, fallback `true`). So every call passes
    `--env-file scripts/turnstile.empty.env` (a global option, `cli.js` 366250), runs with an
    **allowlisted** environment plus forced values rather than the shell minus a denylist, and is
    preceded by the Worker check.
  - **Responses are parsed in one place and never quoted.** A library's parse error can quote a
    fragment of its input, and the input may hold the secret, so an error the script did not raise
    prints its class only.
  - **Branch checks stop accidents.** `main`, a clean tree and `HEAD` at `origin/main` stop a run
    from an agent's branch or unsaved edits. They do not stop a hostile process running as the
    owner (editing `node_modules`, `NODE_OPTIONS` or the shell profile), which the owner put out of
    scope.

## The allowlist

Kept from the shell, by upper-cased name: `PATH`, `PATHEXT`, `SYSTEMROOT`, `SYSTEMDRIVE`, `WINDIR`,
`COMSPEC`, `TEMP`, `TMP`, `TMPDIR`, `USERPROFILE`, `HOME`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`,
`LOCALAPPDATA`, `ALLUSERSPROFILE`. Read from the pinned wrangler: its login store is found through
`xdgConfig()` (`cli.js` 25045–25055), which reads `XDG_CONFIG_HOME`, else `APPDATA` on Windows or the
home folder (`homeDir()` from `os.homedir()`, then `HOME`), and its temp folder through `tempDir()`
(25006–25030). `XDG_CONFIG_HOME` is deliberately left out; a login stored there makes the Worker
check refuse, which fails closed. Forced: the account id, Cloudflare's base URL,
`NODE_TLS_REJECT_UNAUTHORIZED=1`, `WRANGLER_SEND_METRICS=false`,
`WRANGLER_SEND_ERROR_REPORTS=false`, `WRANGLER_WRITE_LOGS=false`, `WRANGLER_LOG_SANITIZE=true`,
`WRANGLER_LOG=log`. Confirmed against the source only, never by running wrangler against
Cloudflare, with two local checks that touch no network: `wrangler secret put`, `secret list` and
`deployments list` each list `--env-file` under `--help` in the pin, and `wrangler --version` runs
under exactly this environment. Whether the login is found is proven by the owner's first run.

## Accepted, with the owner's agreement

- The secret stays **readable at Cloudflare** by any token with Turnstile Sites Read or Account
  Settings Read, as for every widget made by hand. Keeping it out of Terraform state is about it
  never resting on this machine, not about it being unreadable.
- The secret and the token are held in the script's memory for one run; a token pasted from a
  clipboard may stay in Windows clipboard history, which deleting the token after the run ends.
- **There is no mode that invalidates the old secret immediately.** A leaked Turnstile secret
  verifies tokens and cannot mint them, so a two-hour overlap after a leak is accepted. For an
  emergency the dashboard's rotation remains.
- A hostile process running as the owner is out of scope.
- The `.env` exposure `deploy:ask` already carries (#459) is not extended to this script and is a
  separate follow-up.

## Not verified

Nothing here has run against Cloudflare: the account-token verify path, the error a second
rotation gets, a site key's exact length, wrangler's output lines, and whether `pnpm exec` restores
a `NODE_OPTIONS` from `.npmrc` into wrangler's environment. Each fails closed until the
owner's first run, which records the real codes and messages (with `<account>` for the id).

## Consequences

- S13 steps 8 to 11, S8's table, S4's flows table, `.env.example`, `infra/README.md` and
  `docs/commands.md` say the same. `AGENTS.md` lists `pnpm turnstile` (G14), and G67
  (`release-age`) holds both script files to `pnpm exec wrangler`, with planted cases.
- No dependency is added: the prompt is Node's raw-mode stdin.
