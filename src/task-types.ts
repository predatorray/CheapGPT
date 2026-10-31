import type { ToolResult } from './types';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface LocalDocument {
  id: string;
  name: string;
  text: string;
  table?: TableData;
}
export interface TableData {
  columns: string[];
  rows: Json[][];
}
export interface GeneratedFile {
  name: string;
  mime: string;
  content: string;
}
export interface TaskCall {
  tool: string;
  args: Record<string, Json>;
}
export interface TaskStep extends TaskCall {
  id: string;
  status: 'running' | 'done' | 'error';
  summary: string;
  result?: ToolResult;
  error?: string;
}
export interface TaskSnapshot {
  goal: string;
  workflow?: string;
  planningCalls?: number;
  instructions?: string[];
  scope?: { fileRequested: boolean; useHistory: boolean; groups: string[] };
  plan?: { tool: string; purpose: string }[];
  status: 'running' | 'complete' | 'partial' | 'clarify' | 'stopped';
  steps: TaskStep[];
  note?: string;
}
export interface TaskOutcome {
  useHistory?: boolean;
  snapshot: TaskSnapshot;
  answer?: string;
  context?: ToolResult;
  deadline: number;
}
export interface Schema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: Json[];
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
}
export const objectSchema = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: 'object', properties, required, additionalProperties: false });
export const stringSchema: Schema = { type: 'string', minLength: 1, maxLength: 12000 };
export function validate(schema: Schema, value: unknown, path = 'args'): void {
  if (schema.enum && !schema.enum.includes(value as Json))
    throw new Error(`${path}: choose ${schema.enum.join(', ')}.`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`${path} must be an object.`);
    const data = value as Record<string, unknown>;
    for (const key of schema.required || [])
      if (!(key in data)) throw new Error(`${path}.${key} is required.`);
    for (const [key, item] of Object.entries(data)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Unsafe property name.');
      if (!schema.properties?.[key]) {
        if (schema.additionalProperties === false)
          throw new Error(`${path}.${key} is not supported.`);
      } else validate(schema.properties[key], item, `${path}.${key}`);
    }
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 2000))
      throw new Error(`${path} must be a bounded array.`);
    if (schema.items) value.forEach((item, i) => validate(schema.items!, item, `${path}.${i}`));
  }
  if (
    schema.type === 'string' &&
    (typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? 12000))
  )
    throw new Error(`${path} must be text within the allowed length.`);
  if (
    (schema.type === 'number' || schema.type === 'integer') &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (schema.type === 'integer' && !Number.isInteger(value)) ||
      value < (schema.minimum ?? -1e15) ||
      value > (schema.maximum ?? 1e15))
  )
    throw new Error(`${path} must be a finite ${schema.type} within the allowed range.`);
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    throw new Error(`${path} must be true or false.`);
}

// Nano sometimes flattens a variable's reference beside its name. This one shape has
// an unambiguous meaning; do not discard siblings on other reference objects.
export function normalizeCallReferences(call: TaskCall): TaskCall {
  if (call.tool !== 'calculator.evaluate' || !Array.isArray(call.args.variables)) return call;
  return {
    ...call,
    args: {
      ...call.args,
      variables: call.args.variables.map((variable) => {
        if (
          variable &&
          typeof variable === 'object' &&
          !Array.isArray(variable) &&
          Object.keys(variable).length === 2 &&
          typeof variable.name === 'string' &&
          typeof variable.$ref === 'string'
        )
          return { name: variable.name, value: { $ref: variable.$ref } };
        return variable;
      }),
    },
  };
}

// References address successful structured outputs, never model-written summaries or prototype properties.
export function resolveArgs(value: Json, steps: TaskStep[], depth = 0, location = 'args'): Json {
  if (depth > 12) throw new Error('Arguments are nested too deeply.');
  if (Array.isArray(value))
    return value.map((item, i) => resolveArgs(item, steps, depth + 1, `${location}[${i}]`));
  if (value && typeof value === 'object') {
    if ('$ref' in value) {
      if (Object.keys(value).length !== 1 || typeof value.$ref !== 'string')
        throw new Error(
          `Invalid reference at ${location}: use {"$ref":"r1.field"} as a field value, without sibling properties. Calculator variables use {"name":"amount","value":{"$ref":"r1.value"}}.`,
        );
      const [id, ...path] = value.$ref
        .trim()
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.');
      const step = steps.find((s) => s.id === id && s.status === 'done');
      if (!step?.result || step.result.data === undefined)
        throw new Error(`Missing successful result: ${value.$ref}`);
      let data: Json = step.result.data;
      // Workspace previews show an enclosing `data` field. Accept that spelling as
      // an alias, unless the actual result itself has a field called data.
      if (path[0] === 'data' && !(data && typeof data === 'object' && Object.hasOwn(data, 'data')))
        path.shift();
      for (const key of path) {
        if (
          ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !data ||
          typeof data !== 'object' ||
          !Object.hasOwn(data, key)
        )
          throw new Error(`Missing result field: ${value.$ref}`);
        data = (data as Record<string, Json>)[key];
      }
      return structuredClone(data);
    }
    const result: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Unsafe property name.');
      result[key] = resolveArgs(item, steps, depth + 1, `${location}.${key}`);
    }
    return result;
  }
  return value;
}
