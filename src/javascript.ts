import type { Json } from './task-types';
import type { ToolResult } from './types';
import { tableData } from './documents';
import {
  checkJavaScriptInput,
  checkJavaScriptOutput,
  javascriptLimits,
} from './javascript-protocol';
import type { JavaScriptOutput, JavaScriptResponse } from './javascript-protocol';

export async function runJavaScript(
  code: string,
  input: Json,
  signal: AbortSignal,
): Promise<ToolResult> {
  signal.throwIfAborted();
  checkJavaScriptInput(code, input);
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined')
    throw new Error('The JavaScript sandbox needs Web Workers and WebAssembly in this browser.');
  const output = await new Promise<JavaScriptOutput>((resolve, reject) => {
    const worker = new Worker(new URL('./javascript-worker.ts', import.meta.url), {
      type: 'module',
    });
    let started = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(signal.reason);
    timer = setTimeout(
      () => fail(new Error('The JavaScript sandbox could not start within 15 seconds.')),
      javascriptLimits.startupMs,
    );
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      fail(
        new Error(
          'The JavaScript sandbox could not run. Check that its bundled worker and WebAssembly assets are available.',
        ),
      );
    };
    worker.onmessageerror = () =>
      fail(new Error('The JavaScript sandbox returned unreadable data.'));
    worker.onmessage = (event: MessageEvent<JavaScriptResponse>) => {
      try {
        if (event.data.type === 'ready' && !started) {
          started = true;
          clearTimeout(timer);
          timer = setTimeout(
            () => fail(new Error('JavaScript exceeded the sandbox execution deadline.')),
            javascriptLimits.executionMs,
          );
          worker.postMessage({ code, input });
        } else if (event.data.type === 'result' && started) {
          checkJavaScriptOutput(event.data.output);
          cleanup();
          resolve(event.data.output);
        } else if (event.data.type === 'error') {
          fail(new Error(event.data.message.slice(0, 1000)));
        } else fail(new Error('The JavaScript sandbox returned an invalid message.'));
      } catch (error) {
        fail(error);
      }
    };
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  let table: Json | undefined;
  if (
    output.value &&
    typeof output.value === 'object' &&
    !Array.isArray(output.value) &&
    output.value.table
  ) {
    try {
      const parsed = tableData(output.value.table);
      table = { columns: parsed.columns, rows: parsed.rows };
    } catch {
      // Ordinary JSON can have a table property without using the table schema.
    }
  }
  return {
    tool: 'javascript',
    summary:
      'JavaScript completed in the sandbox. Returned data and console output are available in the step result.',
    data: { value: output.value, logs: output.logs, ...(table ? { table } : {}) },
    sources: [],
  };
}
