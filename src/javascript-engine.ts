import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import type { Json } from './task-types';
import {
  checkJavaScriptInput,
  checkJavaScriptOutput,
  javascriptLimits,
} from './javascript-protocol';

// Only this interpreter sees user code. No host functions, browser APIs or module
// loader are installed in the guest. Never replace this with host eval/Function.
export function evaluateJavaScript(engine: QuickJSWASMModule, code: string, input: Json = null) {
  checkJavaScriptInput(code, input);
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(javascriptLimits.memory);
  runtime.setMaxStackSize(javascriptLimits.stack);
  const deadline = Date.now() + javascriptLimits.cpuMs;
  let interrupted = false;
  runtime.setInterruptHandler(() => {
    interrupted = Date.now() >= deadline;
    return interrupted;
  });
  const context = runtime.newContext();
  try {
    const source = `(() => {
      'use strict';
      const stringify = JSON.stringify;
      const logs = [];
      const record = (...args) => {
        if (logs.length >= ${javascriptLimits.logs}) return;
        logs.push(args.map(value => {
          if (typeof value === 'string') return value.slice(0, ${javascriptLimits.logLength});
          try { return (stringify(value) ?? String(value)).slice(0, ${javascriptLimits.logLength}); }
          catch { return '[unserializable]'; }
        }).join(' ').slice(0, ${javascriptLimits.logLength}));
      };
      globalThis.console = Object.freeze({ log: record, info: record, warn: record, error: record, debug: record });
      const run = new Function('input', ${JSON.stringify('"use strict";\n' + code)});
      const value = run(JSON.parse(${JSON.stringify(JSON.stringify(input))}));
      if (value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value?.then === 'function')
        throw new Error('Async JavaScript and returned promises are not supported. Return synchronous JSON data.');
      const output = stringify({ value: value === undefined ? null : value, logs }, (_key, item) => {
        if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof item) ||
            (typeof item === 'number' && !Number.isFinite(item)))
          throw new Error('Return JSON-compatible data: no functions, undefined fields, BigInt, NaN or Infinity.');
        return item;
      });
      if (output.length > ${javascriptLimits.output}) throw new Error('Sandbox output is limited to 32,000 serialized characters.');
      return output;
    })()`;
    const evaluated = context.evalCode(source, 'sandbox.js', { type: 'global' });
    if (evaluated.error) {
      try {
        if (interrupted) throw new Error('JavaScript exceeded the 1-second execution limit.');
        const message = context.getProp(evaluated.error, 'message');
        try {
          throw new Error(
            context.typeof(message) === 'string'
              ? context.getString(message).slice(0, 1000)
              : 'JavaScript execution failed. Throw Error objects to include a message.',
          );
        } finally {
          message.dispose();
        }
      } finally {
        evaluated.error.dispose();
      }
    }
    try {
      if (runtime.hasPendingJob())
        throw new Error(
          'Async JavaScript and pending promise jobs are not supported. Return synchronous JSON data.',
        );
      const output: unknown = JSON.parse(context.getString(evaluated.value));
      checkJavaScriptOutput(output);
      return output;
    } finally {
      evaluated.value.dispose();
    }
  } finally {
    context.dispose();
    runtime.dispose();
  }
}
