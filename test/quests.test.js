import { describe, it, expect } from 'vitest';
import { nextQuestAction, QUEST_CATALOG } from '../src/game/quests.js';

describe('nextQuestAction', () => {
  it('accepts the first quest when nothing started', () => {
    const a = nextQuestAction({ active: [], completed: [] });
    expect(a).toEqual({ type: 'accept', questId: 'Q001', npc: 'broker' });
  });

  it('drives a talk step to the target NPC', () => {
    const a = nextQuestAction({ active: [{ id: 'Q001', step: 1 }], completed: [] });
    expect(a).toEqual({ type: 'turnin', questId: 'Q001', step: 1, npc: 'nora' });
  });

  it('emits a gather action for a gather step with the target resource + count', () => {
    const a = nextQuestAction({ active: [{ id: 'Q003', step: 0 }], completed: ['Q001'] });
    expect(a).toEqual({ type: 'gather', questId: 'Q003', step: 0, target: 'fish_gudgeon', count: 2 });
  });

  it('emits a craft action with the recipe', () => {
    const a = nextQuestAction({ active: [{ id: 'Q003', step: 1 }], completed: ['Q001'] });
    expect(a).toEqual({ type: 'craft', questId: 'Q003', step: 1, recipe: 'dish_gudgeon', count: 1 });
  });

  it('respects quest dependencies (Q005 needs Q004)', () => {
    const a = nextQuestAction({ active: [], completed: ['Q001', 'Q002'] });
    // Q003/Q004/Q006/Q007 are available (need Q001/Q002); Q005 (needs Q004) is not yet
    expect(a.questId).not.toBe('Q005');
  });

  it('skips blocked quests', () => {
    const a = nextQuestAction({ active: [{ id: 'Q005', step: 0 }], completed: ['Q004'], blocked: new Set(['Q005']) });
    // Q005 blocked -> should accept a different available quest instead of acting on Q005
    expect(a?.questId).not.toBe('Q005');
  });

  it('returns null when everything is done', () => {
    const all = Object.keys(QUEST_CATALOG);
    expect(nextQuestAction({ active: [], completed: all })).toBeNull();
  });
});
