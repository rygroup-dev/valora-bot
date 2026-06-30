// Tactical turn planner for Valora's turn-based combat.
// Starter spells: strike (ap3, melee 1), bolt (ap4, ranged 2-6, needs LoS),
// mend (ap3, heal, range 0-4), guard (ap2, self buff). Player base 6 AP / 3 MP.
//
// Pure: given a normalized turn state, return an ordered list of acts. The
// Agent maps the live `fight` payload to this shape and sends each act as
// fightAct{kind,...}. Distance is injected so it works with the real grid.

export const SPELLS = {
  strike: { id: 'strike', ap: 3, min: 1, max: 1, kind: 'damage' },
  bolt: { id: 'bolt', ap: 4, min: 2, max: 6, kind: 'damage' },
  mend: { id: 'mend', ap: 3, min: 0, max: 4, kind: 'heal' },
  guard: { id: 'guard', ap: 2, min: 0, max: 0, kind: 'buff' },
};

// state: { self:{cell,ap,mp,hp,maxHp}, enemies:[{id,cell,hp}], dist(a,b), stepToward(from,target,mp) }
// dist(a,b): cell distance. stepToward(from,target,mp): best reachable cell within mp toward target (or from).
export function planTurn(state, { healThreshold = 0.4 } = {}) {
  const acts = [];
  const self = { ...state.self };
  const dist = state.dist || ((a, b) => Math.abs(a - b));
  const enemies = (state.enemies || []).filter((e) => e && e.hp > 0);
  if (!enemies.length) return [{ kind: 'endTurn' }];

  // Heal once if low and affordable.
  if (self.maxHp && self.hp / self.maxHp <= healThreshold && self.ap >= SPELLS.mend.ap) {
    acts.push({ kind: 'cast', spellId: 'mend', cell: self.cell });
    self.ap -= SPELLS.mend.ap;
  }

  let guarded = false;
  // Attack loop: spend AP on the best available damage spell.
  while (self.ap >= SPELLS.strike.ap) {
    const target = enemies.slice().sort((a, b) => dist(self.cell, a.cell) - dist(self.cell, b.cell))[0];
    const d = dist(self.cell, target.cell);

    if (d >= SPELLS.bolt.min && d <= SPELLS.bolt.max && self.ap >= SPELLS.bolt.ap) {
      acts.push({ kind: 'cast', spellId: 'bolt', cell: target.cell });
      self.ap -= SPELLS.bolt.ap;
      continue;
    }
    if (d <= SPELLS.strike.max && self.ap >= SPELLS.strike.ap) {
      acts.push({ kind: 'cast', spellId: 'strike', cell: target.cell });
      self.ap -= SPELLS.strike.ap;
      continue;
    }
    // Out of range: move toward the target if we still have MP.
    if (self.mp > 0 && state.stepToward) {
      const next = state.stepToward(self.cell, target.cell, self.mp);
      if (next != null && next !== self.cell) {
        acts.push({ kind: 'move', cell: next });
        self.cell = next;
        self.mp = 0; // movement consumed for this turn
        continue;
      }
    }
    // Can't reach and can't act usefully: spend leftover AP on guard once.
    if (!guarded && self.ap >= SPELLS.guard.ap) {
      acts.push({ kind: 'cast', spellId: 'guard', cell: self.cell });
      self.ap -= SPELLS.guard.ap;
      guarded = true;
      continue;
    }
    break;
  }

  acts.push({ kind: 'endTurn' });
  return acts;
}
