import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from './tools';

const signal = () => new AbortController().signal;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web search', () => {
  it('encodes keywords and returns bounded ranked snippets and source links through the shared cache', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        results: Array.from({ length: 12 }, (_, i) => ({
          title: `Result ${i}`,
          url: `https://example.com/${i}`,
          description: 'Indexed snippet. '.repeat(200),
        })),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const query = 'site:example.com "C++ & café"';
    const result = await runTool('web', query, signal());
    const request = new URL(fetch.mock.calls[0][0]);
    expect(request.origin + request.pathname).toBe('https://puri.li/api/search');
    expect(request.searchParams.get('q')).toBe(query);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    });
    expect(result.sources).toHaveLength(10);
    expect(result.sources[0]).toMatchObject({ title: 'Result 0', url: 'https://example.com/0' });
    expect(result.sources[0].detail).toHaveLength(1600);
    expect(result.data).toMatchObject({
      query,
      results: [
        { title: 'Result 0', url: 'https://example.com/0' },
        ...result.sources.slice(1).map((s) => ({ title: s.title, url: s.url })),
      ],
    });
    expect(await runTool('web', query, signal())).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed results and unsafe link protocols', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({
            results: [
              null,
              {},
              { title: 'Unsafe', url: 'javascript:alert(1)' },
              { title: 'File', url: 'file:///tmp/private' },
              { title: 123, url: 'https://example.com/' },
              { title: 'Valid', url: 'https://example.com/valid' },
            ],
          }),
        ),
    );
    const result = await runTool('web', 'unsafe-result-test', signal());
    expect(result.sources).toEqual([
      { title: 'Valid', url: 'https://example.com/valid', detail: 'No snippet available.' },
    ]);
  });

  it('returns an explicit empty result without inventing sources', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ results: [] })));
    const result = await runTool('web', 'no-results-test', signal());
    expect(result.summary).toContain('No web results');
    expect(result.sources).toEqual([]);
    expect(result.data).toEqual({ query: 'no-results-test', results: [] });
  });

  it.each([null, {}, { results: 'not an array' }])(
    'reports malformed responses: %j',
    async (data) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)));
      await expect(runTool('web', `malformed-${JSON.stringify(data)}`, signal())).rejects.toThrow(
        'invalid response',
      );
    },
  );

  it('surfaces provider and network errors without automatic retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ error: 'Rate limited' }, 429))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    await expect(runTool('web', 'quota-test', signal())).rejects.toThrow('hit a limit');
    await expect(runTool('web', 'network-test', signal())).rejects.toThrow('Failed to fetch');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects empty input and cancellation before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(runTool('web', ' ', signal())).rejects.toThrow('look up');
    await expect(runTool('web', 'cancelled-test', AbortSignal.abort())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
