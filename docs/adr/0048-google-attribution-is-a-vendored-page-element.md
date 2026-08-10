# Google's attribution binds this site, and is discharged by a vendored page element

The shelf carries a persistent bottom-left surface: a *powered by Google*
graphic and an **Attribution** link, with `/attribution` behind it.

⚠️ **Not legal advice.** Nobody involved is a lawyer and no lawyer reviewed
this. What follows is a reading of what Google and Apple say they require.

## The obligation is live, and the ticket was wrong about where it lives

The Books API's own Terms of Service carry **no attribution clause at all** —
fees, content removal, privacy. But they bind you to the Google APIs Terms of
Service, §6: *"You agree to display any attribution(s) required by Google **as
described in the documentation for the API**."* The Books branding page is that
documentation, and it closes the loop from its own side twice.

So it is a **live clause pointing at a stale page**, not a stale page asserting
on its own authority — and the correction strengthens it rather than weakening
it. This project holds a key obtained under those terms.

**What did *not* decide it:** personal use, non-commercial, `noindex`. That is
the same move the mark research refused when it would not let the Internet
Archive's non-profit status stand in for a trademark licence.

**It binds although the data reaches the vault first.** §6 attaches to
*displaying* the data; if inserting a hop between fetch and display discharged
it, every API attribution requirement would be one cache away from nothing — and
this project caches every response already.

## Persistent, because the repo decided it rather than taste

`pages` drives spine thickness, so the shelf renders Google-derived **geometry**
continuously with no card open. A card-conditional graphic would be absent for
the entire time the obligation is live. That also disqualifies a colophon behind
a click: *"always displayed"* is strained by anything requiring an interaction.

The per-result link limb needed no new work: the card's Google mark links
`books.google.com/books?id={volumeId}` on exactly the books Google contributed
to, because the id key *is* the record of contribution
([ADR-0047](0047-the-contributor-set-is-the-id-keys.md)). Obligation and
affordance share a population by construction.

⚠️ **The two limbs are separate.** A published claim on the map — that an open
card discharges the corner's obligation — is wrong: the mark is the *link* limb
and the occluded graphic is the *graphic* limb.

## Vendored, against the recommendation

Google serves the image from its own host with no registration, and hotlinking
would make the redistribution question vanish. It was recommended on that basis
and argued down:

- **The page makes zero third-party requests today.** A hotlinked PNG would be
  the first, disclosing every visitor's IP and referer to Google on a `noindex`
  site — a privacy regression accepted to satisfy an obligation that has nothing
  to do with privacy.
- **An attribution you do not host can fail silently**, and a broken image is a
  failed obligation that looks exactly like a met one.
- **The redistribution residual is weaker here**: Google *requires* this image's
  display and serves it unconditionally.

**The artwork has since landed**, at `packages/site/public/poweredby-google.png`,
byte-for-byte as Google serves it. Two of this record's figures were guesses and
are now measurements: it is **62×30**, not 144×26, and it is **dark on
transparent**, so it is invisible on this page and sits on a quiet plate. See
[ADR-0050](0050-provider-marks-are-redrawn-monotone.md), which also records the
card's three marks going a different way — redrawn monotone rather than vendored.

## Half size and 0.8, and where the legibility floor actually is

The owner asked for it *"half its current size"* with *"a little bit of subtle
transparency so the colors arent too sharp"* — the badge was a lit chip in a
near-black room and Google's four saturated letters were the loudest colour on a
page whose subject is book covers. It renders at **31×15 with `opacity: 0.8`**,
the padding and radius halved with it so the plate stays a plate.

**The file is untouched.** It is still `poweredby.png` byte for byte, still
served from this origin, and it is drawn *whole and in proportion* — scaling is
a different act from cropping or recolouring, and G13's allowance is about the
committed binary, which has not moved.

⚠️ **`opacity` is nonetheless the first thing here that changes the mark's
rendered appearance rather than only the surface under it**, and that is the
owner's call rather than a finding. One value on one element, so the mark is
never faded *relative to* its own plate — a logo at a different opacity from its
background would read as doctored rather than quiet.

⚠️ **On a 1× display, half size costs the words "POWERED BY".** Measured, at 62 /
46 / 40 / 31 px: at 62 they are letters, at 46 they are readable, at 40 they are
mostly mush and at 31 they are a smudge. No better resampler recovers them —
their cap height in the file is about 5px and half of that is 2.5px, so the
information is not there to recover. On a 2× display the opposite is true and
31 CSS px is drawn at the file's own 62 device pixels, losing nothing at all.

This is the floor [`docs/spec/attribution-surface.md`](../spec/attribution-surface.md)
predicted when it noted Google publishes **no minimum size** for this graphic —
"so the floor is legibility" — and it is the first time anyone measured where
that floor is. **46px is the largest reduction that keeps the words on every
display**, and it is one number away if the owner would rather have them.

⚠️ **A deploy-time check that the graphic is still served was offered and
declined.** Recorded as declined rather than overlooked, because in a gate-heavy
repo a missing gate otherwise reads as an oversight: the obligation is met by a
committed file, not by a checked property.

⚠️ **Google's "no competing search services" clause is read narrowly** — Google
means search engines; Apple Books is a bookshop and Open Library a catalogue.
The counter-argument is on the record: *"there are no exceptions"* is the same
phrasing this map treated as absolute when O'Reilly used it. A judgement, not a
certainty.

## What the second page cost

`/attribution` is the first page this site has had besides the shelf. It carries
`index.astro`'s `noindex` posture, and ⚠️ **`pnpm gate:public`'s robots rule read
`dist/index.html` alone** — so a second page shipping searchable would have
passed. It now reads every built page.

## How this was decided

Map [#88](https://github.com/mephistopheles4/stacks/issues/88), tickets
[#103](https://github.com/mephistopheles4/stacks/issues/103) (what the providers
publish), [#104](https://github.com/mephistopheles4/stacks/issues/104) (whether
it binds), [#106](https://github.com/mephistopheles4/stacks/issues/106) (what the
surface carries and where it sits, measured with `?attribproto=`).
