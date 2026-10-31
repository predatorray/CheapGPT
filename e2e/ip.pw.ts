import { test, expect } from '@playwright/test';
import { model, send, calls, call, finish } from './model-fixture';
test('own-IP request calls caller endpoint and supplies actual response to local model', async ({
  page,
}) => {
  await model(
    page,
    [call('ip.lookup', { query: 'current' }), finish],
    'Your public IP is 203.0.113.10.',
  );
  let endpoint = '';
  await page.route('https://ipwho.is/**', (route) => {
    endpoint = route.request().url();
    return route.fulfill({
      json: {
        success: true,
        ip: '203.0.113.10',
        city: 'Test City',
        country: 'Test',
        connection: { isp: 'Fixture' },
      },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'What is my IP address?');
  expect(new URL(endpoint).pathname).toBe('/');
  expect(JSON.stringify((await calls(page)).replies)).toContain('203.0.113.10');
});
test('blocked IP service preserves failure without invented tool evidence', async ({ page }) => {
  await model(page, [call('ip.lookup', { query: 'current' }), finish], 'The IP lookup failed.');
  await page.route('https://ipwho.is/**', (r) => r.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'What is my IP address?');
  await expect(page.getByLabel('Task progress')).toContainText('partial');
  expect(JSON.stringify((await calls(page)).replies)).not.toContain('1.1.1.1');
});
