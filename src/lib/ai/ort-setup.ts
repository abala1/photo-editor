import * as ort from "onnxruntime-web";
// Importing the WASM runtime directly from node_modules (instead of serving it out of
// public/) lets Vite treat it as a regular asset: it gets a proper URL in dev and a
// hashed, copied file in production. Vite refuses to serve public/ files via dynamic
// `import()`, which is how onnxruntime-web loads its .mjs glue code — hence this route.
import ortWasmJsepMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasmJsepWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";

let configured = false;

/** Configures onnxruntime-web so inference runs fully offline with no CDN calls.
 * Must run once before creating any session. */
export function configureOrt() {
  if (configured) return;
  ort.env.wasm.wasmPaths = {
    mjs: ortWasmJsepMjsUrl,
    wasm: ortWasmJsepWasmUrl,
  };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  configured = true;
}

const sessionCache = new Map<string, ort.InferenceSession>();

export async function getSession(modelUrl: string): Promise<ort.InferenceSession> {
  configureOrt();
  const cached = sessionCache.get(modelUrl);
  if (cached) return cached;
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ["wasm"],
  });
  sessionCache.set(modelUrl, session);
  return session;
}

export { ort };
