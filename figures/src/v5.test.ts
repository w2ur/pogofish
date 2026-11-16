import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('sharedV5', () => {
  it('fetches once for every figure, and tries again after a failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ rules: 'lc1-2' }) });
    vi.stubGlobal('fetch', fetch);
    const { sharedV5 } = await import('./v5');
    await expect(sharedV5()).rejects.toThrow('503');
    const [a, b] = await Promise.all([sharedV5(), sharedV5()]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]![0])).toMatch(/data\/v5\.json$/);
  });
});
