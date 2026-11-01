import { test, expect } from '@playwright/test';
import { model, noModel, send, calls, call, finish } from './model-fixture';

test('explicit memory save survives reload and reaches replies in a new Just chat conversation', async ({
  page,
}) => {
  await model(
    page,
    [call('memory.save', { key: 'temperature', value: 'I prefer Celsius' }), finish],
    'Remembered.',
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://')) external.push(request.url());
  });
  await send(page, 'Remember that I prefer Celsius');
  await expect(page.getByLabel('Task progress')).toContainText('complete');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('cheapgpt.memory.v1')!).entries),
    )
    .toEqual([{ key: 'temperature', value: 'I prefer Celsius' }]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'About CheapGPT', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved memory', exact: true })).toContainText(
    'I prefer Celsius',
  );
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Just chat' }).click();
  await send(page, 'Which temperature units do I prefer?');
  const observed = await calls(page);
  expect(observed.plans).toHaveLength(0);
  expect(JSON.stringify(observed.replies)).toContain('I prefer Celsius');
  expect(JSON.stringify(observed.replies)).toContain('current request takes priority');
  expect(external).toEqual([]);
});

test('settings can edit, disable, forget and clear memory without a model', async ({ page }) => {
  await noModel(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('cheapgpt.memory.v1'))
      localStorage.setItem(
        'cheapgpt.memory.v1',
        JSON.stringify({
          enabled: true,
          entries: [
            { key: 'temperature', value: 'I prefer Celsius' },
            { key: 'name', value: 'My name is Alex' },
          ],
        }),
      );
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'About CheapGPT', exact: true }).click();
  const memory = page.getByRole('region', { name: 'Saved memory', exact: true });
  await memory.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await memory.getByRole('textbox', { name: 'Fact for temperature' }).fill('I prefer Fahrenheit');
  await memory.getByRole('button', { name: 'Save fact' }).click();
  await expect(memory).toContainText('I prefer Fahrenheit');
  await page.getByRole('switch', { name: 'Use saved memory' }).uncheck();
  await page.getByRole('switch', { name: 'Remember conversations' }).uncheck();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'About CheapGPT', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Use saved memory' })).not.toBeChecked();
  await expect(memory).toContainText('I prefer Fahrenheit');
  await memory.getByRole('button', { name: 'Forget temperature', exact: true }).click();
  await expect(memory).not.toContainText('I prefer Fahrenheit');
  await expect(memory).toContainText('My name is Alex');
  await memory.getByRole('button', { name: 'Clear saved memory' }).click();
  await memory.getByRole('button', { name: 'Forget all saved facts' }).click();
  await expect(memory).toContainText('No saved memories yet.');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('cheapgpt.memory.v1')!)),
  ).toEqual({ enabled: false, entries: [] });
});

test('manual Memory group can forget an existing fact', async ({ page }) => {
  await model(page, [call('memory.forget', { key: 'temperature' }), finish], 'Forgotten.');
  await page.addInitScript(() =>
    localStorage.setItem(
      'cheapgpt.memory.v1',
      JSON.stringify({
        enabled: true,
        entries: [{ key: 'temperature', value: 'I prefer Celsius' }],
      }),
    ),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Memory', exact: false }).click();
  await send(page, 'Forget my temperature preference');
  await expect(page.getByLabel('Task progress')).toContainText('complete');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('cheapgpt.memory.v1')!).entries),
  ).toEqual([]);
});
