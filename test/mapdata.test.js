import { describe, it, expect } from 'vitest';
import { MapData } from '../src/game/MapData.js';

function baseMap() {
  const width = 10, height = 10;
  const n = width * height + (width - 1) * (height - 1);
  return {
    id: 'test',
    width,
    height,
    spawn: 50,
    cells: Array.from({ length: n }, () => ({ walkable: 1 })),
    woodSpots: [{ cell: 60, wood: 'wood_oak' }],
    fishSpots: [{ cell: 70, fish: 'fish_chub' }],
    mineralNodes: [],
    portals: [{ cell: 5, toMap: 'mine1', toCell: 100, label: 'Mine' }],
  };
}

describe('MapData.spots', () => {
  it('normalizes wood/fish/mineral into a unified spot list', () => {
    const m = new MapData(baseMap());
    const spots = m.spots();
    expect(spots).toContainEqual({ cell: 60, type: 'wood', resource: 'wood_oak' });
    expect(spots).toContainEqual({ cell: 70, type: 'fish', resource: 'fish_chub' });
  });
  it('filters by requested kinds', () => {
    const m = new MapData(baseMap());
    expect(m.spots(['fish']).every((s) => s.type === 'fish')).toBe(true);
  });
});

describe('MapData.portals', () => {
  it('exposes portals', () => {
    const m = new MapData(baseMap());
    expect(m.portals()[0].toMap).toBe('mine1');
  });
});

describe('MapData.pickGatherTarget', () => {
  it('returns the spot with a reachable stand cell and a path', () => {
    const json = baseMap();
    json.cells[60].walkable = 0; // wood node is an obstacle
    const m = new MapData(json);
    const t = m.pickGatherTarget(50, {});
    expect(t).not.toBeNull();
    expect(t.spot.cell).toBe(60);
    // stand is a walkable cell within harvest range of the spot
    expect(m.graph.isWalkable(t.stand)).toBe(true);
    expect(m.graph.standsWithin(60, 2)).toContain(t.stand);
    expect(Array.isArray(t.path)).toBe(true);
  });

  it('skips spots whose cell is in the busy set', () => {
    const json = baseMap();
    json.cells[60].walkable = 0;
    json.cells[70].walkable = 0;
    const m = new MapData(json);
    const t = m.pickGatherTarget(50, { busy: new Set([60]) });
    expect(t.spot.cell).toBe(70); // 60 busy -> pick fish at 70
  });

  it('returns null when no spots are gatherable', () => {
    const json = baseMap();
    json.woodSpots = [];
    json.fishSpots = [];
    const m = new MapData(json);
    expect(m.pickGatherTarget(50, {})).toBeNull();
  });
});
