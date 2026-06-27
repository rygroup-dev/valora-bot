import { describe, it, expect, vi } from 'vitest';
import { fetchTokenBalance } from '../src/net/balance.js';

describe('fetchTokenBalance', () => {
  it('returns the uiAmount for the owner+mint', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 31023.52 } } } } } }] },
      }),
    }));
    const bal = await fetchTokenBalance({ rpc: 'https://rpc', owner: 'W', mint: 'M', fetchImpl });
    expect(bal).toBeCloseTo(31023.52);
  });

  it('returns 0 when the wallet has no token account', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ result: { value: [] } }) }));
    expect(await fetchTokenBalance({ rpc: 'https://rpc', owner: 'W', mint: 'M', fetchImpl })).toBe(0);
  });

  it('returns null on RPC error (unknown, not zero)', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('rpc down'); });
    expect(await fetchTokenBalance({ rpc: 'https://rpc', owner: 'W', mint: 'M', fetchImpl })).toBeNull();
  });
});
