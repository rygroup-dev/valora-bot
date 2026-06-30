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

// Ordered shard candidates for joining.
// mode:
//   priority -> gated shards only (main/primary wallet must stay on prime)
//   standard -> normal shards only (subs)
//   auto     -> gated first, then normal fallback (legacy probe mode)
export function orderShardCandidates(shards, { preferPriority = true, mode, holding } = {}) {
  if (!shards || !shards.length) return [];
  const hasHolding = Number.isFinite(Number(holding));
  const walletHold = hasHolding ? Number(holding) : null;
  const joinable = shards.filter((s) => (Number(s.playing) || 0) < (Number(s.capacity) || Infinity));
  const priority = joinable
    .filter((s) => (Number(s.minHold) || 0) > 0)
    .filter((s) => !hasHolding || walletHold >= (Number(s.minHold) || 0))
    .sort((a, b) => (b.minHold - a.minHold) || (Number(b.playing) || 0) - (Number(a.playing) || 0));
  const normal = joinable
    .filter((s) => (Number(s.minHold) || 0) === 0)
    .sort((a, b) => (Number(b.playing) || 0) - (Number(a.playing) || 0));
  const routeMode = mode || (preferPriority ? 'auto' : 'standard');
  const ordered =
    routeMode === 'priority' ? priority
    : routeMode === 'standard' ? normal
    : [...priority, ...normal];
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
