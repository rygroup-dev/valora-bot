// Shard selection. `pickBusiestShard`: sort by `playing` desc, tie-break by
// original index asc, then by id string asc; return the winner's id.

export function pickBusiestShard(shards) {
  if (!shards || !shards.length) return undefined;
  return shards
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const d = (Number(b.s.playing) || 0) - (Number(a.s.playing) || 0);
      if (d !== 0) return d;
      if (a.i !== b.i) return a.i - b.i;
      return String(a.s.id) < String(b.s.id) ? -1 : 1;
    })[0].s.id;
}

// Ordered shard candidates for try-and-fallback joining. The server enforces
// the token-hold gate at matchmake, so we list priority (gated) shards FIRST —
// the bot tries `prime` and only falls back to normal shards if rejected.
// This auto-detects holding without needing the token mint client-side.
export function orderShardCandidates(shards, { preferPriority = true } = {}) {
  if (!shards || !shards.length) return [];
  const joinable = shards.filter((s) => (Number(s.playing) || 0) < (Number(s.capacity) || Infinity));
  const priority = joinable
    .filter((s) => (Number(s.minHold) || 0) > 0)
    .sort((a, b) => (b.minHold - a.minHold) || (Number(b.playing) || 0) - (Number(a.playing) || 0));
  const normal = joinable
    .filter((s) => (Number(s.minHold) || 0) === 0)
    .sort((a, b) => (Number(b.playing) || 0) - (Number(a.playing) || 0));
  // Priority wallets (main, 30k hold) try the gated PRIORITY shard first, then
  // standard. Sub wallets (100 hold) get STANDARD shards only — they can't meet
  // the priority hold gate, so never waste a join attempt on it.
  const ordered = preferPriority ? [...priority, ...normal] : normal;
  return ordered.map((s) => s.id);
}

// Gate-aware picker: filter out shards the wallet can't enter (minHold) or
// that are full, then choose. `prefer`: 'busiest' (default) or 'emptiest'.
export function pickBestShard(shards, { holding = 0, prefer = 'busiest' } = {}) {
  if (!shards || !shards.length) return undefined;
  const joinable = shards.filter((s) => {
    const minHold = Number(s.minHold) || 0;
    const cap = Number(s.capacity) || Infinity;
    const playing = Number(s.playing) || 0;
    return holding >= minHold && playing < cap;
  });
  if (!joinable.length) return undefined;
  if (prefer === 'emptiest') {
    return joinable
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (Number(a.s.playing) || 0) - (Number(b.s.playing) || 0) || a.i - b.i)[0].s.id;
  }
  return pickBusiestShard(joinable);
}
