import { MapGraph } from './MapGraph.js';

// Wraps a parsed map JSON: builds the pathfinding graph and exposes gathering
// spots (wood/fish/mineral) and portals, plus target selection for gathering.

export class MapData {
  constructor(json) {
    this.json = json;
    this.id = json.id;
    this.spawn = json.spawn;
    this.graph = new MapGraph(json);
  }

  spots(kinds = ['wood', 'fish', 'mineral']) {
    const out = [];
    if (kinds.includes('wood')) {
      for (const w of this.json.woodSpots || []) out.push({ cell: w.cell, type: 'wood', resource: w.wood });
    }
    if (kinds.includes('fish')) {
      for (const f of this.json.fishSpots || []) out.push({ cell: f.cell, type: 'fish', resource: f.fish });
    }
    if (kinds.includes('mineral')) {
      for (const m of this.json.mineralNodes || []) out.push({ cell: m.cell, type: 'mineral', resource: m.mineral || m.ore });
    }
    return out;
  }

  portals() {
    return this.json.portals || [];
  }

  // NPC id -> cell map (for quest navigation).
  npcCell(id) {
    const n = (this.json.npcs || []).find((x) => x.id === id);
    return n ? n.cell : null;
  }
  npcs() {
    return this.json.npcs || [];
  }

  // Harvest range per resource (in coordinate rings). Fishing is done from the
  // shore, so its range is larger than melee gathering.
  static RANGE = { wood: 2, mineral: 2, fish: 6, cereal: 2 };

  // Nearest gatherable spot (by path length to a reachable stand) not in `busy`.
  // The stand is the closest walkable cell within the resource's harvest range.
  pickGatherTarget(from, { busy = new Set(), kinds, blockedResources = new Set() } = {}) {
    let best = null;
    let bestLen = Infinity;
    for (const spot of this.spots(kinds)) {
      if (busy.has(spot.cell)) continue;
      if (blockedResources.has(spot.resource)) continue;
      const radius = MapData.RANGE[spot.type] || 2;
      const stands = this.graph.standsWithin(spot.cell, radius);
      for (const stand of stands) {
        const path = from === stand ? [] : this.graph.path(from, stand);
        if (path == null) continue;
        if (path.length < bestLen) {
          bestLen = path.length;
          best = { spot, stand, path };
        }
        break; // stands are nearest-first; first reachable is best for this spot
      }
    }
    return best;
  }
}
