# `scripts/ios-swipe-check.ts` — does a finger scroll the open book

The check only a real iPhone can run (#599, [ADR-0151](adr/0151-the-open-book-reads-in-a-flat-layer.md)).
iOS WebKit will not start a native overflow scroll inside `CSS3DRenderer`'s
layer, and no desktop engine shows it: G35's held-at-rest check sets `scrollTop`
from script, which scrolls even where a finger cannot. The probe drives a
BrowserStack Automate session on an iPhone (or, with `--browser chrome`, an
Android phone), opens the book with the longest Thoughts, swipes the right page
with a W3C pointer action, and reads whether `scrollTop` rose by 100 px or more
and whether `scroll` events fired. **Not a `pnpm` script and not a gate**: it
needs the owner's BrowserStack account, which no CI runner and no contributor
has, so it is listed beside G35 as **not gated**
([`gates.md`](gates.md#not-gated-deliberately)), with this probe as its manual
check. Run it before merging anything that touches `held-flat.ts`, the held
pages' stacking, or `CSS3DRenderer`'s layer.

```sh
pnpm exec tsx scripts/ios-swipe-check.ts --premise        # the live site, the page cloned into a flat layer
pnpm exec tsx scripts/ios-swipe-check.ts                  # the live site as it is: the control, expected not to scroll on iOS before the fix
pnpm exec tsx scripts/ios-swipe-check.ts --check-served   # is the build on the port the fixture build? opens no session
pnpm exec tsx scripts/ios-swipe-check.ts --local          # the fixture build through BrowserStack Local
pnpm exec tsx scripts/ios-swipe-check.ts --local --device "Google Pixel 9" --os 15 --browser chrome
```

**The credential** is read from `~/.config/browserstack.env`
(`BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`) into the process, sent in an
`Authorization` header and nowhere else: never printed, never in a URL, never on
a command line, never written to the repository or a log. An error prints an HTTP
status and the hub's message cut to 200 characters with the session id masked,
and the verdict line carries no account name and no session URL. What a page or
the hub hands back is outside text: each answer is checked for the shape asked
for. A page's own string is never printed (its errors are this tool's fixed
sentences, or "the page script failed"); the hub's message is, scrubbed of
control characters and cut to 200 characters.

**Serving the fixture build for a tunnel.** The tunnel carries whatever is on one
port to a device cloud, so it carries the fixture build and only that — invented
titles and text, [ADR-0004](adr/0004-fixtures-invented.md). From the
repository root, in this order:

```sh
pnpm fixtures:50                                                                    # the generated vault, with the long-Thoughts book
pnpm stacks build --public --vault fixtures/vault-50 --assets packages/site/public  # its library.json, covers and notes/
pnpm --filter @stacks/site build                                                    # the site, into packages/site/dist
pnpm exec tsx scripts/ios-swipe-check.ts --serve                                    # serves packages/site/dist on 127.0.0.1:8766, in its own terminal
pnpm exec tsx scripts/ios-swipe-check.ts --check-served                             # refuses unless every title is the generator's
```

`--serve` is the one way to serve it: it judges `packages/site/dist/library.json`
from disk the same way, refuses a build that is not the fixture's, then serves
that folder through `scripts/lib/serve-dist.ts` (loopback only, refuses a path
outside the folder) and takes no argument but `--port`. No package runner is
involved. `--check-served` reads `http://127.0.0.1:<port>/library.json` and
refuses unless the list is not empty and every title is one `isFixtureTitle`
accepts, counting the ones that are not and never quoting them; it follows no
redirect. `--local` runs the same check first, always, and opens nothing when it
refuses. **Both read one file at one moment**: do not build into
`packages/site/dist` while the tunnel is up, and stop the tunnel after each run.

**The tunnel is the owner's to start and stop.** BrowserStack Local is a download
and a long-running process that opens the machine to a device cloud, so it is not
started from a session: the owner starts it with `--only localhost,<port>,0` (the
one port, and the check's own `--port` is that port) and `--force-local` off, and
stops it after each run, from a folder outside this repository. `--local` loads
`http://bs-local.com:<port>/` and no other address.

⚠️ **The key must not be typed into a shell.** BrowserStack's flag reference
documents the key only as `--key <access key>`, and does not say the binary reads
it from an environment variable, so this page does not claim it does (not
confirmed, 2026-11). Typing the key, in a command or in `$env:` assignments, can
leave it in the shell's history file. Start the binary from a small script of
your own that reads `~/.config/browserstack.env` and passes the key, so the value
is never typed or saved in history (the binary's own command line still holds
it while it runs, visible to this machine's other processes), and check the
current Local docs for the flags before the first run.

**Chrome on iOS needs no run of its own**: every browser on iOS is WebKit, so the
Safari result stands for it.
