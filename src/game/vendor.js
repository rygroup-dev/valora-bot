// Broker vendor logic: what to sell (buyback) and which tool to buy next.
// Selling uses econ_sell {cart:[{id,qty}]}; buying uses econ_buy {cart}.

const QUEST_PREFIXES = ['quest_'];

// Cart of resources to sell — everything that isn't a tool or a quest item,
// minus any per-item quantity we want to keep.
export function sellableCart(inventory = [], { tools = [], keep = {} } = {}) {
  const cart = [];
  for (const it of inventory) {
    const id = typeof it === 'string' ? it : it.id;
    const qty = (typeof it === 'object' ? it.qty : 1) || 1;
    if (!id) continue;
    if (tools.some((t) => id.includes(t))) continue; // never sell tools
    if (QUEST_PREFIXES.some((p) => id.startsWith(p))) continue; // keep quest items
    const sell = qty - (keep[id] || 0);
    if (sell > 0) cart.push({ id, qty: sell });
  }
  return cart;
}

// All gather tools and the resource kind they unlock.
const TOOLS = [
  { id: 'fishing_rod', kind: 'fish' },
  { id: 'bucheron_axe', kind: 'wood' },
  { id: 'mining_pick', kind: 'mineral' },
  { id: 'paysan_sickle', kind: 'cereal' },
];

// Cheapest missing, affordable gather tool to buy next (null if none).
export function toolToBuy({ gold = 0, ownedKinds = new Set(), prices = {} } = {}) {
  const candidates = TOOLS.filter((t) => !ownedKinds.has(t.kind))
    .map((t) => ({ ...t, cost: prices[t.id] }))
    .filter((t) => typeof t.cost === 'number' && t.cost <= gold)
    .sort((a, b) => a.cost - b.cost);
  return candidates[0] || null;
}
