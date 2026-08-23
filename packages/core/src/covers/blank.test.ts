import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isBlank } from "./cache-cover.ts";
import { FIXTURE_VAULT } from "../test-support.ts";

const cover = (file: string): string =>
  join(FIXTURE_VAULT, "Library", "covers", file);

/**
 * Google answers "no cover" with a white card reading "image not available",
 * at HTTP 200 and a plausible size. Nothing upstream can tell it from real art,
 * and it overwrote three correct audiobook covers before this check existed.
 */
describe("isBlank", () => {
  it("rejects a near-white, near-featureless image", async () => {
    const placeholder = await sharp({
      create: { width: 800, height: 1043, channels: 3, background: "#fbfbfb" },
    })
      .jpeg()
      .toBuffer();

    expect(await isBlank(placeholder)).toBe(true);
  });

  it("keeps a pale cover that still has something on it", async () => {
    // Staff Engineer's real cover is a grey map on off-white. The threshold has
    // to let that through, or the check trades one wrong cover for another.
    const pale = await sharp({
      create: { width: 400, height: 600, channels: 3, background: "#f2f2f2" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 300,
              height: 200,
              channels: 3,
              background: "#404040",
            },
          })
            .png()
            .toBuffer(),
          top: 200,
          left: 50,
        },
      ])
      .jpeg()
      .toBuffer();

    expect(await isBlank(pale)).toBe(false);
  });

  it("keeps every real fixture cover", async () => {
    for (const file of [
      "the-tidal-engine.png",
      "the-salt-road-ledger.png",
      "white-bordered.png",
    ]) {
      expect(await isBlank(await sharp(cover(file)).toBuffer()), file).toBe(
        false,
      );
    }
  });

  it("says no rather than throwing when handed something that is not an image", async () => {
    expect(await isBlank(Buffer.from("not an image"))).toBe(false);
  });
});
