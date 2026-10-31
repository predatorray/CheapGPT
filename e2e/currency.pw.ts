import { test, expect } from '@playwright/test';
import { model, send, calls, call, finish } from './model-fixture';
for (const manual of [false, true])
  test(`currency conversion uses model and exact provider data (manual=${manual})`, async ({
    page,
  }) => {
    await model(
      page,
      [call('currency.convert', { amount: 1234.56, from: 'USD', to: 'CAD' }), finish],
      'The converted amount is CAD 1,697.52.',
    );
    await page.route('https://api.frankfurter.dev/**', (route) =>
      route.fulfill({ json: { base: 'USD', date: '2026-10-30', rates: { CAD: 1.375 } } }),
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (manual) {
      await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
      await page.getByRole('menuitem').filter({ hasText: 'Exchange rates' }).click();
    }
    await send(page, 'Convert 1,234.56 USD to CAD');
    await page.locator('.task-panel > details:first-child > summary').click();
    await expect(page.getByLabel('Task progress')).toContainText('CAD 1,697.52');
    expect(JSON.stringify((await calls(page)).replies)).toContain('1697.52');
  });
test('missing target rate stays a failed tool result', async ({ page }) => {
  await model(
    page,
    [call('currency.convert', { amount: 1, from: 'USD', to: 'CAD' }), finish],
    'The service did not return the requested rate.',
  );
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({ json: { base: 'USD', date: '2026-10-30', rates: { EUR: 0.9 } } }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Convert 1 USD to CAD');
  await expect(page.getByLabel('Task progress')).toContainText('partial');
  await expect(page.getByLabel('Task progress')).toContainText('error');
});
