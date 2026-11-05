import { describe, expect, it, vi } from 'vitest';
import { createTokenSource, type TurnstileApi } from './turnstile.ts';

const container = {} as HTMLElement;

function fakeApi() {
  let options: Record<string, unknown> = {};
  const render = vi.fn((_c: unknown, o: Record<string, unknown>) => {
    options = o;
    return 'w1';
  });
  const execute = vi.fn();
  const reset = vi.fn();
  const api: TurnstileApi = { render, execute, reset };
  return {
    api,
    render,
    execute,
    reset,
    options: () =>
      options as Record<string, (token?: string) => void> & { action: string; sitekey: string },
  };
}

describe('createTokenSource (C11, S5 step 3)', () => {
  it('loads nothing until prepare or token is called', () => {
    const load = vi.fn();
    createTokenSource({ siteKey: 'k', container, load });
    expect(load).not.toHaveBeenCalled();
  });

  it('renders once with the site key and the fixed action, in execute mode', async () => {
    const { api, options, render } = fakeApi();
    const load = vi.fn(async () => api);
    const source = createTokenSource({ siteKey: 'site-key', container, load });
    source.prepare();
    source.prepare();
    const pending = source.token();
    await Promise.resolve();
    await Promise.resolve();
    options().callback!('tok-1');
    expect(await pending).toBe('tok-1');
    expect(load).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(options().action).toBe('ask');
    expect(options().sitekey).toBe('site-key');
    expect(options()).toMatchObject({ execution: 'execute', appearance: 'interaction-only' });
  });

  it('resets and executes the widget for every question, and returns each token once', async () => {
    const { api, options, execute, reset } = fakeApi();
    const source = createTokenSource({ siteKey: 'k', container, load: async () => api });
    const first = source.token();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    options().callback!('a');
    expect(await first).toBe('a');
    const second = source.token();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    options().callback!('b');
    expect(await second).toBe('b');
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('has no token when the script is blocked', async () => {
    const source = createTokenSource({
      siteKey: 'k',
      container,
      load: async () => {
        throw new Error('blocked');
      },
    });
    expect(await source.token()).toBeUndefined();
  });

  it('has no token without a site key, and never loads the script', async () => {
    const load = vi.fn();
    const source = createTokenSource({ siteKey: '', container, load });
    expect(await source.token()).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('has no token on an error callback', async () => {
    const { api, options, execute } = fakeApi();
    const source = createTokenSource({ siteKey: 'k', container, load: async () => api });
    const pending = source.token();
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    options()['error-callback']!();
    expect(await pending).toBeUndefined();
  });

  it('gives up after the timeout', async () => {
    const { api } = fakeApi();
    let fire: (() => void) | undefined;
    const source = createTokenSource({
      siteKey: 'k',
      container,
      load: async () => api,
      setTimer: (run) => {
        fire = run;
        return 1;
      },
      clearTimer: () => undefined,
    });
    const pending = source.token();
    await vi.waitFor(() => expect(fire).toBeDefined());
    fire!();
    expect(await pending).toBeUndefined();
  });
});
