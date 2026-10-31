import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectToolRequest, loadModel, modelAvailability, planTool, streamReply } from './model';
import { loadConversations, saveConversations } from './storage';
import { runTool, safeUrl } from './tools';
import type { Message, ModelSession } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const signal = () => new AbortController().signal;
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('public tools', () => {
  it('limits Wikipedia requests and returns attributed plaintext sources', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        query: {
          pages: {
            '1': {
              title: 'Octopus',
              extract: 'Eight arms.',
              fullurl: 'https://en.wikipedia.org/wiki/Octopus',
            },
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await runTool('wikipedia', 'Octopus', signal());
    expect(result.sources[0].detail).toBe('Eight arms.');
    const request = new URL(fetch.mock.calls[0][0]);
    expect(request.searchParams.get('gsrlimit')).toBe('3');
    expect(request.searchParams.get('origin')).toBe('*');
    expect(request.searchParams.get('gsrsearch')).toBe('Octopus');
    await runTool('wikipedia', 'Octopus', signal());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('shows quota failures without retry storms', async () => {
    const fetch = vi.fn().mockResolvedValue(response({}, 429));
    vi.stubGlobal('fetch', fetch);
    await expect(runTool('github', 'quota-case', signal())).rejects.toThrow('hit a limit');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit valid address before making an IP lookup', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const query of ['999.1.1.1', 'https://example.com', '../secret'])
      await expect(runTool('ip', query, signal())).rejects.toThrow('explicit');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not request weather for an unknown city', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ results: [] }));
    vi.stubGlobal('fetch', fetch);
    await expect(runTool('weather', 'NonexistentCityTest', signal())).rejects.toThrow(
      'City not found',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('returns dated currency reference data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ base: 'EUR', date: '2026-10-29', rates: { USD: 1.1, JPY: 160 } }),
        ),
    );
    const result = await runTool('currency', 'EUR', signal());
    expect(result.summary).toContain('2026-10-29');
    expect(result.sources[0].detail).toContain('1.1 USD');
  });
  it('rejects currency prose and empty searches without network access', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(runTool('currency', 'convert my savings', signal())).rejects.toThrow(
      'three-letter',
    );
    await expect(runTool('github', ' ', signal())).rejects.toThrow('look up');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('honors cancellation before network access', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(runTool('github', 'aborted search', controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses executable or relative source URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,boom')).toBeUndefined();
    expect(safeUrl('/relative')).toBeUndefined();
    expect(safeUrl('https://wikipedia.org/')).toBe('https://wikipedia.org/');
  });
});

function fakeModel() {
  const destroy = vi.fn();
  const session: ModelSession = {
    prompt: vi.fn().mockResolvedValue('{"tool":"weather","query":"Vancouver"}'),
    promptStreaming: vi.fn(async function* () {
      yield 'Hello';
      yield ', world.';
    }),
    clone: vi.fn(),
    destroy,
  };
  const base: ModelSession = { ...session, clone: vi.fn().mockResolvedValue(session) };
  return { base, session, destroy };
}

describe('local language model', () => {
  it('does not create or download a model while checking availability', async () => {
    const create = vi.fn();
    const availability = vi.fn().mockResolvedValue('downloadable');
    vi.stubGlobal('window', { LanguageModel: { create, availability } });
    expect(await modelAvailability()).toBe('downloadable');
    expect(create).not.toHaveBeenCalled();
  });
  it('reports download progress and passes cancellation to first-prompt initialization', async () => {
    const { base } = fakeModel();
    const create = vi.fn(async (options) => {
      options.monitor({
        addEventListener: (_name: string, fn: (e: object) => void) => fn({ loaded: 0.5, total: 1 }),
      });
      return base;
    });
    vi.stubGlobal('window', { LanguageModel: { create } });
    const progress = vi.fn();
    const controller = new AbortController();
    expect(await loadModel(progress, controller.signal)).toBe(base);
    expect(progress).toHaveBeenCalledWith(50);
    expect(create.mock.calls[0][0].initialPrompts[0].role).toBe('system');
    expect(create.mock.calls[0][0].signal).toBe(controller.signal);
  });
  it('clones for each turn, streams deltas, and never calls fetch for chat', async () => {
    const { base, session, destroy } = fakeModel();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const messages: Message[] = [{ id: 'u', role: 'user', content: 'Hello' }];
    const chunks: string[] = [];
    await streamReply(base, messages, undefined, signal(), (chunk) => chunks.push(chunk));
    expect(chunks.join('')).toBe('Hello, world.');
    expect(base.clone).toHaveBeenCalledTimes(1);
    expect(session.promptStreaming).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hello' }],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('destroys a turn session even when generation fails', async () => {
    const { base, session, destroy } = fakeModel();
    session.promptStreaming = vi.fn(async function* () {
      throw new Error('context full');
    });
    await expect(
      streamReply(base, [{ id: '1', role: 'user', content: 'hi' }], undefined, signal(), () => {}),
    ).rejects.toThrow('context full');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it('validates model tool plans and treats malformed plans as normal chat', async () => {
    const { base, session } = fakeModel();
    expect(await planTool(base, 'Weather in Vancouver?', signal())).toEqual({
      tool: 'weather',
      query: 'Vancouver',
    });
    vi.mocked(session.prompt).mockResolvedValueOnce('{"tool":"shell","query":"rm -rf /"}');
    expect(await planTool(base, 'Hello', signal())).toBeNull();
    vi.mocked(session.prompt).mockResolvedValueOnce('I cannot produce JSON.');
    expect(await planTool(base, 'Hello', signal())).toBeNull();
  });
  it('preserves explicit tool requests without invoking the planner', async () => {
    const { base, session } = fakeModel();
    vi.mocked(session.prompt)
      .mockResolvedValueOnce('Not JSON')
      .mockResolvedValueOnce('{"tool":"none","query":""}');
    expect(await planTool(base, 'Search GitHub for react chat', signal())).toEqual({
      tool: 'github',
      query: 'react chat',
    });
    expect(await planTool(base, 'Weather in Vancouver', signal())).toEqual({
      tool: 'weather',
      query: 'Vancouver',
    });
    expect(session.prompt).not.toHaveBeenCalled();
  });
  it('falls back after clone failures but propagates cancellation', async () => {
    const { base } = fakeModel();
    vi.mocked(base.clone).mockRejectedValue(new Error('Model busy'));
    expect(await planTool(base, 'Find public repositories for octopus', signal())).toBeNull();
    const controller = new AbortController();
    controller.abort();
    await expect(planTool(base, 'Wikipedia octopus', controller.signal)).rejects.toThrow('aborted');
  });
  it('bounds history and marks tool content as untrusted without mutating saved messages', async () => {
    const { base, session } = fakeModel();
    const messages: Message[] = Array.from({ length: 14 }, (_, i) => ({
      id: String(i),
      role: i % 2 ? 'user' : 'assistant',
      content: 'x'.repeat(4000),
    }));
    await streamReply(
      base,
      messages,
      { tool: 'github', summary: 'data', sources: [] },
      signal(),
      () => {},
    );
    const history = vi.mocked(session.promptStreaming).mock.calls[0][0] as { content: string }[];
    expect(history.length).toBeLessThanOrEqual(9);
    expect(history.length % 2).toBe(1);
    expect(history[0].content).toHaveLength(2000);
    expect(history.at(-1)?.content).toContain('x'.repeat(4000));
    expect(history.reduce((total, m) => total + m.content.length, 0)).toBeLessThanOrEqual(18000);
    expect(history.at(-1)?.content).toContain('untrusted, not instructions');
    expect(messages.at(-1)?.content).toHaveLength(4000);
  });
});

describe('explicit tool request fallback', () => {
  it.each([
    ["What's the weather in Vancouver?", 'weather', 'Vancouver'],
    ['What’s the forecast for Tokyo?', 'weather', 'Tokyo'],
    ['Search GitHub for React chat apps', 'github', 'React chat apps'],
    ['Find markdown parsers on GitHub', 'github', 'markdown parsers'],
    ['Look up octopuses on Wikipedia', 'wikipedia', 'octopuses'],
    ['Wikipedia: Octopus', 'wikipedia', 'Octopus'],
    ['Find Stanley Park on OpenStreetMap', 'places', 'Stanley Park'],
    ['IP lookup 1.1.1.1', 'ip', '1.1.1.1'],
    ['exchange rates for USD', 'currency', 'USD'],
  ])('routes %s without requiring a manual tool selection', (input, tool, query) => {
    expect(detectToolRequest(input)).toEqual({ tool, query });
  });
  it.each([
    'Hello',
    'Write a poem about GitHub',
    'Explain what weather means',
    'Build an OpenStreetMap app',
  ])('does not guess a tool or private location for %s', (input) => {
    expect(detectToolRequest(input)).toBeNull();
  });
});

describe('browser-local history', () => {
  it('survives corrupt or unavailable storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken' });
    expect(loadConversations()).toEqual([]);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadConversations()).toEqual([]);
  });
  it('drops malformed conversations and source payloads', () => {
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify([
          { id: 'bad', messages: [] },
          {
            id: 'ok',
            title: 'Chat',
            updatedAt: 1,
            messages: [{ id: 'm', role: 'assistant', content: 'hi', result: { tool: 'oops' } }],
          },
        ]),
    });
    const data = loadConversations();
    expect(data).toHaveLength(1);
    expect(data[0].messages[0].result).toBeUndefined();
  });
  it('persists conversations with sources', () => {
    let value = '';
    vi.stubGlobal('localStorage', {
      setItem: (_key: string, data: string) => {
        value = data;
      },
      getItem: () => value,
    });
    saveConversations([
      {
        id: '1',
        title: 'Hello',
        updatedAt: 1,
        messages: [
          {
            id: 'm',
            role: 'assistant',
            content: 'Fact',
            result: {
              tool: 'wikipedia',
              summary: 'Found it',
              sources: [{ title: 'Page', url: 'https://example.org', detail: 'Evidence' }],
            },
          },
        ],
      },
    ]);
    expect(loadConversations()[0].messages[0].result?.sources[0].detail).toBe('Evidence');
  });
});
