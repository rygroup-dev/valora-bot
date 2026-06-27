import { describe, it, expect } from 'vitest';
import { pickTarget, decideFightAction } from '../src/game/combat.js';

describe('pickTarget', () => {
  const player = { level: 10, cell: 100 };
  it('skips mobs above the allowed level delta (too dangerous)', () => {
    const mobs = [
      { id: 'hard', level: 30, cell: 101 },
      { id: 'ok', level: 11, cell: 130 },
    ];
    const t = pickTarget(mobs, player, { maxLevelDelta: 3 });
    expect(t.id).toBe('ok');
  });
  it('prefers the closest eligible mob by default', () => {
    const mobs = [
      { id: 'far', level: 9, cell: 500 },
      { id: 'near', level: 9, cell: 102 },
    ];
    const t = pickTarget(mobs, player, { maxLevelDelta: 3 });
    expect(t.id).toBe('near');
  });
  it('returns null when no mob is safe', () => {
    const mobs = [{ id: 'boss', level: 50, cell: 100 }];
    expect(pickTarget(mobs, player, { maxLevelDelta: 3 })).toBeNull();
  });
  it('ignores dead or already-engaged mobs', () => {
    const mobs = [
      { id: 'dead', level: 9, cell: 100, hp: 0 },
      { id: 'live', level: 9, cell: 120, hp: 50 },
    ];
    expect(pickTarget(mobs, player, { maxLevelDelta: 3 }).id).toBe('live');
  });
});

describe('decideFightAction', () => {
  const player = { hp: 100, maxHp: 100 };
  it('heals when hp ratio drops below threshold and a heal is available', () => {
    const state = { enemies: [{ id: 'e1', hp: 10 }], self: { hp: 20, maxHp: 100 } };
    const a = decideFightAction(state, { healThreshold: 0.35, heals: [{ id: 'potion', heal: 50 }] });
    expect(a).toEqual({ type: 'use', id: 'potion' });
  });
  it('focus-fires the lowest-hp enemy when healthy', () => {
    const state = { enemies: [{ id: 'e1', hp: 80 }, { id: 'e2', hp: 12 }], self: { hp: 90, maxHp: 100 } };
    const a = decideFightAction(state, { healThreshold: 0.35, heals: [] });
    expect(a).toEqual({ type: 'attack', target: 'e2' });
  });
  it('flees when below the flee threshold with no heals', () => {
    const state = { enemies: [{ id: 'e1', hp: 80 }], self: { hp: 8, maxHp: 100 } };
    const a = decideFightAction(state, { healThreshold: 0.35, fleeThreshold: 0.12, heals: [] });
    expect(a).toEqual({ type: 'flee' });
  });
  it('passes when no enemies remain', () => {
    const state = { enemies: [], self: { hp: 50, maxHp: 100 } };
    expect(decideFightAction(state, {})).toEqual({ type: 'none' });
  });
});
