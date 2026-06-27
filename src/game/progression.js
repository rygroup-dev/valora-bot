// Character progression: gear upgrades (econ_equip) and stat allocation.
// Makes the character stronger over time. Pure/testable decision logic;
// the actual econ_* sends happen in the economy/agent layer.

export function scoreItem(item, weights) {
  if (!item || !item.stats) return 0;
  let s = 0;
  for (const [stat, val] of Object.entries(item.stats)) {
    const w = weights[stat];
    if (w) s += val * w;
  }
  return s;
}

// Compare equipped vs inventory per slot; return a list of equip actions for
// any strict upgrade. Never downgrades. Respects level requirements.
export function bestLoadout({ inventory = [], equipped = {}, weights = {}, level = Infinity }) {
  const plan = [];
  const bySlot = new Map();
  for (const it of inventory) {
    if (!it || !it.slot) continue;
    if ((it.levelReq || 0) > level) continue;
    const cur = bySlot.get(it.slot);
    if (!cur || scoreItem(it, weights) > scoreItem(cur, weights)) bySlot.set(it.slot, it);
  }
  for (const [slot, candidate] of bySlot) {
    const current = equipped[slot] || null;
    if (scoreItem(candidate, weights) > scoreItem(current, weights)) {
      plan.push({ action: 'equip', id: candidate.id, slot });
    }
  }
  return plan;
}

// Allocate `charac.points` across stats per a build ratio map (values sum ~1).
// Largest-remainder rounding, never exceeding available points.
export function planStatAllocation(charac, build) {
  const points = Number(charac?.points) || 0;
  if (points <= 0) return {};
  const entries = Object.entries(build);
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  const raw = entries.map(([stat, w]) => ({ stat, exact: (w / total) * points }));
  const plan = {};
  let used = 0;
  for (const r of raw) {
    const floor = Math.floor(r.exact);
    plan[r.stat] = floor;
    used += floor;
    r.rem = r.exact - floor;
  }
  let left = points - used;
  raw.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < raw.length && left > 0; i++, left--) plan[raw[i].stat] += 1;
  for (const k of Object.keys(plan)) if (plan[k] === 0) delete plan[k];
  return plan;
}
