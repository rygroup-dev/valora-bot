import { describe, it, expect } from 'vitest';
import { healConsumableReserve, healConsumableToBuy, healInputReserve, mergeReserve, sellableCart, toolToBuy } from '../src/game/vendor.js';

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

  it('reserves HP consumables from broker selling', () => {
    const cart = sellableCart(
      [{ id: 'bread_country', qty: 8 }, { id: 'fish_minnow', qty: 2 }],
      { tools: TOOLS, keep: healConsumableReserve(8) },
    );
    expect(cart).toEqual([{ id: 'fish_minnow', qty: 2 }]);
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

describe('healConsumableToBuy', () => {
  it('does not broker-buy HP food because live consumables are crafted or looted', () => {
    const pick = healConsumableToBuy({ gold: 500, inventory: [], targetQty: 3, reserveGold: 100 });
    expect(pick).toBeNull();
  });

  it('does not buy HP food when target stock is already reserved', () => {
    const pick = healConsumableToBuy({
      gold: 500,
      inventory: [{ id: 'bread_country', qty: 3 }],
      targetQty: 3,
      reserveGold: 100,
    });
    expect(pick).toBeNull();
  });

  it('still returns null after broker rejects known heal foods', () => {
    const pick = healConsumableToBuy({
      gold: 500,
      inventory: [],
      targetQty: 3,
      reserveGold: 100,
      blocked: new Set(['dish_wolf_stew']),
    });
    expect(pick).toBeNull();
  });
});

describe('healInputReserve', () => {
  const RECIPES = {
    dish_minnow: { id: 'cook_fish_minnow', kind: 'cuisine', levelReq: 1, inputs: [{ id: 'fish_minnow', qty: 1 }] },
    dish_gudgeon: { id: 'cook_fish_gudgeon', kind: 'cuisine', levelReq: 1, inputs: [{ id: 'fish_gudgeon', qty: 1 }] },
    dish_trout_pie: { id: 'cook_trout_pie', kind: 'cuisine', levelReq: 12, inputs: [{ id: 'fish_trout', qty: 2 }] },
  };

  it('reserves raw inputs of level-1 dishes to cover the food deficit', () => {
    const keep = healInputReserve(RECIPES, [], 6);
    expect(keep.fish_minnow).toBe(6);
    expect(keep.fish_gudgeon).toBe(6);
    expect(keep.fish_trout).toBeUndefined(); // level-gated recipe, not craftable
  });

  it('reserves nothing once the food stock meets the target', () => {
    const inv = [{ id: 'dish_minnow', qty: 6 }];
    expect(healInputReserve(RECIPES, inv, 6)).toEqual({});
  });

  it('shrinks the reservation as dishes accumulate', () => {
    const inv = [{ id: 'dish_minnow', qty: 4 }];
    const keep = healInputReserve(RECIPES, inv, 6);
    expect(keep.fish_minnow).toBe(2);
  });

  it('includes level-gated recipes when the job level allows them', () => {
    const keep = healInputReserve(RECIPES, [], 2, { craftableLevelOk: () => true });
    expect(keep.fish_trout).toBe(4); // qty 2 per craft x deficit 2
  });
});

describe('mergeReserve', () => {
  it('takes the max per item instead of letting a later map lower it', () => {
    const merged = mergeReserve({ fish_gudgeon: 3, wood_ash: 2 }, { fish_gudgeon: 1, dish_minnow: 8 });
    expect(merged).toEqual({ fish_gudgeon: 3, wood_ash: 2, dish_minnow: 8 });
  });
});
