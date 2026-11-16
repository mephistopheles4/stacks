# iOS would not scroll the open book: two runs on a real iPhone (#599)

On 2026-11-15, before any of the fix was built, the spec's premise was run on a
BrowserStack Automate iPhone 16 Pro (iOS 18, Safari) against the live site, with
`scripts/ios-swipe-check.ts`. The probe finds the book with the longest Thoughts,
picks it up, opens it, and swipes the right-hand page with a W3C pointer action.

| Run | Page | `scrollTop` | `scroll` events | Page's parent |
| --- | --- | --- | --- | --- |
| `--premise` | the right page cloned into a flat layer, swiped there | 0 → 564 | 118 | `.probe-flat` |
| plain (the control) | the page as the site ships it | 0 → 0 | 0 | `.other` |

The clone's box was 1507 by 713 px against a 713 px viewport, and the shelf
reported no fallback. The only difference between the runs is where the page
stands, which is what the fix changes: ADR-0151.

Nothing from either session is kept here beyond those numbers: the verdict line
carries no account name and no session address, and the credential never reaches
the repository or a log.

Still to run, through BrowserStack Local on the fixture build once the owner
starts the tunnel: the same swipe on the iPhone (C1) and on a Pixel 9, Android 15,
Chrome (C10).

## Text cut to make room

G71 holds `docs/gates.md`, `docs/progress.md` and `docs/spec/README.md` to a word
budget, and none had room for this change. What was cut, as it stood:

- `docs/progress.md`, the notice-modals row: "The text exists once (`NoticeBody`,
  `AttributionNotice`, `PrivacyNotice`); the modal is `packages/site/src/notice/`."
- `docs/spec/README.md`, the row for "New specs live on their issues", its last
  sentence: "Six files change and no gate does: `AGENTS.md` step 6, the tracker
  doc's new Specs section, a row in `gates.md`'s not-gated table, this paragraph
  and row, and [ADR-0145](../adr/0145-new-specs-live-on-their-issues.md) with its
  row in `docs/adr/README.md`".
- `docs/spec/README.md`, the O'Reilly row: "and the inert O'Reilly names in the
  metadata layer stay unexercised", after "`oreilly_ourn` and `cover_source:
  oreilly` stay on older notes".
- `docs/gates.md`, the G35 row, the notice cells; the row now links
  `spec/notice-modals.md`, which lists them.

**And the two notice pages** (`checkNoticePages`), with JavaScript off at 1440×900 and 375×812: `/attribution` and `/privacy` each carry their text, a way back to the shelf and `noindex`, set in body text of at least 18 px at 7:1 against its background and 1.5 times the size in line-height, and neither scrolls sideways. The modal's cells read the same properties through the same function. **And the notice modal opened from the shelf's Attribution link** (`checkNoticeModal`; the drawer and a held book are `checkNoticeOverDrawer`'s), at both widths: a plain click opens it with focus on the close button and the dialog named "Attribution"; Tab cycles inside it at both ends; the in-notice link to the privacy notice swaps the panel, the name becomes "Privacy" and focus lands on its heading; the type equals the direct page's property for property; the last line of each notice scrolls into view by keyboard; one Escape closes it and focus returns to the link; a click on the backdrop closes it; a ctrl-click opens the page in a new tab and not the modal; and nothing navigated while a `window` sentinel survived. **And a notice over the Ask drawer and a held book** (`checkNoticeOverDrawer`), from each of its two links, at 1280×800: a book held, the drawer opened over it, a question sent and answered (the offline build's unavailable reply), then open and close the notice, reading from each link the dialog's accessible name, the focus at the open and the focus back on that link, three clicks on the backdrop (the shelf, the corner by the brand, the drawer panel beside the notice), a click on the notice text, `Home`, an arrow and a down arrow with focus on `body`, and one Escape. Each step leaves the drawer's `aria-expanded`, the held title, phase, opened state, turn and the thread text exactly as they were; the second Escape is the drawer's; no new tab opens, nothing navigates and a `window` sentinel survives. The no-dialog fallback, where the shelf link navigates and the drawer link opens a new tab, is not a standing cell: `notice-modals.md` N6 states it.
