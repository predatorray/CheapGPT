import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { taskTools } from '../src/task-tools';
import { model, send, calls, call, finish, attach } from './model-fixture';

// Exercise the published prompts verbatim. Model decisions and public services are
// explicit fixtures; these tests do not measure live Nano inference quality.
const prompts = [...readFileSync('README.md', 'utf8').matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1]);
const scenarios = [
  { actions: [], evidence: 'invoice' },
  { actions: [], evidence: 'Summarize these meeting notes' },
  { actions: [call('calculator.evaluate', { expression: '15% * 80' })], evidence: '12' },
  { actions: [call('datetime.now', { query: 'timezone' })], evidence: 'timeZone' },
  { actions: [call('weather.forecast', { query: 'Vancouver' })], evidence: 'Vancouver' },
  { actions: [call('github.search', { query: 'React chat apps' })], evidence: 'sample/chat' },
  {
    actions: [
      call('currency.convert', { amount: 250, from: 'USD', to: 'CAD' }),
      call('calculator.adjust', { operation: 'add_percent', operand: 12, label: 'Tax' }),
      call('calculator.adjust', { operation: 'divide', operand: 3, label: 'Per person' }),
      call('file.export_current', { name: 'budget', format: 'csv' }),
    ],
    evidence: '128.33',
    download: 'budget.csv',
  },
  {
    actions: [
      call('documents.read', { documentId: '@attachment:notes.txt' }),
      call('documents.extract', { text: { $ref: 'r1.text' }, fields: ['owner', 'deadline'] }),
      { action: 'extraction', args: { owner: 'Maya', deadline: 'Friday' } },
    ],
    evidence: 'Maya',
    attachment: ['notes.txt', 'Owner: Maya\nDeadline: Friday'],
  },
  {
    actions: [
      call('table.query', {
        source: '@attachment:expenses.csv',
        sort: { column: 'Amount', direction: 'desc' },
      }),
    ],
    evidence: 'Amount',
    attachment: ['expenses.csv', 'Item,Amount\nSmall,2\nLarge,100\nMedium,15'],
  },
  {
    actions: [call('currency.convert', { amount: 100, from: 'USD', to: 'CAD' })],
    evidence: '137.5',
  },
  {
    actions: [call('website.read', { query: 'https://example.com/' })],
    evidence: 'Example Domain',
  },
  {
    actions: [call('conversation.rename', { title: 'Weekly planning' })],
    evidence: 'Weekly planning',
  },
];
test('all published prompt rows have a scenario', () =>
  expect(prompts).toHaveLength(scenarios.length));
for (const [i, scenario] of scenarios.entries()) {
  test(prompts[i], async ({ page }) => {
    await model(page, [...scenario.actions, finish]);
    await page.route('https://**/*', (route) => {
      const url = route.request().url();
      if (url.includes('frankfurter'))
        return route.fulfill({ json: { base: 'USD', date: '2026-10-30', rates: { CAD: 1.375 } } });
      if (url.includes('geocoding-api'))
        return route.fulfill({
          json: {
            results: [
              { name: 'Vancouver', country: 'Canada', latitude: 49.28, longitude: -123.12 },
            ],
          },
        });
      if (url.includes('api.open-meteo'))
        return route.fulfill({
          json: {
            current: { temperature_2m: 12, apparent_temperature: 10, wind_speed_10m: 4 },
            daily: {
              time: ['2026-11-03', '2026-11-04', '2026-11-05'],
              temperature_2m_max: [14, 15, 16],
              temperature_2m_min: [8, 9, 10],
              precipitation_probability_max: [10, 20, 30],
            },
          },
        });
      if (url.includes('api.github.com'))
        return route.fulfill({
          json: {
            items: [
              {
                full_name: 'sample/chat',
                html_url: 'https://github.com/sample/chat',
                description: 'React chat app',
                stargazers_count: 100,
                language: 'TypeScript',
              },
            ],
          },
        });
      if (url === 'https://example.com/')
        return route.fulfill({ contentType: 'text/html', body: '<main>Example Domain</main>' });
      return route.abort();
    });
    await page.goto('/');
    if (scenario.attachment) await attach(page, scenario.attachment[0], scenario.attachment[1]);
    await send(page, prompts[i]);
    const observed = await calls(page);
    expect(observed.replies).toHaveLength(1);
    // Scope selection must see every operation, not just the first tool in a group.
    const routing = observed.plans.find((prompt) =>
      prompt.startsWith('Select only the tool groups'),
    )!;
    const catalog = JSON.parse(routing.split('Groups: ')[1]);
    for (const tool of taskTools) {
      expect(catalog.find((group: { id: string }) => group.id === tool.group).tools).toContainEqual(
        { id: tool.id, description: tool.description },
      );
    }
    expect(JSON.stringify(observed.replies)).toContain(scenario.evidence);
    if (scenario.actions.length)
      await expect(page.getByLabel('Task progress')).toContainText('complete ·');
    if (scenario.download) {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: `Download ${scenario.download}` }).click();
      expect(await readFile((await (await download).path())!, 'utf8')).toContain('128.33');
    }
    if (i === 8) {
      const rows = page.locator('.task-table tbody tr');
      await expect(rows).toHaveText(['Large100', 'Medium15', 'Small2']);
    }
    if (i === 11)
      await expect(page.locator('.conversation-heading > span')).toHaveText('Weekly planning');
  });
}

test('Remember that I prefer temperatures in Celsius', async ({ page }) => {
  await model(page, [
    call('memory.save', { key: 'temperature', value: 'I prefer temperatures in Celsius' }),
    finish,
  ]);
  await page.goto('/');
  await send(page, 'Remember that I prefer temperatures in Celsius');
  await expect(page.getByLabel('Task progress')).toContainText('complete ·');
  expect(JSON.stringify((await calls(page)).replies)).toContain('I prefer temperatures in Celsius');
});
