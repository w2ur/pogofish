// The board's search, off the main thread: a second build entry, emitted as
// dist/search-worker.js and started by SearchClient as a module worker.
import { createSearchHandler, createWorkerEndpoint, type WorkerMessage } from './search-handler';

const scope = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<WorkerMessage>) => void): void;
};

const onMessage = createWorkerEndpoint(createSearchHandler(), (reply) => scope.postMessage(reply));
scope.addEventListener('message', (e) => void onMessage(e.data));
