import { describe, expect, it } from 'vitest';
import { noticeFor, type ClickRead } from './links.ts';

/** A plain left-click, which is what opens a notice (C7). */
const plain: ClickRead = {
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe('noticeFor: which notice a click opens', () => {
  it('opens the attribution notice for a plain click on /attribution', () => {
    expect(noticeFor('/attribution', plain)).toBe('attribution');
  });

  it('opens the privacy notice for a plain click on /privacy', () => {
    expect(noticeFor('/privacy', plain)).toBe('privacy');
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['the middle button', { button: 1 }],
    ['the right button', { button: 2 }],
    ['a click that something already handled', { defaultPrevented: true }],
  ] as const)('leaves %s to the browser', (_, change) => {
    expect(noticeFor('/attribution', { ...plain, ...change })).toBeUndefined();
    expect(noticeFor('/privacy', { ...plain, ...change })).toBeUndefined();
  });

  it.each([
    ['no href at all', null],
    ['the shelf', '/'],
    ['a trailing slash', '/attribution/'],
    ['a fragment', '/attribution#google'],
    ['a query', '/privacy?x=1'],
    ['another origin', 'https://example.com/attribution'],
    ['the absolute form of our own address', 'http://localhost/privacy'],
    ['another path', '/privacy-policy'],
    ['the case-changed path', '/Attribution'],
    ['a name every object inherits', 'constructor'],
  ])('is not a notice link: %s', (_, href) => {
    expect(noticeFor(href, plain)).toBeUndefined();
  });
});
