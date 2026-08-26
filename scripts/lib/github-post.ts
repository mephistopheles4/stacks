/**
 * Posting a body to GitHub, then proving the body that arrived is the body that
 * went out.
 *
 * **Six known ways to get this wrong, and three of them return HTTP 200**
 * ([#220](https://github.com/mephistopheles4/stacks/issues/220)). `-f
 * body=@reply.md` posts the literal string `@reply.md`; `gh … --jq .body |
 * Set-Content -NoNewline` concatenates every line of the answer; `.Length` on
 * that answer is a line count wearing a character count's clothes. Every agent
 * session that posts prose here has hand-rolled the invocation, and the
 * invocation has more failure modes than it has correct forms.
 *
 * **The one thing every correct form has in common is that it reads the body
 * back and compares** — and that is what nobody does by hand twice. Mode 6 is
 * the exception and it is `github-body.ts`'s: a hard-wrapped body posts
 * perfectly, round-trips byte-identical and still renders as ragged broken
 * lines. So this module transforms first and compares against the *transformed*
 * text, never against what the author wrote; comparing against the latter would
 * report a mismatch on every correct post, which is mode 5's cry-wolf
 * reintroduced by its own fix.
 *
 * ⚠️ **A program, not a command line, and that is three of the six modes
 * closed by construction.** Modes 2, 4 and 5 exist only in a shell: `@(…)` is
 * PowerShell's array subexpression, `Set-Content -NoNewline` joins a string
 * array with no separator, and `.Length` on that array is its line count.
 * Nothing here ever builds a command line — `runExeOutput` takes an argument
 * array and spawns a real executable — so none of the three has anywhere to
 * happen.
 *
 * ⚠️ **Five surfaces, two conventions, and the danger is not spread evenly.**
 * Four take `gh <command> --body-file <path>`. The fifth — a reply into a pull
 * request review thread — has no `gh` subcommand at all and must go through
 * `gh api`, which is exactly where modes 1 and 2 live and where mode 5 was
 * actually observed. It is modelled as its own case rather than branched on at
 * the call site.
 *
 * **The seam is `gh` itself.** Everything below either builds an argument array
 * or reads one back; the process is injected, so every test here runs with no
 * `gh`, no network and no escape hatch from G21.
 */

import { bodyForGitHub } from './github-body.ts';

/** One `gh` invocation: its arguments, and anything it takes on stdin. */
export interface GhCall {
  args: readonly string[];
  /** A JSON request document for `gh api --input -`. Never a command line. */
  input?: string;
}

/** A `gh` that has run, and what it printed. Injected so a test needs no `gh`. */
export type GhRunner = (call: GhCall) => string;

export interface PostDeps {
  gh: GhRunner;
  /** Writes the transformed body somewhere `--body-file` can read, and says where. */
  writeBody: (text: string) => string;
}

/**
 * Where a body is going. Five surfaces, named rather than inferred from which
 * arguments happen to be set.
 */
export type Surface =
  | { kind: 'issue'; title: string; labels?: readonly string[]; parent?: number }
  | { kind: 'pull-request'; title: string; base?: string; head?: string }
  | { kind: 'issue-comment'; issue: number }
  | { kind: 'pull-request-review'; pullRequest: number }
  | { kind: 'review-thread-reply'; pullRequest: number; comment: number };

/** Every surface's name, for a command line and for a message. */
export const SURFACES = [
  'issue',
  'pull-request',
  'issue-comment',
  'pull-request-review',
  'review-thread-reply',
] as const satisfies readonly Surface['kind'][];

/**
 * What to read back, once the post has said where it landed.
 *
 * Separate from `Surface` because they are different facts: *where a body is
 * going* is chosen by the caller, and *what to read* is whatever GitHub just
 * created. A review is the odd one — `gh pr review` prints no identifier at
 * all, so its handle is the pull request plus the account that posted.
 */
export type PostedRef =
  | { kind: 'issue'; number: number }
  | { kind: 'pull-request'; number: number }
  | { kind: 'issue-comment'; id: number }
  | { kind: 'review-comment'; id: number }
  | { kind: 'pull-request-review'; pullRequest: number; author: string };

/** The prose to post, and where it was written. */
export interface Body {
  markdown: string;
  /** The repository-relative directory the prose lives in. See `TransformOptions`. */
  from?: string;
}

export interface PostResult {
  /** The text that was actually sent — transformed, and what the comparison uses. */
  posted: string;
  /** What came back, after the read-back normalisation below. */
  readBack: string;
  matched: boolean;
  /** Absent when it matched. Sizes in characters, never in lines. */
  difference?: string;
  ref: PostedRef;
}

/**
 * A difference the read is allowed to have, and the measurement that put it
 * here.
 *
 * **Data rather than a condition**, so a later session can see what the
 * comparison stopped checking instead of reconstructing it from a boolean.
 */
export interface Normalisation {
  name: string;
  why: string;
  apply: (text: string) => string;
}

/**
 * The whole of what the comparison ignores — one entry, and it is not the
 * server's.
 *
 * ⚠️ **Measured on 2026-08-26 against a scratch issue, not assumed.** Ten
 * bodies were posted and read back: CRLF, a lone carriage return, trailing
 * spaces, tabs, leading and trailing blank lines, a 2000-character line and
 * non-ASCII punctuation all came back **byte-identical**. GitHub stores the
 * body verbatim. The only difference anywhere was `gh` terminating its own
 * output with a line feed, which is a property of the reader and not of the
 * record.
 *
 * That matters because #220 attributed the one-character difference it saw to
 * the server — *"GitHub normalises some bodies (trailing whitespace, CRLF)"* —
 * and a comparison built on that guess would have stopped checking the two
 * things this tool exists to be exact about. After the strip below, this is a
 * **byte comparison**, and any difference it reports is real.
 */
export const READ_BACK_NORMALISATIONS: readonly Normalisation[] = [
  {
    name: 'one trailing line feed from gh',
    why:
      'gh terminates `--jq .body` output with exactly one line feed whether or not the body ' +
      'ends with one. It is the reader adding a character, not the server changing one — ' +
      'measured over ten bodies on 2026-08-26, none of which the server altered in any way.',
    apply: (text) => text.replace(/\n$/, ''),
  },
];

/** What `gh` printed, with the one difference above taken out of it. */
export function normaliseReadBack(text: string): string {
  return READ_BACK_NORMALISATIONS.reduce((carried, entry) => entry.apply(carried), text);
}

/** The body on disk, and the same text, for the surface that sends JSON. */
interface BodyAt {
  file: string;
  text: string;
}

/**
 * The one `gh` invocation that posts to this surface.
 *
 * Four surfaces take `--body-file`, so the prose never reaches a command line
 * and mode 3 has nowhere to happen. The fifth sends a JSON document on stdin:
 * `-f body=@file` posts the filename and `-F body=…` coerces a value that looks
 * like a number, and `--input -` can do neither.
 */
export function postPlan(surface: Surface, body: BodyAt): GhCall {
  switch (surface.kind) {
    case 'issue': {
      const args = ['issue', 'create', '--title', surface.title];
      for (const label of surface.labels ?? []) args.push('--label', label);
      if (surface.parent !== undefined) args.push('--parent', String(surface.parent));
      return { args: [...args, '--body-file', body.file] };
    }
    case 'pull-request': {
      const args = ['pr', 'create', '--title', surface.title];
      if (surface.base !== undefined) args.push('--base', surface.base);
      if (surface.head !== undefined) args.push('--head', surface.head);
      return { args: [...args, '--body-file', body.file] };
    }
    case 'issue-comment':
      return { args: ['issue', 'comment', String(surface.issue), '--body-file', body.file] };
    case 'pull-request-review':
      return {
        args: ['pr', 'review', String(surface.pullRequest), '--comment', '--body-file', body.file],
      };
    case 'review-thread-reply':
      return {
        args: [
          'api',
          '--method',
          'POST',
          `repos/{owner}/{repo}/pulls/${String(surface.pullRequest)}/comments/${String(surface.comment)}/replies`,
          '--input',
          '-',
        ],
        input: JSON.stringify({ body: body.text }),
      };
  }
}

/**
 * The handle on what was just posted, read out of whatever `gh` printed.
 *
 * ⚠️ **Throws rather than guessing.** A handle guessed from an unparseable
 * answer reads some *other* body back and compares against that — a new silent
 * failure mode inside the tool built to remove them.
 */
export function refFrom(surface: Surface, stdout: string, author: string | undefined): PostedRef {
  const printed = stdout.trim();

  switch (surface.kind) {
    case 'issue':
      return { kind: 'issue', number: numberFrom(printed, /\/issues\/(\d+)\b/, 'issue URL') };
    case 'pull-request':
      return {
        kind: 'pull-request',
        number: numberFrom(printed, /\/pull\/(\d+)\b/, 'pull request URL'),
      };
    case 'issue-comment':
      return {
        kind: 'issue-comment',
        id: numberFrom(printed, /#issuecomment-(\d+)\b/, 'issue comment URL'),
      };
    case 'review-thread-reply':
      // The api surface answers with the created comment, so its id is exact.
      return { kind: 'review-comment', id: idFromJson(printed) };
    case 'pull-request-review': {
      // `gh pr review` prints "Reviewed pull request #225" and no identifier of
      // any kind, so the newest review by the account that just posted is the
      // only handle there is.
      if (author === undefined || author === '') {
        throw new Error('a pull request review can only be read back with the authenticated login');
      }
      return { kind: 'pull-request-review', pullRequest: surface.pullRequest, author };
    }
  }
}

function numberFrom(printed: string, pattern: RegExp, what: string): number {
  const found = pattern.exec(printed);
  if (found?.[1] === undefined) {
    throw new Error(`gh printed no ${what} to read the body back from: ${printed}`);
  }
  return Number(found[1]);
}

function idFromJson(printed: string): number {
  const parsed: unknown = JSON.parse(printed);
  const id = (parsed as { id?: unknown }).id;
  if (typeof id !== 'number') throw new Error(`the api answer carried no comment id: ${printed}`);
  return id;
}

/**
 * The one `gh` invocation that reads this body back.
 *
 * Always the REST API and never the HTML page: the page is rendered, and what
 * has to be compared is what was stored.
 */
export function readPlan(ref: PostedRef): readonly string[] {
  const api = (path: string, jq = '.body'): string[] => ['api', path, '--jq', jq];

  switch (ref.kind) {
    case 'issue':
      return api(`repos/{owner}/{repo}/issues/${String(ref.number)}`);
    case 'pull-request':
      return api(`repos/{owner}/{repo}/pulls/${String(ref.number)}`);
    case 'issue-comment':
      return api(`repos/{owner}/{repo}/issues/comments/${String(ref.id)}`);
    case 'review-comment':
      return api(`repos/{owner}/{repo}/pulls/comments/${String(ref.id)}`);
    case 'pull-request-review':
      // Filtered by author, because the newest review on a pull request need
      // not be ours — and comparing against somebody else's review is a false
      // alarm the design would produce on purpose.
      return api(
        `repos/{owner}/{repo}/pulls/${String(ref.pullRequest)}/reviews`,
        `[.[] | select(.user.login == "${ref.author}")] | last | .body`,
      );
  }
}

/** How much context to show either side of the first character that differs. */
const WINDOW = 40;

/**
 * What differs between what was sent and what came back, or `undefined`.
 *
 * ⚠️ **Every size here is a character count.** #220's mode 5 is a verification
 * step reporting `posted 14 chars / local 1984` about two identical bodies,
 * because `.Length` on PowerShell's string array is the number of lines. **A
 * verification step that cries wolf costs the same as one that misses** — and
 * the remedy for the failure it reports is to re-post, which on mode 1 would
 * have doubled the damage. So this counts characters, says so in the message,
 * and never mentions a line at all.
 */
export function differenceOf(sent: string, back: string): string | undefined {
  if (sent === back) return undefined;

  let at = 0;
  while (at < sent.length && at < back.length && sent[at] === back[at]) at += 1;

  const window = (text: string): string =>
    JSON.stringify(text.slice(Math.max(0, at - WINDOW), at + WINDOW));

  return [
    `sent ${String(sent.length)} characters, read back ${String(back.length)} characters`,
    `first difference at character ${String(at)}`,
    `  sent: ${window(sent)}`,
    `  back: ${window(back)}`,
  ].join('\n');
}

/**
 * Transform the prose, post it, read it back, and say whether it arrived.
 *
 * Every stage is deliberately visible in the result: `posted` is what the
 * comparison used, and it is the transformed text rather than the argument. A
 * caller that reports the author's own prose as *what was sent* would be
 * describing something that was never on the wire.
 */
export function postAndVerify(deps: PostDeps, surface: Surface, body: Body): PostResult {
  const posted = bodyForGitHub(body.markdown, { from: body.from ?? '' });
  const file = deps.writeBody(posted);

  const printed = deps.gh(postPlan(surface, { file, text: posted }));

  // Asked for only by the surface with no identifier of its own — one extra
  // round trip where it buys something, and none where it does not.
  const author =
    surface.kind === 'pull-request-review'
      ? deps.gh({ args: ['api', 'user', '--jq', '.login'] }).trim()
      : undefined;

  const ref = refFrom(surface, printed, author);
  const readBack = normaliseReadBack(deps.gh({ args: readPlan(ref) }));
  const difference = differenceOf(posted, readBack);

  return { posted, readBack, matched: difference === undefined, difference, ref };
}
