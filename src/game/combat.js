// Combat decisions: which mob to engage, and what to do each fight turn.
// Conservative by design (anti-death): respects level delta, heals, flees.

function dist(a, b) {
  return Math.abs((a || 0) - (b || 0));
}

export function pickTarget(mobs, player, { minLevelDelta = -Infinity, maxLevelDelta = 3, prefer = 'closest', maxPackSize = 1 } = {}) {
  // engageFight{gid} pulls the mob's WHOLE group into the fight — a solo
  // level-4 character vs a 4-mob pack of level 4s is a guaranteed loss. Count
  // pack sizes by gid and never engage a pack larger than we can handle.
  const packSize = new Map();
  for (const m of mobs || []) {
    if (!m || m.gid == null) continue;
    packSize.set(m.gid, (packSize.get(m.gid) || 0) + 1);
  }
  const eligible = (mobs || []).filter((m) => {
    if (!m) return false;
    if (m.hp === 0) return false;
    if (m.engaged) return false;
    if ((packSize.get(m.gid) || 1) > maxPackSize) return false;
    const delta = (m.level || 0) - (player.level || 0);
    return delta >= minLevelDelta && delta <= maxLevelDelta;
  });
  if (!eligible.length) return null;
  const size = (m) => packSize.get(m.gid) || 1;
  if (prefer === 'closest') {
    return eligible.slice().sort((a, b) => size(a) - size(b) || dist(a.cell, player.cell) - dist(b.cell, player.cell))[0];
  }
  if (prefer === 'equal') {
    return eligible.slice().sort((a, b) => {
      const ad = Math.abs((a.level || 0) - (player.level || 0));
      const bd = Math.abs((b.level || 0) - (player.level || 0));
      return size(a) - size(b) || ad - bd || dist(a.cell, player.cell) - dist(b.cell, player.cell);
    })[0];
  }
  // 'weakest' fallback
  return eligible.slice().sort((a, b) => size(a) - size(b) || (a.level || 0) - (b.level || 0))[0];
}

// Decide whether to GO LOOKING for a fight (out of combat). The live player
// schema carries no HP out of combat (the save's 1/0 is a stale placeholder;
// real HP is server-side at fight time), so this does NOT gate on HP — it relies
// on the level-winnability gate plus a loss-backoff cooldown the caller passes
// in. Returns the chosen target mob, or null when we shouldn't seek a fight.
export function combatSeekTarget({
  enabled = true,
  now = Date.now(),
  cooldownUntil = 0,
  mobs = [],
  self = {},
  minLevelDelta = -Infinity,
  maxLevelDelta = 2,
  prefer = 'weakest',
} = {}) {
  if (!enabled) return null;
  if (now < cooldownUntil) return null;
  return pickTarget(mobs, self, { minLevelDelta, maxLevelDelta, prefer });
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
