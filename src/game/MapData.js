import { MapGraph } from './MapGraph.js';

// Wraps a parsed map JSON: builds the pathfinding graph and exposes gathering
// spots (wood/fish/mineral/cereal) and portals, plus target selection for gathering.

const CEREAL_GFX = {
  cereal_wheat: 1000727,
  cereal_barley: 1001172,
  cereal_oats: 1001258,
  cereal_corn: 1001844,
  cereal_rye: 1001368,
  cereal_hemp: 1000035,
};

const GFX_CEREAL = new Map(Object.entries(CEREAL_GFX).map(([resource, gfx]) => [gfx, resource]));

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
    if (kinds.includes('cereal')) {
      const seen = new Set();
      for (const c of this.json.cerealSpots || []) {
        if (c.cell == null) continue;
        seen.add(c.cell);
        out.push({ cell: c.cell, type: 'cereal', resource: c.cereal || c.resource });
      }
      for (let cell = 0; cell < (this.json.cells || []).length; cell++) {
        if (seen.has(cell)) continue;
        const c = this.json.cells[cell] || {};
        const resource = GFX_CEREAL.get(c.layer1) || GFX_CEREAL.get(c.layer2);
        if (resource) out.push({ cell, type: 'cereal', resource });
      }
    }
    return out;
  }

  portals() {
    return this.json.portals || [];
  }

  // The portal on this map that leads to `mapId` (or null). Each portal is
  // { cell, toMap, toCell, label }.
  portalTo(mapId) {
    return this.portals().find((p) => p.toMap === mapId) || null;
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
  pickGatherTarget(from, { busy = new Set(), kinds, blockedResources = new Set(), wantResource = null } = {}) {
    let best = null;
    let bestLen = Infinity;
    for (const spot of this.spots(kinds)) {
      if (busy.has(spot.cell)) continue;
      if (wantResource && spot.resource !== wantResource) continue;
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
