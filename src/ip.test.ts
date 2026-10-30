import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_IP_QUERY, isCurrentIpRequest } from './ip';
import { detectToolRequest, planTool } from './model';
import { runTool } from './tools';
import type { ModelSession } from './types';

afterEach(() => vi.unstubAllGlobals());
const reply = (ip: string) => new Response(JSON.stringify({ success: true, ip, city: 'Test city', region: 'Test region', country: 'Test country' }), { status: 200 });
describe('requested caller IP lookup', () => {
  it.each(["what’s my ip address", "What's my IP?", "What is my public IP address?", "my IP", "Could you please show me my IP address?"])('routes %s without guessing an address', async input => {
    expect(isCurrentIpRequest(input)).toBe(true);
    expect(detectToolRequest(input)).toEqual({ tool: 'ip', query: CURRENT_IP_QUERY });
    const clone = vi.fn();
    expect(await planTool({ clone } as unknown as ModelSession, input, new AbortController().signal)).toEqual({ tool: 'ip', query: CURRENT_IP_QUERY });
    expect(clone).not.toHaveBeenCalled();
  });
  it.each(['Write a poem about my IP address', 'What is an IP address?', 'IP lookup 1.1.1.1'])('does not infer caller lookup for %s', input => expect(isCurrentIpRequest(input)).toBe(false));
  it.each(['current', 'my IP', 'What’s my IP address?'])('calls the no-address endpoint for %s', async input => {
    const fetch = vi.fn().mockResolvedValue(reply('203.0.113.42')); vi.stubGlobal('fetch', fetch);
    const result = await runTool('ip', input, new AbortController().signal);
    expect(fetch).toHaveBeenCalledWith('https://ipwho.is/', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
    expect(result.summary).toContain('203.0.113.42');
    expect(result.summary).toContain('VPN');
  });
  it('refreshes the caller IP after a network change instead of caching it', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply('203.0.113.42')).mockResolvedValueOnce(reply('198.51.100.24')); vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    expect((await runTool('ip', 'current', signal)).summary).toContain('203.0.113.42');
    expect((await runTool('ip', 'current', signal)).summary).toContain('198.51.100.24');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps explicit-address lookups separate', async () => {
    const fetch = vi.fn().mockResolvedValue(reply('8.8.4.4')); vi.stubGlobal('fetch', fetch);
    expect((await runTool('ip', '8.8.4.4', new AbortController().signal)).summary).toContain('8.8.4.4');
    expect(fetch).toHaveBeenCalledWith('https://ipwho.is/8.8.4.4', expect.anything());
  });
  it('propagates service failures without substituting an example IP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(runTool('ip', 'current', new AbortController().signal)).rejects.toThrow('Failed to fetch');
  });
});
