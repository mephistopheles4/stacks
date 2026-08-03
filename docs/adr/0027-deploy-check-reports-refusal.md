# The deploy's live check reports a refusal as a refusal, and is not worked around

Cloudflare's bot protection on `stacks.aymandiab.com` refuses every automatable
client, so `deploy:site` cannot read the page it deploys. The check now says
that, in its own message, and stops. **It is not routed around**, and the deploy
is reported as unverified rather than as fine.

The failure it replaces was worse than no check: a 403 carries a *challenge
page*, which parses as HTML containing no build stamp, so the check reported
`serving a build with no stamp` — the same words as the real defect it exists to
catch — and then recommended purging the entire zone cache. A remedy for a cause
that was not there, on a diagnosis it had not made.

## How this was decided

- **2026-08-03** — **The user agent is not the axis, and finding that out is the
  whole decision.** The first diagnosis was a user-agent rule, and it was wrong.
  Measured against this zone: curl is refused on its own default UA and passes
  with any other; Node's `fetch` is refused with *every* UA including a verbatim
  Chrome one; and a real headless Chrome is refused too. Only the non-headless
  browser in a desktop session loads it. So the block keys on the client's
  fingerprint and on headless detection, neither of which a caller controls —
  **no request header fixes this**, and a fix that "worked" by looking browsery
  enough would be one Cloudflare heuristic update away from silently reverting
  to the behaviour being fixed here.

- **2026-08-03** — **So the check is made honest instead of made to pass.**
  `verifyBuildLive` reads `response.status` before it reads the body. The refusal
  message deliberately does **not** carry the cache-purge advice: the two
  failures are indistinguishable from here and have nothing in common — one is a
  stale copy of a real page, the other is no page at all.

- **2026-08-03** — **Corrected the same day: a 4xx retries like everything else.**
  The first version bailed immediately on any 4xx, reasoning that a rule will say
  the same thing five more times. That premise is wrong, and the owner's zone
  disproved it within the hour: with Super Bot Fight Mode's "definitely automated"
  category set to *allow*, the identical request still came back 403 about **one
  time in six**. Bot protection is not a rule, it is a **score** recomputed per
  request, so there is no such thing as a deterministic answer to retry past.
  Bailing on the first would have raised a false alarm on roughly one deploy in
  six *on a zone that lets the check through* — the same class of false alarm this
  whole record exists to end, reintroduced by the fix for it. A hard refusal now
  costs seven attempts before it is reported; that is the price of not crying
  wolf, and it is worth paying.

- **2026-08-03** — **The cover check had the identical blindness and was fixed
  with it.** It compared `content-length` against the built file without reading
  the status, so a challenge page would have reported a byte mismatch on every
  cover — which reads as a stale cache, and points at the same wrong remedy.
  Covers are not currently blocked on this zone; it was fixed because the next
  rule change decides that, not us.

- **2026-08-03** — **No `pages.dev` fallback.** It was considered and dropped.
  The `*.pages.dev` origin is readable and would confirm the uploaded
  `index.html` carries the expected stamp — but that is a fact the script just
  computed itself, and it says nothing about what the custom domain's cache is
  serving, which is the entire failure this check was built for after the mobile
  fix sat behind a stale `index.html`. Its hostname also carries a generated
  suffix (`stacks-51z`) that is not derivable from the project name, so it would
  need a new `.env` key. Permanent config surface for a weaker answer.

- **2026-08-03** — **The remedy named in the output is a WAF rule, scoped to
  something only the owner can send.** Not a fixed header the script ships: a
  bypass anyone could guess is an exemption handed to every bot, and this is the
  one setting here whose blast radius is the public internet. Until such a rule
  exists, the honest state is that **`deploy:site` publishes without confirming
  what visitors get**, and the by-hand check — open the site, view source, read
  `<meta name="stacks:build">` — is the only thing that closes it.
