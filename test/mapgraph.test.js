import { describe, it, expect } from 'vitest';
import { MapGraph } from '../src/game/MapGraph.js';

// Build a map with all-walkable cells of given width/height.
function fullMap(width, height) {
  const n = width * height + (width - 1) * (height - 1);
  return { width, height, cells: Array.from({ length: n }, () => ({ walkable: 1 })) };
}

describe('MapGraph topology (matches Dofus fs formula)', () => {
  const g = new MapGraph(fullMap(90, 102));
  it('has the right cell count', () => {
    expect(g.size).toBe(18169);
  });
  it('adjacency is symmetric', () => {
    for (const c of [0, 100, 5000, 11225, 18168]) {
      for (const n of g.neighbors(c)) expect(g.neighbors(n)).toContain(c);
    }
  });
  it('interior cell has 4 neighbors', () => {
    expect(g.neighbors(11225).length).toBe(4);
  });
});

describe('MapGraph pathfinding', () => {
  it('finds a shortest path of adjacent walkable cells', () => {
    const g = new MapGraph(fullMap(10, 10));
    const path = g.path(0, 50);
    expect(path).not.toBeNull();
    // each step adjacent to previous
    let prev = 0;
    for (const c of path) {
      expect(g.neighbors(prev)).toContain(c);
      prev = c;
    }
    expect(path[path.length - 1]).toBe(50);
  });

  it('returns empty path when already at destination', () => {
    const g = new MapGraph(fullMap(10, 10));
    expect(g.path(42, 42)).toEqual([]);
  });

  it('routes around blocked cells', () => {
    const m = fullMap(10, 10);
    // block one neighbor of an interior start cell; routes still exist
    const g0 = new MapGraph(m);
    const start = 50; // interior (4 neighbors)
    expect(g0.neighbors(start).length).toBe(4);
    const mid = g0.neighbors(start)[0];
    m.cells[mid].walkable = 0;
    const g = new MapGraph(m);
    const path = g.path(start, 130);
    expect(path).not.toBeNull();
    expect(path).not.toContain(mid);
    for (const c of path) expect(g.isWalkable(c)).toBe(true);
  });

  it('returns null when destination is unreachable', () => {
    const m = fullMap(10, 10);
    const g0 = new MapGraph(m);
    const target = 60;
    for (const n of g0.neighbors(target)) m.cells[n].walkable = 0; // wall it off
    m.cells[target].walkable = 1;
    const g = new MapGraph(m);
    expect(g.path(0, target)).toBeNull();
  });
});

describe('MapGraph harvest helpers', () => {
  it('adjacentWalkable lists walkable neighbors of a (non-walkable) spot', () => {
    const m = fullMap(10, 10);
    const g0 = new MapGraph(m);
    const spot = 55;
    m.cells[spot].walkable = 0; // the resource node itself is an obstacle
    const g = new MapGraph(m);
    const stands = g.adjacentWalkable(spot);
    expect(stands.length).toBeGreaterThan(0);
    for (const c of stands) expect(g.isWalkable(c)).toBe(true);
  });

  it('nearestStand returns a reachable walkable neighbor of the spot', () => {
    const m = fullMap(10, 10);
    const spot = 55;
    m.cells[spot].walkable = 0;
    const g = new MapGraph(m);
    const stand = g.nearestStand(0, spot);
    expect(g.adjacentWalkable(spot)).toContain(stand);
    expect(g.path(0, stand)).not.toBeNull();
  });
});
