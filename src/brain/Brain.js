// The Brain: chooses ONE activity per tick by a fixed safety-first priority,
// then by ROI among profit activities. Pure function for testability.
//
// Priority:
//   1. rest        — survival (hp below threshold)
//   2. bank        — inventory pods near full
//   3. allocate    — pending stat points (free power)
//   4. upgrade     — gear upgrade available (free power)
//   5. quest       — when character leveling is the current goal
//   6. profit      — best of combat / craft / gather by value
//   7. quest       — actionable quests
//   8. gather      — fallback

const HP_REST = 0.3;
const PODS_FULL = 0.9;

export function decideActivity(ctx) {
  const p = ctx.player || {};
  const hpRatio = p.maxHp ? p.hp / p.maxHp : 1;
  const podsRatio = p.podsMax ? p.podsUsed / p.podsMax : 0;

  // Rest only when something can actually restore HP (food to eat/craft/buy).
  // The live server does not heal on rest, so with no recovery available the
  // right move is to keep gathering — combat is gated separately on trusted HP.
  if (hpRatio <= HP_REST && (ctx.canRecover ?? true)) {
    return { type: 'rest', reason: `hp ${Math.round(hpRatio * 100)}%` };
  }
  if (podsRatio >= PODS_FULL) return { type: 'bank', reason: `pods ${Math.round(podsRatio * 100)}%` };
  if ((p.statPoints || 0) > 0) return { type: 'allocate_stats', reason: `${p.statPoints} points` };
  if (ctx.hasGearUpgrade) return { type: 'upgrade_gear', reason: 'better gear available' };
  if (ctx.progression?.prioritizeCharacterLevel && ctx.quests?.actionable) {
    return { type: 'quest', reason: 'character leveling' };
  }

  const profit = ctx.profit || {};
  const options = [
    { type: 'combat', value: profit.combatValue || 0 },
    { type: 'craft', value: profit.bestCraftProfit || 0 },
    { type: 'gather', value: profit.gatherValue || 0 },
  ].sort((a, b) => b.value - a.value);

  const best = options[0];
  if (best.value > 0) return { type: best.type, reason: `value ${best.value}` };

  if (ctx.quests?.actionable) return { type: 'quest', reason: 'quest actionable' };
  if (ctx.arena?.available) return { type: 'arena', reason: 'arena open' };

  return { type: 'gather', reason: 'fallback' };
}
