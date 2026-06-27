// Auction House (HDV) helpers: choose what to list and price it.
// Listing for $VALORA uses currency:'token' with unitPrice in RAW units
// (tokenAmount * 10^decimals). Listing earns tokens when another player buys;
// the buyer pays on-chain, so listing itself spends nothing for us.

export function tokenRaw(amount, decimals = 6) {
  return Math.max(1, Math.round(amount * 10 ** decimals));
}

// Choose an item + qty to list: the most-stacked sellable resource, listing
// roughly half (keep the rest for the broker / quests). Excludes tools & quest.
export function chooseHdvListing(inventory = [], { tools = [], minQty = 4 } = {}) {
  let best = null;
  for (const it of inventory) {
    const id = typeof it === 'string' ? it : it.id;
    const qty = (typeof it === 'object' ? it.qty : 1) || 1;
    if (!id || qty < minQty) continue;
    if (tools.some((t) => id.includes(t))) continue;
    if (id.startsWith('quest_')) continue;
    if (!best || qty > best.qty) best = { itemId: id, qty };
  }
  if (!best) return null;
  return { itemId: best.itemId, qty: Math.max(1, Math.floor(best.qty / 2)) };
}

// Token unit price (raw) for a listing. The server requires a WHOLE-token price
// (human price must be an integer >= 1, then scaled by 10^decimals). So we work
// in whole tokens: undercut the lowest existing token listing by 1 whole token,
// never below 1. `tokenListings` = [{unitPrice(raw)}].
export function hdvTokenUnitPrice({ tokenListings = [], floorToken = 1, decimals = 6 }) {
  const unit = 10 ** decimals;
  const wholes = tokenListings
    .map((l) => Math.round(Number(l.unitPrice) / unit))
    .filter((n) => n >= 1);
  const floor = Math.max(1, Math.round(floorToken));
  if (!wholes.length) return floor * unit;
  const lowest = Math.min(...wholes);
  const target = Math.max(1, lowest - 1); // undercut by one whole token
  return Math.max(floor, target) * unit;
}
