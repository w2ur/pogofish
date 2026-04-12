import init from "pogofish-wasm";

let initialized = false;

export async function ensureEngineReady(): Promise<void> {
  if (!initialized) {
    await init();
    initialized = true;
  }
}
