import type { ModelSession } from './types';

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Bound both cloning and inference, including implementations that are slow to honor AbortSignal.
export async function withSession<T>(
  base: ModelSession,
  parent: AbortSignal,
  milliseconds: number,
  task: (session: ModelSession, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  parent.throwIfAborted();
  const timeout = new AbortController();
  const signal = AbortSignal.any([parent, timeout.signal]);
  const timer = setTimeout(
    () =>
      timeout.abort(
        new DOMException('The local model timed out. Try a shorter request.', 'TimeoutError'),
      ),
    milliseconds,
  );
  let session: ModelSession | undefined;
  try {
    const clone = await abortable<ModelSession>(
      base.clone({ signal }).then((clone) => {
        if (signal.aborted) {
          clone.destroy();
          signal.throwIfAborted();
        }
        return clone;
      }),
      signal,
    );
    session = clone;
    return await abortable(task(clone, signal), signal);
  } finally {
    clearTimeout(timer);
    timeout.abort();
    session?.destroy();
  }
}
