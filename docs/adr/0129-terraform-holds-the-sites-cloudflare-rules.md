# ADR-0129 — Terraform holds the site's Cloudflare rules, under `infra/`

**Date:** 2026-11-05
**Status:** accepted. The owner chose "infrastructure in the repo as code
wherever a tool allows it" (`docs/spec/ask-the-library.md` S3). Nothing has been
applied yet.

## Decision

The rules the Ask the library feature depends on, which live in Cloudflare's
dashboard and not in a repository file, are written in `infra/` as Terraform: the
WAF rate-limit rule, the AI Gateway with its spend limit, and the Health Check
with its notification. Exact tool and provider versions are pinned and
`.terraform.lock.hcl` is committed. State is local and never committed.

## Why

The WAF rule and the spend limit are what cap the bill and the abuse. A rule that
exists only in a dashboard can be edited without a diff, and the repository's
claims about it (S5) would go stale unseen. As code, the first `terraform plan`
is read for any change to an existing rule before apply, and `terraform destroy`
is the way back (S13).

## Boundaries

- **The Turnstile widget and secret are made by hand.** The secret must never
  enter Terraform state (S14, Q4).
- **The token is scoped** to one zone, the account's AI Gateway and what the
  Health Check notification needs, has an expiry, is set only on the Terraform
  command and never goes in `.env`, so it cannot reach `deploy:ask`.
- **The zone also carries the root domain**, so any plan that changes a rule
  outside `infra/` is a stop-and-ask (S13).
- **The alert recipient is a variable**, never committed.
- **No mutation scope, no CI job.** Applying is the owner's step (S13 step 8).

## What was rejected

- **Dashboard-only.** Nothing to diff, review or roll back.
- **Wrangler's own config for the rules.** It covers the Worker, its routes and
  bindings (and does, in `packages/ask/wrangler.jsonc`), but not zone rules or
  the gateway.
- **An encrypted state backend.** It is more machinery than one owner and one
  small zone need, and the secret is kept out of state instead.
