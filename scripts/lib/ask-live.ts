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

/** wrangler's own error code for a Worker that does not exist yet. */
const NO_SUCH_WORKER = /\b10007\b|does not exist|not found/i;

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
  if (versionId === undefined) return 'none';
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

/** The version id of the newest deployment in a `deployments list --json` answer. */
export function latestVersionId(stdout: string): string | undefined {
  try {
    const deployments = JSON.parse(stdout) as {
      versions?: { version_id?: unknown }[];
      created_on?: unknown;
    }[];
    if (!Array.isArray(deployments)) return undefined;
    const last = [...deployments]
      .sort((a, b) => String(a.created_on).localeCompare(String(b.created_on)))
      .at(-1);
    const id = last?.versions?.[0]?.version_id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
