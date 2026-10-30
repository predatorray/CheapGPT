import { describe, expect, it, vi } from 'vitest';
import { summarizeTitle, titleCheckpoint } from './titles';
import { detectToolRequest } from './model';
import { loadConversations, saveConversations } from './storage';
import type { Conversation, ModelSession } from './types';

const chat = (rounds: number): Conversation => ({
  id: 'chat',
  title: 'Old title',
  updatedAt: 1,
  messages: Array.from({ length: rounds }, (_, i) => ({
    id: String(i),
    role: 'assistant',
    content: 'A reply',
  })),
});
describe('conversation titles', () => {
  it('spaces title work and permanently respects manual and stable titles', () => {
    expect(titleCheckpoint(chat(0))).toBeNull();
    expect(titleCheckpoint(chat(1))).toBe(1);
    expect(titleCheckpoint({ ...chat(3), titleRound: 1 })).toBeNull();
    expect(titleCheckpoint({ ...chat(4), titleRound: 1 })).toBe(4);
    expect(titleCheckpoint({ ...chat(9), titleRound: 7 })).toBeNull();
    expect(titleCheckpoint({ ...chat(9), titleManual: true })).toBeNull();
    expect(titleCheckpoint({ ...chat(9), titleStable: true })).toBeNull();
  });
  it('recognizes explicit renames without treating title discussions as commands', () => {
    expect(detectToolRequest('Rename this conversation to Garden plans')).toEqual({
      tool: 'rename_conversation',
      query: 'Garden plans',
    });
    expect(detectToolRequest('Please change the conversation title to Travel')).toEqual({
      tool: 'rename_conversation',
      query: 'Travel',
    });
    expect(detectToolRequest('Explain how conversation titles work')).toBeNull();
  });
  it('bounds context and releases its session even when generation fails', async () => {
    const session = { prompt: vi.fn().mockResolvedValue('Garden plans'), destroy: vi.fn() };
    const base = { clone: vi.fn().mockResolvedValue(session) } as unknown as ModelSession;
    expect(await summarizeTitle(base, chat(30), new AbortController().signal)).toBe('Garden plans');
    expect(session.prompt.mock.calls[0][0].length).toBeLessThan(3000);
    expect(session.destroy).toHaveBeenCalledOnce();
    session.prompt.mockRejectedValueOnce(new Error('Failed'));
    await expect(summarizeTitle(base, chat(1), new AbortController().signal)).rejects.toThrow(
      'Failed',
    );
    expect(session.destroy).toHaveBeenCalledTimes(2);
  });
  it('preserves the manual lock and checkpoints across storage reloads', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    const saved = { ...chat(4), titleManual: true, titleRound: 4 };
    saveConversations([saved]);
    expect(loadConversations()[0]).toMatchObject(saved);
    vi.unstubAllGlobals();
  });
});
