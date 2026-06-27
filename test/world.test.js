import { describe, it, expect } from 'vitest';
import { snapshot, freeNodes } from '../src/game/world.js';

// Minimal MapSchema stand-in: has forEach((value,key)) and get(key).
function mapSchema(obj) {
  return {
    size: Object.keys(obj).length,
    forEach: (fn) => Object.entries(obj).forEach(([k, v]) => fn(v, k)),
    get: (k) => obj[k],
  };
}

const state = {
  players: mapSchema({
    me: { id: '2096', name: 'ohmaygawd', cell: 100, level: 10, inFight: false, gathering: '' },
    other: { id: '7', name: 'bob', cell: 200, level: 12, inFight: false },
  }),
  mobs: mapSchema({
    1: { mid: 1, mobId: 'slime', level: 9, cell: 102, owner: '' },
    2: { mid: 2, mobId: 'golem', level: 30, cell: 300, owner: 'someone' },
  }),
  nodes: mapSchema({
    n1: { cell: 50, status: 0 },
    n2: { cell: 60, status: 1 },
  }),
};

describe('snapshot', () => {
  it('resolves self from the session id', () => {
    const s = snapshot(state, 'me');
    expect(s.self.name).toBe('ohmaygawd');
    expect(s.self.cell).toBe(100);
  });
  it('lists other players separately from self', () => {
    const s = snapshot(state, 'me');
    expect(s.players.map((p) => p.name)).toContain('bob');
    expect(s.players.find((p) => p.name === 'ohmaygawd')).toBeUndefined();
  });
  it('normalizes mobs with a usable id field', () => {
    const s = snapshot(state, 'me');
    const slime = s.mobs.find((m) => m.mobId === 'slime');
    expect(slime.id).toBe(1);
    expect(slime.cell).toBe(102);
  });
  it('handles null state gracefully', () => {
    const s = snapshot(null, 'me');
    expect(s.self).toBeNull();
    expect(s.mobs).toEqual([]);
  });
});

describe('freeNodes', () => {
  it('returns only nodes whose status marks them available', () => {
    // status 0 = available (free), per server convention we treat 0 as ready
    const nodes = freeNodes(state, 0);
    expect(nodes.map((n) => n.cell)).toEqual([50]);
  });
});
