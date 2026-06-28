// Quest item reservation: compute which inventory items the bot must NOT sell
// because an active or upcoming quest still needs them (gather targets feed
// craft steps). Selling them would make the bot re-gather — a costly mistake.

function depsMet(reqs, completed) {
  return (reqs || []).every((r) => completed.includes(r));
}

// Returns { itemId: qtyToKeep } for the gather targets of quests that are
// active OR acceptable next (deps met, not completed, not blocked). A craft
// step may consume more than the gathered count, so reserve with a small buffer.
export function questReservations(catalog, { active = [], completed = [], blocked = new Set() } = {}) {
  const keep = {};
  const consider = new Set();
  for (const a of active) if (!blocked.has(a.id)) consider.add(a.id);
  for (const [id, def] of Object.entries(catalog)) {
    if (completed.includes(id) || blocked.has(id)) continue;
    if (depsMet(def.requires, completed)) consider.add(id);
  }
  for (const id of consider) {
    const def = catalog[id];
    if (!def) continue;
    for (const step of def.steps || []) {
      if (step.kind !== 'gather') continue;
      const item = step.target;
      if (!item || item === '*') continue;
      const need = (step.count || 1) + 1; // +1 buffer for craft consumption
      keep[item] = Math.max(keep[item] || 0, need);
    }
  }
  return keep;
}
