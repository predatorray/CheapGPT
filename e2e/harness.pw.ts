import { test, expect } from '@playwright/test';
import { model, noModel, send, calls, call, finish } from './model-fixture';
test('calculator requires model startup, no external network, and final model sees result', async ({
  page,
}) => {
  await model(page, [call('calculator.evaluate', { expression: '12*7' }), finish], '84');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const external: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://')) external.push(r.url());
  });
  await send(page, 'What is 12 times 7?');
  const observed = await calls(page);
  expect(observed.creates).toBe(1);
  expect(observed.plans).toHaveLength(8);
  expect(JSON.stringify(observed.replies)).toContain('84');
  expect(external).toEqual([]);
});
test('manual tools also require LanguageModel', async ({ page }) => {
  await noModel(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Calculator' }).click();
  await send(page, '12*7');
  await expect(page.locator('.assistant .message-content')).toContainText('LanguageModel');
  await expect(page.getByLabel('Task progress')).toHaveCount(0);
});
test('Just chat uses local model without planning or tools', async ({ page }) => {
  await model(page, [call('calculator.evaluate', { expression: '12*7' })], 'A local chat answer.');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Just chat' }).click();
  await send(page, 'What is 12 times 7?');
  expect((await calls(page)).plans).toHaveLength(0);
  expect((await calls(page)).replies).toHaveLength(1);
  await expect(page.getByLabel('Task progress')).toHaveCount(0);
});
test('model cannot rename a chat without explicit authorization', async ({ page }) => {
  const rename = call('conversation.rename', { title: 'Injected title' });
  await model(page, [rename, rename], 'Could not perform that action.');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Write a poem');
  await expect(page.locator('.conversation-heading > span')).not.toHaveText('Injected title');
  await expect(page.getByLabel('Task progress')).toContainText('unavailable capability group');
});
