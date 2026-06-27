// Combat decisions: which mob to engage, and what to do each fight turn.
// Conservative by design (anti-death): respects level delta, heals, flees.

function dist(a, b) {
  return Math.abs((a || 0) - (b || 0));
}

export function pickTarget(mobs, player, { maxLevelDelta = 3, prefer = 'closest' } = {}) {
  const eligible = (mobs || []).filter((m) => {
    if (!m) return false;
    if (m.hp === 0) return false;
    if (m.engaged) return false;
    return (m.level || 0) - (player.level || 0) <= maxLevelDelta;
  });
  if (!eligible.length) return null;
  if (prefer === 'closest') {
    return eligible.slice().sort((a, b) => dist(a.cell, player.cell) - dist(b.cell, player.cell))[0];
  }
  // 'weakest' fallback
  return eligible.slice().sort((a, b) => (a.level || 0) - (b.level || 0))[0];
}

export function decideFightAction(state, { healThreshold = 0.35, fleeThreshold = 0.1, heals = [] } = {}) {
  const enemies = (state.enemies || []).filter((e) => e && e.hp > 0);
  if (!enemies.length) return { type: 'none' };

  const self = state.self || {};
  const ratio = self.maxHp ? self.hp / self.maxHp : 1;

  if (ratio <= healThreshold && heals.length) {
    return { type: 'use', id: heals[0].id };
  }
  if (ratio <= fleeThreshold && !heals.length) {
    return { type: 'flee' };
  }
  // focus-fire lowest hp enemy
  const target = enemies.slice().sort((a, b) => a.hp - b.hp)[0];
  return { type: 'attack', target: target.id };
}
