import type { Conversation, ToolResult } from './types';
const key = 'cheapgpt.conversations.v1';
function validResult(data: unknown): data is ToolResult {
  if (!data || typeof data !== 'object') return false;
  const result = data as Record<string, unknown>;
  return (
    ['wikipedia', 'github', 'places', 'weather', 'ip', 'currency'].includes(String(result.tool)) &&
    typeof result.summary === 'string' &&
    Array.isArray(result.sources) &&
    result.sources.every((s: unknown) => {
      if (!s || typeof s !== 'object') return false;
      const source = s as Record<string, unknown>;
      return (
        typeof source.title === 'string' &&
        typeof source.url === 'string' &&
        typeof source.detail === 'string'
      );
    })
  );
}
export function loadConversations(): Conversation[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (c): c is Conversation =>
          c &&
          typeof c.id === 'string' &&
          typeof c.title === 'string' &&
          typeof c.updatedAt === 'number' &&
          Array.isArray(c.messages) &&
          c.messages.every((m: unknown) => {
            if (!m || typeof m !== 'object') return false;
            const msg = m as Record<string, unknown>;
            return (
              typeof msg.id === 'string' &&
              ['user', 'assistant'].includes(String(msg.role)) &&
              typeof msg.content === 'string'
            );
          }),
      )
      .slice(0, 50)
      .map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          elapsed: typeof m.elapsed === 'number' ? m.elapsed : undefined,
          error: m.error === true,
          interrupted: m.interrupted === true,
          result: validResult(m.result) ? m.result : undefined,
        })),
      }));
  } catch {
    return [];
  }
}
export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(key, JSON.stringify(conversations.slice(0, 50)));
}
