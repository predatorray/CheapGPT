import { describe, expect, it, vi } from 'vitest';
import { websiteUrl, readWebsite } from './website';

describe('website tool URL handling', () => {
  it.each(['https://example.com/', 'Read https://example.com/', 'Summarize https://example.com/'])(
    'recognizes %s',
    (input) => {
      expect(websiteUrl(input)).toBe('https://example.com/');
    },
  );
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:password@example.com/',
    'write a poem about example.com',
  ])('rejects %s', (input) => expect(websiteUrl(input)).toBeNull());
  it('does not swallow user cancellation as a restriction', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    try {
      await expect(readWebsite('https://example.com/', controller.signal)).rejects.toThrow(
        'Aborted',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
