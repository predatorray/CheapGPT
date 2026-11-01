import type { TaskSnapshot, Json } from './task-types';
import type { Conversation, ToolResult } from './types';
const key = 'cheapgpt.conversations.v1';
function validResult(data: unknown): data is ToolResult {
  if (!data || typeof data !== 'object') return false;
  const result = data as Record<string, unknown>;
  return (
    [
      'wikipedia',
      'github',
      'places',
      'weather',
      'ip',
      'currency',
      'website',
      'calculator',
      'datetime',
      'documents',
      'table',
      'date_math',
      'github_file',
      'export',
      'capabilities',
      'conversation',
    ].includes(String(result.tool)) &&
    typeof result.summary === 'string' &&
    (result.data === undefined || validData(result.data)) &&
    (result.artifact === undefined || validArtifact(result.artifact)) &&
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
function validData(data: unknown, depth = 0): data is Json {
  if (depth > 14) return false;
  if (data === null || typeof data === 'boolean' || typeof data === 'string')
    return typeof data !== 'string' || data.length <= 256000;
  if (typeof data === 'number') return Number.isFinite(data);
  if (Array.isArray(data))
    return data.length <= 2000 && data.every((item) => validData(item, depth + 1));
  return (
    !!data &&
    typeof data === 'object' &&
    Object.keys(data).length <= 100 &&
    Object.entries(data).every(
      ([key, item]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) && validData(item, depth + 1),
    )
  );
}
function validArtifact(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const file = data as Record<string, unknown>;
  return (
    typeof file.name === 'string' &&
    /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(?:md|csv|json|ics)$/.test(file.name) &&
    ['text/markdown', 'text/csv', 'application/json', 'text/calendar'].includes(
      String(file.mime),
    ) &&
    typeof file.content === 'string' &&
    file.content.length <= 256000
  );
}
function savedTask(data: unknown): TaskSnapshot | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const task = data as TaskSnapshot;
  if (
    (task.intent !== undefined &&
      (!task.intent ||
        !['independent', 'replay', 'use_results'].includes(task.intent.mode) ||
        typeof task.intent.request !== 'string' ||
        !task.intent.request.trim() ||
        task.intent.request.length > 4000)) ||
    (task.conversational !== undefined && typeof task.conversational !== 'boolean') ||
    (task.responseInstructions !== undefined &&
      (!Array.isArray(task.responseInstructions) ||
        task.responseInstructions.length > 7 ||
        task.responseInstructions.some(
          (instruction) => typeof instruction !== 'string' || instruction.length > 500,
        ))) ||
    (task.instructions !== undefined &&
      (!Array.isArray(task.instructions) ||
        task.instructions.length > 7 ||
        task.instructions.some(
          (instruction) => typeof instruction !== 'string' || instruction.length > 500,
        ))) ||
    (task.scope !== undefined &&
      (!task.scope ||
        typeof task.scope.fileRequested !== 'boolean' ||
        typeof task.scope.useHistory !== 'boolean' ||
        !Array.isArray(task.scope.groups) ||
        task.scope.groups.length > 20 ||
        task.scope.groups.some((group) => typeof group !== 'string' || group.length > 100))) ||
    (task.plan !== undefined &&
      (!Array.isArray(task.plan) ||
        task.plan.length > 6 ||
        task.plan.some(
          (step) =>
            !step ||
            typeof step.tool !== 'string' ||
            typeof step.purpose !== 'string' ||
            step.purpose.length > 500,
        ))) ||
    (task.planningCalls !== undefined &&
      (!Number.isInteger(task.planningCalls) ||
        task.planningCalls < 0 ||
        task.planningCalls > 40)) ||
    typeof task.goal !== 'string' ||
    task.goal.length > 4000 ||
    !['running', 'complete', 'partial', 'clarify', 'stopped'].includes(task.status) ||
    !Array.isArray(task.steps) ||
    task.steps.length > 6 ||
    (task.note !== undefined && typeof task.note !== 'string') ||
    (task.workflow !== undefined && typeof task.workflow !== 'string')
  )
    return undefined;
  if (
    task.steps.some(
      (step) =>
        !step ||
        typeof step.id !== 'string' ||
        typeof step.tool !== 'string' ||
        typeof step.summary !== 'string' ||
        !['running', 'done', 'error'].includes(step.status) ||
        !validData(step.args) ||
        (step.error !== undefined && typeof step.error !== 'string') ||
        (step.result !== undefined && !validResult(step.result)),
    )
  )
    return undefined;
  return {
    ...task,
    status: task.status === 'running' ? 'stopped' : task.status,
    steps: task.steps.map((step) =>
      step.status === 'running'
        ? {
            ...step,
            status: 'error',
            summary: 'Interrupted by reload.',
            error: 'Interrupted by reload.',
          }
        : step,
    ),
  };
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
          task: savedTask(m.task),
        })),
      }));
  } catch {
    return [];
  }
}
export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(key, JSON.stringify(conversations.slice(0, 50)));
}
