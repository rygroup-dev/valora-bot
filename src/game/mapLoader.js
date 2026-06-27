import fs from 'node:fs';
import path from 'node:path';
import { MapData } from './MapData.js';

// Fetches a map JSON from the server and caches it on disk (maps rarely change).
// Returns a MapData instance.
const memCache = new Map();

export async function loadMapData(base, mapId, { fetchImpl, cacheDir = 'data/maps' } = {}) {
  if (memCache.has(mapId)) return memCache.get(mapId);
  const f = fetchImpl || globalThis.fetch;
  const file = path.join(cacheDir, `${mapId}.json`);

  let json = null;
  try {
    if (fs.existsSync(file)) json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    json = null;
  }
  if (!json) {
    const res = await f(`${base.replace(/\/$/, '')}/assets/maps/${mapId}.json`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`map fetch failed: ${mapId} (${res.status})`);
    json = await res.json();
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(json));
    } catch {
      /* best-effort cache */
    }
  }
  const data = new MapData(json);
  memCache.set(mapId, data);
  return data;
}
