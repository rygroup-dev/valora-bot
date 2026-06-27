// Starter quest chain that grants the first gathering tool.
// Q001 "Welcome": greet town NPCs, turn in at the broker.
// Q002 "A tool in each hand": grants a tool (toolIfNone), equip + use it.
// Only two server actions exist: econ_quest_accept{questId} and
// econ_quest_turnin{questId,step}; talk/equip/gather steps advance via turnin
// (talk) or the matching econ action (equip/gather) then turnin.

export const STARTER_CHAIN = ['Q001', 'Q002'];

// Step definitions (kind + target NPC for talk/turnin steps).
const QUESTS = {
  Q001: {
    giver: 'broker',
    steps: [
      { kind: 'talk', npc: 'mira' },
      { kind: 'talk', npc: 'nora' },
      { kind: 'talk', npc: 'rurik' },
      { kind: 'talk', npc: 'broker' }, // final turn-in
    ],
  },
  Q002: {
    giver: 'broker',
    steps: [
      { kind: 'equip' },
      { kind: 'gather' },
      { kind: 'talk', npc: 'broker' }, // final turn-in
    ],
  },
};

// Decide the next starter action.
//  state: { active:[{id,step}], completed:[ids], hasTool:bool }
// Returns one of:
//  {type:'accept', questId, npc}
//  {type:'turnin', questId, step, npc}
//  {type:'equip'}  |  {type:'gather'}  |  null (chain done)
export function nextStarterAction({ active = [], completed = [], hasTool = false } = {}) {
  const questId = STARTER_CHAIN.find((q) => !completed.includes(q));
  if (!questId) return null;

  const cur = active.find((q) => q.id === questId);
  const def = QUESTS[questId];

  if (!cur) {
    return { type: 'accept', questId, npc: def.giver };
  }

  const step = cur.step || 0;
  const stepDef = def.steps[step];
  if (!stepDef) return { type: 'turnin', questId, step, npc: def.giver };

  switch (stepDef.kind) {
    case 'talk':
      return { type: 'turnin', questId, step, npc: stepDef.npc };
    case 'equip':
      return { type: 'equip', questId, step };
    case 'gather':
      return { type: 'gather', questId, step };
    default:
      return { type: 'turnin', questId, step, npc: def.giver };
  }
}
