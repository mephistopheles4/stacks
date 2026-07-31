export type MetadataSource = 'open-library' | 'google-books';

/** What a lookup yields, normalised across providers. */
export interface BookMetadata {
  readonly title: string;
  readonly author?: string;
  readonly isbn?: string;
  readonly pages?: number;
  readonly coverUrl?: string;
  readonly source: MetadataSource;
}

/** Narrows an unknown JSON body to an indexable object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}
