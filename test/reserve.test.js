import { describe, it, expect } from 'vitest';
import { questReservations } from '../src/game/reserve.js';
import { QUEST_CATALOG } from '../src/game/quests.js';

describe('questReservations — never sell items an active/upcoming quest still needs', () => {
  it('reserves gather targets of active quests with their step count', () => {
    // Q003 active: gather 2× fish_gudgeon then craft dish_gudgeon
    const r = questReservations(QUEST_CATALOG, { active: [{ id: 'Q003', step: 0 }], completed: ['Q001'] });
    expect(r.fish_gudgeon).toBeGreaterThanOrEqual(2);
  });

  it('reserves gather targets of acceptable (deps-met, not completed) quests too', () => {
    // Q007 not active but deps (Q002) met → bot will pursue it; reserve ore_copper/ore_coal
    const r = questReservations(QUEST_CATALOG, { active: [], completed: ['Q001', 'Q002'] });
    expect(r.ore_copper).toBeGreaterThanOrEqual(2);
    expect(r.ore_coal).toBeGreaterThanOrEqual(1);
  });

  it('does not reserve for completed quests', () => {
    const r = questReservations(QUEST_CATALOG, { active: [], completed: ['Q001', 'Q002', 'Q007'] });
    expect(r.ore_copper).toBeUndefined();
  });

  it('does not reserve for blocked quests', () => {
    const r = questReservations(QUEST_CATALOG, {
      active: [{ id: 'Q003', step: 0 }],
      completed: ['Q001'],
      blocked: new Set(['Q003']),
    });
    expect(r.fish_gudgeon).toBeUndefined();
  });

  it('ignores wildcard gather targets', () => {
    const r = questReservations(QUEST_CATALOG, { active: [{ id: 'Q002', step: 1 }], completed: ['Q001'] });
    expect(r['*']).toBeUndefined();
  });
});
