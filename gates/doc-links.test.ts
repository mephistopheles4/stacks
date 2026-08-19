/**
 * G29 — a documented link points at something that exists.
 *
 * This repo's documentation is a graph, not a pile: `AGENTS.md` routes a cold
 * session to five files, every ADR links back to `gates.md`, and `gates.md`
 * links out to the specs it scores. **Nothing checked that any of those links
 * resolved.** G19 asserts that spec paths named in scoreboard *rows* exist, and
 * that is the only link-shaped claim in the repo that could go red.
 *
 * Written for the split of `docs/progress.md` into `docs/log/`, which moves
 * ~1400 lines across 17 new files. That change is exactly the kind this repo
 * has no defence against: a link that silently stops resolving is a documented
 * claim that has quietly become false, which is the failure `docs/gates.md`
 * opens by listing six instances of.
 *
 * **Local links only — no network.** G21 forbids a test touching the internet,
 * so `http(s):` and `mailto:` targets are skipped rather than fetched. A link
 * checker that reached out would be both a G21 violation and flaky, and the
 * failure this gate exists for is a *moved file*, which is entirely local.
 *
 * See docs/gates.md, row G29 (doc-links).
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expectFound, readRepoFile, REPO_ROOT, trackedFiles } from './repo.ts';

/** One `[text](target)` occurrence, with enough context to name it in a failure. */
interface DocLink {
  /** The file the link was written in. */
  from: string;
  /** The raw target, fragment included. */
  target: string;
  line: number;
}

/**
 * Code blanked out — fenced blocks first, then inline spans — so a link written
 * *about* link syntax is not read as a claim about this repo.
 *
 * Both halves were earned. `docs/research/splitting-the-long-docs.md` sketches
 * a `docs/log/…` tree inside a fence before those files exist; the same file
 * describes the extraction this gate performs as ``` `](./x.md)` ```, in inline
 * code, and the first version of this gate went red on it — correctly by its
 * own rules and wrongly in substance. Prose quoting a path is not a route to
 * it, and a gate that cannot tell the difference makes documenting itself an
 * error.
 *
 * Lines are preserved so a failure still reports the right number, the same
 * reason `codeOf` in `gates/repo.ts` blanks rather than deletes.
 */
function withoutCode(source: string): string {
  return source
    .replace(/^```[\s\S]*?^```/gm, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(`+)[^\n]*?\1/g, (match) => match.replace(/[^\n]/g, ' '));
}

/**
 * Every local markdown link and image in the tracked `.md` files.
 *
 * Deliberately *not* a Markdown parser. It reads inline `](target)` links,
 * which is the only link form this repo actually uses — checked by counting:
 * there are no reference-style definitions and no autolinks to local files.
 * The honest limit is that a form nobody writes here is a form this does not
 * see, which is why the count is asserted below.
 */
function docLinks(): DocLink[] {
  const found: DocLink[] = [];

  for (const path of trackedFiles().filter((file) => file.endsWith('.md'))) {
    const lines = withoutCode(readRepoFile(path)).split('\n');

    lines.forEach((text, index) => {
      for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1];
        if (target === undefined) continue;
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        found.push({ from: path, target, line: index + 1 });
      }
    });
  }

  return found;
}

/** The repo-relative path a link resolves to, fragment stripped. */
function resolveTarget(link: DocLink): string {
  const [pathPart = ''] = link.target.split('#');
  const decoded = decodeURIComponent(pathPart);
  const base = dirname(join(REPO_ROOT, link.from));
  return resolve(base, decoded);
}

/**
 * A heading's GitHub anchor: lowercased, Markdown stripped, punctuation
 * dropped, spaces to hyphens.
 *
 * Approximate by construction, and safe in the direction that matters — this
 * repo's headings carry backticks, arrows and inline links (`## Invariants →
 * gates`, `## The probes became a tuning panel — map [#39](…)`), and any of
 * those getting slugified slightly differently would produce a *false red*
 * rather than a false green. That is the correct way round for a gate, and it
 * is why the fragment check is scoped to fragments somebody actually wrote.
 */
function anchorsOf(source: string): Set<string> {
  const anchors = new Set<string>();

  for (const match of source.matchAll(/^#{1,6} +(.+?)\s*$/gm)) {
    const heading = (match[1] ?? '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their text
      .replace(/[`*_~]/g, '')
      .trim();

    anchors.add(
      heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .trim()
        .replace(/ +/g, '-'),
    );
  }

  return anchors;
}

describe('G29 — every documented link resolves', () => {
  it('finds enough links to be checking anything', () => {
    // The vacuity guard. A regex that stops matching returns an empty set, and
    // an empty set trivially satisfies "every link resolves" — the defect
    // docs/gates.md logs under G14, G19 and G22.
    //
    // The floor sits just under the real count rather than at a round number an
    // order of magnitude below it: left far below, most of the corpus could
    // stop being checked without anything going red, which is the same vacuity
    // this assertion exists to prevent, one level up. So it is raised as the
    // corpus grows — it stood at 180 while `docs/spec/` was a fraction of its
    // size, which by the sentence above is a floor that had stopped doing its
    // job. It is a floor and not an exact count on purpose — docs/gates.md
    // records what happened to the prose that tried to carry the exact numbers.
    expectFound(docLinks(), 'local links in tracked Markdown', 500);
  });

  it('points every link at a file that exists', () => {
    const broken = docLinks()
      .filter((link) => !existsSync(resolveTarget(link)))
      .map((link) => `${link.from}:${link.line} → ${link.target}`);

    expect(
      broken,
      'links whose target does not exist. A document that links to a moved file ' +
        `reads as a route and is a dead end:\n  ${broken.join('\n  ')}`,
    ).toEqual([]);
  });

  it('points every fragment at a heading that exists', () => {
    // This half was written against an empty corpus and proven by mutation
    // alone: for a while no link in the repo carried a fragment at all. The
    // future it was written for arrived — `docs/spec/` cross-references its own
    // sections by anchor, and `docs/plan.md` routes into `issue-tracker.md` the
    // same way — so it is now exercised by real links as well as by mutation.
    //
    // Which is exactly why it needs the floor the file-existence half already
    // has. "Every fragment resolves" is trivially true of no fragments, so a
    // corpus that quietly went back to zero — or an extraction that stopped
    // seeing `#` — would read as green. The floor sits just under the real
    // count, and links only ever get added, so it moves up and never down.
    const fragments = expectFound(
      docLinks().filter((link) => link.target.includes('#')),
      'fragment-carrying local links',
      40,
    );

    const broken = fragments
      .filter((link) => {
        const target = resolveTarget(link);
        if (!target.endsWith('.md') || !existsSync(target)) return false;
        const fragment = decodeURIComponent(link.target.split('#')[1] ?? '');
        return !anchorsOf(readFileSync(target, 'utf8')).has(fragment.toLowerCase());
      })
      .map((link) => `${link.from}:${link.line} → ${link.target}`);

    expect(
      broken,
      `links whose #fragment names no heading in the target:\n  ${broken.join('\n  ')}`,
    ).toEqual([]);
  });
});
