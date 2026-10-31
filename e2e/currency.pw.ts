import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // No downloaded native model is needed for this deterministic tool chain.
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true }),
  );
  await page.route('https://api.frankfurter.dev/v1/latest*', (route) =>
    route.fulfill({ json: { base: 'USD', date: '2026-10-29', rates: { CAD: 1.375, JPY: 151.1 } } }),
  );
  await page.goto('/');
});

test('automatically extracts and converts 1 USD to CAD from the conversation', async ({
  page,
  browser,
}) => {
  console.info(`Browser: Chromium ${browser.version()}; exchange-rate response is a test fixture.`);
  const request = page.waitForRequest('https://api.frankfurter.dev/v1/latest*');
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Convert 1 USD to CAD');
  await page.getByRole('button', { name: 'Send message' }).click();
  expect(new URL((await request).url()).searchParams.get('base')).toBe('USD');
  await expect(page.locator('.source-card strong')).toHaveText('USD 1.00 = CAD 1.38');
  await expect(page.locator('.source-card')).toContainText('1 × 1.375 = 1.375 CAD');
  await expect(page.locator('.source-card')).toContainText('2026-10-29');
  await expect(page.locator('.message-error')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('manual currency selection accepts the whole conversion prompt', async ({ page }) => {
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Exchange rates' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Convert 100 USD to CAD');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.source-card strong')).toHaveText('USD 100.00 = CAD 137.50');
});

test('grouped decimal amounts and target minor units are calculated by code', async ({ page }) => {
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Please convert 1,000.50 usd to jpy');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.source-card strong')).toHaveText('USD 1,000.50 = JPY 151,176');
});

test('a missing target rate shows an error instead of inventing an amount', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Convert 1 USD to ZZZ');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.message-error')).toContainText(
    'No valid reference rate is available for ZZZ',
  );
  await expect(page.locator('.source-card')).toHaveCount(0);
});

test('Just chat does not execute conversion tools', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('api.frankfurter.dev')) requests++;
  });
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Just chat' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Convert 1 USD to CAD');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.message-error')).toBeVisible();
  expect(requests).toBe(0);
});

test('an available model cannot rewrite a calculated conversion', async ({ page }) => {
  await page.evaluate(() => {
    let plannerCalls = 0;
    Object.defineProperty(window, 'plannerCalls', { get: () => plannerCalls });
    const session = () => ({
      clone: async () => session(),
      destroy: () => {},
      prompt: async () => {
        plannerCalls++;
        return '{"tool":"currency","query":"USD"}';
      },
      promptStreaming: async function* () {
        yield 'See the calculated result below.';
      },
    });
    Object.defineProperty(window, 'LanguageModel', {
      configurable: true,
      value: {
        availability: async () => 'available',
        create: async () => session(),
      },
    });
  });
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Convert 1 USD to CAD');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.source-card strong')).toHaveText('USD 1.00 = CAD 1.38');
  await expect(page.locator('.assistant .message-content')).toContainText('USD 1.00 = CAD 1.38');
  expect(
    await page.evaluate(() => (window as unknown as { plannerCalls: number }).plannerCalls),
  ).toBe(0);
});
