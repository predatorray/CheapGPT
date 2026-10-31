import { test, expect } from '@playwright/test';
import { model, send, calls, call, finish } from './model-fixture';
for (const date of ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z'])
  test(`timezone uses browser settings via model-selected clock on ${date}`, async ({ page }) => {
    await page.clock.install({ time: new Date(date) });
    await model(page, [call('datetime.now', { query: 'timezone' }), finish]);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await send(page, 'What is my timezone?');
    expect(JSON.stringify((await calls(page)).replies)).toContain('timeZone');
    await page.locator('.task-panel > details:first-child > summary').click();
    await expect(page.getByLabel('Task progress')).toContainText('Check clock');
  });
test('explicit rename is selected by model and freezes automatic titles', async ({ page }) => {
  await model(
    page,
    [call('conversation.rename', { title: 'Weekly planning' }), finish],
    'Renamed to Weekly planning.',
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Could you rename this conversation to Weekly planning?');
  await expect(page.getByRole('region', { name: 'Conversation', exact: true })).toContainText(
    'Weekly planning',
  );
});
test('date arithmetic and calendar exports use model arguments', async ({ page }) => {
  await model(page, [
    call('date.calculate', { start: '2026-10-30', amount: 7, unit: 'days' }),
    finish,
    call('file.create', {
      name: 'meeting',
      format: 'ics',
      data: {
        title: 'Team planning',
        start: '2026-10-30T09:00:00-07:00',
        end: '2026-10-30T10:00:00-07:00',
      },
    }),
    finish,
  ]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Add 7 days to 2026-10-30');
  expect(JSON.stringify((await calls(page)).replies)).toContain('2026-11-06');
  await send(
    page,
    'Create calendar event Team planning from 2026-10-30T09:00:00-07:00 to 2026-10-30T10:00:00-07:00',
  );
  await expect(page.getByRole('button', { name: 'Download meeting.ics' })).toBeVisible();
});
