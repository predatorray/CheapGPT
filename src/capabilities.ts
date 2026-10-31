import { toolInfo } from './tools';

// Read the installed tool registry so newly installed tools appear automatically.
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
    '\n\nAuto mode can chain up to six validated tool calls and prepare downloadable files. Attach text, Markdown, JSON or CSV for local document questions and table operations. Use structured tools to retrieve facts, calculate values, and prepare downloadable files as needed. Every submitted prompt, including simple lookups, is handled by local AI; no rule-based prompt routing or model-free answers are used.\n\nFor USD/CAD currency exchange, I can calculate conversions using daily reference rates. Try “Convert 100 USD to CAD”. I cannot transfer money or execute trades. Public lookups need an internet connection and provider availability.'
  );
}
