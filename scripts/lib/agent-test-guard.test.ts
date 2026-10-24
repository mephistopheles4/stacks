/**
 * `scripts/lib/agent-test-guard.ts`'s decision, in process (#513).
 *
 * The seam is `decide()`: the hook's input in, a refusal or `null` out, with
 * the athanor probe passed in. Every case here names a claim of the spec on
 * #513, C1 to C6, C11 and C12; the probe itself and the script as Claude Code spawns it are
 * in `scripts/agent-test-guard-hook.test.ts`, which Stryker's dry run leaves out
 * because it writes files and spawns processes.
 */

import { describe, expect, it } from 'vitest';
import { decide, FULL_MUTATION_REFUSAL, REFUSAL } from './agent-test-guard.ts';

type Shell = 'Bash' | 'PowerShell';

const present = (): Promise<boolean> => Promise.resolve(true);
const missing = (): Promise<boolean> => Promise.resolve(false);

const ask = (
  command: string,
  {
    tool = 'Bash',
    athanorPresent = present,
  }: { tool?: Shell; athanorPresent?: () => Promise<boolean> } = {},
) => decide({ tool_name: tool, tool_input: { command } }, { athanorPresent });

// C1: every form of a guarded host run. A miss lets the host run through.
const GUARDED = [
  'pnpm test',
  'pnpm run test',
  'pnpm typecheck',
  'pnpm run typecheck',
  'pnpm lint',
  'pnpm run lint',
  'pnpm build',
  'pnpm run build',
  'pnpm test -- gates/commands.test.ts',
  'pnpm test gates/commands.test.ts',
  'pnpm -w test',
  'pnpm.cmd test',
  'cd packages/site && pnpm build',
  'git status; pnpm build',
  'git status\npnpm lint',
  'pnpm test 2>&1 | tail -5',
  'pnpm vitest',
  'pnpm vitest run gates/commands.test.ts',
  'pnpm exec vitest run',
  'npx vitest run',
  'npx -y vitest run',
  'vitest',
  'vitest run',
  'vitest gates/commands.test.ts',
  'node_modules/.bin/vitest run',
  'pnpm tsc --noEmit',
  'pnpm exec tsc --noEmit -p tsconfig.json',
  'npx tsc --noEmit',
  'tsc --noEmit',
  'FOO=1 pnpm test',
  'env CI=true pnpm test',
  'timeout 600 pnpm test',
  '& pnpm test',
  '$out = pnpm test',
  '(pnpm test)',
  'if ($true) { pnpm test }',
  'pnpm test # a comment that names no fallback',
  'git status | pnpm test',
  'git status & pnpm test',
  'false || pnpm test',
  'time pnpm test',
  'pnpm t',
  'pnpm tst',
  'pnpm --reporter append-only test',
  'pnpm --reporter=append-only test',
  'node node_modules/vitest/vitest.mjs run',
  'node_modules\\.bin\\vitest.cmd run',
  'cat <<EOF\nx\nEOF\npnpm test',
];

// C4: never refused, and the probe never runs for them.
const PASSES = [
  'athanor run',
  'athanor run typecheck',
  'athanor run -- pnpm vitest run gates/commands.test.ts',
  'pnpm smoke:render',
  'pnpm run smoke:render',
  'node scripts/phone-check.ts',
  'pnpm exec tsx scripts/phone-check.ts',
  'pnpm gate:public',
  'pnpm deploy:site --dry-run',
  'pnpm lint:md',
  'pnpm lint:md:fix',
  'pnpm format',
  'pnpm format:check',
  'pnpm install',
  'pnpm dev',
  'pnpm worktree feat/1-x',
  'pnpm stacks build',
  'pnpm stacks build --public',
  'pnpm lint --fix',
  'pnpm run lint --fix',
  'pnpm exec eslint --fix scripts/x.ts',
  'pnpm test -u',
  'pnpm test --update',
  'pnpm vitest -u',
  'vitest watch',
  'vitest dev',
  'pnpm vitest --watch',
  'vitest -w',
  'pnpm --filter @stacks/site run build',
  'pnpm -F @stacks/site build',
  'pnpm -C packages/site build',
  'pnpm --dir packages/site build',
  'tsc',
  'tsc --noEmit --watch',
  'pnpm testing',
  'pnpm test:e2e',
  'git commit -m "pnpm test"',
  "git commit -m 'pnpm build'",
  'git commit -m "say \\"hi\\" then pnpm test"',
  "git commit -F - <<'EOF'\npnpm test\nEOF",
  "gh issue comment 1 --body @'\npnpm test\n'@",
  'echo pnpm test',
  '# pnpm test',
  'ls -la',
  '',
  'git commit -m "wip; pnpm test"',
  "git commit -m 'a && pnpm build'",
  'echo "x | pnpm test"',
  'cat <<EOF\nx\npnpm test\nEOF',
  'cat <<-EOF\n\tpnpm test\n\tEOF',
  '@"\nx; pnpm test\n"@',
  '<# pnpm test #> git status',
  'pnpm --filter=@stacks/site build',
  'pnpm -r test',
  'pnpm --recursive test',
  'pnpm vitest --update',
  'tsc --noEmit -w',
  'pnpm test --watch',
  'vitest list',
  'pnpm run t',
];

// C11: a full mutation run, refused to an agent on the host whatever athanor's
// state, with no fallback.
const FULL_MUTATION = [
  'pnpm mutation:run',
  'pnpm run mutation:run',
  'pnpm mutation:run --force',
  'pnpm exec stryker run',
  'pnpm stryker run',
  'npx stryker run',
  'stryker run',
  'node_modules/.bin/stryker run',
  'pnpm mutation:run # --host-fallback=athanor exited 125',
  'npx @stryker-mutator/core run',
  'pnpm dlx @stryker-mutator/core run',
  'node node_modules/@stryker-mutator/core/bin/stryker.js run',
];

// C12: a scoped mutation run, guarded like any other host run.
const SCOPED_MUTATION = [
  'pnpm mutation:run --mutate scripts/lib/settle.ts',
  'pnpm exec stryker run -m scripts/lib/settle.ts',
  'npx stryker run --mutate=scripts/lib/settle.ts',
  'pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/incremental.json',
];

describe('C1: a guarded host run is refused while athanor works', () => {
  for (const tool of ['Bash', 'PowerShell'] as const) {
    for (const command of GUARDED) {
      it(`${tool}: ${JSON.stringify(command)}`, async () => {
        expect(await ask(command, { tool })).toEqual({ reason: REFUSAL });
      });
    }
  }

  it('joins a line continuation in the shell that has one', async () => {
    expect(await ask('pnpm \\\ntest')).toEqual({ reason: REFUSAL });
    expect(await ask('pnpm `\ntest', { tool: 'PowerShell' })).toEqual({ reason: REFUSAL });
  });

  it('closes a PowerShell double quote at a trailing backslash', async () => {
    expect(await ask('Set-Location "C:\\x\\"; pnpm test', { tool: 'PowerShell' })).toEqual({
      reason: REFUSAL,
    });
  });
});

describe('C2: every guarded run is silent while athanor is missing', () => {
  it('passes each form', async () => {
    for (const command of GUARDED) {
      expect(await ask(command, { athanorPresent: missing }), command).toBeNull();
    }
  });
});

describe('C3: the fallback comment', () => {
  it('lets a guarded run through when it names a reason', async () => {
    expect(await ask('pnpm test # --host-fallback=athanor exited 125')).toBeNull();
    expect(await ask('pnpm test # --host-fallback="exit 137"', { tool: 'PowerShell' })).toBeNull();
  });

  it('covers every guarded run on its own line', async () => {
    expect(await ask('pnpm test && pnpm build # --host-fallback=docker is down')).toBeNull();
  });

  it('refuses an empty or all-space reason', async () => {
    for (const command of [
      'pnpm test # --host-fallback=',
      'pnpm test # --host-fallback="  "',
      'pnpm test # --host-fallback=   ',
      'pnpm test # --host-fallback=""',
      "pnpm test # --host-fallback=' '",
    ]) {
      expect(await ask(command), command).toEqual({ reason: REFUSAL });
    }
  });

  it('does not reach a run on another line', async () => {
    expect(await ask('echo x # --host-fallback=y\npnpm test')).toEqual({ reason: REFUSAL });
  });

  it('counts only inside a comment', async () => {
    expect(await ask('pnpm test --host-fallback=x')).toEqual({ reason: REFUSAL });
    expect(await ask('echo "# --host-fallback=x"; pnpm test')).toEqual({ reason: REFUSAL });
  });
});

describe('C4: what stays on the host', () => {
  it('passes each form without probing', async () => {
    let probes = 0;
    const athanorPresent = (): Promise<boolean> => {
      probes++;
      return Promise.resolve(true);
    };
    for (const tool of ['Bash', 'PowerShell'] as const) {
      for (const command of PASSES) {
        expect(await ask(command, { tool, athanorPresent }), command).toBeNull();
      }
    }
    expect(probes).toBe(0);
    await ask('pnpm test', { athanorPresent });
    expect(probes).toBe(1);
  });
});

describe('C5: anything that is not a shell command is silence', () => {
  it('passes other tools and malformed input', async () => {
    const opts = { athanorPresent: present };
    expect(
      await decide({ tool_name: 'Read', tool_input: { command: 'pnpm test' } }, opts),
    ).toBeNull();
    expect(await decide({ tool_name: 'Bash', tool_input: {} }, opts)).toBeNull();
    expect(await decide({ tool_name: 'Bash', tool_input: { command: 7 } }, opts)).toBeNull();
    expect(await decide({ tool_name: 'Bash' }, opts)).toBeNull();
    expect(await decide(null, opts)).toBeNull();
    expect(await decide('pnpm test', opts)).toBeNull();
  });

  it('passes when the probe throws, and tokenises an unclosed quote to its end', async () => {
    const athanorPresent = (): Promise<boolean> => Promise.reject(new Error('boom'));
    expect(await ask('pnpm test', { athanorPresent })).toBeNull();
    expect(await ask('pnpm test "unclosed')).toEqual({ reason: REFUSAL });
  });
});

describe('C6: the refusal is fixed text', () => {
  it('names the athanor runs, untracked files and the fallback', () => {
    for (const part of [
      'athanor run typecheck',
      'athanor run -- pnpm vitest run <file>',
      'mutation',
      'git add',
      '--untracked',
      '# --host-fallback=<reason>',
      '124',
      '125',
      '137',
      'own words',
      'smoke:render',
    ]) {
      expect(REFUSAL).toContain(part);
    }
  });
});

describe('C11: a full mutation run is refused on the host, always', () => {
  for (const tool of ['Bash', 'PowerShell'] as const) {
    for (const command of FULL_MUTATION) {
      it(`${tool}: ${JSON.stringify(command)}`, async () => {
        let probes = 0;
        const athanorPresent = (): Promise<boolean> => {
          probes++;
          return Promise.resolve(false);
        };
        expect(await ask(command, { tool, athanorPresent })).toEqual({
          reason: FULL_MUTATION_REFUSAL,
        });
        expect(probes).toBe(0);
      });
    }
  }

  it('names the scoped recipe, the nightly artifact and the owner', () => {
    for (const part of [
      'no fallback',
      '--mutate',
      'artifacts/stryker/scoped/',
      'metrics.yml',
      'mutation-report-',
      'owner',
    ]) {
      expect(FULL_MUTATION_REFUSAL).toContain(part);
    }
  });
});

describe('C12: a scoped mutation run is guarded like any other', () => {
  it('is refused while athanor works, silent while it is missing, and takes the fallback', async () => {
    for (const command of SCOPED_MUTATION) {
      expect(await ask(command), command).toEqual({ reason: REFUSAL });
      expect(await ask(command, { athanorPresent: missing }), command).toBeNull();
      expect(await ask(`${command} # --host-fallback=athanor exited 125`), command).toBeNull();
    }
  });

  it('passes the recipe and the readers of a report', async () => {
    for (const command of [
      "athanor run -- sh -c 'pnpm exec stryker run --concurrency 4 --mutate scripts/lib/settle.ts >&2 && cat artifacts/stryker/current/mutation.json' > artifacts/stryker/scoped/mutation.json",
      'pnpm mutation:score artifacts/stryker/scoped/mutation.json',
      'pnpm mutation:stamp --check',
      'pnpm exec stryker --version',
    ]) {
      expect(await ask(command), command).toBeNull();
    }
  });
});
