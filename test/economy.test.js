import { describe, it, expect } from 'vitest';
import { craftProfit, bestCraft, hdvListPrice, undercut } from '../src/game/economy.js';

describe('craftProfit', () => {
  const prices = { wood: 10, iron: 20, sword: 100 };
  it('computes profit and roi net of craft fee', () => {
    const recipe = { id: 'sword', output: { item: 'sword', qty: 1 }, inputs: [{ item: 'wood', qty: 2 }, { item: 'iron', qty: 1 }], fee: 5 };
    const r = craftProfit(recipe, prices);
    // cost = 2*10 + 1*20 + 5 = 45 ; revenue = 100 ; profit = 55
    expect(r.cost).toBe(45);
    expect(r.revenue).toBe(100);
    expect(r.profit).toBe(55);
    expect(r.roi).toBeCloseTo(55 / 45, 5);
  });

  it('returns negative profit when inputs cost more than output', () => {
    const recipe = { id: 'sword', output: { item: 'sword', qty: 1 }, inputs: [{ item: 'iron', qty: 6 }], fee: 0 };
    const r = craftProfit(recipe, prices);
    expect(r.profit).toBeLessThan(0);
  });

  it('treats unknown input/output prices as zero (unsellable)', () => {
    const recipe = { id: 'x', output: { item: 'mystery', qty: 1 }, inputs: [{ item: 'wood', qty: 1 }], fee: 0 };
    const r = craftProfit(recipe, prices);
    expect(r.revenue).toBe(0);
    expect(r.profit).toBe(-10);
  });
});

describe('bestCraft', () => {
  const prices = { wood: 10, iron: 20, sword: 100, ring: 60, gem: 5 };
  const recipes = [
    { id: 'sword', output: { item: 'sword', qty: 1 }, inputs: [{ item: 'iron', qty: 1 }], fee: 0 }, // profit 80
    { id: 'ring', output: { item: 'ring', qty: 1 }, inputs: [{ item: 'gem', qty: 2 }], fee: 0 },     // profit 50
    { id: 'loss', output: { item: 'gem', qty: 1 }, inputs: [{ item: 'iron', qty: 1 }], fee: 0 },     // profit -15
  ];
  it('returns the most profitable recipe the wallet can afford', () => {
    const inv = { iron: 5, gem: 5 };
    const r = bestCraft(recipes, prices, inv);
    expect(r.id).toBe('sword');
  });
  it('skips recipes lacking inventory inputs', () => {
    const inv = { gem: 5 }; // no iron -> sword impossible
    const r = bestCraft(recipes, prices, inv);
    expect(r.id).toBe('ring');
  });
  it('returns null when nothing is profitable', () => {
    const r = bestCraft([recipes[2]], prices, { iron: 5 });
    expect(r).toBeNull();
  });
});

describe('hdv pricing', () => {
  it('undercut lowers competitor price by margin but respects a floor', () => {
    expect(undercut(100, { marginPct: 5, floor: 50 })).toBe(95);
    expect(undercut(52, { marginPct: 10, floor: 50 })).toBe(50); // would be 46.8 -> floored
  });
  it('hdvListPrice = max(undercut(lowest), cost*minMargin)', () => {
    // lowest listing 100, cost 80, minMargin 1.2 => floor 96 ; undercut 5% = 95 -> floored to 96
    const p = hdvListPrice({ lowestListing: 100, cost: 80, minMargin: 1.2, marginPct: 5 });
    expect(p).toBe(96);
  });
  it('with no competitors, prices at cost*minMargin', () => {
    const p = hdvListPrice({ lowestListing: null, cost: 50, minMargin: 1.5, marginPct: 5 });
    expect(p).toBe(75);
  });
});
