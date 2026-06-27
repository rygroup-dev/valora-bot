import { describe, it, expect } from 'vitest';
import { scoreItem, bestLoadout, planStatAllocation } from '../src/game/progression.js';

const weights = { dmg: 2, pv: 1, force: 1.5, crit: 3 };

describe('scoreItem', () => {
  it('weights item stats into a single power score', () => {
    const item = { id: 'a', slot: 'weapon', stats: { dmg: 10, crit: 2 } };
    // 10*2 + 2*3 = 26
    expect(scoreItem(item, weights)).toBe(26);
  });
  it('ignores stats with no configured weight', () => {
    const item = { id: 'b', slot: 'weapon', stats: { dmg: 5, unknown: 99 } };
    expect(scoreItem(item, weights)).toBe(10);
  });
  it('scores a missing item as 0', () => {
    expect(scoreItem(null, weights)).toBe(0);
  });
});

describe('bestLoadout', () => {
  it('proposes equipping a stronger inventory item over the equipped one', () => {
    const equipped = { weapon: { id: 'old', slot: 'weapon', stats: { dmg: 5 } } };
    const inventory = [
      { id: 'new', slot: 'weapon', stats: { dmg: 12 } },
      { id: 'meh', slot: 'weapon', stats: { dmg: 3 } },
    ];
    const plan = bestLoadout({ inventory, equipped, weights });
    expect(plan).toContainEqual({ action: 'equip', id: 'new', slot: 'weapon' });
  });

  it('does NOT downgrade: keeps equipped when it is already best', () => {
    const equipped = { weapon: { id: 'good', slot: 'weapon', stats: { dmg: 20 } } };
    const inventory = [{ id: 'worse', slot: 'weapon', stats: { dmg: 1 } }];
    const plan = bestLoadout({ inventory, equipped, weights });
    expect(plan).toEqual([]);
  });

  it('fills an empty slot from inventory', () => {
    const plan = bestLoadout({
      inventory: [{ id: 'h', slot: 'helmet', stats: { pv: 10 } }],
      equipped: {},
      weights,
    });
    expect(plan).toContainEqual({ action: 'equip', id: 'h', slot: 'helmet' });
  });

  it('respects level requirements', () => {
    const plan = bestLoadout({
      inventory: [{ id: 'hi', slot: 'weapon', stats: { dmg: 99 }, levelReq: 30 }],
      equipped: {},
      weights,
      level: 5,
    });
    expect(plan).toEqual([]);
  });
});

describe('planStatAllocation', () => {
  it('distributes available points by build ratio', () => {
    const charac = { points: 10, placed: { force: 0, vitalite: 0, esprit: 0, adresse: 0 } };
    const build = { force: 0.6, vitalite: 0.4 };
    const plan = planStatAllocation(charac, build);
    expect(plan.force).toBe(6);
    expect(plan.vitalite).toBe(4);
    expect(plan.force + plan.vitalite).toBeLessThanOrEqual(10);
  });
  it('returns empty plan when no points available', () => {
    expect(planStatAllocation({ points: 0, placed: {} }, { force: 1 })).toEqual({});
  });
  it('never allocates more than available points', () => {
    const plan = planStatAllocation({ points: 7, placed: {} }, { force: 0.5, vitalite: 0.5 });
    const total = Object.values(plan).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(7);
  });
});
