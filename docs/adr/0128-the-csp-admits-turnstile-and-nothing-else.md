# ADR-0128 — The CSP admits Turnstile's origin in two directives, and nothing else

**Date:** 2026-11-05
**Status:** accepted. The owner approved it on 2026-11-04
(`docs/spec/ask-the-library.md` S14, Q2). Amends [ADR-0065](./0065-the-csp-is-generated-not-written.md).

## Decision

`https://challenges.cloudflare.com` joins `script-src`, and a new
`frame-src https://challenges.cloudflare.com` is added, on every page, because
Astro emits one policy for the whole site. `connect-src 'self'` stays as it is:
the drawer's one request is to `/api/chat` on the site's own hostname. G20's
`CSP_DIRECTIVES` holds the full set, and any other change reddens it (C10).

## Why

Turnstile is the one check that does not key on an address (S15), so it is the
check that holds up when addresses are many. It runs a script and a challenge
frame from Cloudflare's origin. This is the first origin the project chooses to
add: the beacon origin ADR-0065 names is one Cloudflare injects.

## What limits the damage

- Turnstile's script loads when the drawer first opens, not on page load, so a
  visitor who never opens it makes no request to that origin (C11).
- The set stays enumerable. A third origin, a `script-src-elem`, or the frame
  directive widened still fails G20, and so does either of the two being dropped.
- `frame-ancestors` is unchanged: `_headers` still denies framing the site.

## What was rejected

- **Loading Turnstile on every page.** It sends browser signals and an address to
  Cloudflare for every visitor, including those who never ask a question.
- **A nonce or `strict-dynamic`.** The policy is a `<meta>` generated from the
  build; the origin list is the smaller change and the one a gate can read.

## Unmeasured

Whether Turnstile needs another directive on the live page (for example a
`style-src` or `connect-src` entry its frame might ask the parent for) is not
known until a real token is earned under the planned CSP. That is S12's
after-build check, and a finding there reopens this record.
