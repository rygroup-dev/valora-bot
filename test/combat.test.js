import { describe, it, expect } from 'vitest';
import { pickTarget, decideFightAction, combatSeekTarget } from '../src/game/combat.js';
import { Agent } from '../src/Agent.js';

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

describe('combatSeekTarget', () => {
  const self = { level: 5, cell: 100 };
  const mobs = [{ id: 'm', gid: 1, level: 5, cell: 102, hp: 30 }];

  it('returns a winnable target when enabled and off cooldown', () => {
    const t = combatSeekTarget({ enabled: true, now: 1000, cooldownUntil: 0, mobs, self, maxLevelDelta: 2 });
    expect(t?.id).toBe('m');
  });
  it('does NOT gate on HP (no hp/maxHp passed in)', () => {
    // self has no hp/maxHp at all — must still find a fight (the old bug blocked this).
    const t = combatSeekTarget({ enabled: true, mobs, self: { level: 5, cell: 100 }, maxLevelDelta: 2 });
    expect(t).toBeTruthy();
  });
  it('returns null while in the post-loss backoff cooldown', () => {
    const t = combatSeekTarget({ enabled: true, now: 1000, cooldownUntil: 5000, mobs, self, maxLevelDelta: 2 });
    expect(t).toBeNull();
  });
  it('returns null when combat is disabled', () => {
    expect(combatSeekTarget({ enabled: false, mobs, self })).toBeNull();
  });
  it('returns null when the only mob is too high level', () => {
    const hard = [{ id: 'boss', gid: 9, level: 40, cell: 101 }];
    expect(combatSeekTarget({ enabled: true, mobs: hard, self, maxLevelDelta: 2 })).toBeNull();
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

describe('Agent HP recovery gate', () => {
  function agentWithHp(hp, maxHp = 80) {
    return Object.assign(Object.create(Agent.prototype), {
      _hp: hp,
      _maxHp: maxHp,
      _inventory: () => [],
    });
  }

  it('requires recovery below the ready threshold', () => {
    expect(agentWithHp(40, 80)._needsHpRecovery()).toBe(true);
    expect(agentWithHp(75, 80)._needsHpRecovery()).toBe(true);
  });

  it('allows combat only once HP is near full', () => {
    expect(agentWithHp(76, 80)._needsHpRecovery()).toBe(false);
    expect(agentWithHp(80, 80)._needsHpRecovery()).toBe(false);
  });

  it('does not block first fight before any HP snapshot exists', () => {
    const agent = Object.assign(Object.create(Agent.prototype), {});
    expect(agent._needsHpRecovery()).toBe(false);
  });

  it('rests after startup until a first HP snapshot exists', () => {
    const agent = Object.assign(Object.create(Agent.prototype), {
      combatEnabled: true,
      _startupRecoverUntil: Date.now() + 1000,
    });
    expect(agent._needsStartupRecovery()).toBe(true);
    agent._maxHp = 80;
    expect(agent._needsStartupRecovery()).toBe(false);
  });
});
