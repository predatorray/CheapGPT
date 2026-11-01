import { test, expect } from '@playwright/test';
import { model, send, calls, call, finish } from './model-fixture';

for (const manual of [false, true])
  test(`web search returns source cards and model evidence (manual=${manual})`, async ({
    page,
  }) => {
    const query = 'independent search engines';
    await model(page, [call('web.search', { query }), finish]);
    const requests: string[] = [];
    await page.route('https://puri.li/api/search?*', (route) => {
      requests.push(new URL(route.request().url()).searchParams.get('q')!);
      return route.fulfill({
        json: {
          results: [
            {
              title: 'Independent search guide',
              url: 'https://example.com/search-guide',
              description: 'A snippet from the public web index.',
            },
          ],
        },
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (manual) {
      await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
      await page.getByRole('menuitem').filter({ hasText: 'Web search' }).click();
    }
    await send(page, `Search the web for ${query}`);
    await expect(page.getByLabel('Task progress')).toContainText('complete');
    await page.locator('.task-sources > summary').click();
    await expect(page.locator('.source-card')).toContainText(
      'A snippet from the public web index.',
    );
    await expect(page.locator('.source-card').first()).toHaveAttribute(
      'href',
      'https://example.com/search-guide',
    );
    expect(requests).toEqual([query]);
    expect(JSON.stringify((await calls(page)).replies)).toContain(
      'A snippet from the public web index.',
    );
  });
