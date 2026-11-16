import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('sharedTable', () => {
  it('fetches once for every figure, and tries again after a failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ game: 'A' }) });
    vi.stubGlobal('fetch', fetch);
    const { sharedTable } = await import('./table');
    await expect(sharedTable()).rejects.toThrow('503');
    const [a, b] = await Promise.all([sharedTable(), sharedTable()]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]![0])).toMatch(/data\/table\.json$/);
  });
});
