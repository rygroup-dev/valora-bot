// Broker vendor logic: what to sell (buyback) and which tool to buy next.
// Selling uses econ_sell {cart:[{id,qty}]}; buying uses econ_buy {cart}.

const QUEST_PREFIXES = ['quest_'];

// Valora has no literal "potion" items in the live client. HP sustain comes
// from consumables (mostly bread / cooked food). Broker buy price is the item
// sell value multiplied by the vendor markup (4x in the live bundle).
export const HEAL_CONSUMABLES = [
  { id: 'dish_minnow', heal: 15, cost: 20 },
  { id: 'dish_gudgeon', heal: 18, cost: 28 },
  { id: 'dish_roach', heal: 25, cost: 44 },
  { id: 'dish_trout', heal: 38, cost: 64 },
  { id: 'dish_tench', heal: 59, cost: 124 },
  { id: 'dish_perch', heal: 54, cost: 100 },
  { id: 'dish_pike', heal: 69, cost: 128 },
  { id: 'dish_zander', heal: 85, cost: 172 },
  { id: 'dish_chub', heal: 80, cost: 180 },
  { id: 'dish_carp', heal: 98, cost: 232 },
  { id: 'dish_eel', heal: 111, cost: 272 },
  { id: 'dish_mackerel', heal: 116, cost: 188 },
  { id: 'dish_catfish', heal: 126, cost: 332 },
  { id: 'dish_seabass', heal: 137, cost: 376 },
  { id: 'dish_bream', heal: 152, cost: 432 },
  { id: 'dish_tuna', heal: 173, cost: 632 },
  { id: 'dish_ray', heal: 189, cost: 720 },
  { id: 'dish_swordfish', heal: 204, cost: 1008 },
  { id: 'dish_golden', heal: 150, cost: 560 },
  { id: 'bread_country', heal: 20, cost: 48 },
  { id: 'bread_barley', heal: 40, cost: 104 },
  { id: 'dish_boar_roast', heal: 55, cost: 96 },
  { id: 'dish_gudgeon_snack', heal: 45, cost: 120 },
  { id: 'bread_oat_flat', heal: 65, cost: 176 },
  { id: 'dish_trout_pie', heal: 75, cost: 152 },
  { id: 'dish_wolf_stew', heal: 90, cost: 144 },
  { id: 'bread_peasant', heal: 90, cost: 280 },
  { id: 'bread_rye', heal: 115, cost: 440 },
  { id: 'dish_carp_pie', heal: 130, cost: 360 },
  { id: 'bread_full', heal: 155, cost: 480 },
  { id: 'bread_miller', heal: 160, cost: 540 },
  { id: 'bread_corn_flat', heal: 195, cost: 1000 },
  { id: 'dish_swordfish_feast', heal: 260, cost: 1520 },
];

export function healConsumableQty(inventory = [], ids = new Set(HEAL_CONSUMABLES.map((h) => h.id))) {
  let qty = 0;
  for (const it of inventory) {
    const id = typeof it === 'string' ? it : it?.id || it?.item;
    if (!ids.has(id)) continue;
    qty += (typeof it === 'object' ? it.qty : 1) || 1;
  }
  return qty;
}

export function bestHealToUse(inventory = [], { missingHp = Infinity } = {}) {
  const have = new Set((inventory || []).map((it) => (typeof it === 'string' ? it : it?.id || it?.item)).filter(Boolean));
  const candidates = HEAL_CONSUMABLES
    .filter((h) => have.has(h.id))
    .sort((a, b) => {
      const aWaste = Math.max(0, a.heal - missingHp);
      const bWaste = Math.max(0, b.heal - missingHp);
      return aWaste - bWaste || a.cost - b.cost || a.heal - b.heal;
    });
  return candidates[0] || null;
}

export function healConsumableToBuy({ gold = 0, inventory = [], targetQty = 6, reserveGold = 120, blocked = new Set() } = {}) {
  if (healConsumableQty(inventory) >= targetQty) return null;
  const budget = gold - reserveGold;
  if (budget <= 0) return null;
  return HEAL_CONSUMABLES
    .filter((h) => h.buyable === true && h.cost <= budget && !blocked.has(h.id))
    .sort((a, b) => {
      const aValue = a.heal / Math.max(1, a.cost);
      const bValue = b.heal / Math.max(1, b.cost);
      return bValue - aValue || a.cost - b.cost;
    })[0] || null;
}

export function healConsumableReserve(targetQty = 6) {
  const keep = {};
  for (const h of HEAL_CONSUMABLES) keep[h.id] = targetQty;
  return keep;
}

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
