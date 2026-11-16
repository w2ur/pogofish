// The nets are fetched once per page: two figures and the board's search
// share one request for the AlphaZero net, and the TD net has its own. This
// file stubs fetch before any figure renders; vitest gives it its own module
// state, so the shared loaders start empty.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { LC1_2 } from '../engine';
import { SearchClient, type WorkerLike } from '../search-client';
import type { WorkerMessage } from '../search-handler';
import { createStore } from '../store';
import { intersect } from '../test-dom';
import { PogoNet } from './pogo-net';
import { PogoSearch } from './pogo-search';
import { PogoTdTargets } from './pogo-td-targets';
import { sharedAz, sharedTd } from '../nets-shared';
import { netPosition } from './net-position';

const file = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const AZ = file('az-lc1-s1.pfw');
const TD = file('td-s1.pfv');
const fetchMock = vi.fn(async (url: string) => new Response(String(url).endsWith('.pfw') ? AZ.slice(0) : TD.slice(0)));
vi.stubGlobal('fetch', fetchMock);
afterAll(() => vi.unstubAllGlobals());

customElements.define('pogo-net', PogoNet);
customElements.define('pogo-search', PogoSearch);
customElements.define('pogo-td-targets', PogoTdTargets);
const store = createStore({ storage: null, loadEngine: () => Promise.resolve() });
PogoNet.deps = { store, az: sharedAz, td: sharedTd };
PogoSearch.deps = { ...PogoSearch.deps, store, az: sharedAz };
PogoTdTargets.deps = { store, td: sharedTd };

const requests = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix)).length;
const flush = () => new Promise((r) => setTimeout(r, 0));

function figure(tag: string, attrs: Record<string, string>): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = '<p>fallback</p>';
  document.body.append(el);
  return el;
}

describe('the nets on one page', () => {
  it('nothing is fetched before a figure that needs a net approaches', async () => {
    figure('pogo-net', { kind: 'az' });
    figure('pogo-search', { position: 'puzzle5' });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the network is fetched once for two figures and the board’s search', async () => {
    const [net, search] = [...document.body.children] as HTMLElement[];
    intersect(net!);
    intersect(search!);
    for (let i = 0; i < 20 && !search!.shadowRoot!.querySelector('.search-table'); i++) await flush();
    expect(net!.shadowRoot!.querySelector('.policy tbody tr')).not.toBeNull();
    expect(search!.shadowRoot!.querySelector('.search-table tbody tr')).not.toBeNull();
    // The board's first search: its worker gets the same bytes, without a fetch of its own.
    const sent: WorkerMessage[] = [];
    const worker: WorkerLike = { postMessage: (m) => void sent.push(m), terminate: () => {}, addEventListener: () => {} };
    const client = new SearchClient({ createWorker: () => worker, timeoutMs: 50 });
    void client.bestMove(netPosition(store).state, 5, LC1_2).catch(() => {});
    for (let i = 0; i < 5 && sent.length === 0; i++) await flush();
    expect(sent[0] && 'netBytes' in sent[0] ? sent[0].netBytes?.byteLength : 0).toBe(AZ.byteLength);
    client.dispose();
    expect(requests('nets/az-lc1-s1.pfw')).toBe(1);
    expect(requests('nets/td-s1.pfv')).toBe(0);
  });

  it('the TD net is fetched once for two figures', async () => {
    const a = figure('pogo-net', { kind: 'td' });
    const b = figure('pogo-td-targets', {});
    intersect(a);
    intersect(b);
    for (let i = 0; i < 20 && !b.shadowRoot!.querySelector('.td-chart'); i++) await flush();
    expect(a.shadowRoot!.querySelector('.value-number')!.textContent).not.toBe('');
    expect(requests('nets/td-s1.pfv')).toBe(1);
    expect(requests('nets/az-lc1-s1.pfw')).toBe(1);
  });
});
