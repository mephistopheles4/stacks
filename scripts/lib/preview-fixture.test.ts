/**
 * `preview:fixture`'s decisions (room spec S13.4, C14): it refuses `main` and the production
 * branch, takes no branch argument, and deletes only what is the preview branch's.
 */
import { describe, expect, it } from 'vitest';
import {
  branchRefusal,
  parsePreviewArgs,
  PREVIEW_BRANCH,
  previewDeploymentIds,
  projectRefusal,
} from './preview-fixture.ts';

describe('branchRefusal', () => {
  it('refuses main in every spelling, and the production branch it is told', () => {
    for (const spelling of [
      'main',
      'MAIN',
      ' main ',
      'refs/heads/main',
      'Refs/Heads/Main',
      'master',
    ]) {
      expect(branchRefusal(spelling), spelling).toContain('production');
    }
    expect(branchRefusal('live', 'live')).toContain('production');
    expect(branchRefusal('')).toContain('empty');
  });

  it('allows the constant', () => {
    expect(branchRefusal(PREVIEW_BRANCH)).toBeUndefined();
  });

  it('keeps the constant itself clear of the refusal', () => {
    expect(PREVIEW_BRANCH).toMatch(/^[a-z0-9-]+$/);
    expect(branchRefusal(PREVIEW_BRANCH)).toBeUndefined();
  });
});

describe('parsePreviewArgs', () => {
  it('takes four switches and no branch', () => {
    expect(parsePreviewArgs([])).toEqual({
      probe: false,
      control: false,
      dryRun: false,
      remove: false,
    });
    expect(parsePreviewArgs(['--probe', '--control', '--dry-run'])).toEqual({
      probe: true,
      control: true,
      dryRun: true,
      remove: false,
    });
    expect(parsePreviewArgs(['--delete'])).toMatchObject({ remove: true });
  });

  it('refuses a branch, an unknown switch, a repeat, a control without the probe, and a delete with more', () => {
    for (const bad of [
      ['--branch', 'main'],
      ['--branch=main'],
      ['main'],
      ['--probe', '--probe'],
      ['--control'],
      ['--delete', '--probe'],
    ]) {
      expect(typeof parsePreviewArgs(bad), bad.join(' ')).toBe('string');
    }
  });
});

describe('projectRefusal', () => {
  it('accepts a Pages project name only', () => {
    expect(projectRefusal('stacks')).toBeUndefined();
    for (const bad of ['', 'Stacks', 'a b', '-x', 'a;b', 'a'.repeat(60)]) {
      expect(projectRefusal(bad), bad).toBeDefined();
    }
  });
});

describe('previewDeploymentIds', () => {
  const entry = (id: string, branch: unknown, environment = 'preview') => ({
    id,
    environment,
    deployment_trigger: { metadata: { branch } },
  });

  it('keeps preview deployments of the preview branch and nothing else', () => {
    const list = JSON.stringify([
      entry('aaaaaaaa-1111', PREVIEW_BRANCH),
      entry('bbbbbbbb-2222', 'main'),
      entry('cccccccc-3333', 'main', 'production'),
      entry('dddddddd-4444', PREVIEW_BRANCH, 'production'),
      entry('eeeeeeee-5555', 7),
    ]);
    expect(previewDeploymentIds(list)).toEqual(['aaaaaaaa-1111']);
  });

  it('fails closed on a shape nobody expected', () => {
    for (const odd of ['', 'not json', '{}', '"x"', '[null, 3, {}]', '[{"id": 4}]']) {
      expect(previewDeploymentIds(odd), odd).toEqual([]);
    }
    expect(previewDeploymentIds(JSON.stringify([entry('x y; rm', PREVIEW_BRANCH)]))).toEqual([]);
  });
});
