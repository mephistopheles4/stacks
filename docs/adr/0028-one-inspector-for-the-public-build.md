# One inspector for the folder about to be published

"Is this folder safe to publish?" is answered once, by
`scripts/lib/public-build.ts`. `pnpm gate:public` and `pnpm deploy:site` are two
**callers** of it, not two implementations of it.

The module is handed a directory and the origin its share URLs must be absolute
against. It builds nothing, does not know which vault produced the folder, and
does not log. It returns problems tagged with the rule that produced them, plus
the observations a caller may print. The rules: `note-body`, `vault-path`,
`empty-library`, `private-book`, `wishlist-book`, `foreign-cover`,
`orphan-cover`, `share-image-missing`, `share-image-origin`, `robots`,
`headers`, `og-image`, and — added later, by
[#127](https://github.com/mephistopheles4/stacks/issues/127) — `csp`.
`PUBLIC_BUILD_RULES` is the list; the type is derived from it, and G20 asserts
every member has been watched going red. That last clause is what lets a rule
join without a new gate row, and it is the mechanism #127 was written to use.

## What this does not change

The **ordering** in [`deploy.ts`](../../scripts/deploy.ts) is untouched and is
still the thing that matters most: the gates stage a _fixture_ vault into
`packages/site/public/` and therefore run first, and the real build runs last.
[ADR-0012](0012-public-build-staging.md) is why.

The **separation** `CLAUDE.md` states is untouched too — _"the gates prove the
code path is safe using fixtures, and say nothing about the folder about to go
on the internet."_ That remains exactly true. Two calls against two different
folders is what it always described; two divergent implementations was never the
point of it.

**G2 is untouched.** It keeps asserting `private`/`wishlist` against
`publish()`'s output, which is a different claim from asserting them against the
artifact: G2 proves the filter _works_, the artifact rules prove it _ran_. Both
stay.

## The trade-off

Against: one module means one bug can blind both call sites. Two independent
checkers of a safety property is a defensible posture, and collapsing them gives
that up.

For: the redundancy was **accidental, not designed** — neither script knew the
other existed — and it had already failed in the way accidental redundancy does.
Neither was a superset of the other, and the weaker half of both divergences was
on `deploy:site`, the only one of the two that publishes anything:

| rule        | `gate:public`                                     | `deploy:site`                                            |
| ----------- | ------------------------------------------------- | -------------------------------------------------------- |
| `_headers`  | exists **and** `/covers/*` carries `max-age=0`    | exists                                                   |
| share image | every `og:image` **and** `twitter:image` absolute | one substring match, so a page with no `og:image` passed |

The `_headers` gap is not hypothetical: it is how the fix for the mobile crash
reached an origin nobody could see. Independent implementations only buy
independence when somebody is checking that they still agree, and nothing was.

The deciding argument is not the duplication count. It is that an inspector
which builds nothing can be pointed at a synthetic folder, so every rule is
watched going red in milliseconds — G20, `gates/public-build-artifact.test.ts`.
Neither of the two originals could be tested at all without running a full site
build, which is why neither ever was.

## What deliberately stayed out

The fixture-book check stays in `deploy.ts`. `gate:public` requires those titles
**present** in the folder it inspects and the deploy requires them **absent** —
the same strings with opposite verdicts — and a module handed a directory cannot
know which vault produced it. Resolving that needs an `expect:
'fixtures' | 'real-vault'` parameter, which is a caller teaching the module
something the module then uses once: the shallowness this change exists to
remove.

It is also a different question. Every other rule asks _is this folder safe to
publish_; that one asks _did my build steps run in the right order_. Its failure
means the deploy script is broken, not that the build is unsafe. The genuinely
unsafe half of the same incident — real covers surviving beside a fixture
`library.json` — is `orphan-cover`, and that did move in.

It reads the fixture vault through `ObsidianAdapter`, not by listing filenames.
That is invariant 4, and it is also the only correct answer: a note's filename
is not its title for five of the twelve fixtures, and one of the two titles the
check used to hardcode — `Compilers for the Impatient` — carries a subtitle and
had therefore never matched a shipped book at all.

## How this was decided

- **2026-08-03** — **Found by an architecture review, not by a failure.** The
  three implementations were catalogued while looking for shallow modules; the
  `_headers` and `og:image` divergences were found afterwards, by building the
  table above to check whether the duplication was actually costing anything. It
  was, and in the direction that matters. Recorded because the reasoning runs
  the opposite way to the intuition — the _publishing_ path is the one you would
  expect to be strictest, and it was the weaker one precisely because nobody was
  comparing them.

- **2026-08-03** — **Inspect-only was chosen over build-and-inspect, and it is
  the load-bearing decision.** Owning the build would have fit exactly one
  caller: the deploy builds from a different vault with different arguments, and
  `--check-only` builds nothing at all and still wants the inspection. Taking a
  directory instead fits all three unchanged — and is what makes G20 possible,
  which is worth more than the deduplication.

- **2026-08-03** — **Tagged problems rather than a flat `string[]`, decided from
  `--check-only`'s behaviour.** It collected problems and deliberately did not
  fail on them, which rules out a throwing interface. It also skipped _all_ of
  them, though only `share-image` genuinely cannot hold for it — that check
  asserts the built `og:image` matches the _current_ `SITE_URL`, and repointing
  `SITE_URL` at a local server is how you watch the live check fail on purpose.
  The blanket skip was a workaround for problems being anonymous. With a rule on
  each, `--check-only` now drops that one and reports the rest as warnings
  instead of refusing to run.

- **2026-08-03** — **Merging two half-rules is its own hazard, and it bit
  immediately.** Review of the first draft found that where the two
  implementations had each kept _half_ of one rule, the merged version kept only
  one half rather than the conjunction. `og:image` had to be absolute against
  the origin (the gate's half) **and** name the `og.png` this build wrote (the
  deploy's half); the draft asserted the first alone, so `<origin>/hero.png`
  passed. Recorded because it is the failure mode of this whole exercise: the
  argument for one implementation is that halves stop drifting apart, and
  collapsing them is exactly the moment a half can be dropped without anything
  going red. The rule to carry forward is that a merge starts from the union of
  what each side asserted, enumerated, not from whichever version read better.

- **2026-08-03** — **`inspect`, not `certify` or `preflight`.** Three names were
  in use for one act: the deploy called it a pre-flight, the script is
  `gate:public`, the review called it certifying. `preflight` is false for two of
  the three callers — nothing flies after `gate:public`, and `--check-only` is
  not before anything. `certify` overclaims: a clean report is the absence of
  eleven known problems, not a certificate.
