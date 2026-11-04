import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { evaluateJavaScript } from './javascript-engine';
import { javascriptLimits } from './javascript-protocol';
import { runJavaScript } from './javascript';

let engine: QuickJSWASMModule;
beforeAll(async () => {
  engine = await newQuickJSWASMModuleFromVariant(variant);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isolated JavaScript interpreter', () => {
  it('transforms JSON input, captures logs and leaves host data untouched', () => {
    const input = [3, 1, 3, 2];
    const output = evaluateJavaScript(
      engine,
      'console.log("Count", input.length); input.sort(); return { unique: [...new Set(input)], total: input.reduce((a,b) => a+b, 0) };',
      input,
    );
    expect(output).toEqual({ value: { unique: [1, 2, 3], total: 9 }, logs: ['Count 4'] });
    expect(input).toEqual([3, 1, 3, 2]);
  });
  it('provides no browser, network, storage, host objects or escape via a function constructor', () => {
    const output = evaluateJavaScript(
      engine,
      `return {
      fetch: typeof fetch, document: typeof document, window: typeof window, self: typeof self,
      storage: typeof localStorage, indexedDB: typeof indexedDB, process: typeof process,
      require: typeof require, Worker: typeof Worker, postMessage: typeof postMessage,
      timers: typeof setTimeout, wasm: typeof WebAssembly,
      escape: console.log.constructor('return typeof fetch')()
    };`,
    );
    expect(Object.values(output.value as object)).toEqual(Array(13).fill('undefined'));
  });
  it('starts each execution with fresh globals and prototypes', () => {
    evaluateJavaScript(
      engine,
      'globalThis.secret = 42; Object.prototype.polluted = true; return null;',
    );
    expect(
      evaluateJavaScript(engine, 'return [typeof secret, typeof ({}).polluted];').value,
    ).toEqual(['undefined', 'undefined']);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it('interrupts infinite loops even if guest code changes Date.now', () => {
    expect(() => evaluateJavaScript(engine, 'Date.now = () => 0; while (true) {}')).toThrow(
      '1-second execution limit',
    );
  });
  it('limits memory allocation and stack recursion', () => {
    expect(() => evaluateJavaScript(engine, 'return new Array(10000000).fill(0);')).toThrow(
      /memory/i,
    );
    expect(() =>
      evaluateJavaScript(engine, 'function recurse() { return recurse(); } return recurse();'),
    ).toThrow(/stack/i);
    expect(evaluateJavaScript(engine, 'return 42;').value).toBe(42);
  });
  it('bounds console output and reports too-large results without silently truncating data', () => {
    expect(
      evaluateJavaScript(engine, 'for (let i=0;i<100;i++) console.log("x".repeat(2000));').logs,
    ).toEqual(Array(20).fill('x'.repeat(1000)));
    expect(() => evaluateJavaScript(engine, 'return "x".repeat(33000);')).toThrow('32,000');
  });
  it.each([
    'return NaN;',
    'return Infinity;',
    'return 1n;',
    'return () => 1;',
    'return { missing: undefined };',
    'const a = {}; a.self = a; return a;',
  ])('rejects non-JSON results: %s', (code) => {
    expect(() => evaluateJavaScript(engine, code)).toThrow();
  });
  it('reports syntax/runtime errors and unsupported promises', () => {
    expect(() => evaluateJavaScript(engine, 'return (;')).toThrow();
    expect(() => evaluateJavaScript(engine, 'throw new Error("deliberate failure");')).toThrow(
      'deliberate failure',
    );
    expect(() => evaluateJavaScript(engine, 'throw null;')).toThrow();
    expect(() => evaluateJavaScript(engine, 'return Promise.resolve(42);')).toThrow(
      'promises are not supported',
    );
    expect(() =>
      evaluateJavaScript(engine, 'Promise.resolve().then(() => console.log("later")); return 42;'),
    ).toThrow('pending promise jobs');
    expect(evaluateJavaScript(engine, 'console.warn("No result");')).toEqual({
      value: null,
      logs: ['No result'],
    });
  });
  it('rejects deep, oversized, unsafe or malformed input and output data', () => {
    expect(() => evaluateJavaScript(engine, 'return input;', 'x'.repeat(64000))).toThrow('64,000');
    expect(() => evaluateJavaScript(engine, 'x'.repeat(12001))).toThrow('12,000');
    expect(() => evaluateJavaScript(engine, 'return Array(2001).fill(1);')).toThrow('2,000');
    expect(() => evaluateJavaScript(engine, 'return JSON.parse(\'{"__proto__": 1}\');')).toThrow(
      'Unsafe property',
    );
    expect(() =>
      evaluateJavaScript(engine, 'let a={}; for(let i=0;i<14;i++) a={a}; return a;'),
    ).toThrow('12 levels');
  });
});

class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.latest = this;
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
describe('worker lifecycle', () => {
  const setup = () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.useFakeTimers();
  };
  it('waits for initialization, returns evidence and terminates its worker', async () => {
    setup();
    const pending = runJavaScript('return input;', { value: 42 }, new AbortController().signal);
    const worker = FakeWorker.latest;
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.send({ type: 'ready' });
    expect(worker.postMessage).toHaveBeenCalledWith({
      code: 'return input;',
      input: { value: 42 },
    });
    worker.send({ type: 'result', output: { value: 42, logs: ['done'] } });
    await expect(pending).resolves.toMatchObject({
      tool: 'javascript',
      data: { value: 42, logs: ['done'] },
      sources: [],
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])('terminates stalled workers (initialized=%s)', async (ready) => {
    setup();
    const pending = runJavaScript('while(true) {}', null, new AbortController().signal);
    if (ready) FakeWorker.latest.send({ type: 'ready' });
    const assertion = expect(pending).rejects.toThrow(
      ready ? 'execution deadline' : 'could not start',
    );
    await vi.advanceTimersByTimeAsync(
      ready ? javascriptLimits.executionMs : javascriptLimits.startupMs,
    );
    await assertion;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('terminates on Stop and on worker failure', async () => {
    setup();
    const controller = new AbortController();
    const pending = runJavaScript('return 1;', null, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
    const failed = runJavaScript('return 1;', null, new AbortController().signal);
    FakeWorker.latest.onerror?.({ preventDefault: vi.fn() });
    await expect(failed).rejects.toThrow('could not run');
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
  });
  it('validates worker results and rejects cancellation before allocating a worker', async () => {
    setup();
    const pending = runJavaScript('return 1;', null, new AbortController().signal);
    FakeWorker.latest.send({ type: 'ready' });
    FakeWorker.latest.send({ type: 'result', output: { wrong: true } });
    await expect(pending).rejects.toThrow('invalid result');
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
    await expect(runJavaScript('return 1;', null, AbortSignal.abort())).rejects.toThrow();
  });
});
