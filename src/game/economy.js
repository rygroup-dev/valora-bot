// Economy brain: craft profitability + HDV (auction house) pricing.
// Prices are a { itemId: unitPrice } map (gold), built from HDV listings.

export function craftProfit(recipe, prices) {
  const price = (id) => Number(prices[id]) || 0;
  const cost =
    (recipe.inputs || []).reduce((s, i) => s + price(i.item) * (i.qty || 1), 0) +
    (Number(recipe.fee) || 0);
  const revenue = price(recipe.output.item) * (recipe.output.qty || 1);
  const profit = revenue - cost;
  const roi = cost > 0 ? profit / cost : profit > 0 ? Infinity : 0;
  return { id: recipe.id, cost, revenue, profit, roi };
}

function canAfford(recipe, inv) {
  return (recipe.inputs || []).every((i) => (Number(inv[i.item]) || 0) >= (i.qty || 1));
}

// Most profitable craftable recipe given current prices + inventory.
export function bestCraft(recipes, prices, inv = {}) {
  let best = null;
  for (const recipe of recipes) {
    if (!canAfford(recipe, inv)) continue;
    const r = craftProfit(recipe, prices);
    if (r.profit <= 0) continue;
    if (!best || r.profit > best.profit) best = r;
  }
  return best;
}

// Undercut a competitor price by marginPct, never below floor.
export function undercut(price, { marginPct = 5, floor = 0 } = {}) {
  const lowered = Math.floor(price * (1 - marginPct / 100));
  return Math.max(floor, lowered);
}

// Final list price: undercut the lowest listing but never sell below cost*minMargin.
export function hdvListPrice({ lowestListing, cost, minMargin = 1.2, marginPct = 5 }) {
  const floor = Math.ceil(cost * minMargin);
  if (lowestListing == null) return floor;
  return Math.max(floor, undercut(lowestListing, { marginPct, floor }));
}
