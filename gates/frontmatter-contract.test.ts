/**
 * G8 — frontmatter contract ↔ parser ↔ CLAUDE.md.
 *
 * CLAUDE.md heads that section "do not change without updating this file", and
 * `shelf_order` was nevertheless added to the parser, and described in the prose
 * underneath, without ever reaching the documented key list. Prose is not the
 * contract; the enumeration is, and this gate holds the two together.
 *
 * Three assertions, because two of them alone would be gameable:
 *   1. the documented enumeration equals FRONTMATTER_CONTRACT;
 *   2. every key in FRONTMATTER_CONTRACT is genuinely read, into the field it
 *      names — otherwise the constant is just a fourth place to drift;
 *   3. a key outside the contract still parses and is still ignored, which is
 *      invariant 5 and must not be broken by tightening the other two.
 *
 * See docs/gates.md, row G8.
 */

import { describe, expect, it } from 'vitest';
import { FRONTMATTER_CONTRACT, parseNote } from '../packages/core/src/frontmatter.ts';
import type { BookRecord } from '../packages/core/src/types.ts';
import { expectFound, readRepoFile } from './repo.ts';

type ContractKey = keyof typeof FRONTMATTER_CONTRACT;

const CONTRACT_KEYS = Object.keys(FRONTMATTER_CONTRACT) as ContractKey[];

/**
 * These two always have a value on a parsed book — `status` falls back to a
 * default and `tags` to an empty list — so "absent means undefined" cannot hold
 * for them. Every other optional key must vanish when its line does.
 */
const ALWAYS_PRESENT = new Set<string>(['status', 'tags']);

/** The `Required: … Optional: …` sentence, which is the contract proper. The
 *  paragraphs under it are commentary and mention keys in passing. */
function documentedKeys(): string[] {
  const claudeMd = readRepoFile('CLAUDE.md');
  const section = /^## Frontmatter contract[^\n]*\n([\s\S]*?)(?=\n## )/m.exec(claudeMd)?.[1];
  if (section === undefined) throw new Error('no "## Frontmatter contract" section in CLAUDE.md');

  const enumeration = section.split('\n').find((line) => line.startsWith('Required:'));
  if (enumeration === undefined) {
    throw new Error('no line starting "Required:" in the Frontmatter contract section');
  }

  // Each documented key is backticked; `type: book` carries its value with it.
  const keys = [...enumeration.matchAll(/`([^`]+)`/g)]
    .map((match) => (match[1] ?? '').split(':')[0]?.trim() ?? '')
    .filter((key) => key.length > 0);

  return [...new Set(keys)].sort();
}

function noteWith(lines: readonly string[]): string {
  return `---\n${lines.join('\n')}\n---\n\nA note body, which must never be parsed.\n`;
}

describe('G8 — frontmatter contract', () => {
  it('extracts a plausible number of documented keys', () => {
    // If the section were reworded, the regex above would quietly find nothing
    // and every set comparison below would pass over two empty sets.
    expectFound(documentedKeys(), 'documented frontmatter keys', 10);
  });

  it('documents exactly the keys the contract defines', () => {
    expect(documentedKeys()).toEqual([...CONTRACT_KEYS].sort());
  });

  it('reads every contract key into the field it names', () => {
    for (const key of CONTRACT_KEYS) {
      const entry = FRONTMATTER_CONTRACT[key];
      const lines = ['type: book', 'title: A Sample Title'];
      if (key !== 'type' && key !== 'title') lines.push(`${key}: ${entry.sample}`);

      const parsed = parseNote(noteWith(lines), `${key}.md`);
      expect(parsed.kind, `\`${key}: ${entry.sample}\` should parse as a book`).toBe('book');
      if (parsed.kind !== 'book' || entry.field === null) continue;

      expect(
        parsed.record[entry.field as keyof BookRecord],
        `\`${key}\` is in the contract but did not reach record.${String(entry.field)}`,
      ).toBeDefined();
    }
  });

  it('leaves an optional field undefined when its key is absent', () => {
    const bare = parseNote(noteWith(['type: book', 'title: A Sample Title']), 'bare.md');
    expect(bare.kind).toBe('book');
    if (bare.kind !== 'book') return;

    for (const key of CONTRACT_KEYS) {
      const entry = FRONTMATTER_CONTRACT[key];
      if (entry.field === null || entry.required || ALWAYS_PRESENT.has(key)) continue;

      expect(
        bare.record[entry.field as keyof BookRecord],
        `record.${String(entry.field)} is set even though \`${key}\` was absent — ` +
          'the previous test cannot tell a real read from a hardcoded default',
      ).toBeUndefined();
    }
  });

  it('still tolerates and ignores a key outside the contract (invariant 5)', () => {
    const parsed = parseNote(
      noteWith(['type: book', 'title: A Sample Title', 'narrator: A Reader', 'asin: B00SAMPLE']),
      'extra.md',
    );

    expect(parsed.kind).toBe('book');
    if (parsed.kind !== 'book') return;
    expect(Object.keys(parsed.record)).not.toContain('narrator');
    expect(Object.keys(parsed.record)).not.toContain('asin');
  });
});
