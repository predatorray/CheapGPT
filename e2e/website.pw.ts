import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true }),
  );
  await page.goto('/');
});

test('real browser CORS enforcement blocks a server that omits permission headers', async ({
  page,
}) => {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits++;
    response.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' });
    response.end('<main>Secret to this origin only</main>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed to start');
    await page
      .getByRole('textbox', { name: 'Message CheapGPT' })
      .fill(`Read http://127.0.0.1:${address.port}/`);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.assistant .message-content')).toContainText(
      'CORS (cross-origin restrictions)',
    );
    await expect(page.locator('.source-card')).not.toContainText('Secret to this origin only');
    expect(hits).toBe(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('auto reads a URL as inert text without loading scripts or images', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://readable.example')) external.push(r.url());
  });
  await page.route('https://readable.example/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '<title>A small website</title><main><h1>Hello world</h1><p>Readable article text.</p><script>window.attacked = true</script><img src="https://readable.example/tracker.png"><iframe src="https://readable.example/frame"></iframe></main>',
    }),
  );
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Summarize https://readable.example/article');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.source-card')).toContainText('Readable article text.');
  await expect(page.locator('.source-card')).not.toContainText('window.attacked');
  await expect(page.locator('.source-card strong')).toContainText('A small website');
  expect(external).toEqual(['https://readable.example/article']);
});

test('a failed cross-origin request explains restrictions and preserves an open link', async ({
  page,
}) => {
  await page.route('https://blocked.example/**', (route) => route.abort('accessdenied'));
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('https://blocked.example/article');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText(
    'CORS (cross-origin restrictions)',
  );
  await expect(page.locator('.assistant .message-content')).toContainText('regional block');
  await expect(page.locator('.source-card')).toHaveAttribute(
    'href',
    'https://blocked.example/article',
  );
  await expect(page.locator('.source-card')).toContainText('Page content is unavailable');
});

test('manual website tool reports a visible regional HTTP restriction', async ({ page }) => {
  await page.route('https://regional.example/**', (route) =>
    route.fulfill({
      status: 451,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'text/plain',
      body: 'Unavailable',
    }),
  );
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Read website' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('https://regional.example/');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('HTTP 451');
  await expect(page.locator('.assistant .message-content')).not.toContainText('Local AI is off');
});

test('binary files are not sent to the local model as page text', async ({ page }) => {
  await page.route('https://files.example/**', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-fixture' }),
  );
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Read https://files.example/file.pdf');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText(
    'Only HTML and plain-text pages are supported',
  );
});
