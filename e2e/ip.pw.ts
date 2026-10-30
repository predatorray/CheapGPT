import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true }));
  await page.route('https://ipwho.is/**', route => route.fulfill({ json: { success: true, ip: '203.0.113.42', city: 'Test city', region: 'Test region', country: 'Test country' } }));
  await page.goto('/');
});
test('my IP requests call the caller endpoint and display its actual response', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https://ipwho.is/')) requests.push(request.url()); });
  expect(requests).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('what’s my ip address');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('203.0.113.42');
  await expect(page.locator('.assistant .message-content')).not.toContainText('1.1.1.1');
  await expect(page.locator('.source-card strong')).toHaveText('203.0.113.42');
  expect(requests).toEqual(['https://ipwho.is/']);
});
test('manual IP lookup accepts my IP', async ({ page }) => {
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'IP lookup' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('my IP');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('203.0.113.42');
});
test('an available model cannot replace the service answer with 1.1.1.1', async ({ page }) => {
  await page.evaluate(() => {
    const session = () => ({
      clone: async () => session(), destroy: () => {},
      prompt: async () => 'Public IP',
      promptStreaming: async function* () { yield 'Your IP is 1.1.1.1'; },
    });
    Object.defineProperty(window, 'LanguageModel', { configurable: true, value: { availability: async () => 'available', create: async () => session() } });
  });
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill("What's my IP address?");
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('203.0.113.42');
  await expect(page.locator('.assistant .message-content')).not.toContainText('1.1.1.1');
});
test('a blocked service never produces a guessed IP', async ({ page }) => {
  await page.route('https://ipwho.is/**', route => route.abort('accessdenied'));
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('What is my IP?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.message-error')).toBeVisible();
  await expect(page.locator('.assistant .message-content')).not.toContainText('1.1.1.1');
  await expect(page.locator('.source-card')).toHaveCount(0);
});
