// One wallet's full runtime: auth -> gate check -> character -> connect ->
// brain loop. Delegates all decisions to the tested pure modules and gates
// every write through Safety. Risky/on-chain actions require Telegram confirm.

import { RestClient } from './net/RestClient.js';
import { Auth } from './auth/Auth.js';
import { RoomClient } from './net/RoomClient.js';
import { Safety } from './safety/Safety.js';
import { SaveManager } from './state/SaveManager.js';
import { snapshot, freeNodes } from './game/world.js';
import { pickTarget } from './game/combat.js';
import { decideActivity } from './brain/Brain.js';
import { bestLoadout, planStatAllocation } from './game/progression.js';
import { orderShardCandidates } from './util/shards.js';
import { humanDelay, sleep } from './util/timing.js';

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
      .on('hdv_config', (m) => (this.hdvConfig = m))
      .on('fee_config', (m) => (this.feeConfig = m))
      .on('stat_reset_config', (m) => (this.statResetConfig = m))
      .on('creature_config', noop)
      .on('time_config', noop)
      .on('spectate_config', noop)
      .on('quest_sync', (m) => (this.questSync = m))
      .on('friend_list', noop)
      .on('hdv_listings', (m) => (this.lastListings = m))
      .on('harvest_result', (m) => {
        this.safety.recordSuccess('harvest');
        if (m?.xp || m?.drops) this._event(`🌿 harvested${m.xp ? ` +${m.xp}xp` : ''}`);
      })
      .on('harvest_denied', () => this.safety.recordDenied('harvest'))
      .on('fightResult', (m) => {
        const won = m?.win ?? m?.won ?? m?.victory;
        this._event(won ? `⚔️ fight won${m?.xp ? ` +${m.xp}xp` : ''}` : '💀 fight lost', { notify: true });
      })
      .on('fight_denied', () => this.safety.recordDenied('engageFight'))
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
        combatValue: snap.mobs?.length ? 50 : 0,
        gatherValue: freeNodes(this.room?.state).length ? 30 : 0,
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

    const decision = decideActivity(ctx);
    if (decision.type !== this.lastActivity) this._event(`🎯 ${decision.type} (${decision.reason})`);
    this.lastActivity = decision.type;

    // In observe mode, just watch.
    if (this.safety.mode !== 'active') return;

    switch (decision.type) {
      case 'combat':
        return this._doCombat(ctx);
      case 'gather':
        return this._doGather(ctx);
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
    const target = pickTarget(ctx.snap.mobs, ctx.player, { maxLevelDelta: 3 });
    if (!target) return;
    this._guardedSend('engageFight', { mid: target.id });
  }

  async _doGather(ctx) {
    const nodes = freeNodes(this.room.state);
    if (!nodes.length) return;
    this._guardedSend('harvest', { cell: nodes[0].cell });
  }

  async _doBank() {
    this._guardedSend('bank_open', {});
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

  async balanceText() {
    const p = this.character?.save?.player || {};
    const shardInfo = (this._shards || []).find((s) => s.id === this.shardId);
    const tier = shardInfo?.minHold > 0 ? `👑 PRIORITY (hold ≥${shardInfo.minHold.toLocaleString()})` : 'standard';
    return [
      `💰 *${this.label}*`,
      `🪙 gold: ${(p.gold ?? 0).toLocaleString()}`,
      `🗺 shard: ${shardInfo?.name || this.shardId} · ${tier}`,
      `👛 \`${this.wallet.publicKey}\``,
    ].join('\n');
  }
}
