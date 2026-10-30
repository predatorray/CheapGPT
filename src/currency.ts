export interface CurrencyConversion {
  amount: number;
  from: string;
  to: string;
}

// Local extraction tool: explicit codes avoid guessing what an ambiguous "$" means.
export function extractCurrencyConversion(input: string): CurrencyConversion | null {
  const text = input
    .trim()
    .replace(
      /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:convert\s+|how much is\s+|what is\s+)?/i,
      '',
    )
    .replace(/(?:\s+please)?[?.!]*$/i, '')
    .trim();
  const amount = '(-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
  const match = text.match(
    new RegExp(`^${amount}\\s+([a-z]{3})\\s+(?:to|in|into)\\s+([a-z]{3})$`, 'i'),
  );
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || Math.abs(value) > 1e15) return null;
  return { amount: value, from: match[2].toUpperCase(), to: match[3].toUpperCase() };
}

export function calculateCurrencyConversion(request: CurrencyConversion, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0)
    throw new Error(`No valid reference rate is available for ${request.to}.`);
  const value = request.amount * rate;
  if (!Number.isFinite(value)) throw new Error('That conversion is too large to calculate.');
  const format = (amount: number, code: string, preservePrecision = false) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      ...(preservePrecision ? { maximumFractionDigits: 20 } : {}),
    })
      .format(amount)
      .replace(/\s+/g, ' ');
  return `${format(request.amount, request.from, true)} = ${format(value, request.to)}`;
}
