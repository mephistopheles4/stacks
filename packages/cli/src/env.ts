import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Where `.env` lives for the checkout you are standing in.
 *
 * Normally it is the one beside you. A git worktree is the exception: it is a
 * real checkout with its own working directory, and `.env` is gitignored — so a
 * fresh worktree arrives with no vault path, no API key and no SITE_URL, and
 * every command that needs one fails on a branch where nothing is wrong. The
 * fallback is the main checkout's `.env`, found through `--git-common-dir`, the
 * one `.git` that every linked worktree shares.
 *
 * **Read, never copied.** A copy drifts silently: repoint the vault in the main
 * checkout and the worktree keeps building against a path that no longer
 * exists, with nothing going red. `STACKS_DEV_HOST=1` is worse — turned on for
 * an afternoon and forgotten in three stale copies, it keeps the shelf on the
 * network long after anyone remembers enabling it, and that is the one setting
 * here with a consequence outside this machine. One file, one answer, wherever
 * you happen to be standing.
 *
 * A real environment variable still beats both; see `loadEnv`.
 */
export function envFilePath(file = ".env"): string | undefined {
  const beside = resolve(file);
  if (existsSync(beside)) return beside;

  const main = mainCheckout();
  if (main === undefined) return undefined;

  const shared = resolve(main, file);
  return existsSync(shared) ? shared : undefined;
}

/**
 * The main checkout's working directory, or undefined outside a git repository.
 *
 * `--git-common-dir` answers *relative to the cwd* in the main checkout and its
 * subdirectories (`.git` from the root, `../../.git` from `packages/site`) and
 * absolutely from a linked worktree, so it has to be resolved before taking its
 * parent means anything. Both were checked rather than assumed.
 *
 * Exported because `scripts/worktree.ts` needs the same answer to decide where
 * a new worktree goes, and two functions computing "where is the main checkout"
 * is exactly the kind of duplicate that ends up true in one place and false in
 * the other. It lives here because this file is already where the project
 * works out which local configuration applies to it.
 *
 * From `envFilePath` it is only reached when there is no `.env` beside you, so
 * the main checkout — where there nearly always is one — never pays for the
 * subprocess.
 */
export function mainCheckout(): string | undefined {
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    // resolve() does two jobs: makes the relative answer absolute, and
    // normalises git's forward slashes, which on Windows are otherwise a
    // different string from every path node:path produces.
    return dirname(resolve(common.trim()));
  } catch {
    return undefined; // No git, or not a checkout. Neither is a problem here.
  }
}

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
export function loadEnv(file = ".env"): void {
  const path = envFilePath(file);
  if (path === undefined) return; // No .env is the normal case, not a problem.

  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return; // Unreadable is the same as absent: a default that did not apply.
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
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
