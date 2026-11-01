import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { model, noModel, send, calls, call, finish, attach } from './model-fixture';

test('exact budget prompt requires model planning, references exact results and downloads CSV', async ({
  page,
}) => {
  await model(
    page,
    [
      call('currency.convert', { amount: 250, from: 'USD', to: 'CAD' }),
      call('calculator.adjust', {
        operation: 'add_percent',
        operand: 12,
        label: 'Total including tax',
      }),
      call('calculator.adjust', {
        operation: 'divide',
        operand: 3,
        label: 'Per person including tax',
      }),
      call('file.export_results', { name: 'budget', format: 'csv', resultIds: ['r3'] }),
      finish,
    ],
    'Each person pays CAD 128.33.',
  );
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({ json: { base: 'USD', date: '2026-10-30', rates: { CAD: 1.375 } } }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(
    page,
    'Convert 250 USD to CAD, add 12% tax, split between 3 people and export as CSV.',
  );
  await expect(page.getByLabel('Task progress')).toContainText('4/4 steps completed');
  const observed = await calls(page);
  expect(observed.creates).toBe(1);
  expect(observed.plans).toHaveLength(18);
  expect(observed.replies).toHaveLength(1);
  expect(JSON.stringify(observed.replies)).toContain('128.33');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download budget.csv' }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toContain('"128.33"');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.locator('.history-item > button').first().click();
  await expect(page.getByRole('button', { name: 'Download budget.csv' })).toBeVisible();
});
test('different amount, tax and split finish without an unrequested file', async ({ page }) => {
  await model(
    page,
    [
      call('currency.convert', { amount: 1000, from: 'USD', to: 'CAD' }),
      call('calculator.adjust', {
        operation: 'add_percent',
        operand: 13,
        label: 'Including 13 percent tax',
      }),
      call('calculator.adjust', {
        operation: 'divide',
        operand: 8,
        label: 'Per person across 8 people',
      }),
      finish,
    ],
    'Each person pays CAD 197.31.',
  );
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({ json: { base: 'USD', date: '2026-10-30', rates: { CAD: 1.3969 } } }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Convert 1000 USD to CAD, add 13% tax, split between 8 people');
  await expect(page.getByLabel('Task progress')).toContainText('complete · 3/3');
  await expect(page.getByRole('button', { name: /Download/ })).toHaveCount(0);
  const observed = await calls(page);
  expect(JSON.stringify(observed.replies)).toContain('197.31');
  expect((observed.replies[0] as { content: string }[]).at(-1)?.content).toContain(
    '"currency":"CAD"',
  );
  expect(observed.plans).toHaveLength(12);
});

test('no local model means no hidden currency workflow', async ({ page }) => {
  await noModel(page);
  let requests = 0;
  page.on('request', (r) => {
    if (r.url().includes('frankfurter')) requests++;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(
    page,
    'Convert 250 USD to CAD, add 12% tax, split between 3 people and export as CSV.',
  );
  await expect(page.locator('.assistant .message-content')).toContainText(
    'does not expose the local LanguageModel',
  );
  expect(requests).toBe(0);
  await expect(page.getByLabel('Task progress')).toHaveCount(0);
});
test('CSV aggregation and follow-up export use saved structured results chosen by model', async ({
  page,
}) => {
  await model(page, [
    call('table.query', {
      documentId: 'unused',
      aggregate: { operation: 'sum', column: 'Amount', groupBy: 'Team' },
    }),
    finish,
  ]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await attach(page, 'expenses.csv', 'Team,Amount\nA,12\nB,4\nA,8');
  // The random attachment id is read from the app's metadata prompt by this mock only.
  await page.evaluate(() => {
    const factory = window.LanguageModel!;
    const original = factory.create;
    factory.create = async (...args) => {
      const base = await original(...args);
      const clone = base.clone;
      base.clone = async (...args) => {
        const session = await clone(...args);
        const prompt = session.prompt;
        session.prompt = async (input, options) => {
          const text = await prompt(input, options);
          if (typeof input === 'string' && input.startsWith('Generate arguments')) {
            const id = input.match(/"id":"([^"]+)","name":"expenses.csv"/)?.[1];
            return text.replace('unused', id!);
          }
          return text;
        };
        return session;
      };
      return base;
    };
  });
  await send(page, 'Sum Amount by Team');
  await expect(page.locator('.task-table')).toContainText('20');
  expect((await calls(page)).replies).toHaveLength(1);
});
test('repository comparison reads both files and passes source evidence to final model', async ({
  page,
}) => {
  await model(
    page,
    [
      call('github.read_file', { repository: 'sample/one' }),
      call('github.read_file', { repository: 'sample/two' }),
      finish,
    ],
    'Both projects document npm setup.',
  );
  await page.route('https://api.github.com/repos/**/readme', (r) =>
    r.fulfill({
      json: {
        content: Buffer.from('# Project\nInstall with npm ci.').toString('base64'),
        encoding: 'base64',
        size: 30,
        path: 'README.md',
        html_url: r.request().url().replace('api.github.com/repos', 'github.com'),
      },
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Compare GitHub repositories sample/one and sample/two');
  await expect(page.getByLabel('Task progress')).toContainText('2/2');
  await page.locator('.task-sources > summary').click();
  await expect(page.locator('.task-sources .source-card')).toHaveCount(2);
  expect(JSON.stringify((await calls(page)).replies)).toContain('npm ci');
});
test('clarification comes from local model without fabricated results', async ({ page }) => {
  await model(page, [{ action: 'clarify', message: 'Which source timezone should I use?' }]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Convert my meeting time, then create a calendar event');
  await expect(page.locator('.assistant .message-content')).toContainText('Which source timezone');
  expect((await calls(page)).replies).toHaveLength(0);
  await expect(page.getByRole('button', { name: /Download/ })).toHaveCount(0);
});
test('a failed task with no completed tool work does not draft from old results', async ({
  page,
}) => {
  await model(
    page,
    [
      call('calculator.evaluate', { expression: '6*7', label: 'Prior result' }),
      finish,
      call('website.read', { query: 'https://blocked.example/article' }),
      finish,
    ],
    'The result is 42.',
  );
  await page.route('https://blocked.example/**', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await send(page, 'Calculate 6 times 7');
  await send(page, 'Read https://blocked.example/article');
  await expect(page.locator('.assistant .message-content').last()).toContainText(
    'Local AI could not complete',
  );
  await expect(page.locator('.assistant .message-content').last()).not.toContainText(
    'result is 42',
  );
  expect((await calls(page)).replies).toHaveLength(1);
});

test('Stop preserves completed calculations during final model drafting', async ({ page }) => {
  await model(page, [call('calculator.evaluate', { expression: '12*7' }), finish], 'Never', true);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Calculate twelve times seven, then explain');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByLabel('Task progress')).toContainText('1/1 steps completed');
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(page.getByLabel('Task progress')).toContainText('stopped');
  await expect(page.getByLabel('Task progress')).toContainText('84');
});

// These exercise the browser orchestration contract with explicit model decisions.
// Real Nano quality is checked separately in connected Chrome.
for (const scenario of [
  {
    message: 'I have another bill which is 300 USD. do it again.',
    amount: 300,
    tax: 12,
    people: 3,
    csv: false,
  },
  {
    message: 'Do the same for 480 USD, but use 5% tax and 4 people.',
    amount: 480,
    tax: 5,
    people: 4,
    csv: false,
  },
  {
    message: 'Repeat for 1000 USD, use 13% tax and 8 people, and export as CSV.',
    amount: 1000,
    tax: 13,
    people: 8,
    csv: true,
  },
]) {
  test(`replays a multi-tool procedure: ${scenario.message}`, async ({ page }) => {
    const chain = (amount: number, tax: number, people: number) => [
      call('currency.convert', { amount, from: 'USD', to: 'CAD' }),
      call('calculator.adjust', { operation: 'add_percent', operand: tax, label: 'Including tax' }),
      call('calculator.adjust', { operation: 'divide', operand: people, label: 'Per person' }),
    ];
    const request = `Convert ${scenario.amount} USD to CAD, add ${scenario.tax}% tax, split between ${scenario.people} people${scenario.csv ? ' and export as CSV.' : ''}`;
    await model(page, [
      ...chain(250, 12, 3),
      finish,
      { action: 'intent', mode: 'replay', request },
      {
        action: 'patch',
        baseTask: 0,
        edits: [
          { before: '250 USD', after: `${scenario.amount} USD` },
          { before: '12% tax', after: `${scenario.tax}% tax` },
          { before: '3 people', after: `${scenario.people} people` },
        ],
        append: scenario.csv ? 'and export as CSV.' : '',
      },
      ...chain(scenario.amount, scenario.tax, scenario.people),
      ...(scenario.csv
        ? [call('file.export_results', { name: 'repeat', format: 'csv', resultIds: ['r3'] })]
        : []),
      finish,
    ]);
    await page.route('https://api.frankfurter.dev/**', (route) =>
      route.fulfill({ json: { base: 'USD', date: '2026-10-30', rates: { CAD: 1.375 } } }),
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await send(page, 'Convert 250 USD to CAD, add 12% tax, split between 3 people');
    await send(page, scenario.message);
    const panel = page.getByLabel('Task progress').last();
    await expect(panel).toContainText(`complete · ${scenario.csv ? '4/4' : '3/3'}`);
    await panel.locator('summary').first().click();
    await panel.getByText('Local AI resolved request', { exact: true }).click();
    await expect(panel).toContainText(request);
    const observed = await calls(page);
    const lastReply = (observed.replies.at(-1) as { content: string }[])
      .map((message) => message.content)
      .join('\n');
    expect(lastReply).toContain(
      String((scenario.amount * 1.375 * (1 + scenario.tax / 100)) / scenario.people),
    );
    expect(lastReply).toContain('"currency":"CAD"');
    expect(lastReply).not.toContain('p1');
    if (scenario.csv) {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download repeat.csv' }).click();
      expect(await readFile((await (await download).path())!, 'utf8')).toContain('CAD 194.22');
    }
  });
}
