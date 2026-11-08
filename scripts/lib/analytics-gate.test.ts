import { describe, expect, it } from 'vitest';
import { PRODUCTION_HOST } from '../../packages/site/src/analytics/events.ts';
import { WIDGET_DOMAIN } from './turnstile.ts';
import {
  foreignRequests,
  gateBuildEnv,
  judgeAnalyticsCalls,
  type AnalyticsWalk,
  type Attempt,
} from './analytics-gate.ts';

describe('the production host', () => {
  it('is the one host the Ask widget is registered for (S10)', () => {
    // If the two drift, the tracker quietly never starts, so they are held equal.
    expect(PRODUCTION_HOST).toBe(WIDGET_DOMAIN);
  });
});

describe('gateBuildEnv', () => {
  it('removes the switch from a parent that holds it, and keeps the rest', () => {
    const parent = { PUBLIC_PLAUSIBLE_DOMAIN: 'stacks.aymandiab.com', PATH: '/bin', SITE_URL: 'x' };
    expect(gateBuildEnv(parent)).toEqual({ PATH: '/bin', SITE_URL: 'x' });
  });

  it('sets it to the production host for --analytics-on, and only then', () => {
    const parent = { PUBLIC_PLAUSIBLE_DOMAIN: 'other.example', PATH: '/bin' };
    expect(gateBuildEnv(parent, true)).toEqual({
      PUBLIC_PLAUSIBLE_DOMAIN: 'stacks.aymandiab.com',
      PATH: '/bin',
    });
    expect(gateBuildEnv({ PATH: '/bin' })).not.toHaveProperty('PUBLIC_PLAUSIBLE_DOMAIN');
  });
});

describe('judgeAnalyticsCalls', () => {
  const ask: Attempt = { name: 'Ask Opened' };
  const picked = (book: string): Attempt => ({ name: 'Book Picked Up', book });
  const opened = (book: string): Attempt => ({ name: 'Book Opened', book });

  /** The walk S6 describes, built so a test can break one step at a time. */
  function walk(overrides: Partial<Record<'click' | 'chat' | 'again' | 'open', Attempt[]>> = {}) {
    const drawer = [ask, ask];
    const click = overrides.click ?? [picked('dune-abc123')];
    const chat = overrides.chat ?? [picked('emma-def456')];
    const again = overrides.again ?? [];
    const open = overrides.open ?? [opened('emma-def456')];
    const clicked = [...drawer, ...click];
    const afterChat = [...clicked, ...chat];
    const afterAgain = [...afterChat, ...again];
    return {
      drawer,
      clicked,
      chat: afterChat,
      chatId: 'emma-def456',
      chatAgain: afterAgain,
      opened: [...afterAgain, ...open],
    } satisfies AnalyticsWalk;
  }

  it('is quiet for the walk S6 describes', () => {
    expect(judgeAnalyticsCalls(walk())).toEqual([]);
  });

  it('fails a second Book Picked Up from one landing', () => {
    expect(
      judgeAnalyticsCalls(walk({ click: [picked('dune-abc123'), picked('dune-abc123')] })),
    ).toHaveLength(1);
  });

  it('fails a chat link to the book in hand that counted', () => {
    expect(judgeAnalyticsCalls(walk({ again: [picked('emma-def456')] }))).toHaveLength(1);
  });

  it('fails a malformed id, a missing Book Opened and a drawer counted once', () => {
    expect(judgeAnalyticsCalls(walk({ click: [picked('Bad Id!')] }))).toHaveLength(1);
    expect(judgeAnalyticsCalls(walk({ open: [] }))).toHaveLength(1);
    // A drawer counted once, with every later step consistent with that one entry,
    // so only the drawer arm can fail.
    const once = [ask, picked('dune-abc123')];
    const onceChat = [...once, picked('emma-def456')];
    expect(
      judgeAnalyticsCalls({
        drawer: [ask],
        clicked: once,
        chat: onceChat,
        chatId: 'emma-def456',
        chatAgain: onceChat,
        opened: [...onceChat, opened('emma-def456')],
      }),
    ).toHaveLength(1);
  });

  it('fails a chat link or an open that names another book', () => {
    expect(judgeAnalyticsCalls(walk({ chat: [picked('dune-abc123')] }))).toHaveLength(1);
    expect(judgeAnalyticsCalls(walk({ open: [opened('dune-abc123')] }))).toHaveLength(1);
  });
});

describe('foreignRequests', () => {
  it('counts a host other than the page, and ignores data and blob URLs', () => {
    expect(
      foreignRequests(
        ['http://127.0.0.1:1/a.js', 'data:image/png;base64,AA', 'https://plausible.io/api/event'],
        'http://127.0.0.1:1',
      ),
    ).toEqual(['https://plausible.io/api/event']);
  });
});
