import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeAnalytics } from './analytics';

function setup(url: string, production = true) {
  vi.stubEnv('PROD', production);
  const browser = { location: new URL(url) } as unknown as Window;
  const script = { async: false, src: '' };
  const createElement = vi.fn(() => script);
  const appendChild = vi.fn();
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', { createElement, head: { appendChild } });
  return { browser, script, createElement, appendChild };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Google Analytics', () => {
  it.each([
    'http://localhost:5173/',
    'http://localhost:4173/',
    'http://localhost.:4173/',
    'http://app.localhost:4173/',
    'http://127.0.0.1:4173/',
    'http://127.0.0.2:4173/',
    'http://0.0.0.0:4173/',
    'http://[::1]:4173/',
    'file:///tmp/dist/index.html',
  ])('never loads or queues analytics on %s, even in a production build', (url) => {
    const { browser, createElement, appendChild } = setup(url);
    initializeAnalytics();
    expect(createElement).not.toHaveBeenCalled();
    expect(appendChild).not.toHaveBeenCalled();
    expect(browser.gtag).toBeUndefined();
    expect(browser.dataLayer).toBeUndefined();
  });

  it('disables analytics in development even on a public hostname', () => {
    const { browser, createElement } = setup('https://predatorray.github.io/CheapGPT/', false);
    initializeAnalytics();
    expect(createElement).not.toHaveBeenCalled();
    expect(browser.dataLayer).toBeUndefined();
  });

  it('loads the asynchronous tag and configures the supplied ID once in production', () => {
    const { browser, script, createElement, appendChild } = setup(
      'https://predatorray.github.io/CheapGPT/',
    );
    initializeAnalytics();
    initializeAnalytics();
    expect(createElement).toHaveBeenCalledExactlyOnceWith('script');
    expect(appendChild).toHaveBeenCalledExactlyOnceWith(script);
    expect(script.async).toBe(true);
    expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-W6LF4ZBZ4Q');
    expect(browser.dataLayer?.map((args) => Array.from(args))).toEqual([
      ['js', expect.any(Date)],
      ['config', 'G-W6LF4ZBZ4Q'],
    ]);
  });
});
