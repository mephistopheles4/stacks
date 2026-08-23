# The deploy's live check reports what it cannot verify, and is never routed around

When the origin refuses to be read, `deploy:site` says so and reports the deploy
as **unverified**. It does not fall back to an origin that would answer, and it
does not dress the refusal up as a result.

The failure it replaces was worse than no check. A refusal arrives as a
_challenge page_ — HTML, with a content-length like anything else — so a check
that read the body without the status found no build stamp in it and reported
`serving a build with no stamp`: the same words as the real defect it exists to
catch, followed by a recommendation to purge the entire zone cache. A remedy for
a cause that was not there, on a diagnosis it had not made.

## How this was decided

_Carried verbatim from the session that produced it, newest last._

- **2026-08-03** — **A browser user agent does not fix this, and that is the
  finding most likely to be rediscovered the expensive way.** The first
  diagnosis was a user-agent rule and it was wrong. Measured: curl was refused
  on its own default UA and passed with any other; Node's `fetch` was refused
  with _every_ UA, including a verbatim Chrome one; a real headless Chrome was
  refused too. The decision is made on the client's fingerprint, which no caller
  controls — so there is no header to send, and a fix that appeared to work by
  looking browsery enough would be one heuristic update from silently reverting
  to the behaviour being fixed. **Do not add a user agent to make this pass.**

- **2026-08-03** — **So the check is made honest rather than made to pass.** Both
  live checks read `response.status` before the body. The refusal message
  deliberately does **not** carry the cache-purge advice the stamp-mismatch path
  gives: the two failures are indistinguishable from out here and have nothing
  in common — one is a stale copy of a real page, the other is no page at all.
  It also does not name a cause. All this code has is a status code, and
  asserting a diagnosis it has not made is the defect being fixed.

- **2026-08-03** — **Corrected within the hour: every non-200 retries.** The
  first version bailed immediately on a 4xx, reasoning that a rule will say the
  same thing five more times. Watching a live zone through a settings change,
  identical requests disagreed — refused about one time in six for a few
  minutes, then not again. Whether that was propagation or a per-request
  decision was never established and does not matter: **a single refusal is not
  evidence of a standing one**, so bailing on the first raises a false alarm
  against an origin that does answer, which is the failure this record exists to
  end. A standing refusal now costs seven attempts before it is reported. That
  is the price of not crying wolf.

- **2026-08-03** — **No fallback to an origin that would answer.** Cloudflare
  Pages' own `*.pages.dev` hostname is readable when a custom domain is not, and
  checking it would confirm the uploaded `index.html` carries the expected stamp
  — but that is a fact the script just computed itself, and it says nothing
  about what the custom domain is serving, which is the entire failure this
  check was built for after the mobile fix sat behind a stale `index.html`. A
  weaker check that reads like the strong one is how the original defect
  survived. It would also need a new `.env` key, since that hostname carries a
  generated suffix that is not derivable from the project name.

- **2026-08-03** — **The remedy is never a header this script ships.** A bypass
  anyone could guess is an exemption handed to every bot, and this is the one
  setting in the project whose blast radius is the public internet. So the
  output points at the zone's own **Security → Events**, where each row names
  the service that mitigated the request — which beats any guess this code can
  make from a status code. Scoping such an exemption is the operator's call, not
  this repository's.

Where this has actually bitten, and what the zone was doing at the time, is an
environment finding rather than a decision: see **"The deploy check could not
read the site"** in [`../progress.md`](../progress.md).
