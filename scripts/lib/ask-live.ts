import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './repo-root.ts';
import { liveAiValue, type LiveAi } from './ask-deploy.ts';

/** The Worker's name in `packages/ask/wrangler.jsonc`. */
export const ASK_WORKER = 'stacks-ask';

interface Captured {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the repository's wrangler through `pnpm exec` and keeps its output. */
function capture(args: readonly string[], env: NodeJS.ProcessEnv): Captured {
  const result = spawnSync(['pnpm', ...args].join(' '), {
    cwd: REPO_ROOT,
    shell: true,
    encoding: 'utf8',
    env,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** wrangler's own error code for a Worker that does not exist yet, and nothing looser. */
const NO_SUCH_WORKER = /\b10007\b/;

/**
 * What `ASK_AI_ENABLED` is on the live Worker, read from its latest version
 * (S5). `none` before the first deploy, `unreadable` for anything it cannot tell,
 * which a plain deploy refuses on. Run only after the pinned wrangler is checked.
 */
export function readLiveAi(env: NodeJS.ProcessEnv): LiveAi {
  const listed = capture(
    ['exec', 'wrangler', 'deployments', 'list', '--name', ASK_WORKER, '--json'],
    env,
  );
  if (listed.status !== 0) {
    return NO_SUCH_WORKER.test(listed.stdout + listed.stderr) ? 'none' : 'unreadable';
  }
  const versionId = latestVersionId(listed.stdout);
  // Only a list that parsed and held no deployment means "never deployed".
  if (versionId === 'none') return 'none';
  if (versionId === undefined) return 'unreadable';
  const viewed = capture(
    ['exec', 'wrangler', 'versions', 'view', versionId, '--name', ASK_WORKER, '--json'],
    env,
  );
  if (viewed.status !== 0) return 'unreadable';
  try {
    return liveAiValue(JSON.parse(viewed.stdout));
  } catch {
    return 'unreadable';
  }
}

/**
 * The version id carrying the most traffic in the newest deployment of a
 * `deployments list --json` answer; `none` for a parsed list with no deployment;
 * undefined for anything it cannot read, which the caller treats as unreadable.
 */
export function latestVersionId(stdout: string): string | undefined {
  let deployments: unknown;
  try {
    deployments = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(deployments)) return undefined;
  if (deployments.length === 0) return 'none';
  const list = deployments as {
    versions?: { version_id?: unknown; percentage?: unknown }[];
    created_on?: unknown;
  }[];
  const newest = [...list]
    .sort((a, b) => String(a.created_on).localeCompare(String(b.created_on)))
    .at(-1);
  const versions = newest?.versions;
  if (!Array.isArray(versions) || versions.length === 0) return undefined;
  const top = [...versions].sort(
    (a, b) => Number(b.percentage ?? 0) - Number(a.percentage ?? 0),
  )[0];
  return typeof top?.version_id === 'string' ? top.version_id : undefined;
}
