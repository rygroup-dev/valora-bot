import { describe, it, expect } from 'vitest';
import { planTurn } from '../src/game/combatAI.js';

// simple linear distance for tests
const dist = (a, b) => Math.abs(a - b);
const stepToward = (from, target) => (from < target ? from + 1 : from - 1);

describe('planTurn', () => {
  it('bolts an enemy in ranged band (2-6) and ends turn', () => {
    const acts = planTurn({ self: { cell: 0, ap: 6, mp: 3, hp: 50, maxHp: 50 }, enemies: [{ id: 1, cell: 4, hp: 30 }], dist, stepToward });
    expect(acts[0]).toEqual({ kind: 'cast', spellId: 'bolt', cell: 4 });
    expect(acts[acts.length - 1]).toEqual({ kind: 'endTurn' });
  });

  it('strikes twice when adjacent with 6 AP', () => {
    const acts = planTurn({ self: { cell: 5, ap: 6, mp: 3, hp: 50, maxHp: 50 }, enemies: [{ id: 1, cell: 6, hp: 30 }], dist, stepToward });
    const strikes = acts.filter((a) => a.spellId === 'strike');
    expect(strikes.length).toBe(2);
  });

  it('heals when hp is low before attacking', () => {
    const acts = planTurn({ self: { cell: 0, ap: 6, mp: 3, hp: 10, maxHp: 50 }, enemies: [{ id: 1, cell: 4, hp: 30 }], dist, stepToward });
    expect(acts[0]).toEqual({ kind: 'cast', spellId: 'mend', cell: 0 });
  });

  it('uses mend instead of consumables while already in combat', () => {
    const acts = planTurn(
      { self: { cell: 0, ap: 6, mp: 3, hp: 10, maxHp: 50 }, enemies: [{ id: 1, cell: 4, hp: 30 }], dist, stepToward },
      { heals: [{ id: 'bread_barley', heal: 40 }] },
    );
    expect(acts[0]).toEqual({ kind: 'cast', spellId: 'mend', cell: 0 });
    expect(acts.some((a) => a.kind === 'use')).toBe(false);
  });

  it('moves toward a far enemy then attacks', () => {
    // enemy at 9 (out of bolt max 6) -> move closer then bolt
    const acts = planTurn({ self: { cell: 0, ap: 6, mp: 3, hp: 50, maxHp: 50 }, enemies: [{ id: 1, cell: 9, hp: 30 }], dist, stepToward });
    expect(acts.some((a) => a.kind === 'move')).toBe(true);
  });

  it('ends turn immediately when no enemies remain', () => {
    expect(planTurn({ self: { cell: 0, ap: 6, mp: 3, hp: 50, maxHp: 50 }, enemies: [], dist, stepToward })).toEqual([{ kind: 'endTurn' }]);
  });

  it('never spends more AP than available', () => {
    const acts = planTurn({ self: { cell: 5, ap: 6, mp: 0, hp: 50, maxHp: 50 }, enemies: [{ id: 1, cell: 6, hp: 99 }], dist, stepToward });
    const apUsed = acts.filter((a) => a.kind === 'cast').reduce((s, a) => s + (a.spellId === 'strike' ? 3 : a.spellId === 'bolt' ? 4 : a.spellId === 'mend' ? 3 : 2), 0);
    expect(apUsed).toBeLessThanOrEqual(6);
  });
});
