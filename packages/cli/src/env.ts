import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Fills missing environment variables from a `.env` file.
 *
 * Hand-rolled rather than pulling in dotenv: this reads `KEY=VALUE`, ignores
 * comments and blanks, strips one layer of quotes, and that is the whole
 * requirement. CLAUDE.md asks for zero-dep solutions to small utilities.
 *
 * A real environment variable always wins — the file is a default, not an
 * override, so `STACKS_VAULT=... pnpm stacks build` still does what it says.
 */
export function loadEnv(file = '.env'): void {
  let contents: string;
  try {
    contents = readFileSync(resolve(file), 'utf8');
  } catch {
    return; // No .env is the normal case, not a problem.
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
