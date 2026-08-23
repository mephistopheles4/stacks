/**
 * Asking the live origin what it is serving.
 *
 * Two surfaces share this and always did, without sharing any code: **B**, the
 * edge check `pnpm deploy:site` runs after an upload, and **D**, the same
 * question asked between deploys — which `pnpm trend:sync` folds in because it
 * needs the local `dist/` and so can only run on the owner's machine. Moving D
 * into CI dies on a fact rather than on a preference: the build stamp is
 * `sha256(index.html + library.json)` and `library.json` is built from the real
 * vault, which is not in the repo, **so CI can never compute the expected
 * stamp.** See `docs/spec/trend-layer.md` §5.
 *
 * ⚠️ **Four answers, not three, and the pair that matters is *refused* versus
 * *stale*.** A refusal is not an answer: Cloudflare's bot protection serves a
 * challenge *page* with a 403, and for a long time this code read the missing
 * stamp in it as *"serving a build with no stamp"* — indistinguishable, in the
 * output, from the real failure it exists to catch, and it recommended purging
 * a zone cache to fix a security setting that had nothing to do with caching.
 * [ADR-0027](../../docs/adr/0027-deploy-check-reports-refusal.md).
 *
 * ⚠️ **A refusal is not fixed by a request header, and that has been measured.**
 * Node's `fetch` was refused whatever user agent it sent, and so was a real
 * headless Chrome, while curl passed with any user agent but its own default —
 * so the decision is made on the client's fingerprint, not on anything a caller
 * controls. Looking browsery enough is not available; do not try it again.
 *
 * What this module deliberately does not own is **what to say about an answer**.
 * It returns a verdict; the deploy prints propagation advice, the sync writes a
 * row. One probe, two readers, and neither one's prose in the other's way.
 */

/** How the build a page carries is spelled, in both directions. */
const STAMP_META = /<meta name="stacks:build" content="([0-9a-f]+)">/;

/**
 * How long to give the edge before calling a different build stale.
 *
 * A deploy is not live the instant wrangler returns — Pages has to point the
 * custom domain at the new deployment, and that took about a minute the once it
 * was measured. Checking immediately and reporting failure would cry wolf on
 * every single deploy, which is the fastest way to make a check ignored.
 */
export const PROPAGATION_ATTEMPTS = 7;
export const PROPAGATION_WAIT_MS = 15_000;

/** The build a page says it is, or `undefined` if it does not say. */
export function stampOf(page: string): string | undefined {
  return STAMP_META.exec(page)?.[1];
}

/** The tag a build injects, so the reader and the writer cannot drift apart. */
export function stampMeta(name: string): string {
  return `<meta name="stacks:build" content="${name}">`;
}

export type EdgeAnswer =
  | { kind: 'current'; serving: string }
  | { kind: 'stale'; serving: string | undefined }
  | { kind: 'refused'; status: number }
  | { kind: 'unreachable' };

export interface ProbeOptions {
  attempts?: number;
  waitMs?: number;
  /** Called before each wait, so a two-minute check is not a silent one. */
  onRetry?: (message: string, attempt: number, attempts: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Which build the origin is actually serving.
 *
 * Asks the page, rather than inferring from bytes. Comparing whole HTML would
 * break the first time the zone enabled any edge transform, since those rewrite
 * markup and would then fail forever for a reason unconnected to deploying. A
 * meta tag's content survives all of them.
 *
 * ⚠️ **Every non-200 retries, a 403 included, and the refusal is reported only
 * after the last one.** The first version of this bailed at once on any 4xx, on
 * the reasoning that a rule will say the same thing five more times. Watched
 * through the owner allowing "definitely automated" traffic, identical requests
 * disagreed — 403 about one time in six for a few minutes, then never again.
 * Whether that was the setting propagating or mitigation being decided per
 * request was never established, and it does not need to be: a single refusal
 * is not evidence of a standing one.
 *
 * A request that cannot be made at all is the exception and returns at once.
 * Nothing answered, so there is nothing for a retry to catch up with.
 */
export async function probeBuild(
  origin: string,
  expected: string,
  options: ProbeOptions = {},
): Promise<EdgeAnswer> {
  const attempts = options.attempts ?? PROPAGATION_ATTEMPTS;
  const waitMs = options.waitMs ?? PROPAGATION_WAIT_MS;

  let serving: string | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      // `no-store` so this measures the origin and not whatever this machine
      // fetched a minute ago. It says nothing about a visitor's cache, and
      // cannot: that is what the `_headers` revalidation is for.
      response = await fetch(`${origin}/`, { cache: 'no-store' });
    } catch {
      return { kind: 'unreachable' };
    }

    // Read the status before reading the body: a challenge page parses like
    // any other page and carries no stamp.
    if (!response.ok) {
      if (attempt === attempts) return { kind: 'refused', status: response.status };

      options.onRetry?.(`origin answered HTTP ${String(response.status)}`, attempt, attempts);
      await sleep(waitMs);
      continue;
    }

    serving = stampOf(await response.text());
    if (serving === expected) return { kind: 'current', serving };

    if (attempt === attempts) return { kind: 'stale', serving };

    options.onRetry?.(
      `serving ${serving ?? 'an unstamped build'}, want ${expected}`,
      attempt,
      attempts,
    );
    await sleep(waitMs);
  }

  return { kind: 'stale', serving };
}

export interface StaleCover {
  cover: string;
  served: number;
  built: number;
}

/**
 * One stale cover as a line, because both readers print the same one.
 *
 * The **advice** around it differs — a deploy sends you to purge a zone, a sync
 * does not — and that is the caller's. The finding itself is not: two copies of
 * this line are two chances for one of them to start saying something the
 * comparison does not measure.
 */
export function describeStaleCover(one: StaleCover): string {
  return `${one.cover}: serving ${String(one.served)}B, built ${String(one.built)}B`;
}

export type CoverAnswer =
  | {
      kind: 'checked';
      checked: number;
      stale: StaleCover[];
      /**
       * Covers the origin answered without a `content-length`, which is not a
       * size and must not be read as one. See `probeCovers`.
       */
      uncomparable: string[];
    }
  | { kind: 'refused'; status: number }
  | { kind: 'unreachable' };

/**
 * Whether the origin's covers are this build's covers, by size.
 *
 * ⚠️ **Every cover, never a sample.** Most covers are byte-identical between
 * builds — only the ones that changed can reveal a stale cache — so a sample of
 * five is very likely to land entirely on files that would match either way and
 * report a clean site that is not. That is not hypothetical: the first version
 * of this check sampled five and passed while the site was serving a previous
 * build. A few dozen `HEAD` requests cost a second.
 *
 * Sizes are passed in rather than read here, so this module never touches the
 * filesystem — which is what lets a spec exercise it in-process.
 *
 * ⚠️ **An answer with no `content-length` is a third outcome, not a zero.**
 * Reading the absent header as `0` reports every such cover as *serving 0B,
 * built 619B* — a stale-cache verdict for a header the origin simply did not
 * send, which is the same wrong diagnosis a refusal used to produce. Measured
 * against the live origin: a `HEAD` for a path this build does not have answers
 * **200 with no `content-length`**, and six of six covers were reported stale
 * when none of them exists there at all. Dropping them silently would be the
 * other error — a cover that is genuinely missing would then pass — so they are
 * counted and named separately.
 */
export async function probeCovers(
  origin: string,
  built: ReadonlyMap<string, number>,
): Promise<CoverAnswer> {
  let unreachable = false;
  let refused: number | undefined;

  const checks = await Promise.all(
    [...built].map(async ([cover, size]) => {
      try {
        const response = await fetch(`${origin}/${cover}`, { method: 'HEAD' });
        // Same trap as the build probe: a challenge page has a content-length
        // like anything else, and comparing it against the cover's size reports
        // a byte mismatch — which reads as a stale cache and sends you to purge
        // a zone that was never the problem.
        if (!response.ok) {
          refused = response.status;
          return undefined;
        }
        const length = response.headers.get('content-length');
        if (length === null) return cover;

        const served = Number(length);
        return served === size ? undefined : { cover, served, built: size };
      } catch {
        unreachable = true;
        return undefined;
      }
    }),
  );

  if (unreachable) return { kind: 'unreachable' };
  if (refused !== undefined) return { kind: 'refused', status: refused };

  return {
    kind: 'checked',
    checked: built.size,
    stale: checks.filter((entry): entry is StaleCover => typeof entry === 'object'),
    uncomparable: checks.filter((entry): entry is string => typeof entry === 'string'),
  };
}
