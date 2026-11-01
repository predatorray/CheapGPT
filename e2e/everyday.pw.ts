import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { model, send, call, finish, calls, attach } from './model-fixture';

// Deterministic orchestration contracts; actual Nano checks run separately in Chrome.
test('travel scheduling converts the calculated instant and exports that result', async ({
  page,
}) => {
  await model(page, [
    call('date.calculate', { start: '2026-11-01T00:30:00-07:00', amount: 2, unit: 'hours' }),
    call('date.convert', { instant: { $ref: 'r1.instant' }, timeZone: 'Asia/Tokyo' }),
    call('file.export_results', { name: 'arrival', format: 'json', resultIds: ['r2'] }),
    finish,
  ]);
  await page.goto('/');
  await send(
    page,
    'Add 2 hours to 2026-11-01T00:30:00-07:00, display the result in Asia/Tokyo, and export as JSON.',
  );
  await expect(page.getByLabel('Task progress')).toContainText('complete · 3/3');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download arrival.json' }).click();
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(data[0].data).toMatchObject({
    instant: '2026-11-01T09:30:00.000Z',
    timeZone: 'Asia/Tokyo',
  });
  expect(data[0].data.value).toContain('6:30:00 PM');
  const routing = (await calls(page)).plans.filter((prompt) => prompt.startsWith('Bind tools'));
  expect(routing[1]).toContain('"instant":"2026-11-01T09:30:00.000Z"');
  expect(routing[2]).toContain('"timeZone":"Asia/Tokyo"');
});

test('calendar invitation preserves title, offsets and description in an ICS download', async ({
  page,
}) => {
  await model(page, [
    call('file.create', {
      name: 'review',
      format: 'ics',
      data: {
        title: 'Project review',
        start: '2026-11-02T09:00:00-08:00',
        end: '2026-11-02T09:45:00-08:00',
        description: 'Discuss roadmap; bring notes',
      },
    }),
    finish,
  ]);
  await page.goto('/');
  await send(
    page,
    'Create a calendar file for Project review from 2026-11-02T09:00:00-08:00 to 2026-11-02T09:45:00-08:00. Description: Discuss roadmap; bring notes.',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download review.ics' }).click();
  const data = await readFile((await (await download).path())!, 'utf8');
  expect(data).toContain('DTSTART:20261102T170000Z');
  expect(data).toContain('DTEND:20261102T174500Z');
  expect(data).toContain('SUMMARY:Project review');
  expect(data).toContain('DESCRIPTION:Discuss roadmap\\; bring notes');
});

test('inventory filtering and sorting exports actual remaining rows', async ({ page }) => {
  await model(page, [
    call('documents.read', { documentId: '@attachment:inventory.csv' }),
    call('table.query', {
      source: 'r1.table',
      filter: { column: 'Stock', op: 'lt', value: 5 },
      sort: { column: 'Stock', direction: 'asc' },
      select: ['Item', 'Stock'],
    }),
    call('file.export_results', { name: 'restock', format: 'csv', resultIds: ['r2'] }),
    finish,
  ]);
  await page.goto('/');
  await attach(
    page,
    'inventory.csv',
    'Item,Stock,Category\nPencils,3,Office\nPaper,20,Office\nTape,1,Office\nCoffee,8,Kitchen',
  );
  await send(
    page,
    'Read inventory.csv, filter Stock below 5 and sort by Stock ascending, and export as CSV.',
  );
  await expect(page.getByLabel('Task progress')).toContainText('complete · 3/3');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download restock.csv' }).click();
  const data = await readFile((await (await download).path())!, 'utf8');
  expect(data).toBe('"Item","Stock"\r\n"Tape","1"\r\n"Pencils","3"');
});

test('public repository comparison passes both source documents to final drafting', async ({
  page,
}) => {
  await model(page, [
    call('github.read_file', { repository: 'sample/alpha' }),
    call('github.read_file', { repository: 'sample/beta' }),
    finish,
  ]);
  await page.route('https://api.github.com/repos/**/readme', (route) =>
    route.fulfill({
      json: {
        encoding: 'base64',
        content: Buffer.from(
          route.request().url().includes('alpha')
            ? 'Alpha is a command-line linter.'
            : 'Beta is a browser drawing application.',
        ).toString('base64'),
        path: 'README.md',
      },
    }),
  );
  await page.goto('/');
  await send(page, 'Read the README of sample/alpha, read the README of sample/beta');
  const evidence = JSON.stringify((await calls(page)).replies);
  expect(evidence).toContain('command-line linter');
  expect(evidence).toContain('browser drawing application');
});

test('meeting notes extraction exports evidence-backed fields and null for missing data', async ({
  page,
}) => {
  await model(page, [
    call('documents.read', { documentId: '@attachment:meeting.txt' }),
    call('documents.extract', {
      text: { $ref: 'r1.text' },
      fields: ['Owner', 'Deadline', 'Budget'],
    }),
    { action: 'extraction', args: { Owner: 'Maya', Deadline: '2026-11-06', Budget: null } },
    call('file.export_results', { name: 'actions', format: 'json', resultIds: ['r2'] }),
    finish,
  ]);
  await page.goto('/');
  await attach(
    page,
    'meeting.txt',
    'Project: Atlas\nOwner: Maya\nDeadline: 2026-11-06\nAction: Send draft agenda.',
  );
  await send(page, 'Read meeting.txt, extract Owner and Deadline and Budget, and export as JSON.');
  await expect(page.getByLabel('Task progress')).toContainText('complete · 3/3');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download actions.json' }).click();
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(data[0].data).toMatchObject({
    fields: { Owner: 'Maya', Deadline: '2026-11-06', Budget: null },
  });
});

test('lookup plus two-sentence summary performs only the lookup', async ({ page }) => {
  await model(page, [
    {
      action: 'outline',
      args: {
        steps: [
          { kind: 'tool', purpose: 'Search Wikipedia for axolotls' },
          { kind: 'response', purpose: 'and summarize in two sentences.' },
        ],
      },
    },
    call('wikipedia.search', { query: 'axolotls' }),
    finish,
  ]);
  let requests = 0;
  await page.route('https://en.wikipedia.org/w/api.php**', (route) => {
    requests++;
    return route.fulfill({
      json: {
        query: {
          pages: {
            1: {
              title: 'Axolotl',
              extract: 'The axolotl is a salamander that retains larval features.',
              fullurl: 'https://en.wikipedia.org/wiki/Axolotl',
            },
          },
        },
      },
    });
  });
  await page.goto('/');
  await send(page, 'Search Wikipedia for axolotls and summarize in two sentences.');
  await expect(page.getByLabel('Task progress')).toContainText('complete · 1/1');
  expect(requests).toBe(1);
  const final = (await calls(page)).replies.at(-1) as { content: string }[];
  expect(final.at(-1)?.content).toContain('and summarize in two sentences.');
  expect(final.at(-1)?.content).toContain('retains larval features');
});

test('follow-up download selects the final sorted table instead of intermediate metadata', async ({
  page,
}) => {
  await model(page, [
    call('documents.read', { documentId: '@attachment:inventory.csv' }),
    call('table.query', { source: 'r1.table', filter: { column: 'Stock', op: 'lt', value: 5 } }),
    call('table.query', { source: 'r2.table', sort: { column: 'Stock', direction: 'asc' } }),
    call('file.export_results', { name: 'inventory', format: 'csv', resultIds: ['r3'] }),
    finish,
    { action: 'intent', mode: 'use_results', request: 'Export the final sorted table as CSV.' },
    call('file.export_results', { name: 'sorted', format: 'csv', resultIds: ['p3'] }),
    finish,
  ]);
  await page.goto('/');
  await attach(page, 'inventory.csv', 'Item,Stock\nPencils,3\nPaper,20\nTape,1');
  await send(
    page,
    'Read inventory.csv, filter Stock below 5, sort by Stock ascending, and export as CSV.',
  );
  await send(page, 'Export the final sorted table as CSV.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sorted.csv' }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toBe(
    '"Item","Stock"\r\n"Tape","1"\r\n"Pencils","3"',
  );
  const observed = (await calls(page)).plans
    .filter((prompt) =>
      prompt.startsWith('Generate arguments for ONE tool call: file.export_results'),
    )
    .at(-1)!;
  const schema = JSON.parse(observed.split('Allowed schema: ')[1].split('\n')[0]);
  expect(schema.properties.resultIds.items.enum).toEqual(['p1', 'p2', 'p3']);
});

test('current-result export binds to the last data table without model-written result IDs', async ({
  page,
}) => {
  await model(page, [
    call('documents.read', { documentId: '@attachment:inventory.csv' }),
    call('table.query', { source: 'r1.table', filter: { column: 'Stock', op: 'lt', value: 5 } }),
    call('table.query', { source: 'r2.table', sort: { column: 'Stock', direction: 'asc' } }),
    call('file.export_current', { name: 'sorted', format: 'csv' }),
    finish,
  ]);
  await page.goto('/');
  await attach(page, 'inventory.csv', 'Item,Stock\nPencils,3\nPaper,20\nTape,1');
  await send(
    page,
    'Read inventory.csv, filter Stock below 5, sort by Stock ascending, and export as CSV.',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sorted.csv' }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toBe(
    '"Item","Stock"\r\n"Tape","1"\r\n"Pencils","3"',
  );
  expect(JSON.stringify((await calls(page)).replies)).toContain('resultIds');
});

test('ordinary email drafting receives final-response instructions without invented email tools', async ({
  page,
}) => {
  await model(page, [], "Hi Sam, could you share Friday's agenda? Thanks!");
  await page.goto('/');
  await send(page, 'Draft a short polite email to Sam asking for Friday’s agenda. Don’t send it.');
  const observed = await calls(page);
  expect(observed.replies).toHaveLength(1);
  const reply = observed.replies[0] as { content: string }[];
  expect(reply.at(-1)?.content).toContain('FINAL RESPONSE phase');
  expect(reply.at(-1)?.content).toContain('Draft a short polite email to Sam');
  await expect(page.getByLabel('Task progress')).toHaveCount(0);
  await expect(page.locator('.assistant .message-content')).toContainText('Hi Sam');
});

test('Hello gets a local-model reply with one decision and no tool-planning chain', async ({
  page,
}) => {
  await model(page, [{ action: 'social' }], 'Hello! What can I help with?');
  await page.goto('/');
  await send(page, 'Hello');
  await expect(page.locator('.assistant .message-content')).toHaveText(
    'Hello! What can I help with?',
  );
  await expect(page.getByLabel('Task progress')).toHaveCount(0);
  const observed = await calls(page);
  expect(observed.creates).toBe(1);
  expect(observed.plans).toHaveLength(1);
  expect(observed.replies).toHaveLength(1);
});

test('a greeting after a completed task does not replay that task', async ({ page }) => {
  await model(
    page,
    [call('datetime.now', { query: 'timezone' }), finish, { action: 'social' }],
    'Hi again!',
  );
  await page.goto('/');
  await send(page, 'What is my timezone?');
  const before = await calls(page);
  await send(page, 'Hello');
  await expect(page.locator('.assistant .message-content').last()).toHaveText('Hi again!');
  const after = await calls(page);
  expect(after.plans).toHaveLength(before.plans.length + 1);
  expect(after.replies).toHaveLength(before.replies.length + 1);
  expect(after.plans.at(-1)).toContain('Does THIS user message');
});

test('a greeting prefix does not bypass a requested clock lookup', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  await model(page, [call('datetime.now', { query: 'UTC' }), finish], 'It is noon UTC.');
  await page.goto('/');
  await send(page, 'Hello, what time is it in UTC?');
  await expect(page.getByLabel('Task progress')).toContainText('complete · 1/1');
  const observed = await calls(page);
  expect(observed.plans.length).toBeGreaterThan(1);
  expect(observed.replies).toHaveLength(1);
  expect(JSON.stringify(observed.replies)).toContain('2026-11-01T12:00:00.000Z');
});
