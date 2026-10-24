/**
 * The decision behind the agent guard (#513). Claude Code runs
 * `scripts/agent-test-guard.ts` before every Bash and PowerShell call, with the
 * call as JSON on standard input, and that file hands it to `decide()` here.
 *
 * `AGENTS.md` makes `athanor run` the default way to run the suite, and the
 * host the fallback for a run that produced no result. Two sessions skipped
 * that order in one day and nothing showed it, so this refuses the host runs
 * that have an `athanor run` equivalent while athanor is on the machine, and
 * says how to name the fallback: the comment `# --host-fallback=<reason>` on
 * the command's own line. A comment, not grimoire's flag, because `tsc`,
 * `eslint` and `vitest` all reject an option they do not know, so a flag would
 * fail the very run it permits. **A full mutation run is refused whatever
 * athanor's state, and inside `athanor run --` too, with no fallback**
 * (`FULL_MUTATION_REFUSAL`): agents run only scoped ones.
 *
 * It reads the command as data, never runs it, and never changes it. It starts
 * only the athanor probe — through `cmd.exe` on Windows, and `taskkill` when
 * the probe hangs — and only for a guarded command. It writes nothing and sends
 * nothing.
 *
 * Everything that is not a refusal is silence: exit 0, nothing on either
 * stream. A hook that answers with an explicit allow skips the owner's
 * permission prompt for the call, and silence leaves their rules in force. A
 * bug in this file fails the same way, because a guard that failed closed
 * would block all work in the repository. It is a nudge that shows a skip, not
 * a control against running a branch's code on the host — `docs/gates.md`,
 * "Not gated, deliberately".
 *
 * ⚠️ **`node:` built-ins and erasable syntax only.** Node 24 strips the types
 * and runs this file directly, so it works in a fresh worktree before
 * `pnpm install` — and a `tsx` or a dependency here would make the hook print
 * an error in exactly that worktree.
 *
 * Ported from grimoire's `scripts/agent-check-guard.mjs` (its issue 377): the
 * tokeniser and the probe are that file's, the command table is this repo's.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { delimiter, join, posix } from 'node:path';

/**
 * The refusal. Fixed text: nothing from the command is echoed into it, so a
 * token in the command cannot come back out through it.
 */
export const REFUSAL = [
  'Run this through athanor, not on the host: `athanor run` for `pnpm test`, and `athanor run typecheck`, `athanor run lint` or `athanor run build` for the others; one test file is `athanor run -- pnpm vitest run <file>`.',
  'A run tests tracked files only, so `git add` a new file first, or pass `--untracked` to `athanor run`, before any `--`.',
  'The host run is the fallback only when athanor produced no result (exit 124, 125 or 137): then rerun the same command with the comment `# --host-fallback=<reason>` at the end of its line, name the reason and the exit code in your own words (no path, token or pasted error text), and say in your report that you used the fallback.',
  'A scoped mutation run (Stryker with `--mutate`) goes through athanor too: docs/commands.md, "A scoped run through athanor".',
  '`pnpm smoke:render`, the phone check and the forms that write to the tree or keep running (`--fix`, `-u`, watch mode) stay on the host. docs/commands.md, "The agent guard", has the rest.',
].join(' ');

/**
 * The refusal of a full mutation run, which has no fallback: 13–18 minutes of
 * every core on the owner's machine is the cost the rule exists to stop, and a
 * broken athanor does not make it cheaper. Fixed text, as the other.
 */
export const FULL_MUTATION_REFUSAL = [
  'A full mutation run is not for an agent — on the host, whether or not athanor works, or inside `athanor run` — and no fallback covers it.',
  'Run a scoped one through athanor instead — Stryker with `--mutate <files>`, its report written to `artifacts/stryker/scoped/` and never to `current/` — by the recipe in docs/commands.md, "A scoped run through athanor".',
  'A full report comes from the nightly: find the latest run of `metrics.yml` with `gh run list --workflow metrics.yml` and download its `mutation-report-<run id>` artifact, or ask the owner to run one.',
].join(' ');

interface Segment {
  readonly tokens: readonly string[];
  /** The line the segment ends on, which is the line a comment on it shares. */
  readonly line: number;
}

interface Parsed {
  readonly segments: readonly Segment[];
  /** Comment text by line. */
  readonly comments: ReadonlyMap<number, string>;
}

/**
 * The command as segments of tokens, and its comments by line. Quotes are read
 * first, so text inside them is one token of data; the body of a heredoc or a
 * PowerShell here-string is skipped as data; a `#` that starts a token opens a
 * comment that runs to the end of its line (PowerShell's `<# … #>` is skipped
 * as data); and only then do `;`, `|`, `&&`, `||`, a lone `&`, a parenthesis,
 * a brace and a line break end a segment. A backslash is a path character,
 * not an escape, except before a double quote inside double quotes in Bash;
 * PowerShell escapes with a backtick, so a path ending in a backslash inside
 * double quotes closes there. A line continuation joins its two lines. An
 * unclosed quote runs to the end of the command.
 */
function parse(raw: string, bash: boolean): Parsed {
  const command = raw.replace(bash ? /\\\r?\n/g : /`\r?\n/g, ' ');
  const segments: Segment[] = [];
  const comments = new Map<number, string>();
  let tokens: string[] = [];
  let current = '';
  let started = false;
  let heredocs: { word: string; strip: boolean }[] = [];
  const lineAt = (at: number): number => command.slice(0, at).split('\n').length - 1;
  const endToken = (): void => {
    if (started) tokens.push(current);
    current = '';
    started = false;
  };
  const endSegment = (at: number): void => {
    endToken();
    if (tokens.length > 0) segments.push({ tokens, line: lineAt(at) });
    tokens = [];
  };
  const n = command.length;
  let i = 0;
  while (i < n) {
    const c = command[i];
    const next = command[i + 1];
    if (c === "'") {
      started = true;
      i++;
      while (i < n && command[i] !== "'") current += command[i++];
      i++;
    } else if (c === '"') {
      started = true;
      i++;
      while (i < n && command[i] !== '"') {
        const ch = command[i];
        if ((ch === (bash ? '\\' : '`') || (bash && ch === '`')) && command[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          current += ch;
          i++;
        }
      }
      i++;
    } else if (
      c === '@' &&
      (next === "'" || next === '"') &&
      /^[ \t]*\r?\n/.test(command.slice(i + 2))
    ) {
      // A PowerShell here-string: its body runs to a line that opens with the
      // same quote and `@`.
      const close = command.indexOf(`\n${next}@`, i + 2);
      started = true;
      current += '@';
      i = close === -1 ? n : close + 3;
    } else if (!bash && c === '<' && next === '#') {
      const close = command.indexOf('#>', i + 2);
      endToken();
      i = close === -1 ? n : close + 2;
    } else if (c === '#' && !started) {
      const eol = command.indexOf('\n', i);
      const end = eol === -1 ? n : eol;
      const line = lineAt(i);
      comments.set(line, `${comments.get(line) ?? ''} ${command.slice(i + 1, end)}`);
      i = end;
    } else if (c === '<' && command.startsWith('<<', i) && !command.startsWith('<<<', i)) {
      let j = i + 2;
      const strip = command[j] === '-';
      if (strip) j++;
      while (command[j] === ' ' || command[j] === '\t') j++;
      const quote = command[j] === "'" || command[j] === '"' ? command[j++] : '';
      let word = '';
      while (j < n && !/[\s;|&()<>]/.test(command.charAt(j)) && command[j] !== quote)
        word += command[j++];
      if (quote && command[j] === quote) j++;
      if (word) heredocs.push({ word, strip });
      endToken();
      tokens.push('<<');
      i = j;
    } else if (c === '\n') {
      endSegment(i);
      i++;
      // The bodies of the heredocs this line opened, in order.
      for (const { word, strip } of heredocs) {
        while (i < n) {
          const eol = command.indexOf('\n', i);
          const line = command.slice(i, eol === -1 ? n : eol).replace(/\r$/, '');
          i = eol === -1 ? n : eol + 1;
          if ((strip ? line.replace(/^\t+/, '') : line) === word) break;
        }
      }
      heredocs = [];
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endToken();
      i++;
    } else if (c === ';' || c === '|' || c === '(' || c === ')' || c === '{' || c === '}') {
      endSegment(i);
      i += command.startsWith('||', i) ? 2 : 1;
    } else if (c === '&') {
      if (current.endsWith('>') || next === '>') {
        // A redirect, `2>&1` or `&>`, is part of the word it sits in.
        started = true;
        current += c;
        i++;
      } else if (next === '&') {
        endSegment(i);
        i += 2;
      } else if (tokens.length === 0 && !started) {
        // PowerShell's call operator opens a command; it wraps, it does not end.
        tokens.push('&');
        i++;
      } else {
        endSegment(i);
        i++;
      }
    } else {
      started = true;
      current += c;
      i++;
    }
  }
  endSegment(n);
  return { segments, comments };
}

/** Words that only wrap the command that follows them. */
const WRAPPERS = new Set(['&', 'env', 'time', 'call']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** The root scripts that have an `athanor run` equivalent. */
const SCRIPTS = new Set(['test', 'typecheck', 'lint', 'build']);

/**
 * pnpm options that scope a run to one package or fan it out across all of
 * them, which athanor does not mirror. "Package-scoped", never "scoped": that
 * word belongs to a mutation run that names its files.
 */
const PACKAGE_SCOPED = new Set(['--filter', '-F', '-C', '--dir', '-r', '--recursive']);

/** pnpm options that take their value as the next word, which is not the script. */
const PNPM_VALUED = new Set(['--reporter', '--loglevel', '--workspace-concurrency']);

/** pnpm's own short names for `pnpm test`. After `run`, they would name a script. */
const TEST_ALIASES = new Set(['t', 'tst']);

/** vitest's subcommands that watch, list or do something other than one run. */
const VITEST_OTHER = new Set(['watch', 'dev', 'list', 'bench', 'init']);

/** The flags of a run that writes to the tree or keeps running, which a container cannot do. */
const STAYS_ON_HOST = ['-u', '--update', '-w', '--watch'];

/**
 * A program's name, from a path in either slash, without a Windows or script
 * suffix — so `node_modules/@stryker-mutator/core/bin/stryker.js` is
 * `stryker` — and with Stryker's package name read as Stryker.
 */
function programOf(token: string): string {
  const path = token.replace(/\\/g, '/').toLowerCase();
  if (/(?:^|\/)@stryker-mutator\/core(?:@[^/]*)?$/.test(path)) return 'stryker';
  return (path.split('/').pop() ?? '').replace(/\.(cmd|exe|ps1|js|mjs|cjs)$/, '');
}

const hasAny = (args: readonly string[], flags: readonly string[]): boolean =>
  args.some((arg) => flags.includes(arg));

/** The words from the first one that is not an option. */
const fromFirstWord = (args: readonly string[]): readonly string[] =>
  args.slice(
    Math.max(
      0,
      args.findIndex((arg) => !arg.startsWith('-')),
    ),
  );

/**
 * What a run is: not guarded, a guarded host run, or a full mutation run.
 * Stryker is scoped when it names files with `--mutate` or reuses the last
 * run's verdicts with `--incremental`; anything else is the whole of
 * `stryker.scopes.json`. **Inside `athanor run --` only `--mutate` scopes
 * it**: the container never holds a results file, because `artifacts/` is
 * ignored, so an incremental run there runs everything.
 */
type Kind = 'other' | 'guarded' | 'full-mutation';

const asKind = (isGuarded: boolean): Kind => (isGuarded ? 'guarded' : 'other');

function stryker(args: readonly string[], inContainer: boolean): Kind {
  const scoped = args.some(
    (arg) =>
      arg === '--mutate' ||
      arg === '-m' ||
      arg.startsWith('--mutate=') ||
      (!inContainer && arg === '--incremental'),
  );
  return scoped ? 'guarded' : 'full-mutation';
}

/** `vitest`, `tsc` or `stryker` run directly, by any path or launcher. */
function direct(tokens: readonly string[], inContainer = false): Kind {
  const [first, ...rest] = tokens;
  if (first === undefined) return 'other';
  const program = programOf(first);
  if (program === 'stryker')
    return rest[0] === 'run' ? stryker(rest.slice(1), inContainer) : 'other';
  if (program === 'vitest') {
    const sub = rest.find((arg) => !arg.startsWith('-'));
    return asKind(!(sub !== undefined && VITEST_OTHER.has(sub)) && !hasAny(rest, STAYS_ON_HOST));
  }
  if (program === 'tsc')
    return asKind(rest.includes('--noEmit') && !hasAny(rest, ['-w', '--watch']));
  return 'other';
}

/** What follows `pnpm`. */
function pnpm(args: readonly string[], inContainer: boolean): Kind {
  let j = 0;
  for (; args[j]?.startsWith('-'); j++) {
    const arg = args[j] ?? '';
    if (PACKAGE_SCOPED.has(arg) || arg.startsWith('--filter=') || arg.startsWith('--dir=')) {
      return 'other';
    }
    if (PNPM_VALUED.has(arg)) j++;
  }
  let name = args[j];
  let rest = args.slice(j + 1);
  if (name !== undefined && TEST_ALIASES.has(name)) name = 'test';
  else if (name === 'run') {
    name = args[j + 1];
    rest = args.slice(j + 2);
  }
  if (name === undefined) return 'other';
  if (name === 'exec' || name === 'dlx') return direct(fromFirstWord(rest), inContainer);
  if (name === 'vitest' || name === 'tsc' || name === 'stryker')
    return direct([name, ...rest], inContainer);
  if (name === 'mutation:run') return stryker(rest, inContainer);
  if (!SCRIPTS.has(name)) return 'other';
  if (name === 'lint') return asKind(!rest.includes('--fix'));
  if (name === 'test') return asKind(!hasAny(rest, STAYS_ON_HOST));
  return 'guarded';
}

/** What one segment is. */
function kindOf(tokens: readonly string[], inContainer = false): Kind {
  let i = 0;
  for (;;) {
    const t = tokens[i];
    if (t === undefined) return 'other';
    if (WRAPPERS.has(t) || ASSIGNMENT.test(t)) i++;
    else if (t.startsWith('$') && tokens[i + 1] === '=') i += 2;
    else if (t === 'timeout') {
      i++;
      if (/^[\d.]+[smhd]?$/.test(tokens[i] ?? '')) i++;
    } else break;
  }
  const program = programOf(tokens[i] ?? '');
  const rest = tokens.slice(i + 1);
  if (program === 'pnpm') return pnpm(rest, inContainer);
  if (program === 'npx' || program === 'node') return direct(fromFirstWord(rest), inContainer);
  if (program === 'athanor') return inAthanor(rest);
  return direct(tokens.slice(i), inContainer);
}

/**
 * What `athanor run -- <command>` runs. Never a guarded host run — it is the
 * container run the guard sends agents to — but a full mutation run inside it
 * is still one an agent must not start, so the command after `--` is read, and
 * a `sh -c '<script>'` is parsed as the Bash it is.
 */
function inAthanor(args: readonly string[]): Kind {
  const dashes = args.indexOf('--');
  if (dashes === -1) return 'other';
  const inner = args.slice(dashes + 1);
  const shell = programOf(inner[0] ?? '');
  const script = inner[2];
  const kinds =
    (shell === 'sh' || shell === 'bash') && inner[1] === '-c' && script !== undefined
      ? parse(script, true).segments.map((s) => kindOf(s.tokens, true))
      : [kindOf(inner, true)];
  return kinds.includes('full-mutation') ? 'full-mutation' : 'other';
}

const FALLBACK = /(?:^|\s)--host-fallback=(?:"([^"]*)"|'([^']*)'|(\S*))/;

/** Whether a line's comment names the fallback with a reason. */
function namesFallback(comment: string | undefined): boolean {
  const match = comment === undefined ? null : FALLBACK.exec(comment);
  if (match === null) return false;
  return (match[1] ?? match[2] ?? match[3] ?? '').trim() !== '';
}

export interface DecideOptions {
  /** Called, and awaited, only once a segment is a guarded run with no fallback. */
  readonly athanorPresent: () => Promise<boolean>;
}

/**
 * The seam. Returns `{ reason }` to refuse the call, and `null` for everything
 * else, a fault inside included.
 */
export async function decide(
  input: unknown,
  { athanorPresent }: DecideOptions,
): Promise<{ reason: string } | null> {
  try {
    if (typeof input !== 'object' || input === null) return null;
    const { tool_name: tool, tool_input: toolInput } = input as {
      tool_name?: unknown;
      tool_input?: unknown;
    };
    if (tool !== 'Bash' && tool !== 'PowerShell') return null;
    const command = (toolInput as { command?: unknown } | undefined)?.command;
    if (typeof command !== 'string') return null;
    const { segments, comments } = parse(command, tool === 'Bash');
    const kinds = segments.map((s) => ({ kind: kindOf(s.tokens), line: s.line }));
    if (kinds.some((s) => s.kind === 'full-mutation')) return { reason: FULL_MUTATION_REFUSAL };
    if (!kinds.some((s) => s.kind === 'guarded' && !namesFallback(comments.get(s.line))))
      return null;
    return (await athanorPresent()) ? { reason: REFUSAL } : null;
  } catch {
    return null;
  }
}

const LIMIT_MS = 5000;

export interface ProbeOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly limitMs?: number;
}

/**
 * True when `athanor --version` exits 0 and prints a version within the time
 * limit. A shim that dangles (mise says "athanor is not a valid shim" and
 * exits 1), a missing program and a hang all mean athanor is missing, and the
 * host is then the only way to run the suite.
 *
 * The child inherits the session's environment, so it must be athanor. On
 * Windows an npm install leaves a `.cmd` shim, which only a shell runs, so it
 * goes through `cmd.exe` by absolute path, from the system folder, with the
 * lookup in the current folder switched off: `cmd` would otherwise run a file
 * of that name found in the working folder before it searched PATH. Elsewhere
 * a PATH with an empty or relative entry means the same lookup, so it counts
 * as missing and nothing runs. On the limit the child and its tree die.
 */
export function probeAthanor({
  env = process.env,
  platform = process.platform,
  limitMs = LIMIT_MS,
}: ProbeOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const win = platform === 'win32';
    let file: string;
    let args: string[];
    let cwd: string;
    let childEnv: NodeJS.ProcessEnv;
    let taskkill = '';
    if (win) {
      const named = Object.keys(env).find((k) => k.toLowerCase() === 'systemroot');
      const system = join(
        (named === undefined ? undefined : env[named]) ?? 'C:\\Windows',
        'System32',
      );
      file = join(system, 'cmd.exe');
      taskkill = join(system, 'taskkill.exe');
      args = ['/d', '/s', '/c', 'athanor --version'];
      cwd = system;
      childEnv = { ...env, NoDefaultCurrentDirectoryInExePath: '1' };
    } else {
      if ((env.PATH ?? '').split(delimiter).some((d) => d === '' || !posix.isAbsolute(d))) {
        resolve(false);
        return;
      }
      file = 'athanor';
      args = ['--version'];
      cwd = '/';
      childEnv = env;
    }
    let child: ChildProcess;
    try {
      child = spawn(file, args, {
        cwd,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        detached: !win,
      });
    } catch {
      resolve(false);
      return;
    }
    let out = '';
    let settled = false;
    const settle = (verdict: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.destroy();
      child.unref();
      resolve(verdict);
    };
    const timer = setTimeout(() => {
      try {
        if (win)
          spawnSync(taskkill, ['/t', '/f', '/pid', String(child.pid)], {
            stdio: 'ignore',
            windowsHide: true,
          });
        else if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Nothing left to kill.
      }
      settle(false);
    }, limitMs);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (out.length < 4096) out += chunk.toString();
    });
    child.on('error', () => {
      settle(false);
    });
    child.on('close', (code) => {
      settle(code === 0 && /^\d/.test(out.trim()));
    });
  });
}
