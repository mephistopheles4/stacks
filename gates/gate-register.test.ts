/**
 * G41 — `docs/gates.md`'s numbered rows ↔ `docs/gate-register.md`'s row sections.
 *
 * The register is a standalone document, which is *a second copy of the row
 * list with nothing holding it to the first* unless something holds it. This is
 * that something: **no row without an entry, no entry without a row.**
 *
 * ## Cardinality, not membership — because membership was the failure
 *
 * *"All five categories named"* is satisfied by one merged
 * `**Vacuous green / decay**` bullet, and *"each row has an entry"* is
 * satisfied by a file carrying **two** `## G26` sections. **Both are a claim
 * nothing can fail on, inside the register of claims nothing can fail on.** So
 * every clause below counts rather than asks.
 *
 * ## The exemption list, and why it names ten rows and not one
 *
 * ⚠️ **`docs/spec/gaming-analysis.md` §2 specifies one exemption — G26's merged
 * bullet — and the file has ten.** §4 of that same spec already records it:
 * *"ten rows collapsing five verdicts into one line."* Measured at `3e2fc88`
 * (2026-08-20): G12, G17, G20, G21, G22, G23, G24, G25, G26 and G34 each carry
 * one merged verdict bullet, and the other 27 entries carry five separate ones.
 * So the spec is internally inconsistent, and it is a **category-5 specimen
 * inside the spec** — a load-bearing claim about the file, one `grep` away,
 * asserted from a prior reading.
 *
 * **Exempting only G26 would land this gate red on nine rows**, which is
 * *weakening a gate to make it pass* at the worst possible address, or else
 * rewriting nine band-authored verdicts that §1 says are *"marked in place, not
 * split"*. **The list is widened to what the file actually holds and closed
 * there**: every entry names its row and the exact bullet, in the `gates/`
 * allowlist idiom, and **every one is reverse-asserted** — remove a merged
 * bullet and its exemption goes red, so no entry can outlive the row it exists
 * for. G1's register entry is why: *"the reverse-assert catching both a stale
 * entry and a dropped one on the same change."* **A new entry that merges two
 * verdicts goes red**, which is the whole point of closing the list.
 *
 * ## What this gate asserts about dispositions, and what it does not
 *
 * ⚠️ **The spec says *exactly one* disposition per entry; the file says
 * otherwise, 19 times.** Ten triage-only rows carry none because triage found
 * nothing to flag; two say in terms that their nomination did not survive
 * (G21, G34); two rollout rows disposition inline in their bullets (G36, G38);
 * and four carry two because a band and a later decay re-read each reached one
 * (G1, G6, G13, G35). **Asserting the false stronger claim would be the failure,
 * not the fix.** What is asserted is the closed vocabulary — the plant
 * `gaming-analysis.md` §8 actually names — so a fifth disposition cannot arrive
 * by being written down. ⚠️ **Stated as a limit rather than left implicit: an
 * entry with no disposition passes this gate.**
 *
 * ⚠️ **And the limit the spec states about itself: this gate asserts shape and
 * says nothing about quality.** Whether the analysis inside an entry is any
 * good is outside it — the same relationship G19 has to slugs.
 *
 * ## The floor is on the row side only, at 42
 *
 * ⚠️ **The two sides are not symmetric.** *No entry without a row* already
 * reddens on any deletion, so entries cannot go vacuous. The **row** side can:
 * if the regex over `docs/gates.md` stops matching, both directions pass over
 * nothing. And on **top-row deletion the floor is the only structural check in
 * the file**, because G19's gapless walk bounds at `n < numbers.at(-1)`,
 * exclusive of the maximum.
 *
 * ⚠️ **42 is the population at this row's own landing commit, and *a floor
 * equal to a population* is precisely the shape that went wrong in the
 * supply-chain piece.** It is safe here **only** under the monotonicity
 * argument — mark-never-delete plus gapless makes the row count non-decreasing
 * in normal operation. **A session copying the pattern without that argument
 * copies the mistake.** (The spec calls 42 *"the population after this spec
 * lands"*; under the numbering that actually landed the rollout ends at 43, and
 * 42 is right for the other reason. Recorded rather than silently corrected.)
 *
 * An **entry-side floor was declined**: it would go red *alongside* the first
 * missing entry, landing two reds on the commit whose entire job is
 * demonstrating one.
 *
 * See docs/gates.md, row G41 (gate-register), and
 * docs/spec/gaming-analysis.md §§2-3.
 */

import { describe, expect, it } from 'vitest';
import { expectFound, readRepoFile, sectionsOf } from './repo.ts';

const SCOREBOARD = 'docs/gates.md';
const REGISTER = 'docs/gate-register.md';

/** The five categories, spelled as the register's verdict bullets spell them. */
const CATEGORIES = [
  'weakening',
  'satisfying the letter',
  'routing around',
  'vacuous green',
  'decay',
] as const;

/** `gated` / `repaired` / `accepted` / `declined`. There is no fifth. */
const DISPOSITIONS = ['gated', 'repaired', 'accepted', 'declined'] as const;

/**
 * The merged verdict bullets the register already contains, each named with its
 * row and its exact lead-in.
 *
 * **A closed list, reverse-asserted in both directions**: a row here that no
 * longer carries its merged bullet goes red as a stale permission, and a merged
 * bullet on any row *not* here goes red as a new one. G13's lesson is why each
 * entry names a **bullet** rather than a row — *"a directory is a standing
 * permission, where every other line here names a file."*
 */
const MERGED_BULLETS: readonly { row: string; lead: string }[] = [
  { row: 'G12', lead: 'Weakening / satisfying the letter / routing around / vacuous green' },
  { row: 'G17', lead: 'Satisfying the letter / vacuous green' },
  { row: 'G20', lead: 'Satisfying the letter / vacuous green' },
  { row: 'G21', lead: 'Satisfying the letter / vacuous green' },
  { row: 'G22', lead: 'Satisfying the letter / vacuous green' },
  { row: 'G23', lead: 'Satisfying the letter / vacuous green' },
  { row: 'G24', lead: 'Weakening / satisfying the letter / routing around / vacuous green' },
  { row: 'G25', lead: 'Satisfying the letter / vacuous green' },
  { row: 'G26', lead: 'Vacuous green / decay' },
  { row: 'G34', lead: 'Weakening / satisfying the letter / routing around / vacuous green' },
];

interface Entry {
  readonly row: string;
  readonly slug: string;
  readonly body: string;
}

/**
 * Every `### G<n> — \`slug\`` section of the register.
 *
 * Returned as a list rather than a map **on purpose**: a map would silently
 * collapse a duplicate section, which is one of the two failures this gate
 * exists for.
 */
/**
 * The one heading shape an entry may take.
 *
 * Written once and used twice — by the sweep that reads entries, and by the
 * near-miss check that refuses everything else. **Two patterns would be two
 * definitions of "an entry", and the gap between them is the hole.**
 */
const ENTRY_HEADING = /^### (G\d+) — `([^`]+)`[^\n]*$/;

function entries(): Entry[] {
  return sectionsOf(readRepoFile(REGISTER), new RegExp(ENTRY_HEADING.source, 'gm')).map((section) => ({
    row: section.captures[0] ?? '',
    slug: section.captures[1] ?? '',
    body: section.body,
  }));
}

/** Every numbered row of the scoreboard, in file order. */
function scoreboardRows(): { row: string; slug: string }[] {
  return [...readRepoFile(SCOREBOARD).matchAll(/^\| \*\*(G\d+)\*\* \| `([^`]+)`/gm)].map(
    (match) => ({ row: match[1] ?? '', slug: match[2] ?? '' }),
  );
}

/**
 * The verdict bullets of one entry — the triage layer, above `**Rank:**`.
 *
 * Bounded there rather than run over the whole section because a Deep pass
 * block discusses categories in prose and in further bullets, and counting
 * those would make the cardinality rule assert something nobody wrote.
 */
function verdictLeads(entry: Entry): string[] {
  const triage = entry.body.split(/^\*\*Rank:\*\*/m)[0] ?? '';
  return [...triage.matchAll(/^- \*\*(.+?)\*\*/gm)]
    .map((match) => (match[1] ?? '').trim())
    .filter((lead) => CATEGORIES.some((category) => lead.toLowerCase().includes(category)));
}

/** The categories one bullet's lead-in names. */
function categoriesIn(lead: string): string[] {
  return CATEGORIES.filter((category) => lead.toLowerCase().includes(category));
}

describe('G41 — the two documents are read, and neither read is empty', () => {
  it('finds the rows and the entries', () => {
    // Row side only, and 42 is the population at this row's landing commit —
    // safe solely under mark-never-delete plus gapless making the count
    // non-decreasing. On top-row deletion this is the only structural check in
    // the file: G19's gapless walk is exclusive of the maximum.
    expectFound(scoreboardRows(), `numbered rows in ${SCOREBOARD}`, 42);
    expectFound(entries(), `row sections in ${REGISTER}`, 1);
  });

  it('has no row section written in a heading form this gate cannot see', () => {
    // G29's honest limit, closed rather than inherited: its link finder reads
    // one link form and states that a form nobody writes is a form it does not
    // see. Here the equivalent would read to a human as a real entry and be
    // invisible to the sweep above, so **every heading naming a row that is not
    // exactly `ENTRY_HEADING` is refused** — the wrong level (`## G40`), and
    // also the right level in the wrong format (`### G40 — action-pins`, no
    // backticks).
    //
    // ⚠️ **The backtick case was the hole, found in review.** This check was
    // written against heading *level* alone while its own comment claimed the
    // near-miss forms were refused outright — a docblock whose stated reach
    // exceeded the assertion's, which is the failure this whole register
    // catalogues, arriving in the gate that catalogues it. Both directions now
    // key off one pattern, so the two cannot drift apart again.
    const strays = [...readRepoFile(REGISTER).matchAll(/^#{1,6} (G\d+)\b[^\n]*$/gm)]
      .map((match) => match[0])
      .filter((heading) => !ENTRY_HEADING.test(heading));

    expect(
      strays,
      'register headings naming a row in a form the correspondence sweep cannot read. ' +
        'It reads ``### G<n> — `slug` `` and nothing else, so each of these is an entry ' +
        `a human sees and no gate does: ${strays.join('; ')}`,
    ).toEqual([]);
  });
});

describe('G41 — correspondence, in both directions and by count', () => {
  it('gives every row exactly one register entry', () => {
    const counts = new Map<string, number>();
    for (const entry of entries()) counts.set(entry.row, (counts.get(entry.row) ?? 0) + 1);

    const wrong = scoreboardRows()
      .map(({ row }) => ({ row, count: counts.get(row) ?? 0 }))
      .filter(({ count }) => count !== 1)
      .map(({ row, count }) => `${row} has ${count} entries`);

    expect(
      wrong,
      `rows of ${SCOREBOARD} without exactly one \`### \` section in ${REGISTER}. ` +
        'A row with none is a gate whose five questions nobody asked; a row with two is ' +
        `a correspondence check satisfied by a duplicate: ${wrong.join('; ')}`,
    ).toEqual([]);
  });

  it('gives every register entry a row', () => {
    const rows = new Set(scoreboardRows().map(({ row }) => row));
    const orphans = entries()
      .filter((entry) => !rows.has(entry.row))
      .map((entry) => `${entry.row} (${entry.slug})`);

    expect(
      orphans,
      `sections in ${REGISTER} naming a row that ${SCOREBOARD} does not carry. Either ` +
        `the row was retired without marking, or the entry names a number that never ` +
        `landed: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('names each row by the slug the scoreboard gives it', () => {
    // The second copy ADR-0026 objects to, held to the first. G19 already keeps
    // a row's slug anchored to its spec stem; this keeps the register anchored
    // to the row.
    const slugs = new Map(scoreboardRows().map(({ row, slug }) => [row, slug]));
    const wrong = entries()
      .filter((entry) => slugs.has(entry.row) && slugs.get(entry.row) !== entry.slug)
      .map((entry) => `${entry.row} is "${slugs.get(entry.row)}", entered as "${entry.slug}"`);

    expect(
      wrong,
      `register entries naming a row by a slug it no longer has: ${wrong.join('; ')}`,
    ).toEqual([]);
  });
});

describe('G41 — every entry carries the five verdicts, one bullet each', () => {
  it('names all five categories exactly once per entry', () => {
    const wrong: string[] = [];

    for (const entry of entries()) {
      const named = verdictLeads(entry).flatMap(categoriesIn);
      const missing = CATEGORIES.filter((category) => !named.includes(category));
      const twice = CATEGORIES.filter(
        (category) => named.filter((one) => one === category).length > 1,
      );
      if (missing.length) wrong.push(`${entry.row} names no ${missing.join(', ')} verdict`);
      if (twice.length) wrong.push(`${entry.row} names ${twice.join(', ')} more than once`);
    }

    expect(
      wrong,
      `register entries whose five category verdicts are not each named once: ${wrong.join('; ')}`,
    ).toEqual([]);
  });

  it('merges two verdicts into one bullet only where the list says so', () => {
    const allowed = new Set(MERGED_BULLETS.map(({ row, lead }) => `${row}|${lead}`));
    const unlisted: string[] = [];

    for (const entry of entries()) {
      for (const lead of verdictLeads(entry)) {
        if (categoriesIn(lead).length > 1 && !allowed.has(`${entry.row}|${lead}`)) {
          unlisted.push(`${entry.row}: "${lead}"`);
        }
      }
    }

    expect(
      unlisted,
      'verdict bullets naming more than one category, on a row the exemption list does ' +
        'not name. A mechanical count keyed on one category word misses a merged bullet ' +
        'and reports a total that is silently one short, which is why the list is ' +
        `closed: ${unlisted.join('; ')}`,
    ).toEqual([]);
  });

  it('keeps no exemption that has outlived its bullet', () => {
    // The reverse assertion. An allowlist entry is a permission, and a
    // permission nobody revisits is the category-1 failure this register
    // catalogues — so split G26's merged bullet, or any of the other nine, and
    // the exemption for it goes red rather than sitting there granting nothing.
    const present = new Set(
      entries().flatMap((entry) => verdictLeads(entry).map((lead) => `${entry.row}|${lead}`)),
    );
    const stale = MERGED_BULLETS.filter(
      ({ row, lead }) => !present.has(`${row}|${lead}`),
    ).map(({ row, lead }) => `${row}: "${lead}"`);

    expect(
      stale,
      'exemptions naming a merged verdict bullet the register no longer carries. The ' +
        'entry is now a standing permission for a shape nobody writes — delete it: ' +
        `${stale.join('; ')}`,
    ).toEqual([]);
  });
});

describe('G41 — every entry carries its evidence fields', () => {
  it('carries exactly one `**Gate:**` and one `**Date:**`', () => {
    const wrong: string[] = [];

    for (const entry of entries()) {
      const gates = [...entry.body.matchAll(/^\*\*Gate:\*\*/gm)].length;
      const dates = [...entry.body.matchAll(/^\*\*Date:\*\* *(\d{4}-\d{2}-\d{2})\s*$/gm)].length;
      if (gates !== 1) wrong.push(`${entry.row} has ${gates} \`**Gate:**\` lines`);
      if (dates !== 1) wrong.push(`${entry.row} has ${dates} ISO \`**Date:**\` lines`);
    }

    expect(
      wrong,
      `register entries without exactly one Gate line and one ISO date: ${wrong.join('; ')}`,
    ).toEqual([]);
  });

  it('carries an observed-red line on every entry', () => {
    // `CONTRIBUTING.md`'s oldest rule — *a gate never observed failing is not
    // yet a gate* — has been enforced until now by the author remembering to
    // write a sentence. This is the first structure that can require it.
    const missing = entries()
      .filter((entry) => !/\*\*Observed[- ]red/i.test(entry.body))
      .map((entry) => `${entry.row} (${entry.slug})`);

    expect(
      missing,
      'register entries with no `**Observed-red**` line. A gate never observed failing ' +
        `is not yet a gate: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('uses no disposition outside the four-word vocabulary', () => {
    // A fifth "documented" disposition was floated and refused: by this repo's
    // own constitution that is not a closure, since *a rule nothing can fail on
    // is a comment*. A finding closed by writing a rule down is an `accepted`
    // finding wearing a closure's clothes.
    const wrong: string[] = [];

    for (const entry of entries()) {
      // ⚠️ **The colon is optional, and that was a live hole rather than a
      // nicety.** The file writes this field three ways: `disposition:
      // \`repaired\`` mid-sentence (29 times), `**Disposition: \`accepted\`**`
      // as a field, and — at one address — `Disposition \`gated\`.` **with no
      // colon at all**. A pattern requiring the colon read the first two and
      // was blind to the third, so a fifth disposition written in that form
      // passed green **on the only assertion that survived the retreat from
      // "exactly one disposition per entry"**. Found in review.
      //
      // Deliberately *not* widened to "a vocabulary word near the word
      // disposition": the file legitimately discusses these words in prose —
      // *"dispositioned \`gated\`"*, *"the disposition it would take is
      // \`gated\`"* — and matching those is the prose-matching failure
      // `docs/gates.md` records three separate times. `:? +` reaches both field
      // spellings and no sentence.
      for (const match of entry.body.matchAll(/\bdisposition:? +`(\w+)`/gi)) {
        const word = match[1] ?? '';
        if (!DISPOSITIONS.includes(word as (typeof DISPOSITIONS)[number])) {
          wrong.push(`${entry.row}: \`${word}\``);
        }
      }
    }

    expect(
      wrong,
      `dispositions outside \`${DISPOSITIONS.join('` / `')}\`. There is no fifth: ` +
        `${wrong.join('; ')}`,
    ).toEqual([]);
  });
});
