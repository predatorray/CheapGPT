import { test, expect } from '@playwright/test';

test('place searches show inline maps and retain them after reload', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true }),
  );
  await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
    route.fulfill({
      json: [
        { display_name: 'Stanley Park, Vancouver', lat: '49.3', lon: '-123.14', type: 'park' },
      ],
    }),
  );
  // Test the integration without contacting the public map server.
  await page.route('https://www.openstreetmap.org/export/embed.html*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Map fixture</p>' }),
  );
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Find Stanley Park on OpenStreetMap');
  await page.getByRole('button', { name: 'Send message' }).click();
  const map = page.locator('iframe[title="OpenStreetMap map of Stanley Park, Vancouver"]');
  await expect(map).toBeVisible();
  expect(new URL((await map.getAttribute('src'))!).searchParams.get('marker')).toBe('49.3,-123.14');
  await expect(page.locator('.source-card')).toHaveAttribute('href', /www.openstreetmap.org/);
  await expect(page.locator('.place-map')).toContainText('OpenStreetMap contributors');
  await page.reload();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.locator('.history-item > button').first().click();
  await expect(map).toBeVisible();
});
