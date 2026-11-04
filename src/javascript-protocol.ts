import type { Json } from './task-types';

export const javascriptLimits = {
  code: 12000,
  input: 64000,
  output: 32000,
  logs: 20,
  logLength: 1000,
  memory: 16 * 1024 * 1024,
  stack: 256 * 1024,
  cpuMs: 1000,
  executionMs: 3000,
  startupMs: 15000,
};
export interface JavaScriptOutput {
  value: Json;
  logs: string[];
}
export type JavaScriptResponse =
  | { type: 'ready' }
  | { type: 'result'; output: JavaScriptOutput }
  | { type: 'error'; message: string };

export function checkJavaScriptData(value: unknown, depth = 0): asserts value is Json {
  if (depth > 12) throw new Error('Sandbox data must be nested at most 12 levels deep.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 2000) throw new Error('Sandbox arrays are limited to 2,000 items.');
    value.forEach((item) => checkJavaScriptData(item, depth + 1));
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    if (Object.keys(value).length > 100)
      throw new Error('Sandbox objects are limited to 100 fields.');
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Unsafe property name in sandbox data.');
      checkJavaScriptData(item, depth + 1);
    }
    return;
  }
  throw new Error('Sandbox input and return values must be JSON-compatible data.');
}

export function checkJavaScriptInput(code: string, input: Json) {
  if (!code.trim() || code.length > javascriptLimits.code)
    throw new Error('Supply JavaScript code of 1–12,000 characters.');
  checkJavaScriptData(input);
  if (JSON.stringify(input).length > javascriptLimits.input)
    throw new Error('Sandbox input is limited to 64,000 serialized characters.');
}

export function checkJavaScriptOutput(output: unknown): asserts output is JavaScriptOutput {
  checkJavaScriptData(output);
  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    !Object.hasOwn(output, 'value') ||
    !Array.isArray(output.logs) ||
    output.logs.length > javascriptLimits.logs ||
    !output.logs.every(
      (line) => typeof line === 'string' && line.length <= javascriptLimits.logLength,
    )
  )
    throw new Error('The JavaScript sandbox returned an invalid result.');
  if (JSON.stringify(output).length > javascriptLimits.output)
    throw new Error('Sandbox output is limited to 32,000 serialized characters.');
}
