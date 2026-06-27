import { describe, it, expect } from 'vitest';
import { sellableCart, toolToBuy } from '../src/game/vendor.js';

const TOOLS = ['bucheron_axe', 'fishing_rod', 'mining_pick', 'paysan_sickle'];

describe('sellableCart', () => {
  it('builds a cart of resources, excluding tools and quest/equip-protected items', () => {
    const inv = [
      { id: 'fish_gudgeon', qty: 30 },
      { id: 'fish_minnow', qty: 12 },
      { id: 'fishing_rod', qty: 1 }, // tool — keep
      { id: 'quest_scroll', qty: 1 }, // quest — keep
    ];
    const cart = sellableCart(inv, { tools: TOOLS });
    expect(cart).toContainEqual({ id: 'fish_gudgeon', qty: 30 });
    expect(cart).toContainEqual({ id: 'fish_minnow', qty: 12 });
    expect(cart.find((c) => c.id === 'fishing_rod')).toBeUndefined();
    expect(cart.find((c) => c.id === 'quest_scroll')).toBeUndefined();
  });

  it('returns empty cart when nothing is sellable', () => {
    expect(sellableCart([{ id: 'fishing_rod', qty: 1 }], { tools: TOOLS })).toEqual([]);
    expect(sellableCart([], { tools: TOOLS })).toEqual([]);
  });

  it('can keep a minimum quantity of an item (e.g. quest ingredients)', () => {
    const inv = [{ id: 'fish_gudgeon', qty: 5 }];
    const cart = sellableCart(inv, { tools: TOOLS, keep: { fish_gudgeon: 2 } });
    expect(cart).toContainEqual({ id: 'fish_gudgeon', qty: 3 });
  });
});

describe('toolToBuy', () => {
  const prices = { bucheron_axe: 50, mining_pick: 80 };
  it('buys the cheapest missing tool the wallet can afford', () => {
    const t = toolToBuy({ gold: 100, ownedKinds: new Set(['fish']), prices });
    expect(t).toEqual({ id: 'bucheron_axe', kind: 'wood', cost: 50 });
  });
  it('returns null when all gather tools are owned', () => {
    expect(toolToBuy({ gold: 1000, ownedKinds: new Set(['fish', 'wood', 'mineral']), prices })).toBeNull();
  });
  it('returns null when nothing is affordable', () => {
    expect(toolToBuy({ gold: 10, ownedKinds: new Set(['fish']), prices })).toBeNull();
  });
  it('prefers a tool the bot can actually use given available resource maps', () => {
    // only mineral missing, affordable
    const t = toolToBuy({ gold: 200, ownedKinds: new Set(['fish', 'wood']), prices });
    expect(t.kind).toBe('mineral');
  });
});
