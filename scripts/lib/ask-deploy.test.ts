import { describe, expect, it } from 'vitest';
import {
  bundleLeaks,
  decideAi,
  invocationLogsOff,
  liveAiValue,
  parseAskArgs,
  varArgs,
  type AskFlags,
} from './ask-deploy.ts';

const flags = (over: Partial<AskFlags> = {}): AskFlags => ({
  dryRun: false,
  aiOff: false,
  aiOn: false,
  anyBranch: false,
  ...over,
});

describe('parseAskArgs', () => {
  it('reads the flags', () => {
    expect(parseAskArgs(['--dry-run', '--ai-off', '--any-branch'])).toEqual(
      flags({ dryRun: true, aiOff: true, anyBranch: true }),
    );
  });
  it('reads a gateway id', () => {
    expect(parseAskArgs(['--gateway', 'stacks-test'])).toMatchObject({ gateway: 'stacks-test' });
  });
  it.each([
    ['--gateway'],
    ['--gateway', 'Bad Id'],
    ['--gateway', '-x'],
    ['--gateway', 'default'],
    ['--gateway', 'stacks-ask'],
    ['--nope'],
  ])('refuses %s', (...argv) => {
    expect(parseAskArgs(argv)).toHaveProperty('refusal');
  });
  it('refuses --ai-off with --ai-on', () => {
    expect(parseAskArgs(['--ai-off', '--ai-on'])).toHaveProperty('refusal');
  });
});

describe('liveAiValue', () => {
  it('finds the binding wherever the answer nests it', () => {
    const view = {
      resources: {
        bindings: [
          { name: 'X', text: 'a' },
          { type: 'plain_text', name: 'ASK_AI_ENABLED', text: 'false' },
        ],
      },
    };
    expect(liveAiValue(view)).toBe('false');
  });
  it('is unreadable when the binding is absent or has no string value', () => {
    expect(liveAiValue({ resources: { bindings: [] } })).toBe('unreadable');
    expect(liveAiValue({ name: 'ASK_AI_ENABLED', text: 3 })).toBe('unreadable');
    expect(liveAiValue(null)).toBe('unreadable');
  });
});

describe('decideAi (C18)', () => {
  it('--ai-off deploys with AI off, whatever is live', () => {
    expect(decideAi(flags({ aiOff: true }), 'true')).toEqual({ value: 'false' });
    expect(decideAi(flags({ aiOff: true }), 'unreadable')).toEqual({ value: 'false' });
  });
  it('--ai-on deploys with AI on, even over a switched-off Worker', () => {
    expect(decideAi(flags({ aiOn: true }), 'false')).toEqual({ value: 'true' });
  });
  it('a plain deploy refuses to turn a switched-off Worker back on', () => {
    expect(decideAi(flags(), 'false').refusal).toContain('--ai-on');
  });
  it('a plain deploy refuses when the live value cannot be read', () => {
    expect(decideAi(flags(), 'unreadable').refusal).toContain('could not read');
  });
  it('a plain deploy goes ahead over a live "true", and before any deploy exists', () => {
    expect(decideAi(flags(), 'true')).toEqual({});
    expect(decideAi(flags(), 'none')).toEqual({});
  });
  it('refuses any live value other than the exact string "true"', () => {
    expect(decideAi(flags(), 'TRUE').refusal).toBeDefined();
  });
});

describe('bundleLeaks (C15)', () => {
  it('finds a vault path in any of its spellings', () => {
    const bundles = new Map([
      ['a.js', 'x C:/Users/me/Vault y'],
      ['b.js', 'clean'],
    ]);
    expect(bundleLeaks(bundles, ['C:\\Users\\me\\Vault'])).toEqual(['a.js holds the vault path']);
  });
  it('finds nothing in a clean bundle, and ignores an empty vault setting', () => {
    expect(bundleLeaks(new Map([['a.js', 'clean']]), ['C:\\Users\\me\\Vault', ''])).toEqual([]);
  });
});

describe('invocationLogsOff (C15)', () => {
  const config = (v: string): string =>
    `{ // c\n "observability": { "enabled": true, "logs": { "invocation_logs": ${v} } } }`;
  it('accepts false and refuses true or absent', () => {
    expect(invocationLogsOff(config('false'))).toBe(true);
    expect(invocationLogsOff(config('true'))).toBe(false);
    expect(invocationLogsOff('{ "observability": { "enabled": true } }')).toBe(false);
  });
  it('is not fooled by a commented-out false', () => {
    expect(
      invocationLogsOff(
        '// "invocation_logs": false\n{ "observability": { "logs": { "invocation_logs": true } } }',
      ),
    ).toBe(false);
  });
  it('holds for the real wrangler.jsonc', async () => {
    const { readFileSync } = await import('node:fs');
    expect(invocationLogsOff(readFileSync('packages/ask/wrangler.jsonc', 'utf8'))).toBe(true);
  });
});

describe('varArgs', () => {
  it('passes only what this deploy sets', () => {
    expect(varArgs({}, flags())).toEqual([]);
    expect(varArgs({ value: 'false' }, flags({ gateway: 'g1' }))).toEqual([
      '--var',
      'ASK_AI_ENABLED:false',
      '--var',
      'ASK_GATEWAY_ID:g1',
    ]);
  });
});
