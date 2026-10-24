/**
 * The hook behind `.claude/settings.json` (#513): standard input in, a refusal
 * or nothing out. What it refuses, and why everything else is silence, is in
 * `scripts/lib/agent-test-guard.ts`.
 *
 * ⚠️ **No `node:fs` and no `import.meta`.** It reads standard input as a
 * stream, so G1 (`adapter-boundary`) has no file access to allow, and it is an
 * entry point and nothing else, so G24 (`repo-root`) has no derivation to find.
 * Every import must be a `node:` built-in or a file under `scripts/lib/` that
 * imports only those, or the hook prints an error in a fresh worktree.
 */

import { decide, probeAthanor } from './lib/agent-test-guard.ts';

try {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const refusal = await decide(JSON.parse(raw), { athanorPresent: () => probeAthanor() });
  if (refusal) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: refusal.reason,
        },
      }),
    );
  }
} catch {
  // Silence, whatever went wrong.
}
process.exitCode = 0;
