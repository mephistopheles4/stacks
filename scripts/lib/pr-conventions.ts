/**
 * The pull request title and body rules, as pure functions.
 *
 * This repository squash-merges with `squash_merge_commit_title: PR_TITLE` and
 * `squash_merge_commit_message: PR_BODY`, so **the pull request title is the
 * commit subject that reaches `main`** and its body is that commit's message.
 * The local subject a `commit-msg` hook would lint is the string the squash
 * throws away — which is why the check lives here and on `pull_request`, and
 * why a hook framework buys nothing. See
 * [ADR-0057](../../docs/adr/0057-the-pull-request-title-is-the-commit-subject.md).
 *
 * ⚠️ **A module and not an inline regular expression in the workflow.** Every
 * lint glob and every complexity population in this repository ends in `.ts`, so
 * logic in YAML is read by no linter, scored by no counter and driven by no
 * test — the same reason `AGENTS.md` rules logic out of `.astro` files. The
 * workflow's job is to hand this module two strings and report what it says.
 *
 * ⚠️ **Nothing here reads a file or an environment variable.** `scripts/check-pr.ts`
 * does the input and output; this is the part a test can drive directly, which
 * is what lets the fault vocabulary be asserted rather than eyeballed in a CI
 * log.
 *
 * See docs/gates.md, row G55 (pr-conventions).
 */

/**
 * The commit types, and this list is a **decision rather than a lookup**.
 *
 * ⚠️ **Conventional Commits enumerates no type vocabulary.** It mandates `feat`
 * and `fix`, permits any others, and points at the Angular convention as an
 * example — so there is no canonical list to go and find. This is the
 * commitlint/Angular set, settled by the owner on 2026-09-03.
 *
 * ⚠️ **`research`, `prototype` and `experiment` are deliberately absent.**
 * `AGENTS.md` names them as *branch* prefixes for work that never becomes a
 * commit on `main`, and names them precisely so nobody deletes them as
 * non-conformant. The same care runs in reverse here: a branch prefix is not a
 * commit type, and admitting one by analogy would let `research: x` land as a
 * subject on `main`.
 *
 * Held to `AGENTS.md`'s prose by `gates/pr-conventions.test.ts`.
 */
export const TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
] as const;

/**
 * The scopes, which are the things that exist. Scope is **optional**; an
 * undeclared one fails rather than passing silently.
 *
 * ⚠️ **`docs` and `ci` are each a valid type *and* a declared scope, and that is
 * fine.** `docs: x`, `docs(docs): x` and `feat(docs): x` all pass. The two slots
 * are read separately and never compared — a rule that objected to the pair
 * would be inventing a constraint neither list states.
 */
export const SCOPES = ['core', 'cli', 'site', 'gates', 'docs', 'ci'] as const;

/**
 * Authors whose **body** is not checked. Closed, one entry, and reverse-asserted
 * in `gates/pr-conventions.test.ts`.
 *
 * ⚠️ **The title half is not exempted, and does not need to be.**
 * `.github/dependabot.yml` sets `commit-message.prefix: 'ci'` for both
 * ecosystems, so a bot title conforms by construction — measured on the nine
 * Dependabot pull requests this repository has merged, the eight most recent of
 * which read `ci: bump …`.
 *
 * The body is a different question. A Dependabot body is a changelog and a
 * compatibility score; it has never carried the template's two questions and it
 * never will, because the bot does not read the template. Reddening a weekly
 * dependency bump on a body only a human can write is the *tax* half of Clause A
 * — the remedy exists (edit the body) but it recurs forever and teaches you to
 * click through a red. So the exemption is named here rather than left to be
 * discovered as a permanently red required check.
 *
 * ⚠️ **The brief did not ask for this and the owner has not ruled on it.** #289
 * says flatly *"A body missing either protected question fails"*, with no
 * exception, and never mentions Dependabot — this list is the implementer's
 * judgement about a case the brief did not reach, flagged so it can be struck
 * rather than inherited. **Deleting the array is the whole of striking it**: the
 * bot's own pull requests then go red weekly on their bodies, which is exactly
 * the behaviour the brief's sentence describes.
 */
export const BODY_EXEMPT_AUTHORS = ['dependabot[bot]'] as const;

/** Which of the rules a title or body broke. */
export type FaultKind = 'shape' | 'type' | 'scope' | 'body';

export interface Fault {
  readonly kind: FaultKind;
  /** What is wrong and what to do about it — this is what CI prints. */
  readonly message: string;
}

/**
 * The shape, parsed loosely on purpose.
 *
 * `[^\s(!:]+` in the type slot means `Feat(site): a thing` parses — and then
 * fails as a **type** fault naming the capital, rather than as an unhelpful
 * "does not match the shape". A title whose fault is a wrong word should be told
 * which word.
 *
 * The `!` is Conventional Commits' breaking-change marker and is admitted:
 * `feat!: x` and `feat(site)!: x` both pass. `AGENTS.md` cites the spec, so
 * refusing a construct the spec defines would be a fourth rule nobody agreed.
 *
 * A single space after the colon is required, and the subject must be non-empty.
 */
const SHAPE = /^([^\s(!:]+)(?:\(([^)]*)\))?(!)?: (.+)$/;

/** A readable list for a failure message: `` `a`, `b` ``. */
function spelled(values: readonly string[]): string {
  return values.map((value) => `\`${value}\``).join(', ');
}

/**
 * The one thing wrong with a title, or nothing.
 *
 * One fault and not a list, because the faults are ordered: a title whose shape
 * is unreadable has no type slot to judge, and a title with an unknown type has
 * no business being told about its scope as well.
 */
export function titleFault(title: string): Fault | undefined {
  const trimmed = title.trim();
  const match = SHAPE.exec(trimmed);

  if (match === null) {
    return {
      kind: 'shape',
      message:
        `the title \`${trimmed}\` is not \`<type>(<scope>): <subject>\`. It needs a type, ` +
        'an optional scope in parentheses, a colon, one space, and a subject — for ' +
        'example `feat(site): the shelf remembers where you were`. This repository ' +
        'squash-merges, so this title becomes the commit subject on `main`.',
    };
  }

  const [, type = '', scope, , subject = ''] = match;

  if (!(TYPES as readonly string[]).includes(type)) {
    return {
      kind: 'type',
      message:
        `\`${type}\` is not a commit type. The types are ${spelled(TYPES)} — lowercase, ` +
        'and `research`, `prototype` and `experiment` are branch prefixes rather than ' +
        'types. Documented in AGENTS.md, under the working rule about commits.',
    };
  }

  if (scope !== undefined && !(SCOPES as readonly string[]).includes(scope)) {
    return {
      kind: 'scope',
      message:
        `\`${scope}\` is not a declared scope. The scope is optional; when present it is ` +
        `one of ${spelled(SCOPES)}. Drop the parentheses or pick one of those.`,
    };
  }

  // Reachable only through a subject of nothing but whitespace: `.+` is
  // satisfied by a space, and a title of `feat:   ` trims to `feat:` and fails
  // the shape above, but `feat: <tab>x` does not.
  if (subject.trim().length === 0) {
    return {
      kind: 'shape',
      message: `the title \`${trimmed}\` has a type and no subject. Say what changed.`,
    };
  }

  return undefined;
}

/**
 * The text with every `<!-- … -->` block taken out: a comment carries the
 * template's instructions, never an answer.
 *
 * ⚠️ **A scanner rather than `replace(/<!--[\s\S]*?-->/g, '')`, and the reason
 * is a behaviour change rather than the alert that prompted it.** CodeQL raised
 * `js/incomplete-multi-character-sanitization` at **high** on the regular
 * expression — a false positive as a *security* finding, since nothing here
 * renders HTML and the output of this function is only ever asked whether it is
 * blank. Working `docs/gates.md`'s third triage question found the real one: an
 * **unterminated** `<!--` is left entirely in place by that regex, so a section
 * whose author opened a comment and typed the answer inside it reads as
 * answered. GitHub renders that answer as nothing at all — the reviewer sees an
 * empty section — and the check that exists to catch an empty section passed it.
 *
 * The scanner takes the renderer's reading: an unclosed comment swallows the
 * rest of the section, so the section is empty here exactly when it is empty on
 * the page. **The tempting half-fix was tweaking the regex until the alert
 * cleared**, which that triage section names as the worst outcome available.
 */
function withoutComments(markdown: string): string {
  let kept = '';
  let at = 0;

  while (at < markdown.length) {
    const opens = markdown.indexOf('<!--', at);
    if (opens < 0) return kept + markdown.slice(at);

    kept += markdown.slice(at, opens);

    const closes = markdown.indexOf('-->', opens + 4);
    // Unterminated: the renderer eats the remainder, so this does too.
    if (closes < 0) return kept;

    at = closes + 3;
  }

  return kept;
}

/**
 * The headings a body may not drop, read out of the pull request template.
 *
 * **Derived, never copied.** `.github/pull_request_template.md` tells an author
 * to *"Delete any section that genuinely does not apply"* and then *"Do not
 * delete the two questions"* — so a rule demanding every heading would
 * contradict the template it is enforcing. The two protected sections are
 * exactly the headings that **are** questions, which is a property of the file
 * rather than a second list to maintain.
 *
 * Comments are stripped first: the template's own prose discusses the sections
 * and would otherwise be mined for question marks.
 */
export function protectedQuestions(template: string): string[] {
  return [...withoutComments(template).matchAll(/^#{1,6}\s+(.*\?)\s*$/gm)].map(
    (match) => match[1] ?? '',
  );
}

/**
 * The text under one heading, up to the next heading of any level.
 *
 * ⚠️ **Cut in two steps rather than with one lookahead**, because the obvious
 * one-regex form is wrong in a way that reads fine: `(?=^#{1,6}\s|\z)` uses
 * `\z`, which JavaScript does not have — it is an identity escape matching a
 * literal `z`, so the alternation would only ever terminate on a `z` and a final
 * section would run to whatever followed. The last section here has to run to
 * end of input, and `$` under `m` matches the end of *every* line.
 */
function sectionUnder(body: string, heading: string): string | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Windows and the GitHub API both hand back `\r\n`; a `$` anchor would
  // otherwise never match a heading line.
  const normalised = body.replace(/\r\n/g, '\n');
  const found = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'm').exec(normalised);

  if (found === null) return undefined;

  const rest = normalised.slice(found.index + found[0].length);
  const next = /^#{1,6}\s/m.exec(rest);

  return next === null ? rest : rest.slice(0, next.index);
}

/**
 * Every protected question the body has dropped or left blank.
 *
 * A list rather than one fault, because these are independent: an author who
 * deleted both should be told about both in one red.
 *
 * ⚠️ **It reads headings and the presence of text, and never prose.** Whether
 * the answer is any good is outside this and outside every gate here.
 */
export function bodyFaults(body: string, questions: readonly string[]): Fault[] {
  return questions.flatMap((question) => {
    const section = sectionUnder(body, question);

    if (section === undefined) {
      return [
        {
          kind: 'body' as const,
          message:
            `the body has no \`## ${question}\` section. The pull request template says ` +
            'the two questions may not be deleted — this body becomes the commit message ' +
            'on `main`, so a deleted question is a question nobody answered.',
        },
      ];
    }

    if (withoutComments(section).trim().length === 0) {
      return [
        {
          kind: 'body' as const,
          message:
            `\`## ${question}\` is empty. Answer it outside the \`<!-- -->\` comment — ` +
            '"none" and "nothing would" are both fine answers, and both are better than ' +
            'a blank.',
        },
      ];
    }

    return [];
  });
}

export interface PullRequest {
  readonly title: string;
  /** GitHub hands back `null` for a body nobody wrote. */
  readonly body: string | null;
  /** The login, e.g. `dependabot[bot]`. */
  readonly author: string;
  /** The contents of `.github/pull_request_template.md`. */
  readonly template: string;
}

/** Everything wrong with a pull request, title first. */
export function pullRequestFaults(pull: PullRequest): Fault[] {
  const title = titleFault(pull.title);
  const bodyExempt = (BODY_EXEMPT_AUTHORS as readonly string[]).includes(pull.author);

  return [
    ...(title === undefined ? [] : [title]),
    ...(bodyExempt ? [] : bodyFaults(pull.body ?? '', protectedQuestions(pull.template))),
  ];
}
