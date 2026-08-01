import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { backfillCoverSources, type MeasureCover } from './backfill-covers.ts';

let vaultPath: string;
let vault: ObsidianAdapter;

/** Shapes keyed by filename, so a test can say "this one is Apple-sized". */
function measuring(shapes: Record<string, { width: number; height: number }>): MeasureCover {
  return (path) => {
    const name = path.split(/[\\/]/).pop() ?? '';
    return Promise.resolve(shapes[name]);
  };
}

async function note(name: string, frontmatter: string, body = 'A body.'): Promise<void> {
  await writeFile(join(vaultPath, 'Library', `${name}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
}

beforeEach(async () => {
  vaultPath = await mkdtemp(join(tmpdir(), 'stacks-backfill-'));
  await mkdir(join(vaultPath, 'Library', 'covers'), { recursive: true });
  vault = new ObsidianAdapter(vaultPath);
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe('backfillCoverSources', () => {
  it('records a source inferred from the cover it can measure', async () => {
    await note('Apple Sized', 'type: book\ntitle: Apple Sized\ncover: covers/a.jpg');
    await note('OL Sized', 'type: book\ntitle: OL Sized\ncover: covers/b.jpg');

    const result = await backfillCoverSources(vault, {
      measure: measuring({
        'a.jpg': { width: 1400, height: 2100 },
        'b.jpg': { width: 333, height: 500 },
      }),
    });

    expect(result.recorded).toBe(2);
    expect(result.bySource.get('apple-books')).toBe(1);
    expect(result.bySource.get('open-library')).toBe(1);

    const written = await readFile(join(vaultPath, 'Library', 'Apple Sized.md'), 'utf8');
    expect(written).toContain('cover_source: apple-books');
  });

  it('writes unknown when the shape is not diagnostic', async () => {
    // "Looked and could not tell" is a different statement from the key being
    // absent, and the note should carry the true one.
    await note('Ambiguous', 'type: book\ntitle: Ambiguous\ncover: covers/c.jpg');

    await backfillCoverSources(vault, {
      measure: measuring({ 'c.jpg': { width: 400, height: 600 } }),
    });

    expect(await readFile(join(vaultPath, 'Library', 'Ambiguous.md'), 'utf8')).toContain(
      'cover_source: unknown',
    );
  });

  it('never overwrites a source that was recorded at fetch time', async () => {
    // An observation beats a guess, always. The shape here would infer Apple.
    await note(
      'Observed',
      'type: book\ntitle: Observed\ncover: covers/d.jpg\ncover_source: open-library',
    );

    const result = await backfillCoverSources(vault, {
      measure: measuring({ 'd.jpg': { width: 2400, height: 2400 } }),
    });

    expect(result.recorded).toBe(0);
    expect(result.outcomes[0]).toEqual({
      kind: 'already-known',
      title: 'Observed',
      source: 'open-library',
    });
    expect(await readFile(join(vaultPath, 'Library', 'Observed.md'), 'utf8')).toContain(
      'cover_source: open-library',
    );
  });

  it('leaves the note untouched in a dry run', async () => {
    await note('Dry', 'type: book\ntitle: Dry\ncover: covers/e.jpg');
    const before = await readFile(join(vaultPath, 'Library', 'Dry.md'), 'utf8');

    const result = await backfillCoverSources(vault, {
      dryRun: true,
      measure: measuring({ 'e.jpg': { width: 1400, height: 2100 } }),
    });

    expect(result.recorded).toBe(1);
    expect(await readFile(join(vaultPath, 'Library', 'Dry.md'), 'utf8')).toBe(before);
  });

  it('reports a cover it cannot measure rather than guessing', async () => {
    await note('Missing', 'type: book\ntitle: Missing\ncover: covers/gone.jpg');

    const result = await backfillCoverSources(vault, { measure: measuring({}) });

    expect(result.outcomes[0]).toEqual({ kind: 'unreadable', title: 'Missing' });
    expect(await readFile(join(vaultPath, 'Library', 'Missing.md'), 'utf8')).not.toContain(
      'cover_source',
    );
  });

  it('preserves the note body and the rest of the frontmatter byte for byte', async () => {
    // The whole point of updateBook, asserted here because this command is the
    // one that touches every note in a vault at once.
    await note(
      'Careful',
      'type: book\n# a comment the owner wrote\ntitle: Careful\nauthor: Someone\ncover: covers/f.jpg\ntags: [a, b]',
      'Notes with **markdown** and a --- rule.',
    );

    await backfillCoverSources(vault, {
      measure: measuring({ 'f.jpg': { width: 333, height: 500 } }),
    });

    const after = await readFile(join(vaultPath, 'Library', 'Careful.md'), 'utf8');
    expect(after).toContain('# a comment the owner wrote');
    expect(after).toContain('tags: [a, b]');
    expect(after).toContain('Notes with **markdown** and a --- rule.');
    expect(after).toContain('cover_source: open-library');
  });
});
