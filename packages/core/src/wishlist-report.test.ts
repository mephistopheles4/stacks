import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { MAX_COVER_EDGE } from './covers/cover-budget.ts';
import { listNewWishlist, publish } from './publish.ts';
import { spyOnWarn, type WarnSpy } from './test-support.ts';
import { describeNewWishlist } from './wishlist-report.ts';

describe('listNewWishlist', () => {
  let vaultPath: string;
  let assets: string;
  let warn: WarnSpy;

  const note = async (title: string, frontmatter: string[], ...body: string[]): Promise<void> => {
    await mkdir(join(vaultPath, 'Library'), { recursive: true });
    const text = ['---', 'type: book', `title: ${title}`, ...frontmatter, '---', '', ...body, ''];
    await writeFile(join(vaultPath, 'Library', `${title}.md`), text.join('\n'), 'utf8');
  };

  const cover = async (name: string, edge: number): Promise<void> => {
    await mkdir(join(vaultPath, 'Library', 'covers'), { recursive: true });
    const bytes = await sharp({
      create: { width: edge, height: edge, channels: 3, background: '#445566' },
    })
      .png()
      .toBuffer();
    await writeFile(join(vaultPath, 'Library', 'covers', name), bytes);
  };

  const run = async (): Promise<void> => {
    const vault = new ObsidianAdapter(vaultPath);
    await publish(await vault.listBooks(), vault, assets, { isPublic: true });
  };

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'stacks-wishlist-vault-'));
    assets = await mkdtemp(join(tmpdir(), 'stacks-wishlist-assets-'));
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(vaultPath, { recursive: true, force: true });
    await rm(assets, { recursive: true, force: true });
  });

  it('lists each wishlist book the build published, by title, with what shipped for it', async () => {
    await cover('with-all.png', MAX_COVER_EDGE + 200);
    await cover('small.png', 200);
    await note(
      'With All',
      ['status: wishlist', 'cover: covers/with-all.png'],
      '## Thoughts',
      '',
      'x',
    );
    await note('Cover Only', ['status: wishlist', 'cover: covers/small.png']);
    await note('Bare', ['status: wishlist']);
    await run();

    expect(await listNewWishlist(assets)).toEqual([
      { title: 'Bare', notes: false, cover: false },
      { title: 'Cover Only', notes: false, cover: true },
      { title: 'With All', notes: true, cover: true },
    ]);
  });

  it('lists no private wishlist book, no book marked private: yes, and no book that is not on the wishlist', async () => {
    await note('Kept', ['status: wishlist', 'private: true']);
    await note('Also Kept', ['status: wishlist', 'private: yes']);
    await note('Read One', ['status: read']);
    await note('Shown', ['status: wishlist']);
    await run();

    expect((await listNewWishlist(assets)).map((entry) => entry.title)).toEqual(['Shown']);
  });

  it('prints a mark for each thing that shipped and the title, and says so when there is nothing', () => {
    expect(
      describeNewWishlist([
        { title: 'With All', notes: true, cover: true },
        { title: 'Bare', notes: false, cover: false },
      ]),
    ).toEqual([
      '  2 wishlist book(s) this build publishes — notes, cover, title:',
      '    notes  cover  With All',
      '    -----  -----  Bare',
    ]);
    expect(describeNewWishlist([])).toEqual(['  no wishlist book would be published']);
  });

  it('cannot be made to hide a line by a control character in a title', () => {
    const lines = describeNewWishlist([
      {
        title:
          'Plain' +
          String.fromCharCode(13, 27) +
          '[2KHidden' +
          String.fromCharCode(0x2028) +
          'Line',
        notes: false,
        cover: false,
      },
    ]);

    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
    expect(lines[1]).toContain('Plain');
    expect(lines[1]).toContain('Hidden');
  });

  it('reads what this run staged, so a cover that did not ship is not marked', async () => {
    await note('Ghost Cover', ['status: wishlist', 'cover: covers/not-here.png']);
    await run();

    expect(await listNewWishlist(assets)).toEqual([
      { title: 'Ghost Cover', notes: false, cover: false },
    ]);
  });
});
