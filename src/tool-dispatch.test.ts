import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTaskTool, findTaskTool, taskTools } from './task-tools';
import { runTool } from './tools';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const environment = (signal = new AbortController().signal) => ({ documents: [], signal });

describe('tool dispatch boundaries', () => {
  it.each(taskTools)('cancels $id before validation or side effects', async (tool) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const reason = new Error('Cancelled before dispatch');
    await expect(executeTaskTool(tool.id, {}, environment(AbortSignal.abort(reason)))).rejects.toBe(
      reason,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(taskTools)('rejects invalid arguments for $id before side effects', async (tool) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(executeTaskTool(tool.id, { unexpected: true }, environment())).rejects.toThrow(
      /is required|is not supported/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown IDs, including object prototype property names', async () => {
    for (const id of ['unknown.tool', 'constructor', 'toString', '__proto__']) {
      expect(findTaskTool(id)).toBeUndefined();
      await expect(executeTaskTool(id, {}, environment())).rejects.toThrow('Unknown task tool.');
    }
  });

  it('keeps raw calculator inputs outside the search query limit', async () => {
    const input = '1' + ' '.repeat(310) + '+ 2';
    expect((await runTool('calculator', input, environment().signal)).data).toEqual({ value: 3 });
  });

  it('trims and limits public lookup queries before making requests', async () => {
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    await executeTaskTool('github.search', { query: '  dispatch-query  ' }, environment());
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('q')).toBe('dispatch-query');
    const query = 'x'.repeat(301);
    await runTool('github', `  ${query}  `, environment().signal);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('q')).toBe(query.slice(0, 300));
  });
});
