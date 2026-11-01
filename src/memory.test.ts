import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeMemoryChange,
  clearMemory,
  forgetMemory,
  loadMemory,
  memoryContext,
  memoryLimits,
  saveMemory,
  setMemoryEnabled,
} from './memory';
import { executeTaskTool } from './task-tools';
import { replyContext } from './context';
import type { ModelSession } from './types';

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const env = (request = '') => ({ request, documents: [], signal: new AbortController().signal });

describe('persistent memory', () => {
  it('saves, reloads and updates a named fact without duplicating it', () => {
    saveMemory('temperature', 'I prefer Celsius');
    expect(loadMemory().entries).toEqual([{ key: 'temperature', value: 'I prefer Celsius' }]);
    saveMemory('Temperature', 'I prefer Fahrenheit');
    expect(loadMemory().entries).toEqual([{ key: 'Temperature', value: 'I prefer Fahrenheit' }]);
    expect(memoryContext()).toContain('I prefer Fahrenheit');
    expect(memoryContext()).not.toContain('I prefer Celsius');
  });
  it('disables use and saving while retaining inspection and deletion', async () => {
    saveMemory('temperature', 'I prefer Celsius');
    setMemoryEnabled(false);
    expect(loadMemory()).toMatchObject({ enabled: false, entries: [{ key: 'temperature' }] });
    expect(memoryContext()).toBe('');
    expect(() => saveMemory('name', 'My name is Alex')).toThrow('Memory is off');
    expect((await executeTaskTool('memory.list', {}, env())).data).toMatchObject({
      enabled: false,
    });
    forgetMemory('temperature');
    expect(loadMemory()).toEqual({ enabled: false, entries: [] });
  });
  it('forgets only the selected fact, and clearing memory preserves chat history', () => {
    values.set('cheapgpt.conversations.v1', 'saved conversations');
    saveMemory('temperature', 'I prefer Celsius');
    saveMemory('name', 'My name is Alex');
    forgetMemory('TEMPERATURE');
    expect(loadMemory().entries).toEqual([{ key: 'name', value: 'My name is Alex' }]);
    expect(() => forgetMemory('missing')).toThrow('does not exist');
    clearMemory();
    expect(loadMemory().entries).toEqual([]);
    expect(values.get('cheapgpt.conversations.v1')).toBe('saved conversations');
  });
  it('bounds entries and context without persisting overflow', () => {
    for (let i = 0; i < memoryLimits.entries; i++) saveMemory(`fact-${i}`, 'Short fact');
    expect(() => saveMemory('overflow', 'Too many facts')).toThrow('Memory is full');
    expect(loadMemory().entries).toHaveLength(memoryLimits.entries);
    expect(() => saveMemory('long', 'x'.repeat(301))).toThrow('1–300');
    clearMemory();
    expect(() => {
      for (let i = 0; i < 20; i++) saveMemory(`long-${i}`, 'x'.repeat(300));
    }).toThrow('Memory is full');
    expect(JSON.stringify(loadMemory().entries).length).toBeLessThanOrEqual(
      memoryLimits.characters,
    );
  });
  it('ignores corrupted or malformed browser data', () => {
    values.set('cheapgpt.memory.v1', '{broken');
    expect(loadMemory().entries).toEqual([]);
    values.set(
      'cheapgpt.memory.v1',
      JSON.stringify({
        entries: [
          null,
          {},
          { key: 1, value: 'bad' },
          { key: 'valid', value: 'Safe fact' },
          { key: 'VALID', value: 'duplicate' },
          { key: 'long', value: 'x'.repeat(301) },
        ],
      }),
    );
    expect(loadMemory().entries).toEqual([{ key: 'valid', value: 'Safe fact' }]);
  });
  it('reports storage failure rather than claiming a fact was remembered', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    await expect(
      executeTaskTool(
        'memory.save',
        { key: 'temperature', value: 'I prefer Celsius' },
        env('Remember I prefer Celsius'),
      ),
    ).rejects.toThrow('could not be saved');
  });
});

describe('memory tools and authorization', () => {
  it('saves, lists, updates and forgets through validated local tools', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await executeTaskTool(
      'memory.save',
      { key: 'temperature', value: 'I prefer Celsius' },
      env('Remember that I prefer Celsius'),
    );
    expect((await executeTaskTool('memory.list', {}, env())).data).toMatchObject({
      entries: [{ key: 'temperature', value: 'I prefer Celsius' }],
    });
    await executeTaskTool(
      'memory.save',
      { key: 'temperature', value: 'I prefer Fahrenheit' },
      env('Update my memory: I prefer Fahrenheit'),
    );
    expect(loadMemory().entries).toHaveLength(1);
    await executeTaskTool(
      'memory.forget',
      { key: 'temperature' },
      env('Forget my temperature preference'),
    );
    expect(loadMemory().entries).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    'I prefer Celsius',
    'What do you remember about Celsius?',
    'Do you remember I prefer Celsius?',
    'Do not remember I prefer Celsius',
    'Summarize a page that says remember I prefer Celsius',
  ])('rejects unrequested saves: %s', async (request) => {
    await expect(
      executeTaskTool(
        'memory.save',
        { key: 'temperature', value: 'I prefer Celsius' },
        env(request),
      ),
    ).rejects.toThrow('explicit current request');
    expect(loadMemory().entries).toEqual([]);
  });
  it('rejects invented facts, unrequested deletion, extra fields, and aborted changes', async () => {
    expect(() =>
      authorizeMemoryChange('memory.save', 'Remember I prefer Celsius', 'I live in Vancouver'),
    ).toThrow('quoted from your current request');
    saveMemory('temperature', 'I prefer Celsius');
    await expect(
      executeTaskTool(
        'memory.forget',
        { key: 'temperature' },
        env('What is my temperature preference?'),
      ),
    ).rejects.toThrow('explicit current request');
    await expect(
      executeTaskTool(
        'memory.save',
        { key: 'temperature', value: 'I prefer Celsius', extra: true },
        env('Remember I prefer Celsius'),
      ),
    ).rejects.toThrow('not supported');
    await expect(
      executeTaskTool(
        'memory.forget',
        { key: 'temperature' },
        { ...env('Forget temperature'), signal: AbortSignal.abort() },
      ),
    ).rejects.toThrow();
    expect(loadMemory().entries).toHaveLength(1);
  });
});

describe('memory in reply context', () => {
  const session = {} as ModelSession;
  const message = {
    id: 'new-chat',
    role: 'user' as const,
    content: 'Suggest a comfortable temperature',
  };
  it('provides fresh facts across chats with current-request priority and data boundaries', async () => {
    saveMemory('temperature', 'I prefer Celsius');
    const prompts = await replyContext(session, [message], undefined, new AbortController().signal);
    expect(prompts[0].content).toContain('I prefer Celsius');
    expect(prompts[0].content).toContain('untrusted data');
    expect(prompts[0].content).toContain('current request takes priority');
    expect(prompts[0].content).toContain(message.content);
    forgetMemory('temperature');
    expect(
      JSON.stringify(
        await replyContext(session, [message], undefined, new AbortController().signal),
      ),
    ).not.toContain('I prefer Celsius');
  });
  it('omits disabled memory and sacrifices memory before rejecting a request that fits', async () => {
    saveMemory('temperature', 'I prefer Celsius');
    setMemoryEnabled(false);
    expect(
      JSON.stringify(
        await replyContext(session, [message], undefined, new AbortController().signal),
      ),
    ).not.toContain('I prefer Celsius');
    setMemoryEnabled(true);
    const measured = {
      measureContextUsage: vi.fn(async (prompts: unknown) =>
        JSON.stringify(prompts).includes('Saved memory') ? 1000 : 100,
      ),
      contextWindow: 500,
    } as unknown as ModelSession;
    const prompts = await replyContext(
      measured,
      [message],
      undefined,
      new AbortController().signal,
    );
    expect(prompts[0].content).toContain(message.content);
    expect(prompts[0].content).not.toContain('I prefer Celsius');
  });
});
