import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { model, send, calls, call, finish } from './model-fixture';

test('real browser CORS blocks responses without permission headers', async ({ page }) => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' });
    res.end('<main>Secret to this origin only</main>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Server failed');
    const url = `http://127.0.0.1:${address.port}/`;
    await model(
      page,
      [call('website.read', { query: url }), finish],
      'The page could not be read.',
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await send(page, `Read ${url}`);
    await expect(page.getByLabel('Task progress')).toContainText(
      'CORS (cross-origin restrictions)',
    );
    expect(JSON.stringify((await calls(page)).replies)).not.toContain('Secret to this origin only');
    expect(hits).toBe(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('website is inert text, passed to local model without scripts, frames or images', async ({
  page,
}) => {
  const external: string[] = [];
  await model(page, [call('website.read', { query: 'https://readable.example/article' }), finish]);
  page.on('request', (r) => {
    if (r.url().startsWith('https://readable.example')) external.push(r.url());
  });
  await page.route('https://readable.example/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '<title>A small website</title><main><h1>Hello world</h1><p>Readable article text.</p><script>window.attacked=true</script><img src="https://readable.example/tracker.png"><iframe src="https://readable.example/frame"></iframe></main>',
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Summarize https://readable.example/article');
  await page.locator('.task-sources > summary').click();
  await expect(page.locator('.source-card')).toContainText('Readable article text.');
  expect(JSON.stringify((await calls(page)).replies)).not.toContain('window.attacked');
  expect(external).toEqual(['https://readable.example/article']);
});
for (const [contentType, status, expected] of [
  ['text/plain', 451, 'HTTP 451'],
  ['application/pdf', 200, 'Only HTML and plain-text pages are supported'],
] as const)
  test(`website failure ${expected} is preserved`, async ({ page }) => {
    await model(
      page,
      [call('website.read', { query: 'https://files.example/file' }), finish],
      'The requested content is unavailable.',
    );
    await page.route('https://files.example/**', (r) =>
      r.fulfill({
        status,
        contentType,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'Unavailable',
      }),
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await send(page, 'Read https://files.example/file');
    await expect(page.getByLabel('Task progress')).toContainText(expected);
  });
