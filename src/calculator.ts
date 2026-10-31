import { requestText } from './requests';

// A deliberately small arithmetic language. Never execute model- or user-supplied JavaScript.
export function calculatorExpression(input: string): string | null {
  const text = requestText(input).replace(/=+$/, '').trim();
  const explicit = text.match(
    /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:calculate|compute|evaluate)\s+(.+)$/i,
  );
  let expression = explicit?.[1] ?? text.replace(/^(?:what(?:'s| is)|how much is)\s+/i, '');
  const percent = expression.match(
    /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|percent)\s+of\s+(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/i,
  );
  if (percent) expression = `${percent[1]}% * ${percent[2]}`;
  return explicit ||
    (/\d/.test(expression) &&
      /[+*/^%()×÷-]/.test(expression) &&
      /^[\d\s.,eE+*/^%()×÷-]+$/.test(expression))
    ? expression
    : null;
}

export function calculate(expression: string): number {
  if (expression.length > 500) throw new Error('Keep calculations under 500 characters.');
  // Only well-formed thousands groups are accepted; never interpret decimal commas as thousands.
  expression = expression
    .replace(/(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi, (number) => {
      if (number.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(number))
        throw new Error(
          'Use commas only for thousands groups, such as 1,250.50. Use a dot for decimals.',
        );
      return number.replace(/,/g, '');
    })
    .replace(/×/g, '*')
    .replace(/÷/g, '/');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[^\s]/gi) || [];
  if (!tokens.length || tokens.length > 200)
    throw new Error('Enter a short arithmetic expression.');
  let index = 0;
  const checked = (value: number) => {
    if (!Number.isFinite(value)) throw new Error('The calculation has no finite real result.');
    return Object.is(value, -0) ? 0 : value;
  };
  function primary(): number {
    const token = tokens[index++];
    let value: number;
    if (token === '(') {
      value = sum();
      if (tokens[index++] !== ')') throw new Error('Close every parenthesis.');
    } else {
      if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token))
        throw new Error('Use numbers, parentheses, +, -, *, /, ^, and postfix % only.');
      value = checked(Number(token));
    }
    if (tokens[index] === '%') {
      index++;
      value /= 100;
    }
    return value;
  }
  function power(): number {
    const left = primary();
    if (tokens[index] !== '^') return left;
    index++;
    return checked(left ** unary());
  }
  function unary(): number {
    if (tokens[index] === '+' || tokens[index] === '-') {
      const sign = tokens[index++];
      return checked((sign === '-' ? -1 : 1) * unary());
    }
    return power();
  }
  function product(): number {
    let value = unary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = unary();
      if (operator === '/' && right === 0) throw new Error('Division by zero is undefined.');
      value = checked(operator === '*' ? value * right : value / right);
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = product();
      value = checked(operator === '+' ? value + right : value - right);
    }
    return value;
  }
  const value = sum();
  if (index !== tokens.length)
    throw new Error('Unexpected input. Use explicit arithmetic operators.');
  return checked(value);
}

export function calculationSummary(input: string) {
  const expression = calculatorExpression(input) ?? input.trim();
  const value = calculate(expression);
  return `${expression} = **${Number(value.toPrecision(15))}**\n\nCalculated on your device. % means divide by 100. Uses floating-point arithmetic; displayed to 15 significant digits.`;
}
