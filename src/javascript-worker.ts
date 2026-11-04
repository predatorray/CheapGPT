import variant from '@jitl/quickjs-wasmfile-release-sync';
import wasmLocation from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import { evaluateJavaScript } from './javascript-engine';
import type { Json } from './task-types';

const sendError = (error: unknown) =>
  self.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : 'The JavaScript sandbox failed.',
  });

// A fresh worker and WASM module are created for each run. Initialization fetches
// only the bundled same-origin WASM asset; guest code has no network bindings.
newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmLocation }))
  .then((engine) => {
    self.onmessage = (event: MessageEvent<{ code: string; input: Json }>) => {
      try {
        self.postMessage({
          type: 'result',
          output: evaluateJavaScript(engine, event.data.code, event.data.input),
        });
      } catch (error) {
        sendError(error);
      }
    };
    self.postMessage({ type: 'ready' });
  })
  .catch(sendError);
