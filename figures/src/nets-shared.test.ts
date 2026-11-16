import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const file = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const AZ = file('az-lc1-s1.pfw');
const TD = file('td-s1.pfv');

let fetchMock: ReturnType<typeof vi.fn>;
const fresh = async () => {
  vi.resetModules();
  return import('./nets-shared');
};
const requested = (): string[] => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => new Response(String(url).endsWith('.pfw') ? AZ.slice(0) : TD.slice(0)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('the shared nets', () => {
  it('the network is fetched once for two figures, and once for the board’s bytes too', async () => {
    const m = await fresh();
    const [a, b, bytes] = await Promise.all([m.sharedAz(), m.sharedAz(), m.sharedAzBytes()]);
    expect(a).toBe(b);
    expect(bytes.byteLength).toBe(AZ.byteLength);
    await m.sharedAz();
    expect(requested().filter((u) => u.endsWith('nets/az-lc1-s1.pfw'))).toHaveLength(1);
    expect(requested()).toHaveLength(1);
  });

  it('the TD net is its own file, fetched once', async () => {
    const m = await fresh();
    const [a, b] = await Promise.all([m.sharedTd(), m.sharedTd()]);
    expect(a).toBe(b);
    expect(a.header.layers.map((l) => l.outputs)).toEqual([128, 64, 1]);
    expect(requested()).toEqual([expect.stringMatching(/nets\/td-s1\.pfv$/)]);
  });

  it('nothing is fetched until a reader asks', async () => {
    await fresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed fetch is not kept: the next reader fetches again', async () => {
    const m = await fresh();
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 503 }));
    await expect(m.sharedAz()).rejects.toThrow(/503/);
    await expect(m.sharedAz()).resolves.toBeDefined();
    expect(requested()).toHaveLength(2);
  });
});
