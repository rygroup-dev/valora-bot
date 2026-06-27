import { describe, it, expect } from 'vitest';
import { tokenRaw, chooseHdvListing, hdvTokenUnitPrice } from '../src/game/hdv.js';

const TOOLS = ['fishing_rod', 'bucheron_axe', 'mining_pick', 'paysan_sickle'];

describe('tokenRaw', () => {
  it('scales a token amount to raw units (6 decimals)', () => {
    expect(tokenRaw(0.01)).toBe(10000);
    expect(tokenRaw(1)).toBe(1000000);
  });
  it('never returns below 1', () => {
    expect(tokenRaw(0)).toBe(1);
  });
});

describe('chooseHdvListing', () => {
  it('picks the most-stacked sellable item and lists half', () => {
    const inv = [
      { id: 'fish_gudgeon', qty: 40 },
      { id: 'fish_minnow', qty: 10 },
      { id: 'fishing_rod', qty: 1 },
    ];
    const r = chooseHdvListing(inv, { tools: TOOLS });
    expect(r.itemId).toBe('fish_gudgeon');
    expect(r.qty).toBe(20);
  });
  it('ignores tools, quest items, and tiny stacks', () => {
    const inv = [
      { id: 'bucheron_axe', qty: 1 },
      { id: 'quest_scroll', qty: 9 },
      { id: 'fish_minnow', qty: 2 },
    ];
    expect(chooseHdvListing(inv, { tools: TOOLS, minQty: 4 })).toBeNull();
  });
});

describe('hdvTokenUnitPrice (whole-token, server requires integer >=1)', () => {
  it('uses the floor (1 token) raw when there are no token listings', () => {
    expect(hdvTokenUnitPrice({ tokenListings: [], floorToken: 1 })).toBe(1_000_000);
  });
  it('undercuts the lowest token listing by one whole token', () => {
    // lowest 5 tokens -> list at 4 tokens
    expect(hdvTokenUnitPrice({ tokenListings: [{ unitPrice: 5_000_000 }] })).toBe(4_000_000);
  });
  it('never goes below 1 whole token', () => {
    expect(hdvTokenUnitPrice({ tokenListings: [{ unitPrice: 1_000_000 }] })).toBe(1_000_000);
  });
});
