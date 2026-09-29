import type { ErrorResponse } from "./worker";

/**
 * Builds the worker's `onmessage`. The player module is awaited INSIDE the try,
 * so a failed engine-wasm init or player import answers every request with an
 * `error` response instead of leaving it pending forever.
 */
export function guardedHandler<P, M extends { id: number }>(
  getPlayer: () => Promise<P>,
  handle: (player: P, msg: M) => Promise<void>,
  post: (response: ErrorResponse) => void,
): (msg: M) => Promise<void> {
  return async (msg) => {
    try {
      const player = await getPlayer();
      await handle(player, msg);
    } catch (err) {
      post({
        type: "error",
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
