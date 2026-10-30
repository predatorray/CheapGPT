import { describe, expect, it, vi } from 'vitest';
import { capabilitySummary, listCapabilities } from './capabilities';
import { detectToolRequest, planTool } from './model';
import { toolInfo } from './tools';
import type { ModelSession } from './types';

describe('capability discovery', () => {
  it('lists every installed public tool and local actions', () => {
    const ids = listCapabilities().map((tool) => tool.id);
    for (const tool of toolInfo) expect(ids).toContain(tool.id);
    expect(ids).toContain('rename_conversation');
    expect(ids).toContain('capabilities');
    expect(capabilitySummary()).toContain('Convert 100 USD to CAD');
    expect(capabilitySummary()).toContain('cannot transfer money');
  });
  it.each([
    'can you do currency exchange between USD and CAD?',
    'What can you do?',
    'What tools do you have?',
    'List your capabilities',
    'Do you support weather forecasts?',
  ])('answers capability questions locally: %s', async (query) => {
    expect(detectToolRequest(query)?.tool).toBe('capabilities');
    const clone = vi.fn();
    expect(
      await planTool({ clone } as unknown as ModelSession, query, new AbortController().signal),
    ).toMatchObject({ tool: 'capabilities' });
    expect(clone).not.toHaveBeenCalled();
  });
  it('preserves actual conversions and ordinary requests', () => {
    expect(detectToolRequest('Can you convert 100 USD to CAD?')?.tool).toBe('currency');
    expect(detectToolRequest('Weather in Vancouver')?.tool).toBe('weather');
    expect(detectToolRequest('Write a poem about currency exchange')).toBeNull();
    expect(detectToolRequest('Can you search GitHub for chat apps?')).toBeNull();
  });
});
