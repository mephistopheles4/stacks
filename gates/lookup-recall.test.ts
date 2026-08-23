import { describe, expect, it } from "vitest";
import {
  isProbablySameBook,
  lookup,
  type HttpGet,
} from "../packages/core/src/index.ts";
import { readRepoFile } from "./repo.ts";
import { RECALL_CORPUS, stripKey } from "./recall-corpus.ts";

/**
 * G26 — the lookup finds books the providers demonstrably have.
 *
 * Every other gate here checks a *contract*: the frontmatter keys, the shelf
 * order, what the public build ships. This one checks **recall** — whether the
 * metadata layer actually comes back with a book that exists — and its absence
 * is why issue #63 shipped and stayed shipped. Five books in the real vault had
 * no page count, all five were refused as "not the same book", and Google was
 * holding three of them the whole time. Nothing went red, because nothing asked.
 *
 * The corpus is real books with real answers, replayed from real captured
 * responses (`fixtures/api/lookup-recall.json`, written by
 * `scripts/capture-lookup-recall.ts`). Live calls are forbidden — G21 — and the
 * reader below throws on a URL it has no recording for, so a change that starts
 * asking a new question fails loudly instead of quietly taking the not-found
 * path and passing for the wrong reason.
 */

const RECORDINGS = JSON.parse(
  readRepoFile("fixtures/api/lookup-recall.json"),
) as Record<string, unknown>;

const replay: HttpGet = async (url) => {
  const key = stripKey(url);
  if (!(key in RECORDINGS)) {
    throw new Error(
      `no recorded response for ${key}\n` +
        "The lookup asked something the corpus has never seen. Re-run " +
        "`pnpm tsx scripts/capture-lookup-recall.ts` if that is deliberate.",
    );
  }
  // `null` is a recorded *miss*, which is not the same as an unrecorded URL.
  return RECORDINGS[key] ?? undefined;
};

describe("lookup recall", () => {
  it("has a corpus and recordings to replay", () => {
    expect(RECALL_CORPUS.length).toBeGreaterThan(0);
    // Guards the vacuous pass: an empty recording map would make every case
    // throw, but an almost-empty one could let a shrunken corpus look healthy.
    expect(Object.keys(RECORDINGS).length).toBeGreaterThanOrEqual(
      RECALL_CORPUS.length * 2,
    );
  });

  for (const entry of RECALL_CORPUS) {
    const name = entry.term.slice(0, 48);

    if (entry.expect.kind === "found") {
      const { pages, title } = entry.expect;

      it(`finds ${name}`, async () => {
        const [best] = await lookup(entry.term, replay);

        expect(
          best,
          `nothing came back at all. ${entry.because}`,
        ).toBeDefined();
        expect(
          isProbablySameBook(
            entry.label,
            `${best?.title ?? ""} ${best?.author ?? ""}`,
          ),
          `best candidate was "${best?.title ?? ""}". ${entry.because}`,
        ).toBe(true);
        expect(best?.title).toContain(title);
        // The number, not merely "some number": a page count taken from the
        // wrong edition is the failure this gate exists to catch, and it is
        // invisible in a truthy check.
        expect(
          best?.pages,
          `wrong edition or wrong endpoint. ${entry.because}`,
        ).toBe(pages);
      });
      continue;
    }

    it(`refuses ${name}`, async () => {
      const [best] = await lookup(entry.term, replay);
      // A refusal is the outcome; whether anything came back is not the point.
      expect(
        best === undefined ||
          !isProbablySameBook(
            entry.label,
            `${best.title} ${best.author ?? ""}`,
          ),
        `accepted "${best?.title ?? ""}" as this book. ${entry.because}`,
      ).toBe(true);
    });
  }
});
