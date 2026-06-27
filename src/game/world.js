// Reads the decoded Colyseus room state into plain snapshots for the brain.
// Room state schema:
//   players: MapSchema<{id,name,cell,facing,mountId,level,gear,inFight,
//                       drunkUntil,gathering,resting,rank,colors}>
//   mobs:    MapSchema<{mid,gid,mobId,level,cell,owner}>
//   nodes:   MapSchema<{cell,status}>
//   beacons: MapSchema<...>

function toArray(mapSchema) {
  const out = [];
  if (mapSchema && typeof mapSchema.forEach === 'function') {
    mapSchema.forEach((v, k) => out.push({ _key: k, ...plain(v) }));
  }
  return out;
}

function plain(v) {
  if (v && typeof v.toJSON === 'function') return v.toJSON();
  return v;
}

export function snapshot(state, selfSessionId) {
  if (!state) return { self: null, players: [], mobs: [], nodes: [] };

  const self = state.players?.get ? plain(state.players.get(selfSessionId)) ?? null : null;

  const players = toArray(state.players).filter((p) => p._key !== selfSessionId);

  const mobs = toArray(state.mobs).map((m) => ({
    id: m.mid,
    gid: m.gid,
    mobId: m.mobId,
    level: m.level,
    cell: m.cell,
    owner: m.owner,
    engaged: !!m.owner,
  }));

  const nodes = toArray(state.nodes).map((n) => ({ cell: n.cell, status: n.status }));

  return { self, players, mobs, nodes };
}

// Nodes ready to harvest. `readyStatus` is the status value meaning "available".
export function freeNodes(state, readyStatus = 0) {
  return snapshot(state, null).nodes.filter((n) => n.status === readyStatus);
}
