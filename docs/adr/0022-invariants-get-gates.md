# The invariants get gates, and the gates get a scoreboard

Every rule in CLAUDE.md has a named test that can go red, scored in [`docs/gates.md`](../gates.md). A rule nothing can fail on is a comment, and a gate never _observed_ failing is not yet a gate.

Gate code lives in `gates/` because it belongs to no package — it reads CLAUDE.md, `.env.example` and the source tree itself. Two habits make the difference between a gate and a decoration: every gate asserts its own extraction found something, and every structural allowlist reverse-asserts so a stale entry fails.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **Verified the gate can actually fail** before trusting it: a deliberately broken assertion turns `pnpm test` red (exit 1) and the `&&` chain in `pnpm build` stops on failure. A gate never observed failing is not yet a gate.

- **2026-07-31** — **The invariants get gates, and the gates get a scoreboard** — [`docs/gates.md`](../gates.md). A pre-publication review found six documented rules had quietly stopped being true with nothing going red, including a Decision Log entry below that is false in one of its two call paths. The rule this project already had — _"a gate never observed failing is not yet a gate"_ — now applies to the invariants themselves, not just to phase gates.

- **2026-07-31** — **`gates/` holds rules about the shape of the tree**, separate from each package's own tests, because they belong to no package — they read CLAUDE.md, `.env.example` and the source tree itself. In the typecheck include, so gate code is checked like everything else.

- **2026-07-31** — **Every gate asserts its own extraction found something.** A gate built on a regex reports an empty set when the format it parses changes, and every "each of these is documented" check passes trivially over an empty set. `expectFound` in `gates/repo.ts` is the guard, and it is why a reworded CLAUDE.md section fails loudly instead of going quietly green.

- **2026-07-31** — **Structural allowlists must fail when they go stale.** `gates/adapter-boundary.test.ts` and `gates/cover-path.test.ts` both reverse-assert: every allowlisted file must still exist _and_ still need its exemption. Without that a list only ever grows, and the easiest way to fix a red sweep becomes adding a line to it.
