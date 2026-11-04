import { test, expect } from '@playwright/test';
import { model, send, calls, call, finish, attach } from './model-fixture';
import { readFile } from 'node:fs/promises';

function firstResult(replies: unknown[]) {
  const prompts = replies[0] as { content: string }[];
  const reference = prompts.at(-1)!.content.split('stale):\n')[1].split('\n')[0];
  return JSON.parse(reference).data.results[0].data;
}

for (const manual of [false, true])
  test(`JavaScript runs in a real worker and supplies its result to the model (manual=${manual})`, async ({
    page,
  }) => {
    await model(page, [
      call('javascript.run', {
        code: 'const counts = {}; for (const word of input) counts[word] = (counts[word] || 0) + 1; console.log("Counted", input.length, "words"); return counts;',
        input: ['red', 'blue', 'red'],
      }),
      finish,
    ]);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const external: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://')) external.push(request.url());
    });
    if (manual) {
      await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
      await page.getByRole('menuitem').filter({ hasText: 'JavaScript sandbox' }).click();
    }
    await send(page, 'Use JavaScript to count word frequencies in red blue red');
    await expect(page.getByLabel('Task progress')).toContainText('complete');
    expect(firstResult((await calls(page)).replies)).toEqual({
      value: { red: 2, blue: 1 },
      logs: ['Counted 3 words'],
    });
    expect(external).toEqual([]);
  });

test('sandbox code cannot reach browser APIs, storage, host globals or the network', async ({
  page,
}) => {
  await model(page, [
    call('javascript.run', {
      code: 'return { storage: typeof localStorage, document: typeof document, worker: typeof Worker, fetch: typeof fetch, self: typeof self, escape: console.log.constructor("return typeof fetch")() };',
    }),
    finish,
  ]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await send(page, 'Use JavaScript to inspect which browser APIs are available in the sandbox');
  await expect(page.getByLabel('Task progress')).toContainText('complete');
  expect(firstResult((await calls(page)).replies).value).toEqual({
    storage: 'undefined',
    document: 'undefined',
    worker: 'undefined',
    fetch: 'undefined',
    self: 'undefined',
    escape: 'undefined',
  });
  expect(requests.every((url) => url.startsWith('http://127.0.0.1:5173/'))).toBe(true);
});

test('infinite JavaScript is interrupted and the app remains responsive', async ({ page }) => {
  await model(page, [call('javascript.run', { code: 'while (true) {}' }), finish]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Run an infinite loop in JavaScript to check the execution limit');
  await expect(page.getByLabel('Task progress')).toContainText('1-second execution limit');
  await expect(page.getByLabel('Task progress')).toContainText('partial');
  await expect(page.getByRole('textbox', { name: 'Message CheapGPT' })).toBeEnabled();
  expect((await calls(page)).replies).toHaveLength(0);
});

test('JavaScript numeric results feed arithmetic and a JSON download', async ({ page }) => {
  await model(page, [
    call('javascript.run', { code: 'return new Set(input).size;', input: ['red', 'blue', 'red'] }),
    call('calculator.adjust', { operation: 'add', operand: 10, label: 'Adjusted count' }),
    call('file.export_current', { name: 'count.json', format: 'json' }),
    finish,
  ]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(
    page,
    'Use JavaScript to count unique words in red blue red, then add 10 to the count and export the result as JSON',
  );
  await expect(page.getByLabel('Task progress')).toContainText('complete');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download count.json' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const saved = JSON.parse(Buffer.concat(chunks).toString());
  expect(saved[0].data.value).toBe(12);
});

test('JavaScript transforms attached table data, chains a table query and exports a CSV', async ({
  page,
}) => {
  await model(page, [
    call('documents.read', { documentId: '@attachment:prices.csv' }),
    call('javascript.run', {
      code: 'return { table: { columns: ["Item", "Doubled"], rows: input.rows.map(row => [row[0], Number(row[1]) * 2]) } };',
      input: { $ref: 'r1.table' },
    }),
    call('table.query', { source: 'r2.table', sort: { column: 'Doubled', direction: 'desc' } }),
    call('file.export_current', { name: 'doubled.csv', format: 'csv' }),
    finish,
  ]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await attach(page, 'prices.csv', 'Item,Price\nPencil,3\nPaper,8');
  await send(
    page,
    'Read prices.csv, then use JavaScript to double Price for every Item into a Doubled column, then sort Doubled descending and export as CSV',
  );
  await expect(page.getByLabel('Task progress')).toContainText('complete');
  await expect(page.locator('.task-table')).toContainText('16');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download doubled.csv' }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toBe('"Item","Doubled"\r\n"Paper","16"\r\n"Pencil","6"');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.locator('.history-item > button').first().click();
  await expect(page.getByRole('button', { name: 'Download doubled.csv' })).toBeVisible();
  await expect(page.getByLabel('Task progress')).toContainText('Run JavaScript');
});

test('Stop terminates a live sandbox worker and preserves the stopped task', async ({ page }) => {
  await model(page, [call('javascript.run', { code: 'while (true) {}' }), finish]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Run JavaScript with an infinite loop');
  const workerPromise = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Send message' }).click();
  const worker = await workerPromise;
  const closed = new Promise<void>((resolve) => worker.once('close', () => resolve()));
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await closed;
  await expect(page.getByLabel('Task progress')).toContainText('stopped');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
});
