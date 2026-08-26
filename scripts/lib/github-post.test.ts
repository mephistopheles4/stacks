/**
 * Posting a body through one path per surface, and proving it arrived.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`.
 *
 * ⚠️ **Every `gh` call here is a fake passed in through the seam**, so nothing
 * spawns a process and nothing reaches the network: G21 (`no-live-network`)
 * stays green with no escape hatch. That is the whole reason `postAndVerify`
 * takes its runner as an argument rather than importing one.
 */

import { describe, expect, it } from 'vitest';
import {
  differenceOf,
  normaliseReadBack,
  postAndVerify,
  postPlan,
  READ_BACK_NORMALISATIONS,
  readPlan,
  refFrom,
  type GhCall,
  type Surface,
} from './github-post.ts';

/** A `gh` that records what it was asked and answers from a script. */
function fakeGh(answers: readonly string[]): { calls: GhCall[]; gh: (call: GhCall) => string } {
  const calls: GhCall[] = [];
  let next = 0;
  return {
    calls,
    gh: (call) => {
      calls.push(call);
      const answer = answers[next];
      next += 1;
      return answer ?? '';
    },
  };
}

const ISSUE: Surface = { kind: 'issue', title: 'A title' };
const REVIEW_REPLY: Surface = {
  kind: 'review-thread-reply',
  pullRequest: 225,
  comment: 3836475003,
};

describe('postPlan — the one path per surface', () => {
  const AT = { file: '/tmp/body.md', text: 'A body.' };

  it('creates an issue with the body as a file, never as an argument', () => {
    // Failure mode 3: prose bodies carry apostrophes and backticks that break
    // shell quoting. The body reaches `gh` as a path and never as prose.
    const plan = postPlan(ISSUE, AT);

    expect(plan.args).toEqual([
      'issue',
      'create',
      '--title',
      'A title',
      '--body-file',
      '/tmp/body.md',
    ]);
    expect(plan.input).toBeUndefined();
  });

  it('carries a label and a parent onto an issue when asked', () => {
    const plan = postPlan(
      { kind: 'issue', title: 'A title', labels: ['enhancement'], parent: 228 },
      AT,
    );

    expect(plan.args).toContain('--label');
    expect(plan.args).toContain('enhancement');
    expect(plan.args).toContain('--parent');
    expect(plan.args).toContain('228');
  });

  it('creates a pull request with the body as a file', () => {
    const plan = postPlan({ kind: 'pull-request', title: 'A title', base: 'main' }, AT);

    expect(plan.args).toEqual([
      'pr',
      'create',
      '--title',
      'A title',
      '--base',
      'main',
      '--body-file',
      '/tmp/body.md',
    ]);
  });

  it('comments on an issue with the body as a file', () => {
    expect(postPlan({ kind: 'issue-comment', issue: 220 }, AT).args).toEqual([
      'issue',
      'comment',
      '220',
      '--body-file',
      '/tmp/body.md',
    ]);
  });

  it('leaves a pull request review with the body as a file', () => {
    expect(postPlan({ kind: 'pull-request-review', pullRequest: 225 }, AT).args).toEqual([
      'pr',
      'review',
      '225',
      '--comment',
      '--body-file',
      '/tmp/body.md',
    ]);
  });

  it('replies into a review thread as JSON on stdin, never as -f body=@file', () => {
    // ⚠️ **The surface with no `gh` subcommand at all**, and the one where the
    // two silent failures live. `-f body=@reply.md` posts the literal string
    // `@reply.md` and returns 200; `-F body=@…` coerces a value that looks like
    // a number. A JSON document on stdin can do neither.
    const plan = postPlan(REVIEW_REPLY, AT);

    expect(plan.args).toEqual([
      'api',
      '--method',
      'POST',
      'repos/{owner}/{repo}/pulls/225/comments/3836475003/replies',
      '--input',
      '-',
    ]);
    expect(plan.args.join(' ')).not.toContain('@');
    expect(plan.input).toBe(JSON.stringify({ body: 'A body.' }));
  });
});

describe('refFrom — what gh said, turned into what to read back', () => {
  it('takes the issue number out of the URL gh printed', () => {
    const ref = refFrom(ISSUE, 'https://github.com/mephistopheles4/stacks/issues/276\n', 'me');

    expect(ref).toEqual({ kind: 'issue', number: 276 });
  });

  it('takes the pull request number out of the URL gh printed', () => {
    const ref = refFrom(
      { kind: 'pull-request', title: 'A title' },
      'https://github.com/mephistopheles4/stacks/pull/277\n',
      'me',
    );

    expect(ref).toEqual({ kind: 'pull-request', number: 277 });
  });

  it('takes the comment id out of the anchor gh printed', () => {
    const ref = refFrom(
      { kind: 'issue-comment', issue: 276 },
      'https://github.com/mephistopheles4/stacks/issues/276#issuecomment-3841234567\n',
      'me',
    );

    expect(ref).toEqual({ kind: 'issue-comment', id: 3841234567 });
  });

  it('takes the reply id out of the JSON the api returned', () => {
    const ref = refFrom(REVIEW_REPLY, JSON.stringify({ id: 3836475032, body: 'x' }), 'me');

    expect(ref).toEqual({ kind: 'review-comment', id: 3836475032 });
  });

  it('falls back to the author for a review, which prints no id at all', () => {
    // `gh pr review` says only "Reviewed pull request #225". The newest review
    // by the account that just posted is the only handle available.
    const ref = refFrom({ kind: 'pull-request-review', pullRequest: 225 }, 'Reviewed #225', 'me');

    expect(ref).toEqual({ kind: 'pull-request-review', pullRequest: 225, author: 'me' });
  });

  it('refuses a stdout it cannot find a handle in, rather than reading back nothing', () => {
    // ⚠️ A ref guessed from an unparseable URL reads back some *other* body and
    // compares against it. Silence here would be a new silent failure mode in
    // the tool built to remove them.
    expect(() => refFrom(ISSUE, 'gh: something went sideways', 'me')).toThrow(/issue URL/);
  });
});

describe('readPlan — reading the body back', () => {
  it('reads an issue body through the API, as a body and not a page', () => {
    expect(readPlan({ kind: 'issue', number: 276 })).toEqual([
      'api',
      'repos/{owner}/{repo}/issues/276',
      '--jq',
      '.body',
    ]);
  });

  it('reads a pull request body from the pulls endpoint', () => {
    expect(readPlan({ kind: 'pull-request', number: 277 })).toEqual([
      'api',
      'repos/{owner}/{repo}/pulls/277',
      '--jq',
      '.body',
    ]);
  });

  it('reads an issue comment by id', () => {
    expect(readPlan({ kind: 'issue-comment', id: 3841234567 })).toEqual([
      'api',
      'repos/{owner}/{repo}/issues/comments/3841234567',
      '--jq',
      '.body',
    ]);
  });

  it('reads a review-thread reply from the pull request comments endpoint', () => {
    expect(readPlan({ kind: 'review-comment', id: 3836475032 })).toEqual([
      'api',
      'repos/{owner}/{repo}/pulls/comments/3836475032',
      '--jq',
      '.body',
    ]);
  });

  it('reads the newest review by the account that posted it', () => {
    const args = readPlan({ kind: 'pull-request-review', pullRequest: 225, author: 'me' });

    expect(args.slice(0, 2)).toEqual(['api', 'repos/{owner}/{repo}/pulls/225/reviews']);
    // Filtered by author: the newest review on the pull request need not be
    // ours, and comparing against somebody else's is a false alarm by design.
    expect(args.at(-1)).toContain('"me"');
    expect(args.at(-1)).toContain('last');
  });
});

describe('normaliseReadBack — the one thing the read is allowed to change', () => {
  it('names exactly what it ignores, as data', () => {
    // ⚠️ **The set has to be readable as data**, so a later session can see
    // what the comparison stopped checking rather than digging it out of a
    // condition. Every entry carries the measurement that put it here.
    expect(READ_BACK_NORMALISATIONS.length).toBeGreaterThan(0);
    for (const entry of READ_BACK_NORMALISATIONS) {
      expect(entry.name).not.toBe('');
      expect(entry.why).not.toBe('');
    }
  });

  it('strips the one line feed gh --jq puts on the end of its output', () => {
    // Measured on 2026-08-26 against a scratch issue: `gh api … --jq .body`
    // terminates its output with exactly one line feed whether or not the body
    // has one. This is the whole normalisation set.
    expect(normaliseReadBack('A body.\n')).toBe('A body.');
    expect(normaliseReadBack('A body.\n\n\n\n')).toBe('A body.\n\n\n');
    expect(normaliseReadBack('A body.')).toBe('A body.');
  });

  it('changes nothing else, because the server changed nothing else', () => {
    // ⚠️ **Measured, not assumed.** Carriage returns, lone `\r`, trailing
    // spaces, tabs, leading blank lines and a 2000-character line all came back
    // byte-identical from a real post. So after the strip above this is a byte
    // comparison, and any difference it reports is real.
    const awkward = 'A line.\r\n\r\n\tTabbed.   \rAnd a lone carriage return.';

    expect(normaliseReadBack(`${awkward}\n`)).toBe(awkward);
  });
});

describe('differenceOf — a mismatch reported in characters, never in lines', () => {
  it('says nothing when the two are the same', () => {
    expect(differenceOf('the same', 'the same')).toBeUndefined();
  });

  it('reports both sizes as character counts', () => {
    // ⚠️ **Failure mode 5, closed by construction.** `$posted.Length` in
    // PowerShell is a line count, and reporting `posted 14 chars / local 1984`
    // about two identical bodies is a verification step crying wolf — which
    // costs exactly what one that misses costs, and whose remedy is to re-post.
    const message = differenceOf('a'.repeat(1984), 'a'.repeat(14));

    expect(message).toContain('1984 characters');
    expect(message).toContain('14 characters');
    expect(message).not.toMatch(/\blines?\b/);
  });

  it('names the index of the first character that differs', () => {
    const message = differenceOf('abcdef', 'abcXef');

    expect(message).toContain('character 3');
  });

  it('shows both sides of the first difference, escaped so a newline is visible', () => {
    // A difference that is whitespace is invisible printed raw, and whitespace
    // is exactly what this tool exists to be exact about.
    const message = differenceOf('a\nb', 'a b');

    expect(message).toContain('\\n');
  });
});

describe('postAndVerify — post the transformed text, then prove it arrived', () => {
  const written: { text?: string } = {};
  const writeBody = (text: string): string => {
    written.text = text;
    return '/tmp/body.md';
  };

  it('posts the transformed text and reports a match', () => {
    const { calls, gh } = fakeGh([
      'https://github.com/mephistopheles4/stacks/issues/276',
      'A wrapped paragraph.\n',
    ]);

    const result = postAndVerify({ gh, writeBody }, ISSUE, { markdown: 'A wrapped\nparagraph.' });

    expect(written.text).toBe('A wrapped paragraph.');
    expect(result.matched).toBe(true);
    expect(result.difference).toBeUndefined();
    expect(calls[0]?.args[0]).toBe('issue');
    expect(calls[1]?.args).toEqual(readPlan({ kind: 'issue', number: 276 }));
  });

  it('compares against the transformed text and never against what was written', () => {
    // ⚠️ **The trap the ticket names explicitly.** Comparing the read-back to
    // the pre-transform prose would report a mismatch on every correctly
    // transformed body — mode 5's cry-wolf, reintroduced by its own fix.
    const { gh } = fakeGh([
      'https://github.com/mephistopheles4/stacks/issues/276',
      'A wrapped paragraph.\n',
    ]);

    const result = postAndVerify({ gh, writeBody }, ISSUE, { markdown: 'A wrapped\nparagraph.' });

    expect(result.matched).toBe(true);
    expect(result.posted).toBe('A wrapped paragraph.');
  });

  it('reports a mismatch when the body that came back is not the body that went out', () => {
    // Failure mode 1: `-f body=@reply.md` posts the literal string and returns
    // 200. Nothing but a read-back can see it.
    const { gh } = fakeGh(['https://github.com/mephistopheles4/stacks/issues/276', '@reply.md\n']);

    const result = postAndVerify({ gh, writeBody }, ISSUE, { markdown: 'A real body.' });

    expect(result.matched).toBe(false);
    expect(result.difference).toContain('characters');
  });

  it('sends the reply body as JSON on stdin for a review thread', () => {
    const { calls, gh } = fakeGh([JSON.stringify({ id: 42 }), 'A reply.\n']);

    const result = postAndVerify({ gh, writeBody }, REVIEW_REPLY, { markdown: 'A reply.' });

    expect(calls[0]?.input).toBe(JSON.stringify({ body: 'A reply.' }));
    expect(result.matched).toBe(true);
  });

  it('resolves links against the directory the prose was written in', () => {
    const { gh } = fakeGh([
      'https://github.com/mephistopheles4/stacks/issues/276',
      'See [ADR-0026](https://github.com/mephistopheles4/stacks/blob/main/docs/adr/0026-x.md).\n',
    ]);

    const result = postAndVerify({ gh, writeBody }, ISSUE, {
      markdown: 'See [ADR-0026](../adr/0026-x.md).',
      from: 'docs/agents',
    });

    expect(result.matched).toBe(true);
  });

  it('asks who is authenticated only when the surface has no other handle', () => {
    // One extra round trip, and only for the review surface, which prints no
    // id. Paying it on every post would be a call nobody needs.
    const { calls, gh } = fakeGh(['Reviewed #225', 'me', 'A review.\n']);

    postAndVerify(
      { gh, writeBody },
      { kind: 'pull-request-review', pullRequest: 225 },
      {
        markdown: 'A review.',
      },
    );

    expect(calls[1]?.args).toEqual(['api', 'user', '--jq', '.login']);
  });
});
