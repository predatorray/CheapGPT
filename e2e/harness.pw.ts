import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'America/Vancouver' });

async function mockModel(page: import('@playwright/test').Page, stall = false) {
  await page.addInitScript(
    ({ stall }) => {
      const calls = { create: 0, plans: [] as string[], replies: [] as unknown[], destroyed: 0 };
      Object.assign(window, { harnessCalls: calls });
      const session = () => ({
        clone: async () => session(),
        destroy: () => {
          calls.destroyed++;
        },
        prompt: async (input: string) => {
          calls.plans.push(input);
          return '{"tool":"rename_conversation","query":"Hijacked title"}';
        },
        promptStreaming: async function* (input: unknown) {
          calls.replies.push(input);
          if (stall) await new Promise(() => {});
          yield 'A local answer from the tiny brain.';
        },
      });
      Object.defineProperty(window, 'LanguageModel', {
        configurable: true,
        value: {
          availability: async () => 'available',
          create: async () => {
            calls.create++;
            return session();
          },
        },
      });
    },
    { stall },
  );
}

test('calculator bypasses model startup and network, and survives reloading history', async ({
  page,
}) => {
  await mockModel(page);
  await page.goto('/');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) requests.push(request.url());
  });
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Calculate (125 + 75) * 15%');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('= 30');
  await expect(page.locator('.source-heading')).toContainText('Calculator · On your device');
  expect(
    await page.evaluate(
      () => (window as unknown as { harnessCalls: { create: number } }).harnessCalls.create,
    ),
  ).toBe(0);
  expect(requests).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.getByRole('button', { name: 'Calculate (125 + 75) * 15%', exact: true }).click();
  await expect(page.locator('.source-heading')).toContainText('Calculator · On your device');
});

test('manual local tools work without LanguageModel and invalid arithmetic stays an error', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { configurable: true, value: undefined }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Calculator' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('1 / 0');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.message-error')).toContainText('Division by zero');
  await page.getByRole('button', { name: 'Calculator', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Date & time' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('UTC');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content').last()).toContainText('(UTC)');
});

test('clock honors an explicit timezone across the local date boundary', async ({ page }) => {
  await mockModel(page);
  await page.clock.setFixedTime(new Date('2026-10-30T01:00:00Z'));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('What is today’s date?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText(
    'Thursday, October 29, 2026',
  );
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('What time is it in UTC?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content').last()).toContainText(
    'Friday, October 30, 2026',
  );
});

test('Just chat disables even deterministic automatic tools', async ({ page }) => {
  await mockModel(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto tools', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Just chat' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Calculate 2 + 2');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toHaveText(
    'A local answer from the tiny brain.',
  );
  await expect(page.locator('.source-heading')).toHaveCount(0);
});

test('model plans cannot rename a chat, and a new chat contains no previous context', async ({
  page,
}) => {
  await mockModel(page);
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Message CheapGPT' })
    .fill('Remember the secret word octopus');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('A local answer');
  await expect(page.locator('.conversation-heading')).not.toContainText('Hijacked');
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('What did I just say?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  const replies = () =>
    page.evaluate(
      () =>
        (window as unknown as { harnessCalls: { replies: { content: string }[][] } }).harnessCalls
          .replies,
    );
  expect(JSON.stringify((await replies())[1])).toContain('secret word octopus');
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('A fresh question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('A local answer');
  expect(JSON.stringify((await replies()).at(-1))).not.toContain('octopus');
});

test('Stop releases a stalled generation and lets the next local request run', async ({ page }) => {
  await mockModel(page, true);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Hello');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(page.locator('.assistant .message-content')).toContainText('Stopped');
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill('Calculate 2 + 2');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.assistant .message-content').last()).toContainText('= 4');
});
