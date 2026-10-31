import { expect, type Page } from '@playwright/test';

// Contract tests only: explicit queued model decisions, never a simulated Nano-quality check.
export async function model(
  page: Page,
  actions: unknown[],
  final = 'Answer from completed results.',
  stall = false,
) {
  await page.addInitScript(
    ({ actions, final, stall }) => {
      const calls = { plans: [] as string[], replies: [] as unknown[], creates: 0 };
      Object.assign(window, { taskTestCalls: calls });
      let pendingArgs: unknown;
      let pendingOutline: unknown;
      let workPartsRemaining = 0;
      let pendingScope: { fileRequested: boolean; useHistory: boolean; groups: string[] };
      let pendingCalls: { tool: string; args: unknown }[] = [];
      const session = () => ({
        clone: async () => session(),
        destroy: () => {},
        prompt: async (input: string) => {
          calls.plans.push(input);
          if (input.startsWith('Does THIS user message')) {
            pendingScope = {
              fileRequested: actions
                .slice(
                  0,
                  Math.max(
                    0,
                    actions.findIndex((a) => (a as { action?: string }).action === 'finish'),
                  ) || actions.length,
                )
                .some((a) => (a as { tool?: string }).tool?.startsWith('file.')),
              useHistory: JSON.stringify(actions).includes('p1.'),
              groups: [
                ...new Set(
                  actions.flatMap((a) => {
                    const tool = (a as { tool?: string }).tool;
                    if (!tool) return [];
                    if (tool === 'github.read_file') return ['github_file'];
                    const prefix = tool.split('.')[0];
                    return [
                      ({ file: 'export', date: 'date_math' } as Record<string, string>)[prefix] ||
                        prefix,
                    ];
                  }),
                ),
              ],
            };
            return JSON.stringify({ fileRequested: pendingScope.fileRequested });
          }
          if (input.startsWith('Select only the tool groups'))
            return JSON.stringify({
              useHistory: pendingScope.useHistory,
              groups: pendingScope.groups,
            });
          if (input.startsWith('Create an ordered executable plan')) {
            pendingCalls = [];
            let clarification: string | undefined;
            while (actions.length) {
              const action = actions.shift() as {
                action: string;
                tool: string;
                args: unknown;
                message?: string;
              };
              if (action.action === 'clarify') {
                clarification = action.message;
                break;
              }
              if (action.action === 'finish') break;
              pendingCalls.push({ tool: action.tool, args: action.args });
            }
            const workCount = pendingCalls.filter((a) => !a.tool.startsWith('file.')).length;
            const text = JSON.parse(input.split('User request: ').at(-1)!) as string;
            let workText = text,
              fileInstruction: string | undefined;
            if (pendingScope.fileRequested) {
              const index = text.search(/\b(?:export|download)\b/i);
              if (workCount && index >= 0) {
                fileInstruction = text.slice(index);
                workText = text
                  .slice(0, index)
                  .replace(/\b(?:and|then)\s*$/i, '')
                  .trim();
              } else {
                fileInstruction = text;
                workText = '';
              }
            }
            let parts = workText.split(/\s*,\s*|\s+then\s+/i).filter(Boolean);
            if (parts.length > workCount) parts = workCount ? [workText] : [];
            workPartsRemaining = parts.length;
            pendingOutline = {
              steps: [...parts, ...(fileInstruction ? [fileInstruction] : [])].map((purpose) => ({
                purpose,
              })),
              ...(clarification ? { clarification } : {}),
            };
            return JSON.stringify(pendingOutline);
          }
          if (input.startsWith('Check this decomposition')) return JSON.stringify(pendingOutline);
          if (input.startsWith('Choose one capability group')) {
            const tool = pendingCalls[0]?.tool;
            const prefix = tool?.split('.')[0] || 'calculator';
            return JSON.stringify({
              group:
                tool === 'github.read_file'
                  ? 'github_file'
                  : ({ file: 'export', date: 'date_math' } as Record<string, string>)[prefix] ||
                    prefix,
            });
          }
          if (input.startsWith('Bind tools for this instruction')) {
            const work = pendingCalls.filter((a) => !a.tool.startsWith('file.'));
            const selected =
              workPartsRemaining > 0
                ? work.slice(0, Math.max(1, work.length - workPartsRemaining-- + 1))
                : pendingCalls.filter((a) => a.tool.startsWith('file.'));
            return JSON.stringify({
              steps: selected.map((action) => ({
                tool: action.tool,
                purpose:
                  (action.args as { label?: string })?.label || 'Execute this requested operation',
              })),
            });
          }
          if (input.startsWith('Check arguments')) return JSON.stringify(pendingArgs);
          pendingArgs = pendingCalls.shift()?.args ?? {};
          return JSON.stringify(pendingArgs);
        },
        promptStreaming: async function* (input: unknown) {
          calls.replies.push(input);
          if (stall) await new Promise(() => {});
          yield final;
        },
      });
      Object.defineProperty(window, 'LanguageModel', {
        configurable: true,
        value: {
          availability: async () => 'available',
          create: async () => {
            calls.creates++;
            return session();
          },
        },
      });
    },
    { actions, final, stall },
  );
}
export async function noModel(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true }),
  );
}
export async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message CheapGPT' }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
}
export async function calls(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          taskTestCalls: { plans: string[]; replies: unknown[]; creates: number };
        }
      ).taskTestCalls,
  );
}
export const call = (tool: string, args: object) => ({ action: 'call', tool, args });
export const finish = { action: 'finish' };
export async function attach(page: Page, name: string, text: string) {
  await page
    .getByLabel('Attach local files')
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
}
