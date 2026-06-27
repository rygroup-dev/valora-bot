import { describe, it, expect } from 'vitest';
import { decideActivity } from '../src/brain/Brain.js';

const base = {
  player: { hp: 100, maxHp: 100, level: 10, statPoints: 0, podsUsed: 10, podsMax: 100 },
  hasGearUpgrade: false,
  quests: { actionable: false },
  arena: { available: false },
  profit: { bestCraftProfit: 0, combatValue: 0, gatherValue: 0 },
};

describe('decideActivity priority', () => {
  it('rests/heals first when hp is critically low', () => {
    const d = decideActivity({ ...base, player: { ...base.player, hp: 15 } });
    expect(d.type).toBe('rest');
  });

  it('banks when inventory pods are near full', () => {
    const d = decideActivity({ ...base, player: { ...base.player, podsUsed: 96, podsMax: 100 } });
    expect(d.type).toBe('bank');
  });

  it('allocates stat points before farming when points are pending', () => {
    const d = decideActivity({ ...base, player: { ...base.player, statPoints: 5 } });
    expect(d.type).toBe('allocate_stats');
  });

  it('equips gear upgrade before farming', () => {
    const d = decideActivity({ ...base, hasGearUpgrade: true });
    expect(d.type).toBe('upgrade_gear');
  });

  it('picks the highest-value profit activity when healthy and idle', () => {
    const d = decideActivity({
      ...base,
      profit: { bestCraftProfit: 50, combatValue: 120, gatherValue: 30 },
    });
    expect(d.type).toBe('combat');
  });

  it('chooses craft when craft profit dominates', () => {
    const d = decideActivity({
      ...base,
      profit: { bestCraftProfit: 200, combatValue: 50, gatherValue: 30 },
    });
    expect(d.type).toBe('craft');
  });

  it('does quests when actionable and no better profit', () => {
    const d = decideActivity({ ...base, quests: { actionable: true } });
    expect(d.type).toBe('quest');
  });

  it('falls back to gather/explore when nothing else applies', () => {
    const d = decideActivity({ ...base, profit: { bestCraftProfit: 0, combatValue: 0, gatherValue: 10 } });
    expect(d.type).toBe('gather');
  });

  it('survival outranks everything (low hp beats full pods)', () => {
    const d = decideActivity({
      ...base,
      player: { ...base.player, hp: 10, podsUsed: 99, podsMax: 100, statPoints: 9 },
      hasGearUpgrade: true,
    });
    expect(d.type).toBe('rest');
  });
});
