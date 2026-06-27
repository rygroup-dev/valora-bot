import { describe, it, expect } from 'vitest';
import { nextStarterAction, STARTER_CHAIN } from '../src/game/starter.js';

// Q001 steps: talk mira, talk nora, talk rurik, talk broker(turnin)
// Q002 steps: equip tool, gather *, talk broker(turnin) ; grants a tool on accept

describe('nextStarterAction', () => {
  it('accepts Q001 first when nothing is started', () => {
    const a = nextStarterAction({ active: [], completed: [], hasTool: false });
    expect(a).toEqual({ type: 'accept', questId: 'Q001', npc: 'broker' });
  });

  it('drives Q001 talk steps to the right NPC via turnin(step)', () => {
    const a = nextStarterAction({ active: [{ id: 'Q001', step: 0 }], completed: [], hasTool: false });
    expect(a).toEqual({ type: 'turnin', questId: 'Q001', step: 0, npc: 'mira' });
    const b = nextStarterAction({ active: [{ id: 'Q001', step: 2 }], completed: [], hasTool: false });
    expect(b.npc).toBe('rurik');
    expect(b.step).toBe(2);
  });

  it('turns in Q001 at the broker on the final step', () => {
    const a = nextStarterAction({ active: [{ id: 'Q001', step: 3 }], completed: [], hasTool: false });
    expect(a).toEqual({ type: 'turnin', questId: 'Q001', step: 3, npc: 'broker' });
  });

  it('accepts Q002 once Q001 is completed (grants a tool)', () => {
    const a = nextStarterAction({ active: [], completed: ['Q001'], hasTool: false });
    expect(a).toEqual({ type: 'accept', questId: 'Q002', npc: 'broker' });
  });

  it('equips the granted tool on Q002 step 0', () => {
    const a = nextStarterAction({ active: [{ id: 'Q002', step: 0 }], completed: ['Q001'], hasTool: false });
    expect(a.type).toBe('equip');
  });

  it('gathers on Q002 step 1 (now has a tool)', () => {
    const a = nextStarterAction({ active: [{ id: 'Q002', step: 1 }], completed: ['Q001'], hasTool: true });
    expect(a.type).toBe('gather');
  });

  it('turns in Q002 at broker on final step', () => {
    const a = nextStarterAction({ active: [{ id: 'Q002', step: 2 }], completed: ['Q001'], hasTool: true });
    expect(a).toEqual({ type: 'turnin', questId: 'Q002', step: 2, npc: 'broker' });
  });

  it('returns null when the whole starter chain is done', () => {
    const a = nextStarterAction({ active: [], completed: STARTER_CHAIN, hasTool: true });
    expect(a).toBeNull();
  });
});
