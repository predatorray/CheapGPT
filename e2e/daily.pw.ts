import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'America/Vancouver' });
test.beforeEach(async ({ page }) => {
  // All prompts in this suite should work without starting or downloading a model.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'LanguageModel', {
      configurable: true,
      value: {
        availability: async () => 'available',
        create: () => {
          throw new Error('This request should not start local AI.');
        },
      },
    });
  });
});

for (const [date, offset] of [
  ['2026-10-30T01:00:00Z', 'UTC-07:00'],
  ['2026-01-15T12:00:00Z', 'UTC-08:00'],
]) {
  test(`timezone question uses browser settings and the seasonal offset ${offset}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(date));
    await page.goto('/');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://')) requests.push(request.url());
    });
    await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('What is my timezone?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.assistant .message-content')).toContainText('America/Vancouver');
    await expect(page.locator('.assistant .message-content')).toContainText(offset);
    await expect(page.locator('.assistant .message-content')).toContainText('browser settings');
    await expect(page.locator('.message-error')).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}

test('daily arithmetic, dates, and polite rename work end to end', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-30T01:00:00Z'));
  await page.goto('/');
  for (const [prompt, answer] of [
    ['What is 15% of 80?', '= 12'],
    ['How much is 18 * 7?', '= 126'],
    ['Calculate 1,250 + 75', '= 1325'],
    ['What is 12 × 8?', '= 96'],
    ['What is 144 ÷ 12?', '= 12'],
    ['Could you tell me the current time?', 'Thursday, October 29, 2026'],
    ['What date is it?', 'Thursday, October 29, 2026'],
    [
      'Could you rename this conversation to Weekly planning?',
      'Conversation renamed to “Weekly planning”',
    ],
  ]) {
    await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill(prompt);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.assistant .message-content').last()).toContainText(answer);
  }
  await expect(page.locator('.conversation-heading')).toContainText('Weekly planning');
  await expect(page.locator('.message-error')).toHaveCount(0);
});

test('polite weather and GitHub requests perform the requested lookups rather than listing capabilities', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { configurable: true, value: undefined }),
  );
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        results: [{ name: 'Vancouver', country: 'Canada', latitude: 49.28, longitude: -123.12 }],
      },
    }),
  );
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        current: { temperature_2m: 12, apparent_temperature: 10, wind_speed_10m: 5 },
        daily: {
          time: ['2026-10-30'],
          temperature_2m_max: [14],
          temperature_2m_min: [8],
          precipitation_probability_max: [40],
        },
      },
    }),
  );
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            full_name: 'example/react-chat',
            html_url: 'https://github.com/example/react-chat',
            description: 'A fixture repository',
            stargazers_count: 12,
            language: 'TypeScript',
          },
        ],
      },
    }),
  );
  await page.goto('/');
  const weather = page.waitForRequest('https://geocoding-api.open-meteo.com/**');
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Can you check the weather in Vancouver?');
  await page.getByRole('button', { name: 'Send message' }).click();
  expect(new URL((await weather).url()).searchParams.get('name')).toBe('Vancouver');
  await expect(page.locator('.source-card').last()).toContainText('12°C');
  const github = page.waitForRequest('https://api.github.com/**');
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Please search GitHub for React chat apps');
  await page.getByRole('button', { name: 'Send message' }).click();
  expect(new URL((await github).url()).searchParams.get('q')).toBe('React chat apps');
  await expect(page.locator('.source-card').last()).toContainText('example/react-chat');
});

test('Just chat still opts out of timezone detection', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { configurable: true, value: undefined }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Just chat' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('What is my timezone?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.message-error')).toBeVisible();
  await expect(page.locator('.source-heading')).toHaveCount(0);
});
