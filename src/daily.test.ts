import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectToolRequest } from './model';
import { runTool } from './tools';
import { calculate } from './calculator';
import { dateTimeSummary } from './datetime';
import { websiteUrl } from './website';

afterEach(() => vi.unstubAllGlobals());

describe('everyday request phrasing', () => {
  it.each([
    ['What is my timezone?', 'datetime', 'timezone'],
    ['What’s my time zone?', 'datetime', 'timezone'],
    ['Which time zone am I in?', 'datetime', 'timezone'],
    ['Could you please tell me my timezone?', 'datetime', 'timezone'],
    ['What date is it?', 'datetime', 'local'],
    ['Could you tell me the current time?', 'datetime', 'local'],
    ['What is 15% of 80?', 'calculator', '15% * 80'],
    ['Calculate 15 percent of 80', 'calculator', '15% * 80'],
    ['How much is 18 * 7?', 'calculator', '18 * 7'],
    ['Calculate 1,250 + 75', 'calculator', '1,250 + 75'],
    ['What is 12 × 8?', 'calculator', '12 × 8'],
    ['Can you check the weather in Vancouver?', 'weather', 'Vancouver'],
    ['Could you please show me the forecast for Tokyo?', 'weather', 'Tokyo'],
    ['Please search GitHub for React chat apps', 'github', 'React chat apps'],
    [
      'Could you rename this conversation to Weekly planning?',
      'rename_conversation',
      'Weekly planning',
    ],
    ['Could you please look up octopuses on Wikipedia?', 'wikipedia', 'octopuses'],
    ['Can you look up IP 1.1.1.1?', 'ip', '1.1.1.1'],
    [
      'Can you summarize https://example.com/?q=octopus&lang=en',
      'website',
      'https://example.com/?q=octopus&lang=en',
    ],
  ])('routes %s correctly without a model', (prompt, tool, query) => {
    expect(detectToolRequest(prompt)).toEqual({ tool, query });
  });
  it.each([
    ['What is 15% of 80?', 12],
    ['How much is 18 * 7?', 126],
    ['Calculate 1,250 + 75', 1325],
    ['What is 12 × 8?', 96],
    ['What is 144 ÷ 12?', 12],
    ['What is 20 percent of 1,250?', 250],
  ])('returns the correct result for %s with no network', async (prompt, answer) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const request = detectToolRequest(prompt)!;
    const result = await runTool('calculator', request.query, new AbortController().signal);
    expect(result.summary).toContain(`**${answer}**`);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['1,25 + 2', '12,34,567 + 1', '1, + 1', '1,2345 + 1'])(
    'rejects ambiguous grouping in %s',
    (input) => {
      expect(() => calculate(input)).toThrow('thousands');
    },
  );
  it.each([
    'Draft a polite follow-up email about an invoice',
    'Summarize these meeting notes: launch moved to Friday',
    'Help me debug this Python loop',
    'Write a poem about GitHub',
    'Please write a story about time zones',
    'What is an IP address?',
    'Explain how percentages work',
  ])('keeps ordinary model tasks as chat: %s', (input) => {
    expect(detectToolRequest(input)).toBeNull();
  });
  it('keeps capability questions distinct from actions', () => {
    expect(detectToolRequest('Do you support weather forecasts?')?.tool).toBe('capabilities');
    expect(detectToolRequest('Can you do currency exchange between USD and CAD?')?.tool).toBe(
      'capabilities',
    );
  });
  it('uses browser settings for timezone answers without network or geolocation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await runTool('datetime', 'What is my timezone?', new AbortController().signal);
    expect(result.summary).toContain(`**${zone}**`);
    expect(result.summary).toContain('UTC offset');
    expect(result.summary).toContain('not a verified physical location');
    expect(dateTimeSummary('timezone', new Date('2026-01-15T12:00:00Z'))).toContain(zone);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves the complete supplied URL, including query punctuation', () => {
    expect(websiteUrl('Could you please read https://example.com/?q=why?')).toBe(
      'https://example.com/?q=why?',
    );
  });
});
