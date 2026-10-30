import { toolInfo } from './tools';

// Read the installed public-tool registry so newly installed tools appear automatically.
export function listCapabilities() {
  return [
    ...toolInfo.map((tool) => ({
      id: tool.id,
      name: tool.name,
      usage: tool.placeholder,
      limits: tool.quota,
    })),
    {
      id: 'rename_conversation',
      name: 'Rename conversation',
      usage: 'Rename this conversation to Garden plans',
      limits: 'Changes this chat title locally and permanently stops automatic title updates.',
    },
    {
      id: 'capabilities',
      name: 'List capabilities',
      usage: 'What tools do you have?',
      limits: 'Lists installed tools locally; does not perform lookups or transactions.',
    },
  ];
}

export function capabilitySummary() {
  return (
    'I can use these installed tools:\n\n' +
    listCapabilities()
      .map((tool) => `- **${tool.name}** — Example: “${tool.usage}”. ${tool.limits}`)
      .join('\n') +
    '\n\nFor USD/CAD currency exchange, I can calculate conversions using daily reference rates. Try “Convert 100 USD to CAD”. I cannot transfer money or execute trades. Public lookups need an internet connection and provider availability.'
  );
}

export function isCapabilityQuestion(input: string) {
  const text = input.trim();
  if (/^(?:can|could) you (?:please )?(?:search|find|look up|rename|change|set)\b/i.test(text))
    return false;
  return (
    /^(?:what (?:tools|capabilities|functions|features) (?:do you have|are available|can you use)|(?:list|show)(?: me)? (?:your |the |available |installed )*(?:tools|capabilities)|what can you do)\b/i.test(
      text,
    ) ||
    (/^(?:(?:please|hi|hey)[, ]+)?(?:can|could|are|do) you\b/i.test(text) &&
      /\b(?:capable|able|support|have access|tools?|capabilities|currency|exchange|convert|weather|forecast|wikipedia|github|repositories|openstreetmap|places|ip lookup|rename|title)\b/i.test(
        text,
      ))
  );
}
