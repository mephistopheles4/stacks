/**
 * What the deploy checks about its upload before it starts one.
 *
 * `scripts/deploy.ts` runs at import and cannot be driven by a test, so the
 * decisions the upload owes the lockfile live here, where they can. Nothing in
 * this file reads a file or spawns a process; `deploy.ts` reads the two
 * manifests and hands their text over.
 *
 * See [ADR-0116](../../docs/adr/0116-wrangler-is-a-pinned-dev-dependency.md) and
 * `docs/spec/release-age-side-doors.md`.
 */

/**
 * Why the installed wrangler is not the pinned one, or `undefined` when it is.
 *
 * ⚠️ **`pnpm exec` puts `node_modules/.bin` first on the PATH, and
 * `verifyDepsBeforeRun: warn` does not stop a stale install.** Without this
 * refusal a checkout whose `node_modules` predates a bump would upload with the
 * old wrangler, or with some other one the PATH happens to offer — and the
 * lockfile's age and trust checks would have covered neither. No flag clears it.
 */
export function pinMismatch(
  installed: string | undefined,
  pinned: string | undefined,
): string | undefined {
  if (pinned === undefined) return 'package.json does not pin wrangler as a devDependency';
  if (installed === undefined) {
    return `wrangler ${pinned} is pinned but node_modules holds none; run \`pnpm install\``;
  }
  if (installed === pinned) return undefined;
  return `node_modules holds wrangler ${installed} but package.json pins ${pinned}; run \`pnpm install\``;
}

/** Where the installed wrangler's manifest sits under the repository root. */
export const INSTALLED_MANIFEST: readonly string[] = ['node_modules', 'wrangler', 'package.json'];

/** The `version` of a `package.json`'s text, or `undefined` if it has none. */
export function versionIn(manifest: string | undefined): string | undefined {
  if (manifest === undefined) return undefined;
  try {
    const parsed = JSON.parse(manifest) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/** What a root `package.json`'s text pins wrangler to, or `undefined` if nothing. */
export function pinIn(manifest: string | undefined): string | undefined {
  if (manifest === undefined) return undefined;
  try {
    const parsed = JSON.parse(manifest) as { devDependencies?: Record<string, unknown> };
    const pin = parsed.devDependencies?.['wrangler'];
    return typeof pin === 'string' ? pin : undefined;
  } catch {
    return undefined;
  }
}

/** The names wrangler itself reads, which the upload keeps even from `.env`. */
const WRANGLER_NAMES = /^(?:CLOUDFLARE_|WRANGLER_)/i;

/**
 * The whole environment the upload's child process gets.
 *
 * `loadEnv` copies `.env` into `process.env`, and the deploy used to hand all of
 * it to every child, so the upload received the Google Books key and the vault
 * path. The upload needs neither. ⚠️ **This covers the inherited environment
 * only**: wrangler loads the repository root's `.env` and `.env.local` itself at
 * start-up, so those keys reach it anyway (accepted by the owner, #459). It drops every key `loadEnv` set — the names
 * it returned — except `CLOUDFLARE_*` and `WRANGLER_*`, so a credential kept in
 * `.env` still reaches wrangler. The shell's own variables all stay, user-profile
 * ones included, because wrangler finds its login store through them.
 *
 * `WRANGLER_SEND_METRICS=false` goes in last, so neither the shell nor `.env`
 * can turn wrangler's usage telemetry back on for the upload.
 */
export function uploadEnv(shell: NodeJS.ProcessEnv, loaded: readonly string[]): NodeJS.ProcessEnv {
  const dropped = new Set(loaded.filter((name) => !WRANGLER_NAMES.test(name)));
  // Case-insensitive, since Windows environment names are: a `Wrangler_Send_Metrics`
  // left beside the override could be the one the child reads.
  const kept = Object.entries(shell).filter(
    ([name]) => !dropped.has(name) && name.toUpperCase() !== 'WRANGLER_SEND_METRICS',
  );
  return { ...Object.fromEntries(kept), WRANGLER_SEND_METRICS: 'false' };
}
