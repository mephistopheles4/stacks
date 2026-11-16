/**
 * What `pnpm preview:fixture` decides (room spec S13.4, C14).
 *
 * The command uploads the fixture site, and only that, to a Cloudflare Pages **preview branch** so
 * that three things can be read where the local server cannot show them: the `_headers` block on
 * the worker's path, the confinement probe, and the real transfer size of the room. A preview is
 * a public address, so the branch is a constant here and never an argument, and the command
 * refuses `main` and the project's production branch. `scripts/preview-fixture.ts` does the work;
 * the decisions are here with no process and no network.
 */

/** The one branch a fixture preview goes to. Never an argument. */
export const PREVIEW_BRANCH = 'preview-fixture';

/** The project's production branch: `deploy:site` uploads to it with `--branch main`. */
export const PRODUCTION_BRANCH = 'main';

/**
 * Why a branch may not take a fixture preview, or `undefined` when it may. Compared as git and
 * Pages would see it: case-blind, and with a `refs/heads/` prefix or surrounding space ignored,
 * so a spelling cannot slip past.
 */
export function branchRefusal(
  branch: string,
  production: string = PRODUCTION_BRANCH,
): string | undefined {
  const bare = branch
    .trim()
    .replace(/^refs\/heads\//i, '')
    .toLowerCase();
  if (bare === '') return 'the preview branch is empty';
  if (bare === 'main' || bare === 'master' || bare === production.trim().toLowerCase()) {
    return `the preview branch is ${JSON.stringify(bare)}, which is the production branch`;
  }
  return undefined;
}

export interface PreviewArgs {
  /** Serve the confinement probe at the worker's path in place of the worker. */
  readonly probe: boolean;
  /** With `probe`: loosen the worker's policy, so the probe must come back red. */
  readonly control: boolean;
  /** Build and judge, and print the command, without uploading. */
  readonly dryRun: boolean;
  /** Delete the preview deployments of the preview branch, after they have been read. */
  readonly remove: boolean;
}

export function parsePreviewArgs(argv: readonly string[]): PreviewArgs | string {
  const on = new Set(argv);
  const known = new Set(['--probe', '--control', '--dry-run', '--delete']);
  for (const arg of argv) {
    if (!known.has(arg)) return `unknown argument ${JSON.stringify(arg.slice(0, 40))}`;
  }
  if (on.size !== argv.length) return 'an argument is given twice';
  if (on.has('--control') && !on.has('--probe')) return '--control needs --probe';
  if (on.has('--delete') && argv.length > 1) return '--delete takes no other argument';
  return {
    probe: on.has('--probe'),
    control: on.has('--control'),
    dryRun: on.has('--dry-run'),
    remove: on.has('--delete'),
  };
}

/** A Pages project name: what `CF_PAGES_PROJECT` may be, or the command stops. */
export function projectRefusal(project: string): string | undefined {
  return /^[a-z0-9][a-z0-9-]{0,57}$/.test(project)
    ? undefined
    : 'CF_PAGES_PROJECT is not a Pages project name';
}

/**
 * The deployments `wrangler pages deployment list --environment preview --json` printed that
 * belong to the preview branch, as ids. **Fails closed**: an answer that is not a list, an entry
 * with no string id, or a branch that is not read as a string leaves that entry out, so a shape
 * nobody expected deletes nothing.
 */
export function previewDeploymentIds(listJson: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(listJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const entry of parsed as unknown[]) {
    const record = entry as {
      id?: unknown;
      environment?: unknown;
      deployment_trigger?: { metadata?: { branch?: unknown } };
    } | null;
    const branch = record?.deployment_trigger?.metadata?.branch;
    if (
      typeof record?.id === 'string' &&
      /^[0-9a-f-]{8,64}$/i.test(record.id) &&
      record.environment === 'preview' &&
      branch === PREVIEW_BRANCH
    ) {
      ids.push(record.id);
    }
  }
  return ids;
}
