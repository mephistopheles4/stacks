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
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env['PORT'] ?? 4322);

/**
 * Whether the dev server listens on the network as well as on this machine.
 *
 * Opt-in, and off by default, because it is the one setting here with a
 * consequence outside this computer: bound to the network, anything on the same
 * Wi-Fi can open the shelf and read what you have been reading. That is a
 * reasonable thing to want for a few minutes — it is the only way to see the
 * shelf on a phone without deploying it, and this project has already had two
 * bugs that only appeared on a phone — and an unreasonable default.
 *
 * The build is the same `--public` one the site ships, so `private:` and
 * wishlist books stay off it either way.
 */
const ON_NETWORK = /^(1|true|yes)$/i.test(
  process.env['STACKS_DEV_HOST'] ?? fromEnvFile('STACKS_DEV_HOST') ?? '',
);

/** Every address a phone on the same network could reach this machine at. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

/**
 * One uncommented `KEY=value` from `.env`, or undefined.
 *
 * Not a `.env` loader — the file is read for the two settings this script
 * needs and nothing else. It matters that both are read the same way: a
 * variable documented in `.env.example` that only works when exported from the
 * shell is a setting that appears to exist and does not.
 */
function fromEnvFile(key: string): string | undefined {
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const match = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(.+)$`, 'm').exec(env);
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    return value !== undefined && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function vaultPath(): string {
  const configured = process.env['STACKS_VAULT'] ?? fromEnvFile('STACKS_VAULT');
  if (configured !== undefined) return configured;

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
console.log(`site   http://localhost:${PORT}`);
if (ON_NETWORK) {
  for (const address of lanAddresses()) console.log(`phone  http://${address}:${PORT}`);
}
console.log('');

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

start('site', 'pnpm', [
  '--filter',
  '@stacks/site',
  'run',
  'dev',
  '--port',
  String(PORT),
  ...(ON_NETWORK ? ['--host'] : []),
]);
