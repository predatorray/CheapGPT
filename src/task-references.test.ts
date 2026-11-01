import { describe, expect, it } from 'vitest';
import { normalizeArgumentReferences, resolveArgs } from './task-types';
import type { TaskStep } from './task-types';
const steps: TaskStep[] = [
  {
    id: 'r1',
    tool: 'documents.read',
    args: {},
    status: 'done',
    summary: 'Read',
    result: {
      tool: 'documents',
      summary: 'Read',
      sources: [],
      data: { text: 'Meeting notes', value: 42, table: { columns: ['Item'], rows: [['Tape']] } },
    },
  },
];
describe('typed shorthand references', () => {
  it('supports nested object and scalar dependencies without mutating results', () => {
    const args = normalizeArgumentReferences(
      { data: 'r1.table', label: 'r1.value' },
      { type: 'object', properties: { data: { references: true }, label: { type: 'string' } } },
      steps,
    );
    expect(args).toEqual({ data: { $ref: 'r1.table' }, label: 'r1.value' });
    expect(resolveArgs(args, steps)).toEqual({
      data: { columns: ['Item'], rows: [['Tape']] },
      label: 'r1.value',
    });
  });
  it.each(['r1.csv', 'prefix r1.text', 'r99.text'])(
    'leaves literal or nonexistent paths unchanged: %s',
    (value) => {
      expect(normalizeArgumentReferences(value, { type: 'string', references: true }, steps)).toBe(
        value,
      );
    },
  );
  it('preserves invalid reference siblings for strict rejection', () => {
    const value = { $ref: 'r1.text', extra: true };
    expect(() => resolveArgs(normalizeArgumentReferences(value, {}, steps), steps)).toThrow(
      'without sibling properties',
    );
  });
});
