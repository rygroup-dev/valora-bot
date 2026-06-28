// Auction House (HDV) helpers: choose what to list and price it.
// Listing for $VALORA uses currency:'token' with unitPrice in RAW units
// (tokenAmount * 10^decimals). Listing earns tokens when another player buys;
// the buyer pays on-chain, so listing itself spends nothing for us.

export function tokenRaw(amount, decimals = 6) {
  return Math.max(1, Math.round(amount * 10 ** decimals));
}

// Choose an item + qty to list: the most-stacked sellable resource, listing
// roughly half (keep the rest for the broker / quests). Excludes tools, quest
// items, and any qty reserved for quests (`reserve` = {itemId: qtyToKeep}).
export function chooseHdvListing(inventory = [], { tools = [], minQty = 4, reserve = {} } = {}) {
  let best = null;
  for (const it of inventory) {
    const id = typeof it === 'string' ? it : it.id;
    const raw = (typeof it === 'object' ? it.qty : 1) || 1;
    if (!id) continue;
    const qty = raw - (reserve[id] || 0); // never list reserved quest items
    if (qty < minQty) continue;
    if (tools.some((t) => id.includes(t))) continue;
    if (id.startsWith('quest_')) continue;
    if (!best || qty > best.qty) best = { itemId: id, qty };
  }
  if (!best) return null;
  return { itemId: best.itemId, qty: Math.max(1, Math.floor(best.qty / 2)) };
}

// Detect the live market floor: the lowest whole-token competitor price.
// Returns the floor in WHOLE tokens, or null when there is no competition.
export function marketFloorToken(tokenListings = [], decimals = 6) {
  const unit = 10 ** decimals;
  const wholes = tokenListings
    .map((l) => Math.round(Number(l.unitPrice) / unit))
    .filter((n) => n >= 1);
  return wholes.length ? Math.min(...wholes) : null;
}

// Token unit price (raw) for a listing — market-floor aware so we never dump
// items cheap. The server requires a WHOLE-token price (integer >= 1, scaled by
// 10^decimals). Strategy:
//   • detect the live market floor (lowest competitor),
//   • undercut it by one whole token to win the sale,
//   • but never go below `floorToken` (our minimum acceptable value), and
//   • when there is NO competition, ask a fair price (`fairToken`, e.g. the
//     last-seen market floor) instead of bottoming out.
// `tokenListings` = [{unitPrice(raw)}].
export function hdvTokenUnitPrice({ tokenListings = [], floorToken = 1, fairToken, decimals = 6 }) {
  const unit = 10 ** decimals;
  const floor = Math.max(1, Math.round(floorToken));
  const market = marketFloorToken(tokenListings, decimals);
  if (market == null) {
    const fair = Math.max(floor, Math.round(fairToken ?? floor));
    return fair * unit;
  }
  const target = Math.max(floor, market - 1); // undercut, but hold our value floor
  return target * unit;
}
