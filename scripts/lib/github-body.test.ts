/**
 * The transform that makes repository prose safe to post as a GitHub body.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`.
 *
 * ⚠️ **Nothing here may touch the network, `gh` or the filesystem.** The whole
 * point of the seam is that this half is text in and text out: G21
 * (`no-live-network`) is satisfied with no escape hatch, and the module stays
 * testable from a Stryker sandbox where the checkout is a copy.
 */

import { describe, expect, it } from 'vitest';
import { bodyForGitHub, REPO_WEB_ROOT } from './github-body.ts';

describe('bodyForGitHub — reflowing prose onto one line per paragraph', () => {
  it('joins a hard-wrapped paragraph into a single line', () => {
    // Failure mode 6. GitHub renders a single newline inside an issue body as
    // `<br>`, so every wrap this repository's house style produces becomes a
    // ragged break on screen — and the body still round-trips byte-identical,
    // which is why read-back cannot see it.
    const wrapped = ['A local-first reading tracker where the notes', 'vault IS the database.'];

    expect(bodyForGitHub(wrapped.join('\n'))).toBe(
      'A local-first reading tracker where the notes vault IS the database.',
    );
  });

  it('keeps two paragraphs two paragraphs', () => {
    const source = 'The first\nparagraph.\n\nThe second\nparagraph.';

    expect(bodyForGitHub(source)).toBe('The first paragraph.\n\nThe second paragraph.');
  });

  it('leaves a heading exactly as it found it', () => {
    const source = '## The failure modes\n\nProse under it\nwrapped at eighty.';

    expect(bodyForGitHub(source)).toBe('## The failure modes\n\nProse under it wrapped at eighty.');
  });

  it('never joins a heading onto the paragraph above it', () => {
    expect(bodyForGitHub('A paragraph.\n## A heading')).toBe('A paragraph.\n## A heading');
  });

  it('leaves every table row on its own line', () => {
    // A table joined into one line is not a table any more. Rows are the one
    // structure where the newline is the syntax.
    const table = ['| # | What happens |', '| --- | --- |', '| 1 | Posts the literal string |'];

    expect(bodyForGitHub(table.join('\n'))).toBe(table.join('\n'));
  });

  it('leaves a fenced block byte-identical, wrapped lines and all', () => {
    const source = ['```text', 'posted chars: 30', 'local chars: 1994', '', 'identical:', '```'];

    expect(bodyForGitHub(source.join('\n'))).toBe(source.join('\n'));
  });

  it('leaves a tilde fence alone too, and is not closed by a backtick one', () => {
    const source = ['~~~text', '```', 'still inside', '~~~'];

    expect(bodyForGitHub(source.join('\n'))).toBe(source.join('\n'));
  });

  it('joins a wrapped list item onto its own line and keeps the marker', () => {
    const source = ['- **Create an issue**: pass the body as a file,', '  never as an argument.'];

    expect(bodyForGitHub(source.join('\n'))).toBe(
      '- **Create an issue**: pass the body as a file, never as an argument.',
    );
  });

  it('keeps two list items two list items', () => {
    const source = ['- The first item', '- The second item'];

    expect(bodyForGitHub(source.join('\n'))).toBe(source.join('\n'));
  });

  it('keeps a nested list item nested', () => {
    // Indentation is the syntax here, so a continuation join would flatten the
    // tree. Only a line that is *not* itself an item may be joined.
    const source = ['- The parent', '  - The child', '    wrapped on'];

    expect(bodyForGitHub(source.join('\n'))).toBe('- The parent\n  - The child wrapped on');
  });

  it('joins a run of blockquote lines into one blockquote line', () => {
    const source = ['> Cap for a scope = the highest value observed', '> across the window.'];

    expect(bodyForGitHub(source.join('\n'))).toBe(
      '> Cap for a scope = the highest value observed across the window.',
    );
  });

  it('keeps two blockquote paragraphs apart', () => {
    const source = ['> The first quoted line.', '>', '> The second.'];

    expect(bodyForGitHub(source.join('\n'))).toBe('> The first quoted line.\n>\n> The second.');
  });

  it('keeps the indent of a paragraph that continues a list item', () => {
    // ⚠️ Indentation is what keeps this paragraph *inside* the list item. A
    // fenced block ends the run, so the paragraph after one starts a fresh run
    // — and trimming its first line would quietly promote it to a top-level
    // paragraph. Found by dry-running the real `issue-tracker.md`.
    const source = [
      '- An item:',
      '',
      '  ```sh',
      '  gh issue view 220',
      '  ```',
      '',
      '  Both halves',
      '  are load-bearing.',
    ];

    expect(bodyForGitHub(source.join('\n'))).toBe(
      [
        '- An item:',
        '',
        '  ```sh',
        '  gh issue view 220',
        '  ```',
        '',
        '  Both halves are load-bearing.',
      ].join('\n'),
    );
  });

  it('leaves an indented code block alone when no list run is open', () => {
    const source = ['A paragraph.', '', '    const posted = read();', '    compare(posted);'];

    expect(bodyForGitHub(source.join('\n'))).toBe(source.join('\n'));
  });

  it('reads CRLF and writes LF', () => {
    // A body authored on Windows must not post its carriage returns; the
    // comparison would then be measuring the editor rather than the transform.
    expect(bodyForGitHub('A paragraph\r\nwrapped.\r\n\r\n## Next')).toBe(
      'A paragraph wrapped.\n\n## Next',
    );
  });

  it('is idempotent, so a transformed body may be transformed again', () => {
    // The comparison compares against the transformed text. If the transform
    // moved on a second pass, re-posting an already-safe body would drift.
    const source = ['A wrapped', 'paragraph with [a link](docs/gates.md).', '', '- An item'];
    const once = bodyForGitHub(source.join('\n'));

    expect(bodyForGitHub(once)).toBe(once);
  });
});

describe('bodyForGitHub — repository-relative links become absolute', () => {
  it('absolutises a link that is relative to the repository root', () => {
    expect(bodyForGitHub('See [the gates](docs/gates.md).')).toBe(
      `See [the gates](${REPO_WEB_ROOT}/blob/main/docs/gates.md).`,
    );
  });

  it('resolves a link relative to the file it was written in', () => {
    // `docs/agents/issue-tracker.md` links to the ADR as `../adr/0026-...`,
    // which is correct in the file and dead in a GitHub body.
    const posted = bodyForGitHub(
      '[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)',
      {
        from: 'docs/agents',
      },
    );

    expect(posted).toBe(
      `[ADR-0026](${REPO_WEB_ROOT}/blob/main/docs/adr/0026-constitution-is-gated-not-duplicated.md)`,
    );
  });

  it('keeps the anchor on the end', () => {
    expect(bodyForGitHub('[working rules](AGENTS.md#working-rules-for-agents)')).toBe(
      `[working rules](${REPO_WEB_ROOT}/blob/main/AGENTS.md#working-rules-for-agents)`,
    );
  });

  it('points a directory at tree/ and a file at blob/', () => {
    expect(bodyForGitHub('[the records](docs/adr/)')).toBe(
      `[the records](${REPO_WEB_ROOT}/tree/main/docs/adr/)`,
    );
  });

  it('points an image at raw/, because blob/ serves a page and not the bytes', () => {
    expect(bodyForGitHub('![the shelf](artifacts/shelf.png)')).toBe(
      `![the shelf](${REPO_WEB_ROOT}/raw/main/artifacts/shelf.png)`,
    );
  });

  it('repairs the ../blob/main/ shape rather than resolving it', () => {
    // The shape this repository produced by hand: a relative path that already
    // carries `blob/main`, which resolves to nothing and 404s.
    expect(bodyForGitHub('[crfix](../blob/main/.claude/commands/crfix.md)')).toBe(
      `[crfix](${REPO_WEB_ROOT}/blob/main/.claude/commands/crfix.md)`,
    );
  });

  it('leaves an absolute URL, an anchor and a mailto alone', () => {
    const source = [
      '[an issue](https://github.com/mephistopheles4/stacks/issues/220)',
      '[a section](#the-shape)',
      '[write in](mailto:nobody@example.com)',
    ].join('\n\n');

    expect(bodyForGitHub(source)).toBe(source);
  });

  it('rewrites a reference definition too', () => {
    expect(bodyForGitHub('[gates]: docs/gates.md')).toBe(
      `[gates]: ${REPO_WEB_ROOT}/blob/main/docs/gates.md`,
    );
  });

  it('leaves a target it cannot resolve exactly as it found it', () => {
    // `..` from the repository root escapes the repository. Inventing a URL
    // for it would be worse than leaving a link the reader can see is wrong.
    expect(bodyForGitHub('[somewhere](../outside/thing.md)')).toBe(
      '[somewhere](../outside/thing.md)',
    );
  });
});

describe('bodyForGitHub — code is not prose and is never rewritten', () => {
  it('leaves a path inside an inline code span alone', () => {
    // ⚠️ **The required first fixture.** A throwaway script doing this reflow
    // rewrote the *example* in the paragraph explaining the rule, turning
    // "`../blob/main/x` is broken, use the full URL" into "the full URL is
    // broken, use the full URL". A transform that silently edits prose *about*
    // the thing it fixes is its own silent failure mode.
    const source =
      'A link target beginning `../blob/main/` is dead and needs the full\n' +
      '`https://github.com/<owner>/<repo>/blob/main/...` URL.';

    expect(bodyForGitHub(source)).toBe(
      'A link target beginning `../blob/main/` is dead and needs the full ' +
        '`https://github.com/<owner>/<repo>/blob/main/...` URL.',
    );
  });

  it('leaves a markdown link written inside a code span alone', () => {
    expect(bodyForGitHub('Write `[the gates](docs/gates.md)` in a file.')).toBe(
      'Write `[the gates](docs/gates.md)` in a file.',
    );
  });

  it('rewrites a link whose label is itself a code span', () => {
    // ⚠️ **The shape this repository writes constantly**, and the one a
    // span-splitting transform silently misses: the backticks are in the label,
    // so a rewrite that skipped whole segments holding a span never saw the
    // target beside it. Found by dry-running the real `issue-tracker.md`, where
    // two of its three relative links have this shape.
    expect(
      bodyForGitHub('see [`CONTRIBUTING.md`](../../CONTRIBUTING.md)', { from: 'docs/agents' }),
    ).toBe(`see [\`CONTRIBUTING.md\`](${REPO_WEB_ROOT}/blob/main/CONTRIBUTING.md)`);
  });

  it('rewrites the prose either side of a code span in the same line', () => {
    // The skip must be the span and not the line, or one code span disarms the
    // whole paragraph.
    expect(bodyForGitHub('Before `docs/gates.md` and [after](docs/gates.md).')).toBe(
      `Before \`docs/gates.md\` and [after](${REPO_WEB_ROOT}/blob/main/docs/gates.md).`,
    );
  });

  it('leaves a link inside a fenced block alone', () => {
    const source = ['```md', '[the gates](docs/gates.md)', '```'].join('\n');

    expect(bodyForGitHub(source)).toBe(source);
  });

  it('honours a double-backtick span holding a backtick', () => {
    expect(bodyForGitHub('Write ``a ` and docs/gates.md`` there.')).toBe(
      'Write ``a ` and docs/gates.md`` there.',
    );
  });

  it('survives the whole document that describes the rule', () => {
    // The fixture the ticket asks for, end to end: a document explaining the
    // relative-link rule must survive the tool that enforces it. Every code
    // span below is an example of a wrong link, and every one of them has to
    // come out byte-identical while the real link beside it is repaired.
    const source = [
      '## Two conventions, opposite on purpose',
      '',
      'Files under `docs/` render as standard Markdown, where a single newline',
      'is a soft wrap. Issue bodies render as GFM with hard line breaks, so each',
      'paragraph must be one long line.',
      '',
      'A link target beginning `../blob/main/` is dead in a body and needs the',
      'full `https://github.com/<owner>/<repo>/blob/main/...` URL — while inside',
      'a repository file the relative form is the correct one. See',
      '[ADR-0026](docs/adr/0026-constitution-is-gated-not-duplicated.md).',
      '',
      '```sh',
      'gh issue create --title "..." --body-file body.md',
      '```',
    ].join('\n');

    expect(bodyForGitHub(source)).toBe(
      [
        '## Two conventions, opposite on purpose',
        '',
        'Files under `docs/` render as standard Markdown, where a single newline is a soft wrap. Issue bodies render as GFM with hard line breaks, so each paragraph must be one long line.',
        '',
        `A link target beginning \`../blob/main/\` is dead in a body and needs the full \`https://github.com/<owner>/<repo>/blob/main/...\` URL — while inside a repository file the relative form is the correct one. See [ADR-0026](${REPO_WEB_ROOT}/blob/main/docs/adr/0026-constitution-is-gated-not-duplicated.md).`,
        '',
        '```sh',
        'gh issue create --title "..." --body-file body.md',
        '```',
      ].join('\n'),
    );
  });
});
