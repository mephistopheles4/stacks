# The deploy's live check reports a refusal as a refusal, and is not worked around

Cloudflare's bot protection on `stacks.aymandiab.com` refused every automatable
client, so `deploy:site` could not read the page it deploys. **The check reports
that rather than being routed around it**, and reports the deploy as unverified
rather than as fine.

The failure it replaces was worse than no check: a 403 carries a *challenge
page*, which parses as HTML containing no build stamp, so the check reported
`serving a build with no stamp` — the same words as the real defect it exists to
catch — and then recommended purging the entire zone cache. A remedy for a cause
that was not there, on a diagnosis it had not made.

**Resolved the same day, at the zone rather than in this repo** — see the last
two entries. Super Bot Fight Mode's "definitely automated" category was set to
Allow, and the check reads the site again. The code stands as written: it is
what a *future* refusal should do, and refusing to route around one is why the
cause could be named at all.

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

- **2026-08-03** — **Whatever the remedy is, it is not a header the script
  ships.** A bypass anyone could guess is an exemption handed to every bot, and
  this is the one setting here whose blast radius is the public internet. So the
  output names the zone and, now, **Security → Events** — every mitigation row
  says which service made the decision, which is strictly better than the guess
  this script can make from a status code.

- **2026-08-03** — **The cause was Super Bot Fight Mode, and the output said WAF.**
  Setting its "definitely automated" category to Allow restored the check
  immediately: `serving build 6b092a81e312`, six consecutive runs, 33 covers
  matching. The message had pointed at Security → **WAF**, which is a different
  page from Security → **Bots**, so a reader following it would not have found
  the switch that mattered. Corrected — and the message now offers bot protection
  as the *likely* cause rather than asserting it, because a status code is all
  this code has, and asserting a diagnosis it had not made is the original sin
  being fixed here.

- **2026-08-03** — **The DNS change was examined and is not the explanation.**
  The owner had changed DNS the day before, which would be a clean story:
  `stacks.aymandiab.com` resolves to the same edge addresses as the root domain
  and not to the Pages range, so it is proxied through the zone, which is what
  makes zone bot rules apply at all. But the proxying is not new — `deploy.ts`
  already carried, from long before, that "a zone overrides the Cache-Control
  this build sends", which only happens through a proxy, and `progress.md`
  records `X-Robots-Tag` being read off a live response, which a challenge would
  have prevented. So the hostname was already behind the zone and the page was
  already readable; what changed is a security setting, and **when** it changed
  is answerable only from Security → Events and the account Audit Log.

- **2026-08-03** — **Why it hid for so long.** Two things. Nearly everything
  these checks fetch is *images* — 33 cover requests against one HTML request —
  and images are exempt from the challenge, so the loud part of the output stayed
  green. And when the one HTML request did fail, it failed as "serving a build
  with no stamp", which reads exactly like the edge-propagation delay the check
  is designed to wait out. A check that fails in the vocabulary of its own
  false-positive is a check nobody investigates.
