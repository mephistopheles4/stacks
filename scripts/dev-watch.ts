/**
 * The live-editing loop: watch the vault, serve the shelf.
 *
 * Runs two long-lived processes side by side — `stacks build --public --watch`
 * regenerating `library.json` whenever a note changes, and Astro's dev server
 * serving the result. Edit a note in Obsidian and the shelf follows a second
 * later; the page reloads itself because `boot.ts` polls `library.json` in dev.
 *
 * Spawned by hand rather than with a runner dependency: two children, piped
 * output and a shared shutdown is not worth another package.
 *
 *     pnpm dev:watch
 *
 * The vault comes from STACKS_VAULT, in the environment or in `.env`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env['PORT'] ?? 4322);

function vaultPath(): string {
  if (process.env['STACKS_VAULT'] !== undefined) return process.env['STACKS_VAULT'];

  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const match = /^STACKS_VAULT\s*=\s*(.+)$/m.exec(env);
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (value !== undefined && value.length > 0) return value;
  } catch {
    // fall through to the error below
  }

  console.error(
    'No vault configured.\n\n' +
      '  Create a .env file at the repo root containing:\n' +
      '    STACKS_VAULT=C:\\path\\to\\your\\vault\n\n' +
      '  or set STACKS_VAULT in your environment.',
  );
  process.exit(1);
}

const vault = vaultPath();
console.log(`vault  ${vault}`);
console.log(`site   http://localhost:${PORT}\n`);

const children: ChildProcess[] = [];

function start(label: string, command: string, args: readonly string[]): void {
  const child = spawn(command, [...args], { cwd: ROOT, shell: true, stdio: 'pipe' });

  const relay = (chunk: Buffer): void => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim().length > 0) console.log(`[${label}] ${line}`);
    }
  };
  child.stdout?.on('data', relay);
  child.stderr?.on('data', relay);

  // One dying process makes the pair useless, so take the other down with it
  // rather than leaving half a dev loop running and looking healthy.
  child.on('exit', (code) => {
    console.log(`[${label}] exited (${String(code)})`);
    shutdown();
  });

  children.push(child);
}

let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start('vault', 'pnpm', [
  'stacks',
  'build',
  '--public',
  '--watch',
  '--vault',
  `"${vault}"`,
  '--assets',
  'packages/site/public',
]);

start('site', 'pnpm', ['--filter', '@stacks/site', 'run', 'dev', '--port', String(PORT)]);
