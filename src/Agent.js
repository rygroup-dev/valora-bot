// One wallet's full runtime: auth -> gate check -> character -> connect ->
// brain loop. Delegates all decisions to the tested pure modules and gates
// every write through Safety. Risky/on-chain actions require Telegram confirm.

import { RestClient } from './net/RestClient.js';
import { Auth } from './auth/Auth.js';
import { RoomClient } from './net/RoomClient.js';
import { Safety } from './safety/Safety.js';
import { SaveManager } from './state/SaveManager.js';
import { snapshot } from './game/world.js';
import { pickTarget } from './game/combat.js';
import { decideActivity } from './brain/Brain.js';
import { bestLoadout, planStatAllocation } from './game/progression.js';
import { orderShardCandidates } from './util/shards.js';
import { humanDelay, sleep, jitter } from './util/timing.js';
import { fetchTokenBalance } from './net/balance.js';
import { VALORA, tokenGuide } from './game/valora.js';
import { loadMapData } from './game/mapLoader.js';
import { nextQuestAction } from './game/quests.js';
import RECIPE_MAP from './game/recipes.json' with { type: 'json' };

// Resource -> gather kind (for quest gather steps targeting a specific resource).
const RESOURCE_KIND = (id) =>
  id.startsWith('fish_') ? 'fish'
  : id.startsWith('wood_') ? 'wood'
  : id.startsWith('ore_') ? 'mineral'
  : id.startsWith('cereal_') ? 'cereal'
  : null;
import { sellableCart, toolToBuy } from './game/vendor.js';
import { planTurn } from './game/combatAI.js';
import { chooseHdvListing, hdvTokenUnitPrice } from './game/hdv.js';

const BROKER_NPC = 'broker';
// Estimated broker tool prices (refined from econ_config if provided).
const TOOL_PRICES = { bucheron_axe: 60, mining_pick: 90, paysan_sickle: 60 };

const TOOL_ITEMS = ['bucheron_axe', 'fishing_rod', 'mining_pick', 'paysan_sickle'];
// Which resource each tool can harvest.
const TOOL_KIND = { bucheron_axe: 'wood', fishing_rod: 'fish', mining_pick: 'mineral', paysan_sickle: 'cereal' };
const KIND_TOOL = { wood: 'bucheron_axe', fish: 'fishing_rod', mineral: 'mining_pick', cereal: 'paysan_sickle' };
const COMBAT_WEAPON = 'iron_sword';
// Armor pieces that occupy their own slots (equip once, permanent).
const ARMOR_ITEMS = ['oak_shield', 'travel_cape', 'enchanted_hat'];

const STAT_BUILD = { vitalite: 0.4, force: 0.4, adresse: 0.2 };
const GEAR_WEIGHTS = { dmg: 2, pv: 1, force: 1.5, crit: 3, adresse: 1, pa: 5, pm: 4 };

export class Agent {
  constructor({ wallet, config, store, bot, log }) {
    this.label = wallet.label;
    this.wallet = wallet;
    this.config = config;
    this.bot = bot;
    this.log = (m) => log(`[${this.label}] ${m}`);

    this.rest = new RestClient({ base: config.base });
    this.auth = new Auth({ rest: this.rest, wallet, store, log: this.log });
    this.safety = new Safety({ mode: config.mode, dryRun: config.dryRun });
    this.save = new SaveManager({ rest: this.rest, version: 0 });

    this.character = null;
    this.room = null;
    this.shardId = null;
    this.econConfig = null;
    this.feeConfig = null;
    this.running = false;
    this.lastActivity = 'idle';
    this.events = [];
    this._lastLevel = null;
    this._lastGold = null;
    this._seq = 0;
    this._harvesting = new Set(); // cells we've started harvesting
    this._busyHarvesting = false; // true while one harvest is in progress
    this._harvestAt = 0;
    this.mapData = null; // MapData for the current map (graph + spots)
    this.heroCell = null; // our current cell
    this.walking = false;
    this.gatherKinds = ['wood', 'fish', 'mineral'];
    this._disabledKinds = new Set(); // gather types we lack the tool for
    this._blockedResources = new Set(); // resources too high-level for us
    this._blockedCells = new Set(); // spot cells that keep denying
    this._lastSpot = null;
    // Combat is turn-based tactical; the fight AI is not built yet, so the bot
    // does not auto-engage (avoids getting stuck / dying). Gather-first for now.
    this.combatEnabled = true;
  }

  // Record an event in the ring buffer; optionally push a Telegram notification.
  _event(text, { notify = false } = {}) {
    const ts = new Date().toISOString().slice(11, 19);
    this.events.push(`${ts} ${text}`);
    if (this.events.length > 40) this.events.shift();
    this.log(text);
    if (notify) this.bot?.broadcast(`*${this.label}* · ${text}`);
  }

  logText() {
    const recent = this.events.slice(-15);
    return `📜 *${this.label}* — recent activity\n${recent.length ? recent.map((e) => `\`${e}\``).join('\n') : '_(nothing yet)_'}`;
  }

  // ---------- lifecycle ----------
  async start() {
    const a = await this.auth.ensureAuth();
    if (!a.ok) {
      this.log(`auth failed: ${a.error}`);
      return false;
    }
    const access = await this.rest.accessCheck();
    if (!access.ok) {
      this.log(`gate failed: ${access.error || 'insufficient hold'} (minHold ${access.minHold})`);
      return false;
    }

    const resumed = await this.rest.resumeCharacter();
    if (resumed.character) {
      this.character = resumed.character;
      this.save.setVersion(resumed.character.version || 0);
    } else {
      this.log('no character on this wallet — create one manually first');
      return false;
    }

    // Shard auto-routing: try priority (gated) shards first; the server gates
    // by on-chain token hold at matchmake, so a 30k holder lands on `prime`,
    // a smaller holder falls back to a normal shard automatically.
    const shards = await this.rest.shards();
    this._shards = shards;
    const candidates = orderShardCandidates(shards, { preferPriority: true });
    if (!candidates.length) {
      this.log('no joinable shard');
      return false;
    }

    this.room = new RoomClient({
      base: this.config.base,
      token: this.rest.token,
      mapId: this.character.save?.pos?.mapId || 'city',
      shardCandidates: candidates,
      log: this.log,
      onLeave: (code) => this._event(`🔌 disconnected (code ${code}) — reconnecting…`, { notify: true }),
      onRejoin: (shard) => this._event(`🔁 reconnected to ${shard}`, { notify: true }),
    });
    this._wireRoom();
    await this.room.connect();
    this.shardId = this.room.shardId;

    // Load the current map (graph + gathering spots) for navigation.
    this.mapId = this.character.save?.pos?.mapId || 'city';
    this.heroCell = this.character.save?.pos?.cell ?? null;
    try {
      this.mapData = await loadMapData(this.config.base, this.mapId);
      const spots = this.mapData.spots(this.gatherKinds).length;
      this.log(`map ${this.mapId} loaded — ${spots} gather spots, ${this.mapData.portals().length} portals`);
    } catch (e) {
      this.log(`map load failed: ${e?.message}`);
    }

    const shardInfo = shards.find((s) => s.id === this.shardId);
    const tier = shardInfo && shardInfo.minHold > 0 ? `👑 PRIORITY (hold ≥${shardInfo.minHold.toLocaleString()})` : 'standard';
    this.running = true;
    this.bot?.broadcast(`▶️ ${this.label} online · shard *${shardInfo?.name || this.shardId}* (${tier}) · mode ${this.safety.mode}`);
    this._loop();
    return true;
  }

  _wireRoom() {
    const noop = () => {};
    this.room
      .on('econ_config', (m) => (this.econConfig = m))
      .on('econ_result', (m) => {
        this._applyView(m?.view);
        if (m?.op === 'craft' && m.ok === false) this._event(`craft err: ${m.error}`);
        // Track items we can't equip yet (level-gated) so we stop retrying.
        if (m?.op === 'equip' && m?.error === 'level_req') {
          if (!this._levelBlocked) this._levelBlocked = new Set();
          // the last item we attempted to equip
          if (this._lastEquipId) {
            this._levelBlocked.add(this._lastEquipId);
            if (this._lastEquipId === COMBAT_WEAPON) this._swordBlocked = true;
          }
        }
      })
      .on('hdv_config', (m) => (this.hdvConfig = m))
      .on('hdv_listings', (m) => this._onHdvListings(m))
      .on('hdv_result', (m) => {
        if (m?.op === 'list') {
          this._hdvBusy = false;
          if (m.ok) this._event(`🏷 listed on HDV for $VALORA`, { notify: true });
          else this._event(`hdv list: ${m.error}`);
        }
      })
      .on('hdv_sold', (m) => this._event(`💸 HDV sale: ${m?.itemId || ''} for ${m?.currency === 'token' ? '$VALORA' : 'gold'}`, { notify: true }))
      .on('fee_config', (m) => (this.feeConfig = m))
      .on('stat_reset_config', (m) => (this.statResetConfig = m))
      .on('creature_config', noop)
      .on('time_config', noop)
      .on('spectate_config', noop)
      .on('quest_sync', (m) => {
        this.questSync = m;
        if (m?.book) this.questBook = m.book;
        this._applyView(m?.view);
      })
      .on('quest_result', (m) => {
        if (m?.book) this.questBook = m.book;
        this._applyView(m?.view);
        if (m?.ok) this._event(`📜 quest progress${m.questId ? ` (${m.questId})` : ''}`);
      })
      .on('friend_list', noop)
      .on('chat', () => {})
      .on('chat_denied', () => {})
      .on('harvest_started', (m) => {
        // Server accepted the harvest; finish after the node's duration to collect.
        const cell = m?.cell;
        const sec = Number(m?.sec) || Number(m?.duration) || 3;
        const ms = sec * 1000 + 350; // finish just after the cast completes
        this._event(`🌿 harvesting cell ${cell} (${sec}s)…`);
        setTimeout(() => {
          if (this.safety.canWrite('harvest_finish').ok && this._harvesting.has(cell)) {
            this.room.send('harvest_finish', { cell });
          }
        }, ms);
      })
      .on('harvest_result', (m) => {
        this.safety.recordSuccess('harvest');
        if (m?.cell != null) this._harvesting.delete(m.cell);
        const drops = Array.isArray(m?.drops)
          ? m.drops.map((d) => `${d.qty}× ${d.id}`).join(', ')
          : '';
        this._gathered = (this._gathered || 0) + 1;
        this._busyHarvesting = false;
        if (m?.cell != null) { this._harvesting.delete(m.cell); this._blockedCells.delete(m.cell); }
        this._event(`🌿 harvested${m?.xp ? ` +${m.xp}xp` : ''}${drops ? ` (${drops})` : ''} [#${this._gathered}]`);
      })
      .on('harvest_denied', (m) => {
        this._busyHarvesting = false;
        if (m?.cell != null) this._harvesting.delete(m.cell);
        this.safety.recordDenied('harvest');
        const reason = m?.reason || JSON.stringify(m);
        const spot = this._lastSpot;
        if (reason === 'tool') {
          // Genuinely no tool for this whole resource type → skip it (notify once).
          const type = spot?.type;
          if (type && !this._disabledKinds.has(type)) {
            this._disabledKinds.add(type);
            const tool = { wood: 'an axe', fish: 'a fishing rod', mineral: 'a pickaxe', cereal: 'a sickle' }[type] || 'a tool';
            this._event(`⛔ can't gather ${type}: need ${tool} — skipping it.`, { notify: true });
          }
        } else if (reason === 'level' || reason === 'skill') {
          // This particular resource is too high-level — skip it, try others (no spam).
          if (spot?.resource) this._blockedResources.add(spot.resource);
          if (spot?.cell != null) this._blockedCells.add(spot.cell);
        } else {
          // transient (range/not_busy/etc) — block this cell briefly, no notify
          if (spot?.cell != null) this._blockedCells.add(spot.cell);
        }
      })
      .on('fightResult', (m) => {
        this.inFight = false;
        this.fightState = null;
        this._placed = false;
        const won = m?.win ?? m?.won ?? m?.victory ?? m?.outcome === 'win';
        if (won) this._fightsWon = (this._fightsWon || 0) + 1;
        this._applyView(m?.view);
        this._event(won ? `⚔️ fight won${m?.xp ? ` +${m.xp}xp` : ''} [#${this._fightsWon || 0}]` : '💀 fight lost', { notify: true });
      })
      .on('fight_denied', () => this.safety.recordDenied('engageFight'))
      .on('fight', (m) => this._onFight(m))
      .on('relocate', (m) => {
        if (typeof m?.cell === 'number') this.heroCell = m.cell;
      })
      .on('admin_notice', (m) => this._event(`📢 ${typeof m === 'string' ? m : JSON.stringify(m)}`, { notify: true }));
  }

  // ---------- brain loop ----------
  async _loop() {
    while (this.running) {
      try {
        await this._tick();
      } catch (e) {
        this.log(`tick error: ${e?.message}`);
      }
      await humanDelay(this.config.pacing.actionMin, this.config.pacing.actionMax);
    }
  }

  _ctx() {
    const snap = this.room ? snapshot(this.room.state, this.room.room?.sessionId) : { self: null, mobs: [], nodes: [] };
    const p = this.character?.save?.player || {};
    const self = snap.self || {};
    if (self.cell != null) this.heroCell = self.cell; // keep our position fresh
    const canGather = !!this.mapData && this.mapData.spots(this._effectiveKinds()).length > 0;
    return {
      snap,
      player: {
        hp: self.hp ?? p.hp ?? p.maxHp ?? 50,
        maxHp: p.maxHp ?? 50,
        level: p.level ?? self.level ?? 1,
        statPoints: this.character?.save?.player?.charac?.points ?? 0,
        podsUsed: (p.inventory || []).length,
        podsMax: p.podsMax ?? 100,
      },
      hasGearUpgrade:
        bestLoadout({
          inventory: p.inventory || [],
          equipped: p.equipped || {},
          weights: GEAR_WEIGHTS,
          level: p.level ?? 1,
        }).length > 0,
      quests: { actionable: (p.quests?.active || []).length > 0 },
      arena: { available: false },
      profit: {
        // Only value combat when a winnable, full-HP fight is actually available.
        combatValue:
          this.combatEnabled &&
          (self.hp ?? p.hp ?? 50) / (p.maxHp || 50) >= 0.8 &&
          pickTarget(snap.mobs || [], { level: p.level ?? 1, cell: this.heroCell }, { maxLevelDelta: this.combatDelta ?? 2, prefer: 'weakest' })
            ? 55
            : 0,
        gatherValue: canGather ? 30 : 0,
        bestCraftProfit: 0,
      },
    };
  }

  async _tick() {
    if (!this.room?.connected) {
      await sleep(1000);
      return;
    }
    const ctx = this._ctx();

    // Progress notifications: level ups and notable gold gains.
    const lvl = ctx.player.level;
    const gold = this.character?.save?.player?.gold ?? 0;
    if (this._lastLevel != null && lvl > this._lastLevel) {
      this._event(`🎉 Level up! now level ${lvl}`, { notify: true });
    }
    if (this._lastGold != null && gold - this._lastGold >= 1000) {
      this._event(`🪙 +${(gold - this._lastGold).toLocaleString()} gold (total ${gold.toLocaleString()})`, { notify: true });
    }
    this._lastLevel = lvl;
    this._lastGold = gold;

    // Starter quests come first — they grant the first gathering tool, which
    // unlocks the whole economy. Run until the chain is done & we have a tool.
    const quest = this._questAction();
    if (quest) {
      const label = `quest:${quest.type}`;
      if (label !== this.lastActivity) this._event(`🧭 ${quest.questId} ${quest.type} ${quest.npc || quest.target || quest.recipe || ''}`.trim());
      this.lastActivity = label;
      if (this.safety.mode !== 'active') return;
      return this._doQuest(quest);
    }

    // Equip anything we just bought (tool or gear) so it takes effect.
    if (this._pendingEquip && this._inventory().some((it) => (it.id || it) === this._pendingEquip)) {
      const id = this._pendingEquip;
      this._pendingEquip = null;
      this._disabledKinds.clear(); // a new tool may unlock a previously-blocked kind
      this.lastActivity = 'equip';
      if (this.safety.mode !== 'active') return;
      this._event(`🔧 equipping ${id}`);
      return this._guardedSend('econ_equip', { id });
    }

    // Equip any owned armor that isn't worn yet (makes the character stronger).
    if (this.safety.mode === 'active' && this._equipArmorOnce()) {
      this.lastActivity = 'equip_armor';
      return;
    }

    // Economy: sell when inventory fills up, then buy missing tools / gear upgrades.
    const econ = this._econAction();
    if (econ) {
      if (econ !== this.lastActivity) this._event(`💱 ${econ}`);
      this.lastActivity = econ;
      if (this.safety.mode !== 'active') return;
      if (econ === 'hdv_list') return this._doHdvList();
      if (econ === 'sell') return this._doSell();
      if (econ === 'buy_tool') return this._doBuyTool();
      if (econ === 'buy_gear') return this._doBuyGear();
    }

    const decision = decideActivity(ctx);
    if (decision.type !== this.lastActivity) this._event(`🎯 ${decision.type} (${decision.reason})`);
    this.lastActivity = decision.type;

    // In observe mode, just watch.
    if (this.safety.mode !== 'active') return;

    switch (decision.type) {
      case 'combat':
        return this._doCombat(ctx);
      case 'gather':
        return this._doGather();
      case 'rest':
        return this._guardedSend('rest_start', {});
      case 'bank':
        return this._doBank();
      case 'allocate_stats':
        return this._doAllocate(ctx);
      case 'upgrade_gear':
        return this._doUpgrade(ctx);
      default:
        return;
    }
  }

  // ---------- executors (safety-gated) ----------
  _guardedSend(action, payload, { confirmed = false } = {}) {
    if (action === 'econ_equip' && payload?.id) this._lastEquipId = payload.id;
    const ok = this.safety.canWrite(action, { confirmed });
    if (!ok.ok) {
      this.log(`blocked ${action}: ${ok.reason}`);
      return false;
    }
    if (ok.dryRun) {
      this.log(`[dry-run] would ${action} ${JSON.stringify(payload).slice(0, 80)}`);
      return true;
    }
    return this.room.send(action, payload);
  }

  async _doCombat(ctx) {
    if (!this.combatEnabled || this.inFight || this.walking) return;
    // Only fight at (near) full HP — never walk into a fight already hurt.
    if (ctx.player.maxHp && ctx.player.hp / ctx.player.maxHp < 0.8) return;
    const mobs = ctx.snap.mobs || [];
    // Only engage winnable fights: mobs at most `combatDelta` above our level.
    const target = pickTarget(mobs, { ...ctx.player, cell: this.heroCell }, {
      maxLevelDelta: this.combatDelta ?? 2,
      prefer: 'weakest',
    });
    if (!target || target.gid == null) return;

    // Navigate next to the mob before engaging (engage is range-limited).
    if (this.heroCell != null && this.mapData) {
      const d = this.mapData.graph.path(this.heroCell, target.cell);
      if (d && d.length > 1) {
        const stand = this.mapData.graph.standsWithin(target.cell, 2)[0];
        if (stand && stand !== this.heroCell) {
          const path = this.mapData.graph.path(this.heroCell, stand);
          if (path && path.length) {
            const arrived = await this._walkTo(path);
            if (!arrived) return;
          }
        }
      }
    }
    // Prefer a real weapon if we can equip it, but never block the fight on it
    // (broker gear is level-gated; a gathering tool still does base damage).
    if (this._weaponEquipped() !== COMBAT_WEAPON && this._invHas(COMBAT_WEAPON) && !this._swordBlocked) {
      this._guardedSend('econ_equip', { id: COMBAT_WEAPON });
    }
    this._event(`⚔️ engaging ${target.mobId} (lvl ${target.level})`);
    this.inFight = true;
    this._placed = false;
    this._engagedMid = target.id;
    this._guardedSend('engageFight', { gid: target.gid }); // engage uses gid, not mid
  }

  // Event-driven combat: react to each `fight` state update from the server.
  _onFight(state) {
    if (!state) return;
    this.inFight = true;
    this.fightState = state;
    if (this.safety.mode !== 'active') return;
    try {
      this._playFight(state);
    } catch (e) {
      this.log(`fight error: ${e?.message}`);
      this.room.send('fightAct', { kind: 'endTurn' });
    }
  }

  _mySessionId() {
    return this.room?.room?.sessionId;
  }

  // Map the live fight state to the combat planner shape and act.
  _playFight(raw) {
    const state = raw.snapshot || raw; // server wraps the state in `snapshot`
    const phase = state.phase;
    const fighters = state.fighters || [];
    const me = fighters.find((f) => f.kind === 'player' && f.team === 0)
      || fighters.find((f) => f.name === this.character?.save?.player?.name)
      || fighters.find((f) => f.team === 0);
    if (!me) return;

    // Placement phase: take a start cell then ready up (once).
    if (phase === 'placement' || phase === 'place') {
      if (this._placed) return;
      this._placed = true;
      const cells = state.startCells?.[0] || state.startCells?.team0 || [];
      const cell = (Array.isArray(cells) ? cells[0] : null) ?? me.cell ?? this.heroCell;
      if (cell != null) this.room.send('fightAct', { kind: 'placement', cell });
      setTimeout(() => this.inFight && this.room.send('fightAct', { kind: 'ready' }), jitter(400, 800));
      return;
    }

    // Combat phase: only act on our turn.
    if (state.winner != null) return;
    const order = state.order || [];
    const ptr = state.turnPtr ?? 0;
    const activeId = order[ptr];
    if (activeId !== me.id) return; // not our turn

    const myCell = me.cell ?? this.heroCell;
    const ap = me.curAp ?? me.ap ?? 6;
    const mp = me.curMp ?? me.mp ?? 3;
    const hp = me.hp ?? 50;
    const maxHp = me.maxHp ?? hp;
    const enemies = fighters
      .filter((f) => f.team !== me.team && (f.alive ?? true) && (f.hp ?? 1) > 0)
      .map((f) => ({ id: f.id, cell: f.cell, hp: f.hp ?? 1 }));

    const grid = this.mapData?.graph;
    const dist = (a, b) =>
      grid ? (grid.path(a, b)?.length ?? Math.abs(a - b)) : Math.abs(a - b);
    const stepToward = (from, target, mpLeft) => {
      if (!grid) return from;
      const path = grid.path(from, target);
      if (!path || !path.length) return from;
      return path[Math.min(path.length - 1, mpLeft) - 1] ?? from;
    };

    if (this._actingTurn === state.turn) return; // already acting this turn
    this._actingTurn = state.turn;
    const acts = planTurn({ self: { cell: myCell, ap, mp, hp, maxHp }, enemies, dist, stepToward });
    const summary = acts.map((a) => (a.spellId ? a.spellId : a.kind)).join('>');
    this._event(`🗡 turn ${state.turn} (hp ${hp}/${maxHp}, ${enemies.length} foe): ${summary}`);
    this._sendActs(acts, 0);
  }

  // Send fight acts sequentially with a small human delay between them.
  _sendActs(acts, i) {
    if (!this.inFight || i >= acts.length) return;
    this.room.send('fightAct', acts[i]);
    setTimeout(() => this._sendActs(acts, i + 1), jitter(500, 1000));
  }

  // Resource kinds we actually own a tool for (equipped or in inventory).
  _toolKinds() {
    const kinds = new Set();
    const scan = (it) => {
      const id = String(typeof it === 'string' ? it : it?.id || it?.item || '');
      for (const [tool, kind] of Object.entries(TOOL_KIND)) if (id.includes(tool)) kinds.add(kind);
    };
    this._inventory().forEach(scan);
    Object.values(this._equipped()).forEach(scan);
    return kinds;
  }

  _effectiveKinds() {
    const owned = this._toolKinds();
    // Only gather kinds we both want AND have a tool for, minus tool-denied ones.
    return this.gatherKinds.filter((k) => owned.has(k) && !this._disabledKinds.has(k));
  }

  async _doGather(wantResource = null) {
    // Wait for the current harvest to resolve before starting another (with a
    // safety timeout so a lost result never wedges the bot).
    if (this._busyHarvesting) {
      if (Date.now() - this._harvestAt > 12000) this._busyHarvesting = false;
      else return;
    }
    if (this.walking || !this.mapData || this.heroCell == null) {
      return;
    }
    // For a quest gather step, target that specific resource's kind.
    const kinds = wantResource ? [RESOURCE_KIND(wantResource)].filter(Boolean) : this._effectiveKinds();
    if (!kinds.length) return; // no tools for any resource yet
    // Busy = cells we already started + cooldown nodes + cells that kept denying.
    const busy = new Set([...this._harvesting, ...this._blockedCells]);
    for (const n of snapshot(this.room.state).nodes) busy.add(n.cell);

    const target = this.mapData.pickGatherTarget(this.heroCell, {
      busy,
      kinds,
      blockedResources: this._blockedResources,
      wantResource,
    });
    if (!target) return;
    this._lastSpot = target.spot;

    // Equip the matching tool (weapon slot is shared with combat/other tools).
    if (!this._ensureWeapon(KIND_TOOL[target.spot.type])) return;

    // Walk to a cell adjacent to the resource, then harvest it.
    if (target.path.length) {
      const arrived = await this._walkTo(target.path);
      if (!arrived) return;
    }
    this._harvesting.add(target.spot.cell);
    this._busyHarvesting = true;
    this._harvestAt = Date.now();
    this._event(`⛏ ${target.spot.type} ${target.spot.resource} @${target.spot.cell}`);
    this._guardedSend('harvest', { cell: target.spot.cell });
  }

  // Walk a path by reporting each cell (client-authoritative movement), with a
  // human-like cadence. Returns true on arrival, false if interrupted/blocked.
  async _walkTo(path) {
    this.walking = true;
    try {
      let from = this.heroCell;
      for (const cell of path) {
        const w = this.safety.canWrite('move');
        if (!w.ok) return false;
        const facing = this.mapData.graph.facingTo(from, cell);
        if (w.dryRun) this.log(`[dry-run] move ${from}→${cell} (facing ${facing})`);
        else if (!this.room.send('move', { cell, facing })) return false;
        this.heroCell = cell;
        from = cell;
        await sleep(jitter(150, 260)); // walk speed
        if (!this.running || !this.room?.connected) return false;
      }
      return true;
    } finally {
      this.walking = false;
    }
  }

  // ---------- starter quests (tool acquisition) ----------
  // Keep live inventory/equipped/gold from any server view payload.
  _applyView(view) {
    if (!view) return;
    if (view.inventory) this._serverInventory = view.inventory;
    if (view.equipped) this._serverEquipped = view.equipped;
    if (view.pods) this._pods = view.pods; // {used,max}
    if (typeof view.gold === 'number' && this.character?.save?.player) {
      this.character.save.player.gold = view.gold;
    }
  }

  _gold() {
    return this.character?.save?.player?.gold ?? 0;
  }
  _podsRatio() {
    const p = this._pods;
    if (p && p.max) return p.used / p.max;
    const max = this.character?.save?.player?.podsMax || 100;
    return this._inventory().length / max;
  }
  _inventory() {
    return this._serverInventory || this.character?.save?.player?.inventory || [];
  }
  _equipped() {
    return this._serverEquipped || this.character?.save?.player?.equipped || {};
  }
  _hasTool() {
    const has = (it) => {
      const id = typeof it === 'string' ? it : it?.id || it?.item || '';
      return TOOL_ITEMS.some((t) => String(id).includes(t));
    };
    return this._inventory().some(has) || Object.values(this._equipped()).some(has);
  }
  _toolInInventory() {
    for (const it of this._inventory()) {
      const id = typeof it === 'string' ? it : it?.id || it?.item;
      if (id && TOOL_ITEMS.some((t) => String(id).includes(t))) return id;
    }
    return null;
  }
  _invHas(id) {
    return this._inventory().some((it) => (typeof it === 'string' ? it : it?.id || it?.item) === id);
  }
  _equippedId(slot) {
    const v = this._equipped()[slot];
    return v == null ? null : typeof v === 'string' ? v : v.id || v.item;
  }
  _weaponEquipped() {
    return this._equippedId('weapon');
  }
  // Ensure `id` is the equipped weapon. Returns true if already; else equips and
  // returns false (act resumes next tick once the server confirms).
  _ensureWeapon(id) {
    if (!id) return true;
    if (this._weaponEquipped() === id) return true;
    if (!this._invHas(id)) return true; // not owned — proceed with whatever we have
    this._guardedSend('econ_equip', { id });
    return false;
  }
  // Equip one not-yet-equipped armor piece (distinct slots). Returns true if it acted.
  _equipArmorOnce() {
    if (!this._armorTried) this._armorTried = new Map();
    const equippedIds = new Set(Object.values(this._equipped()).map((v) => (typeof v === 'string' ? v : v?.id)));
    const blocked = this._levelBlocked || new Set();
    for (const a of ARMOR_ITEMS) {
      if (blocked.has(a)) continue; // level-gated, can't equip yet
      if (this._invHas(a) && !equippedIds.has(a) && (this._armorTried.get(a) || 0) < 2) {
        this._armorTried.set(a, (this._armorTried.get(a) || 0) + 1);
        this._event(`🛡 equipping ${a}`);
        this._guardedSend('econ_equip', { id: a });
        return true;
      }
    }
    return false;
  }
  _questState() {
    const q = this.questBook || this.character?.save?.player?.quests || {};
    const active = (q.active || []).map((a) => ({ id: a.id, step: a.step || 0 }));
    const completed = q.completed || [];
    if (!this._blockedQuests) this._blockedQuests = new Set();
    return { active, completed, hasTool: this._hasTool(), blocked: this._blockedQuests };
  }
  _questAction() {
    if (!this.mapData) return null;
    return nextQuestAction(this._questState());
  }

  // Block a quest we can't progress (e.g. inspect/reach target unknown) so the
  // bot moves on to other completable quests instead of getting stuck.
  _blockQuest(questId, why) {
    if (!this._blockedQuests) this._blockedQuests = new Set();
    if (!this._blockedQuests.has(questId)) {
      this._blockedQuests.add(questId);
      this._event(`⏭ skipping ${questId} (${why})`);
    }
  }
  _stepKey(sa) {
    return `${sa.questId}:${sa.step}:${sa.type}`;
  }
  _bumpStepTries(sa, max = 4) {
    if (!this._stepTries) this._stepTries = new Map();
    const k = this._stepKey(sa);
    const n = (this._stepTries.get(k) || 0) + 1;
    this._stepTries.set(k, n);
    return n <= max;
  }

  async _doQuest(sa) {
    if (this.walking) return;
    // Steps that need a specific resource: gather it (targeted).
    if (sa.type === 'gather') {
      const want = sa.target && sa.target !== '*' ? sa.target : null;
      // If this map has no spot for the resource, skip the quest (e.g. cereal
      // farming / ore that lives on another map — supported in a later phase).
      if (want) {
        const kind = RESOURCE_KIND(want);
        const hasSpot = this.mapData.spots(kind ? [kind] : undefined).some((s) => s.resource === want);
        if (!hasSpot && !this._bumpStepTries(sa, 2)) {
          return this._blockQuest(sa.questId, `no ${want} on this map`);
        }
      }
      return this._doGather(want);
    }
    if (sa.type === 'craft') {
      if (!this._bumpStepTries(sa, 6)) return this._blockQuest(sa.questId, 'craft failed');
      // The quest target is the OUTPUT item; econ_craft needs the recipe id.
      const recipeId = RECIPE_MAP[sa.recipe] || sa.recipe;
      this._event(`🔨 crafting ${sa.count}× ${sa.recipe} (${recipeId})`);
      return this._guardedSend('econ_craft', { recipeId, times: sa.count || 1 });
    }
    // Navigate to the NPC/target for accept/turnin/inspect/reach.
    const npc = sa.npc || (sa.type === 'turnin' ? sa.npc : null);
    if (npc != null) {
      const ok = await this._gotoNpc(npc);
      if (!ok && !this._bumpStepTries(sa)) return this._blockQuest(sa.questId, 'NPC unreachable');
    }
    if (sa.type === 'accept') return this._guardedSend('econ_quest_accept', { questId: sa.questId });
    if (sa.type === 'turnin') return this._guardedSend('econ_quest_turnin', { questId: sa.questId, step: sa.step });
    if (sa.type === 'equip') return this._equipTool();
    // inspect / reach targets aren't in the map data yet — try a turn-in, then
    // skip the quest if it won't advance so other quests can proceed.
    if (sa.type === 'inspect' || sa.type === 'reach') {
      if (!this._bumpStepTries(sa, 3)) return this._blockQuest(sa.questId, `${sa.type} unsupported`);
      return this._guardedSend('econ_quest_turnin', { questId: sa.questId, step: sa.step });
    }
  }

  _equipTool() {
    const id = this._toolInInventory();
    if (!id) return;
    this._event(`🔧 equipping ${id}`);
    this._guardedSend('econ_equip', { id });
  }

  async _doBank() {
    const maxFee = (this.feeConfig?.bankFeePerType ?? 1) * 50; // generous cap
    this._guardedSend('bank_open', { reqId: ++this._seq, maxFee });
  }

  // ---------- economy: sell / buy tools / buy gear ----------
  _ownedKinds() {
    return this._toolKinds();
  }

  // Decide a buy/sell action (string) or null.
  _econAction() {
    if (!this.mapData) return null;
    const sellables = sellableCart(this._inventory(), { tools: TOOL_ITEMS });
    const podsFull = this._podsRatio() >= 0.85;
    const manySellables = sellables.reduce((s, c) => s + c.qty, 0) >= 60;

    // Periodically list a stack on the Auction House for $VALORA (token income).
    const hdvReady = Date.now() - (this._lastHdvAt || 0) > 120000;
    if (!this._hdvBusy && hdvReady && this.hdvConfig?.tokenItems && chooseHdvListing(this._inventory(), { tools: TOOL_ITEMS })) {
      return 'hdv_list';
    }

    if (sellables.length && (podsFull || manySellables)) return 'sell';

    if (toolToBuy({ gold: this._gold(), ownedKinds: this._ownedKinds(), prices: TOOL_PRICES })) {
      return 'buy_tool';
    }
    if (this._gearToBuy()) return 'buy_gear';
    return null;
  }

  async _gotoNpc(npcId) {
    if (this.heroCell == null) return false;
    const cell = this.mapData.npcCell(npcId);
    if (cell == null) return false;
    const stand = this.mapData.graph.isWalkable(cell)
      ? cell
      : this.mapData.graph.nearestStand(this.heroCell, cell);
    if (stand == null) return false;
    if (stand === this.heroCell) return true;
    const path = this.mapData.graph.path(this.heroCell, stand);
    if (!path) return false;
    return this._walkTo(path);
  }

  // List a stack on the Auction House priced in $VALORA. Two-step: browse the
  // item for current token prices, then list (handled in _onHdvListings).
  async _doHdvList() {
    if (this._hdvBusy) return;
    const pick = chooseHdvListing(this._inventory(), { tools: TOOL_ITEMS });
    if (!pick) return;
    this._hdvBusy = true;
    this._lastHdvAt = Date.now();
    this._hdvIntent = pick;
    this._event(`🏷 pricing ${pick.qty}× ${pick.itemId} for HDV ($VALORA)…`);
    this._guardedSend('hdv_browse', { itemId: pick.itemId, reqId: ++this._seq });
    // Safety: if no listings come back, clear the busy flag.
    setTimeout(() => {
      this._hdvBusy = false;
    }, 8000);
  }

  _onHdvListings(m) {
    const intent = this._hdvIntent;
    if (!intent || m?.scope !== 'browse') return;
    const listings = m.listings || [];
    if (listings.length && listings[0].itemId !== intent.itemId) return;
    const tokenListings = listings.filter((l) => l.currency === 'token' && !l.mine);
    const decimals = this.hdvConfig?.decimals ?? 6;
    const unitPrice = hdvTokenUnitPrice({ tokenListings, floorToken: 0.01, decimals });
    this._hdvIntent = null;
    this._event(`🏷 listing ${intent.qty}× ${intent.itemId} @ ${(unitPrice / 10 ** decimals).toFixed(4)} $VALORA`, { notify: true });
    this._guardedSend('hdv_list', {
      itemId: intent.itemId,
      qty: intent.qty,
      unitPrice,
      currency: 'token',
      reqId: ++this._seq,
    });
  }

  async _doSell() {
    if (this.walking) return;
    const cart = sellableCart(this._inventory(), { tools: TOOL_ITEMS });
    if (!cart.length) return;
    if (!(await this._gotoNpc(BROKER_NPC))) return;
    const total = cart.reduce((s, c) => s + c.qty, 0);
    this._event(`💰 selling ${total} items (${cart.length} types) to broker`, { notify: true });
    this._guardedSend('econ_sell', { cart });
  }

  async _doBuyTool() {
    if (this.walking) return;
    const tool = toolToBuy({ gold: this._gold(), ownedKinds: this._ownedKinds(), prices: TOOL_PRICES });
    if (!tool) return;
    if (!(await this._gotoNpc(BROKER_NPC))) return;
    this._event(`🛒 buying ${tool.id} (${tool.kind}) for ~${tool.cost}g`, { notify: true });
    this._guardedSend('econ_buy', { cart: [{ id: tool.id, qty: 1 }] });
    // it will be equipped next tick via the gear/tool flow
    this._pendingEquip = tool.id;
  }

  async _doBuyGear() {
    if (this.walking) return;
    const gear = this._gearToBuy();
    if (!gear) return;
    if (!(await this._gotoNpc(BROKER_NPC))) return;
    this._event(`🛡 buying gear ${gear.id} for ~${gear.cost}g`, { notify: true });
    this._guardedSend('econ_buy', { cart: [{ id: gear.id, qty: 1 }] });
    this._boughtGear.add(gear.id);
    this._pendingEquip = gear.id;
  }

  // Basic broker armor/gear to make the character stronger (bought once each).
  _gearToBuy() {
    if (!this._boughtGear) this._boughtGear = new Set();
    // Most broker gear is level-gated; don't waste gold until the character has
    // leveled up via combat enough to equip it.
    if ((this.character?.save?.player?.level || 1) < 3) return null;
    const gold = this._gold();
    const have = (id) =>
      this._inventory().some((it) => (it.id || it) === id) ||
      Object.values(this._equipped()).some((v) => (v?.id || v) === id) ||
      this._boughtGear.has(id);
    const GEAR = [
      { id: 'oak_shield', cost: 120 },
      { id: 'iron_sword', cost: 150 },
      { id: 'travel_cape', cost: 100 },
      { id: 'enchanted_hat', cost: 100 },
    ];
    // Keep a gold buffer so we can still buy tools.
    for (const g of GEAR) if (!have(g.id) && gold >= g.cost + 100) return g;
    return null;
  }

  async _doAllocate(ctx) {
    const charac = this.character?.save?.player?.charac;
    if (!charac?.points) return;
    const plan = planStatAllocation(charac, STAT_BUILD);
    // stat allocation persists via character/save
    charac.placed = charac.placed || {};
    for (const [stat, n] of Object.entries(plan)) {
      charac.placed[stat] = (charac.placed[stat] || 0) + n;
      charac.points -= n;
    }
    await this.save.save(this.character.save);
    this.log(`allocated stats: ${JSON.stringify(plan)}`);
  }

  async _doUpgrade(ctx) {
    const p = this.character.save.player;
    const plan = bestLoadout({
      inventory: p.inventory || [],
      equipped: p.equipped || {},
      weights: GEAR_WEIGHTS,
      level: p.level,
    });
    for (const step of plan) this._guardedSend('econ_equip', { id: step.id });
  }

  // ---------- control ----------
  setMode(mode) {
    this.safety.setMode(mode);
    this._event(mode === 'active' ? '⚡ farming ON (active mode)' : '👁 watch-only mode', { notify: true });
  }
  kill(reason) {
    this.safety.kill(reason);
    this.running = false;
    this.room?.leave();
    this._event(`🛑 stopped (${reason})`, { notify: true });
  }
  resume() {
    this.safety.resume();
    this._event('▶️ resuming…', { notify: true });
    if (!this.running) this.start();
  }

  toggleDryRun() {
    this.safety.dryRun = !this.safety.dryRun;
    return this.safety.dryRun;
  }

  statusData() {
    const p = this.character?.save?.player || {};
    const shardInfo = (this._shards || []).find((s) => s.id === this.shardId);
    return {
      label: this.label,
      running: this.running,
      mode: this.safety.mode,
      dryRun: this.safety.dryRun,
      shardId: shardInfo ? `${shardInfo.name}${shardInfo.minHold > 0 ? ' 👑' : ''}` : this.shardId,
      connected: !!this.room?.connected,
      activity: this.lastActivity,
      level: p.level,
      gold: p.gold,
      hp: p.hp,
      maxHp: p.maxHp,
      pubkey: this.wallet.publicKey,
    };
  }

  async tokenBalance() {
    return fetchTokenBalance({ owner: this.wallet.publicKey, mint: VALORA.mint });
  }

  async balanceText() {
    const p = this.character?.save?.player || {};
    const shardInfo = (this._shards || []).find((s) => s.id === this.shardId);
    const tier = shardInfo?.minHold > 0 ? `👑 PRIORITY (hold ≥${shardInfo.minHold.toLocaleString()})` : 'standard';
    const vbal = await this.tokenBalance();
    const vstr = vbal == null ? '(rpc unavailable)' : `${vbal.toLocaleString()} $VALORA`;
    return [
      `💰 *${this.label}*`,
      `🪙 gold: ${(p.gold ?? 0).toLocaleString()}`,
      `◎ wallet: ${vstr}`,
      `🗺 server: ${shardInfo?.name || this.shardId} · ${tier}`,
      `👛 \`${this.wallet.publicKey}\``,
    ].join('\n');
  }

  async tokenText() {
    const bal = await this.tokenBalance();
    return tokenGuide(bal);
  }

  async bridgeText() {
    const enabled = !!(this.hdvConfig?.goldBridge ?? this.econConfig?.goldBridge);
    const usd = this.hdvConfig?.tokenUsd;
    const gold = this._gold();
    const bal = await this.tokenBalance();
    const lines = [
      '🌉 *Gold ↔ $VALORA bridge*',
      `Status: ${enabled ? '🟢 ENABLED' : '🔴 disabled (server-gated)'}`,
      `🪙 gold: ${gold.toLocaleString()} · ◎ ${bal == null ? '?' : bal.toLocaleString()} $VALORA`,
      usd ? `💵 $VALORA ≈ $${usd}` : '',
      '',
    ];
    if (enabled) {
      lines.push(
        '🟢 Token economy is ON. The bot earns $VALORA by *listing your items on',
        'the Auction House priced in $VALORA* — buyers pay your wallet directly.',
        'It lists a stack every couple of minutes (see /log).',
        '⚠️ Buying with token (spending $VALORA) always asks for your approval.',
      );
    } else {
      lines.push(
        'The direct gold→token bridge is currently *disabled* by the game.',
        'Meanwhile you still earn $VALORA by *selling items on the Auction',
        'House priced in $VALORA* — buyers pay your wallet directly.',
      );
    }
    return lines.join('\n');
  }
}
