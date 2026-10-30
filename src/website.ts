import type { ToolResult } from './types';

export function websiteUrl(input: string): string | null {
  const match = input
    .trim()
    .match(
      /^(?:(?:please\s+)?(?:read|open|visit|browse|summarize|navigate to)\s+(?:the\s+(?:website|page)\s+)?(?:at\s+)?)?(https?:\/\/\S+)$/i,
    );
  if (!match) return null;
  try {
    const url = new URL(match[1]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function readWebsite(input: string, signal: AbortSignal): Promise<ToolResult> {
  const url = websiteUrl(input);
  if (!url)
    throw new Error(
      'Enter an HTTP or HTTPS URL, for example “Read https://example.com/”. URLs with embedded credentials are not supported.',
    );
  const blocked = (reason: string): ToolResult => ({
    tool: 'website',
    unavailable: true,
    summary: `I couldn’t read this website. ${reason} Open the original link below to view it directly. I won’t invent a summary of a page I couldn’t fetch.`,
    sources: [
      {
        title: new URL(url).hostname,
        url,
        detail:
          'Page content is unavailable to CheapGPT. The link opens the original website in a new tab.',
      },
    ],
  });
  const combined = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  try {
    const response = await fetch(url, {
      signal: combined,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'text/html, text/plain, application/xhtml+xml' },
    });
    if (!response.ok)
      return blocked(
        `The website returned HTTP ${response.status}${response.status === 451 ? ' (unavailable for legal reasons)' : ''}. It may restrict access by region, require sign-in, or block automated requests.`,
      );
    const type = response.headers.get('content-type') || '';
    if (!/^(text\/html|text\/plain|application\/xhtml\+xml)\b/i.test(type)) {
      await response.body?.cancel();
      return blocked(
        'Only HTML and plain-text pages are supported; PDFs, downloads, and other media cannot be read here.',
      );
    }
    const reader = response.body?.getReader();
    if (!reader) return blocked('The website returned no readable response body.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_048_576) {
          await reader.cancel();
          return blocked('This page exceeds the 1 MB reading limit.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder().decode(bytes);
    let title = new URL(url).hostname;
    let text = html;
    if (!type.toLowerCase().startsWith('text/plain')) {
      // An unattached template is inert: no page scripts, images, frames, or styles are loaded.
      const template = document.createElement('template');
      template.innerHTML = html;
      title = template.content.querySelector('title')?.textContent?.trim() || title;
      template.content
        .querySelectorAll(
          'script,style,noscript,iframe,object,embed,svg,form,nav,header,footer,aside',
        )
        .forEach((node) => node.remove());
      const main = template.content.querySelector('main,article') || template.content;
      main
        .querySelectorAll('p,div,section,li,h1,h2,h3,h4,br')
        .forEach((node) => node.appendChild(document.createTextNode('\n')));
      text = main.textContent || '';
    }
    text = text
      .replace(/[\t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text)
      return blocked(
        'No readable text was found. This site may require JavaScript or sign-in; CheapGPT does not run a remote page’s scripts.',
      );
    return {
      tool: 'website',
      summary: `Read ${title}. This is the fetched page text, not an interactive browser session.`,
      sources: [
        {
          title: title.slice(0, 200),
          url,
          detail:
            text.slice(0, 8000) +
            (text.length > 8000 ? '\n[Page text truncated to 8,000 characters.]' : ''),
        },
      ],
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return blocked(
      combined.aborted
        ? 'The request timed out after 15 seconds.'
        : 'The browser could not access the page. CORS (cross-origin restrictions), a regional block, mixed HTTP/HTTPS content, or a network failure may be responsible. Browsers do not expose the exact cause. No proxy or restriction bypass was attempted.',
    );
  }
}
