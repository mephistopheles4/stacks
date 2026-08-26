/**
 * Post prose to GitHub, and refuse quietly to believe it worked.
 *
 * ```sh
 * pnpm exec tsx scripts/gh-post.ts issue-comment --issue 220 --body reply.md --from docs/agents
 * ```
 *
 * The thin half. Every rule lives in `scripts/lib/github-body.ts` (what a body
 * has to look like before it is posted) and `scripts/lib/github-post.ts` (one
 * path per surface, and reading it back) — both of which are tested with no
 * `gh`, no network and no escape hatch from G21. This file parses an argument
 * list, touches the disk, and sets an exit code.
 *
 * ⚠️ **Deliberately not a `pnpm` script**, and that is a decision rather than
 * an omission ([#220](https://github.com/mephistopheles4/stacks/issues/220)).
 * Every entry in `package.json` today serves the product — the build, the
 * deploy, the fixtures, the trend layer — and a `pnpm` name only agents run
 * would be the first of its kind, which owes its own record under `docs/adr/`
 * and pulls in G14. Discoverability comes from the pointer in `AGENTS.md`
 * instead.
 *
 * ⚠️ **A mismatch exits non-zero.** A warning is how mode 4 stayed unnoticed
 * for a 26KB body that arrived as one line.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bodyForGitHub } from './lib/github-body.ts';
import {
  postAndVerify,
  postPlan,
  SURFACES,
  type GhCall,
  type PostDeps,
  type Surface,
} from './lib/github-post.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runExeOutput } from './lib/run.ts';

const USAGE = `usage: tsx scripts/gh-post.ts <surface> --body <file> [options]

surfaces and what each needs

  issue                 --title <title> [--label <name>]... [--parent <issue>]
  pull-request          --title <title> [--base <branch>] [--head <branch>]
  issue-comment         --issue <number>
  pull-request-review   --pr <number>
  review-thread-reply   --pr <number> --comment <review comment id>

everywhere

  --body <file>   the prose to post, as a file. Never as an argument.
  --from <dir>    the repository-relative directory the prose was written in,
                  so a relative link resolves the way it does on disk.
  --dry-run       print what would be posted and the gh arguments, post nothing.
`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** `--name value` and `--flag`, with a repeated flag collected rather than lost. */
function parse(argv: readonly string[]): { surface: string; options: Map<string, string[]> } {
  const [surface, ...rest] = argv;
  if (surface === undefined || surface.startsWith('-')) fail(USAGE);

  const options = new Map<string, string[]>();
  for (let at = 0; at < rest.length; at += 1) {
    const token = rest[at] ?? '';
    if (!token.startsWith('--')) fail(`${USAGE}\nunexpected argument: ${token}`);

    const name = token.slice(2);
    const next = rest[at + 1];
    const value = next === undefined || next.startsWith('--') ? '' : next;
    if (value !== '') at += 1;

    options.set(name, [...(options.get(name) ?? []), value]);
  }
  return { surface, options };
}

function one(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}

function required(options: Map<string, string[]>, name: string, surface: string): string {
  const value = one(options, name);
  if (value === undefined || value === '') fail(`${USAGE}\n${surface} needs --${name}`);
  return value;
}

function number(options: Map<string, string[]>, name: string, surface: string): number {
  const raw = required(options, name, surface);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) fail(`--${name} must be a number, not ${raw}`);
  return parsed;
}

function surfaceFrom(kind: string, options: Map<string, string[]>): Surface {
  switch (kind) {
    case 'issue': {
      const parent = one(options, 'parent');
      return {
        kind,
        title: required(options, 'title', kind),
        labels: (options.get('label') ?? []).filter((label) => label !== ''),
        ...(parent === undefined || parent === '' ? {} : { parent: Number(parent) }),
      };
    }
    case 'pull-request': {
      const base = one(options, 'base');
      const head = one(options, 'head');
      return {
        kind,
        title: required(options, 'title', kind),
        ...(base === undefined || base === '' ? {} : { base }),
        ...(head === undefined || head === '' ? {} : { head }),
      };
    }
    case 'issue-comment':
      return { kind, issue: number(options, 'issue', kind) };
    case 'pull-request-review':
      return { kind, pullRequest: number(options, 'pr', kind) };
    case 'review-thread-reply':
      return {
        kind,
        pullRequest: number(options, 'pr', kind),
        comment: number(options, 'comment', kind),
      };
    default:
      return fail(`${USAGE}\nunknown surface: ${kind}. One of: ${SURFACES.join(', ')}`);
  }
}

const { surface: kind, options } = parse(process.argv.slice(2));
const surface = surfaceFrom(kind, options);
const bodyFile = required(options, 'body', kind);
const markdown = readFileSync(bodyFile, 'utf8');
const from = one(options, 'from') ?? '';

const scratch = mkdtempSync(join(tmpdir(), 'stacks-gh-post-'));
const writeBody: PostDeps['writeBody'] = (text) => {
  const path = join(scratch, 'body.md');
  writeFileSync(path, text, 'utf8');
  return path;
};

// Echoed, because which invocation produced the next answer is the question you
// have while reading it — `runShell`'s reason, and the same one.
const gh: PostDeps['gh'] = (call: GhCall) => {
  console.log(`\n$ gh ${call.args.join(' ')}`);
  return runExeOutput('gh', call.args, REPO_ROOT, call.input);
};

if (options.has('dry-run')) {
  const posted = bodyForGitHub(markdown, { from });
  const plan = postPlan(surface, { file: writeBody(posted), text: posted });
  console.log(posted);
  console.log(`\n$ gh ${plan.args.join(' ')}`);
  process.exit(0);
}

const result = postAndVerify({ gh, writeBody }, surface, { markdown, from });

if (result.matched) {
  console.log(`\nposted and verified: ${result.posted.length} characters, read back identical`);
  process.exit(0);
}

console.error(
  `\nthe body that came back is not the body that went out\n${result.difference ?? ''}`,
);
process.exit(1);
