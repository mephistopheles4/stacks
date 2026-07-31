import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spineColour } from './dominant-colour.ts';
import type { VaultAdapter } from '../adapters/vault-adapter.ts';

export interface CachedCover {
  /** Vault-relative, as it goes into the note's `cover:` key. */
  readonly relativePath: string;
  readonly spineColor?: string;
}

/**
 * Downloads a cover into the vault and reads its spine colour.
 *
 * Every failure returns `undefined` rather than throwing: a missing cover
 * downgrades how a book looks, it does not stop the book being logged. Shared
 * by `stacks add` and by imports so the two cannot drift.
 */
export async function cacheCover(
  url: string,
  title: string,
  vault: VaultAdapter,
): Promise<CachedCover | undefined> {
  const extension = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
  const filename = `${slug(title)}.${extension}`;
  const dir = vault.coverDir();
  const absolute = join(dir, filename);

  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;

    const bytes = Buffer.from(await response.arrayBuffer());
    // Open Library serves a 1x1 placeholder for "no cover on file".
    if (bytes.length < 1024) return undefined;

    await mkdir(dir, { recursive: true });
    await writeFile(absolute, bytes);
  } catch {
    return undefined;
  }

  const colour = await spineColour(absolute);
  return {
    relativePath: `covers/${filename}`,
    ...(colour === undefined ? {} : { spineColor: colour }),
  };
}

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cover'
  );
}
