import { describe, expect, it } from 'vitest';
import { latestVersionId } from './ask-live.ts';

describe('latestVersionId (C18: the live read fails closed)', () => {
  const dep = (created: string, versions: { version_id: string; percentage: number }[]) => ({
    created_on: created,
    versions,
  });

  it('is undefined for output it cannot read, never "none"', () => {
    expect(latestVersionId('garbage')).toBeUndefined();
    expect(latestVersionId('{"a":1}')).toBeUndefined();
    expect(latestVersionId(JSON.stringify([{ created_on: 'x' }]))).toBeUndefined();
  });

  it('is "none" only for a parsed list with no deployment', () => {
    expect(latestVersionId('[]')).toBe('none');
  });

  it('reads the newest deployment and, inside it, the version with the most traffic', () => {
    const list = [
      dep('2026-01-01', [{ version_id: 'old', percentage: 100 }]),
      dep('2026-02-01', [
        { version_id: 'minor', percentage: 10 },
        { version_id: 'major', percentage: 90 },
      ]),
    ];
    expect(latestVersionId(JSON.stringify(list))).toBe('major');
  });
});
