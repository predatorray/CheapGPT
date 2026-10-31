import { describe, expect, it } from 'vitest';
import { applyReplayEdits, sourceInstructions } from './task-plan';

describe('lossless source alignment', () => {
  it('accepts explanatory insertions while executing only original source text', () => {
    const goal = 'Convert 250 USD to CAD, add 12% tax, split between 3 people';
    const result = sourceInstructions(goal, [
      'Convert 250 USD to CAD',
      'Add 12% tax to the converted amount',
      'Split the result between 3 people',
    ]);
    expect(result).toEqual(['Convert 250 USD to CAD,', 'add 12% tax,', 'split between 3 people']);
    expect(result.join(' ')).not.toContain('converted amount');
  });
  it.each([
    ['Convert 250 USD to CAD', 'Split between 3 people'],
    ['Convert 300 USD to CAD', 'Add 12% tax', 'Split between 3 people'],
    ['Add 12% tax', 'Convert 250 USD to CAD', 'Split between 3 people'],
  ])('rejects omitted, changed, or reordered source inputs: %j', (...purposes) => {
    expect(() =>
      sourceInstructions('Convert 250 USD to CAD, add 12% tax, split between 3 people', purposes),
    ).toThrow();
  });
  it('preserves original operators, units, punctuation and connectors', () => {
    const result = sourceInstructions('Calculate (80 * 6), then subtract 10%, and divide by 4.', [
      'Calculate 80 * 6',
      'Subtract 10 percent',
      'Divide by 4',
    ]);
    expect(result).toEqual(['Calculate (80 * 6),', 'then subtract 10%,', 'and divide by 4.']);
  });
  it('rejects boundaries that split the same source token', () => {
    expect(() => sourceInstructions('Calculate 2+3', ['Calculate 2', '3'])).toThrow(
      'same source token',
    );
  });
  it('rejects an invented extra operation', () => {
    expect(() => sourceInstructions('Calculate 2+3', ['Calculate 2+3', 'Export as CSV'])).toThrow(
      'without matching source',
    );
  });
});

describe('model-selected replay patches', () => {
  it('replaces several inputs against the original source without cascading', () => {
    expect(
      applyReplayEdits(
        'Calculate 3 * 4, divide by 2',
        [
          { before: '3', after: '4' },
          { before: '4', after: '8' },
        ],
        'and export as JSON',
      ),
    ).toBe('Calculate 4 * 8, divide by 2 and export as JSON');
  });
  it.each([
    [{ before: '2', after: '3' }],
    [
      { before: '2 * 2', after: '4' },
      { before: 'Calculate 2', after: 'Find 3' },
    ],
    [{ before: 'missing', after: '3' }],
  ])('rejects ambiguous, overlapping and missing edit anchors: %j', (...edits) => {
    expect(() => applyReplayEdits('Calculate 2 * 2', edits, '')).toThrow(/replay/i);
  });
});
