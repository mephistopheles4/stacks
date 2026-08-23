import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObsidianAdapter } from "../adapters/obsidian-adapter.ts";
import { coverUrls } from "../metadata/types.ts";
import { cacheCover } from "./cache-cover.ts";

/**
 * `cacheCover`'s sequencing, as opposed to its parts.
 *
 * `blank.test.ts` and `download.test.ts` each prove one step in isolation.
 * Nothing proved the *order* they run in: which candidate wins, what happens
 * when none of them is cover-shaped, and which URL the recorded `source` is
 * taken from. That was exercised only incidentally, through `add-book.test.ts`
 * and `enrich.test.ts`, where a change in preference order would still leave a
 * cover on disk and every assertion green.
 *
 * The empty case matters more than it looks. Callers used to filter their own
 * candidate lists and skip the call entirely when nothing was left, so
 * `cacheCover` was never handed a list with nothing usable in it. Now it is.
 *
 * No test makes a live call: `fetch` is stubbed throughout.
 */

const SPREAD = "https://books.google.com/jacket-spread.jpg";
const COVER = "https://covers.openlibrary.org/b/id/1-L.jpg";
const DEAD = "https://books.google.com/gone.jpg";

/** Cover-shaped: the ~0.65 ratio a print cover actually has. */
async function coverShaped(): Promise<Buffer> {
  return await sharp({
    create: { width: 400, height: 600, channels: 3, background: "#2f6d7a" },
  })
    .jpeg()
    .toBuffer();
}

/** Front, spine and back together — what Google sometimes serves as "large". */
async function spreadShaped(): Promise<Buffer> {
  return await sharp({
    create: { width: 1400, height: 600, channels: 3, background: "#7a4b2f" },
  })
    .jpeg()
    .toBuffer();
}

/** Routes each URL to its own bytes, so which candidate won is observable. */
function serve(bodies: Readonly<Record<string, Buffer | undefined>>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = bodies[url];
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(Uint8Array.from(body), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }),
  );
}

/** Every URL `fetch` was called with, in call order. */
function fetched(): string[] {
  return vi.mocked(fetch).mock.calls.map(([url]) => String(url));
}

describe("cacheCover", () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "stacks-cover-"));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  describe("which candidate wins", () => {
    it("passes over a jacket spread for the next candidate", async () => {
      serve({ [SPREAD]: await spreadShaped(), [COVER]: await coverShaped() });

      const cached = await cacheCover(
        [SPREAD, COVER],
        "The Tidal Engine",
        vault,
      );

      // The whole reason the downloader takes a list rather than one URL.
      expect(cached?.source).toBe("open-library");
    });

    it("keeps a spread rather than leaving the book bare", async () => {
      // Nothing cover-shaped anywhere: a wrong-shaped cover still beats none.
      serve({ [SPREAD]: await spreadShaped() });

      const cached = await cacheCover([SPREAD], "The Tidal Engine", vault);

      expect(cached?.relativePath).toBe("covers/the-tidal-engine.jpg");
      expect(cached?.source).toBe("google-books");
    });

    it("records the provider of the URL that won, not the one asked first", async () => {
      // `cover_source` describes the bytes on disk. A candidate that 404s must
      // not leave its provider's name next to somebody else's image.
      serve({ [COVER]: await coverShaped() });

      const cached = await cacheCover([DEAD, COVER], "The Tidal Engine", vault);

      expect(cached?.source).toBe("open-library");
    });

    it("reads a spine colour from the bytes it kept", async () => {
      serve({ [COVER]: await coverShaped() });

      const cached = await cacheCover([COVER], "The Tidal Engine", vault);

      expect(cached?.spineColor).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe("nothing to try", () => {
    it("returns undefined for an empty list without fetching", async () => {
      serve({});

      expect(await cacheCover([], "The Tidal Engine", vault)).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("returns undefined when every candidate is absent", async () => {
      // The shape callers actually hold: two optional metadata fields, neither
      // set. Filtering that list was duplicated at every call site until the
      // downloader took it on.
      serve({});

      expect(
        await cacheCover([undefined, undefined], "The Tidal Engine", vault),
      ).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("tries the candidates that are present and ignores the gaps", async () => {
      serve({ [COVER]: await coverShaped() });

      const cached = await cacheCover(
        [undefined, COVER],
        "The Tidal Engine",
        vault,
      );

      expect(cached?.source).toBe("open-library");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("returns undefined when every download fails", async () => {
      serve({});

      expect(
        await cacheCover([DEAD], "The Tidal Engine", vault),
      ).toBeUndefined();
    });
  });

  /**
   * The preference rule end to end — the half a structural gate cannot reach.
   *
   * G22 proves the ranking is written in exactly one place. It cannot prove
   * that place ranks it the right way round, and for a while nothing did:
   * reversing `coverUrls` left all 290 tests green, because a reversed
   * preference is not an error anywhere. A cover still downloads, it is still
   * the right book, and `cover_source` is still correct for the bytes kept —
   * you have simply kept a ~128px thumbnail instead of the large image.
   *
   * Asserted through the downloader rather than on the tuple alone, because the
   * thing worth protecting is which bytes reach the shelf, not the shape of a
   * return value.
   */
  describe("the preference rule reaches the network", () => {
    const LARGE = "https://books.google.com/large.jpg";
    const SMALL = "https://books.google.com/thumbnail.jpg";

    it("asks for the large cover before the small one", async () => {
      serve({ [LARGE]: await coverShaped(), [SMALL]: await coverShaped() });

      await cacheCover(
        coverUrls({
          title: "The Tidal Engine",
          coverUrl: SMALL,
          coverUrlLarge: LARGE,
          source: "google-books",
        }),
        "The Tidal Engine",
        vault,
      );

      expect(fetched()[0]).toBe(LARGE);
    });

    it("falls back to the small cover when there is no large one", async () => {
      serve({ [SMALL]: await coverShaped() });

      const cached = await cacheCover(
        coverUrls({
          title: "The Tidal Engine",
          coverUrl: SMALL,
          source: "google-books",
        }),
        "The Tidal Engine",
        vault,
      );

      expect(cached?.relativePath).toBe("covers/the-tidal-engine.jpg");
      expect(fetched()).toEqual([SMALL]);
    });
  });
});
