import { describe, expect, it, vi } from 'vitest';
import { calculateCurrencyConversion, extractCurrencyConversion } from './currency';
import { detectToolRequest, planTool } from './model';
import type { ModelSession } from './types';

describe('local currency extraction and calculation tools', () => {
  it.each([
    ['Convert 1 USD to CAD', 1, 'USD', 'CAD'],
    ['Could you please convert 1 USD to CAD?', 1, 'USD', 'CAD'],
    ['What is 25 EUR in GBP?', 25, 'EUR', 'GBP'],
    ['Please convert 1,000.50 usd to cad.', 1000.5, 'USD', 'CAD'],
    ['How much is 0 USD in JPY?', 0, 'USD', 'JPY'],
    ['-12.50 EUR into GBP', -12.5, 'EUR', 'GBP'],
  ])('extracts structured parameters from %s', (text, amount, from, to) => {
    expect(extractCurrencyConversion(text)).toEqual({ amount, from, to });
  });
  it.each([
    'Convert $1 to dollars',
    'Convert 1,23 USD to CAD',
    'Convert Infinity USD to CAD',
    'Write a poem about 1 USD to CAD',
    'Convert 1 USD',
    'Convert 10000000000000000 USD to CAD',
  ])('rejects ambiguous or invalid requests: %s', (text) => {
    expect(extractCurrencyConversion(text)).toBeNull();
  });
  it('calculates using the supplied rate and target currency precision', () => {
    expect(calculateCurrencyConversion({ amount: 1.005, from: 'USD', to: 'CAD' }, 1)).toBe(
      'USD 1.005 = CAD 1.01',
    );
    expect(calculateCurrencyConversion({ amount: 1, from: 'USD', to: 'CAD' }, 1.375)).toBe(
      'USD 1.00 = CAD 1.38',
    );
    expect(calculateCurrencyConversion({ amount: 1000.5, from: 'USD', to: 'JPY' }, 151.1)).toBe(
      'USD 1,000.50 = JPY 151,176',
    );
  });
  it.each([NaN, Infinity, -1, 0])('rejects invalid rate %s', (rate) => {
    expect(() => calculateCurrencyConversion({ amount: 1, from: 'USD', to: 'CAD' }, rate)).toThrow(
      'No valid reference rate',
    );
  });
  it('preserves both codes and the amount without relying on a model plan', async () => {
    const clone = vi.fn();
    const base = { clone } as unknown as ModelSession;
    const query = 'Convert 1 USD to CAD';
    expect(detectToolRequest(query)).toEqual({ tool: 'currency', query });
    expect(await planTool(base, query, new AbortController().signal)).toEqual({
      tool: 'currency',
      query,
    });
    expect(clone).not.toHaveBeenCalled();
  });
});
