// Isometric map graph + pathfinding for Valora maps.
// Replicates the game's cell→(x,y) layout exactly (Dofus formula `fs`), so the
// adjacency used here matches what the server accepts for `move {cell, facing}`.
//   total cells  : width*height + (width-1)*(height-1)
//   cell→(x,y)   : t=2w-1; i=⌊c/t⌋; s=c%t; r=s>=w;
//                  x=(r?s-w:s)*2 + (r?1:0);  y=i*2 + (r?1:0)   (D=O=2)
//   neighbors    : (x±1, y±1) — the 4 iso-diagonal cells.

const DIRS = [
  [1, -1], // facing 0 — up-right
  [1, 1], // facing 1 — down-right
  [-1, 1], // facing 2 — down-left
  [-1, -1], // facing 3 — up-left
];

export class MapGraph {
  constructor({ width, height, cells }) {
    this.width = width;
    this.height = height;
    this.cells = cells;
    this.size = cells.length;
    this._pos = new Array(this.size);
    this._index = new Map();
    const t = 2 * width - 1;
    for (let c = 0; c < this.size; c++) {
      const i = Math.floor(c / t);
      const s = c % t;
      const r = s >= width;
      const x = (r ? s - width : s) * 2 + (r ? 1 : 0);
      const y = i * 2 + (r ? 1 : 0);
      this._pos[c] = { x, y };
      this._index.set(`${x},${y}`, c);
    }
  }

  pos(cell) {
    return this._pos[cell];
  }
  cellAt(x, y) {
    return this._index.get(`${x},${y}`);
  }
  isWalkable(cell) {
    return !!this.cells[cell] && this.cells[cell].walkable === 1;
  }

  neighbors(cell) {
    const p = this._pos[cell];
    if (!p) return [];
    const out = [];
    for (const [dx, dy] of DIRS) {
      const n = this._index.get(`${p.x + dx},${p.y + dy}`);
      if (n !== undefined) out.push(n);
    }
    return out;
  }

  // Direction the hero should face when stepping from `from` to adjacent `to`.
  facingTo(from, to) {
    const a = this._pos[from];
    const b = this._pos[to];
    if (!a || !b) return 0;
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    const idx = DIRS.findIndex(([ddx, ddy]) => ddx === dx && ddy === dy);
    return idx < 0 ? 0 : idx;
  }

  // BFS shortest path of walkable cells from `from` to `to`.
  // Excludes `from`, includes `to`. [] if already there, null if unreachable.
  path(from, to, { maxExpansions = 60000 } = {}) {
    if (from === to) return [];
    const prev = new Map([[from, -1]]);
    const queue = [from];
    let head = 0;
    let expansions = 0;
    while (head < queue.length && expansions < maxExpansions) {
      const cur = queue[head++];
      expansions++;
      for (const n of this.neighbors(cur)) {
        if (prev.has(n)) continue;
        if (n !== to && !this.isWalkable(n)) continue; // walk only through walkable cells
        prev.set(n, cur);
        if (n === to) {
          const out = [];
          let c = to;
          while (c !== from) {
            out.push(c);
            c = prev.get(c);
          }
          return out.reverse();
        }
        queue.push(n);
      }
    }
    return null;
  }

  adjacentWalkable(cell) {
    return this.neighbors(cell).filter((n) => this.isWalkable(n));
  }

  // Walkable cells within `radius` rings of `cell` (for harvest ranges where the
  // resource sits on non-walkable terrain, e.g. fishing from the shore).
  // Returned nearest-first by ring distance.
  standsWithin(cell, radius = 1) {
    const p = this._pos[cell];
    if (!p) return [];
    const out = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx === 0 && dy === 0) continue;
        const c = this._index.get(`${p.x + dx},${p.y + dy}`);
        if (c !== undefined && this.isWalkable(c)) {
          out.push({ cell: c, d: Math.abs(dx) + Math.abs(dy) });
        }
      }
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.cell);
  }

  // Closest (by path length) walkable neighbor of `spot` reachable from `from`.
  nearestStand(from, spot) {
    const stands = this.adjacentWalkable(spot);
    let best = null;
    let bestLen = Infinity;
    for (const s of stands) {
      if (s === from) return s;
      const p = this.path(from, s);
      if (p && p.length < bestLen) {
        bestLen = p.length;
        best = s;
      }
    }
    return best;
  }
}
