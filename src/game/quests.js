// General quest runner for the chapter 1-2 quests. Completing them grants
// character XP (levels) without needing to win mob fights — the steps are
// talk / equip / gather / craft / inspect / reach.
//
// Server actions: econ_quest_accept{questId}, econ_quest_turnin{questId,step}
// (advances talk/inspect/reach steps when near the target). gather/craft steps
// advance via their own econ actions (harvest / econ_craft) tracked by counter.

export const QUEST_CATALOG = {
  Q001: { giver: 'broker', requires: [], steps: [
    { kind: 'talk', target: 'mira' }, { kind: 'talk', target: 'nora' },
    { kind: 'talk', target: 'rurik' }, { kind: 'talk', target: 'broker' } ] },
  Q002: { giver: 'broker', requires: ['Q001'], steps: [
    { kind: 'equip', target: 'tool' }, { kind: 'gather', target: '*', count: 1 },
    { kind: 'talk', target: 'broker' } ] },
  Q003: { giver: 'nora', requires: ['Q001'], steps: [
    { kind: 'gather', target: 'fish_gudgeon', count: 2 },
    { kind: 'craft', target: 'dish_gudgeon', count: 1 }, { kind: 'talk', target: 'nora' } ] },
  Q004: { giver: 'mira', requires: ['Q001'], steps: [
    { kind: 'gather', target: 'cereal_wheat', count: 4 },
    { kind: 'craft', target: 'flour_wheat', count: 2 },
    { kind: 'craft', target: 'bread_country', count: 1 }, { kind: 'talk', target: 'mira' } ] },
  Q005: { giver: 'mira', requires: ['Q004'], steps: [
    { kind: 'inspect', target: 'field_sack' }, { kind: 'talk', target: 'mira' } ] },
  Q006: { giver: 'gabin', requires: ['Q002'], steps: [
    { kind: 'gather', target: 'wood_ash', count: 2 },
    { kind: 'craft', target: 'wood_plank', count: 1 },
    { kind: 'inspect', target: 'fountain_bench' }, { kind: 'talk', target: 'gabin' } ] },
  Q007: { giver: 'rurik', requires: ['Q002'], steps: [
    { kind: 'gather', target: 'ore_copper', count: 2 },
    { kind: 'gather', target: 'ore_coal', count: 1 },
    { kind: 'craft', target: 'ingot_copper', count: 1 }, { kind: 'talk', target: 'rurik' } ] },
  Q008: { giver: 'sellem', requires: ['Q001'], steps: [
    { kind: 'reach', target: 'pasture' }, { kind: 'talk', target: 'sellem' } ] },
};

export const QUEST_ORDER = ['Q001', 'Q002', 'Q003', 'Q004', 'Q007', 'Q006', 'Q005', 'Q008'];

function depsMet(reqs, completed) {
  return (reqs || []).every((r) => completed.includes(r));
}

// Decide the next quest action.
//  state: { active:[{id,step}], completed:[ids], hasTool, blocked:Set(questIds) }
// Returns {type, questId, step?, npc?, target?, count?, recipe?} or null.
export function nextQuestAction({ active = [], completed = [], hasTool = false, blocked = new Set() } = {}) {
  // Continue an in-progress quest first.
  for (const q of active) {
    if (blocked.has(q.id)) continue;
    const def = QUEST_CATALOG[q.id];
    if (!def) continue;
    const step = def.steps[q.step || 0];
    if (!step) return { type: 'turnin', questId: q.id, step: q.step || 0, npc: def.giver };
    return stepAction(q.id, q.step || 0, step);
  }
  // Otherwise accept the next available quest.
  for (const id of QUEST_ORDER) {
    if (completed.includes(id) || blocked.has(id)) continue;
    if (active.some((a) => a.id === id)) continue;
    const def = QUEST_CATALOG[id];
    if (!def || !depsMet(def.requires, completed)) continue;
    return { type: 'accept', questId: id, npc: def.giver };
  }
  return null;
}

function stepAction(questId, step, def) {
  switch (def.kind) {
    case 'talk':
      return { type: 'turnin', questId, step, npc: def.target };
    case 'equip':
      return { type: 'equip', questId, step };
    case 'gather':
      return { type: 'gather', questId, step, target: def.target, count: def.count || 1 };
    case 'craft':
      return { type: 'craft', questId, step, recipe: def.target, count: def.count || 1 };
    case 'inspect':
      return { type: 'inspect', questId, step, target: def.target };
    case 'reach':
      return { type: 'reach', questId, step, target: def.target };
    default:
      return { type: 'turnin', questId, step, npc: QUEST_CATALOG[questId].giver };
  }
}
