// Colyseus room wrapper for the "map" room (rustdays-server).
// Handles authenticated matchmake, connect, reconnect with jittered backoff,
// an onMessage event bus, and a typed send() for the room protocol.
//
// NOTE: this is the live-network boundary. The pure logic it relies on
// (backoff, shard pick, decisions) is unit-tested separately.

import { Client } from 'colyseus.js';
import { backoff, sleep } from '../util/timing.js';

export class RoomClient {
  constructor({ base, token, mapId = 'city', homeMapId = 'city', shardId, shardCandidates, log = () => {}, onLeave, onRejoin, onAny }) {
    this.onLeaveCb = onLeave;
    this.onRejoinCb = onRejoin;
    this.onAnyCb = onAny; // (type, message) for every server message (telemetry)
    // colyseus.js derives the matchmake HTTP endpoint from the ws endpoint.
    this.wsEndpoint = base.replace(/^http/, 'ws');
    this.token = token;
    this.mapId = mapId;
    // The always-joinable map to fall back to if a gated room rejects us.
    this.homeMapId = homeMapId;
    // Ordered list to try (priority shard first). Falls back to single shardId.
    this.shardCandidates = shardCandidates && shardCandidates.length ? shardCandidates : [shardId];
    this.shardId = this.shardCandidates[0];
    this.log = log;
    this.room = null;
    this._handlers = new Map();
    this._attempt = 0;
    this._intentionalLeave = false;
    this.lastCloseCode = null;
    this._gateWaiters = new Map();
  }

  get connected() {
    return !!this.room && this.room.connection?.isOpen !== false;
  }

  on(type, fn) {
    this._handlers.set(type, fn);
    if (this.room) this.room.onMessage(type, fn);
    return this;
  }

  async connect() {
    this._intentionalLeave = false;
    const client = new Client(this.wsEndpoint);
    // Bearer auth for the seat-reservation HTTP request.
    if (client.http) client.http.authToken = this.token;

    // Try priority shard first, fall back through candidates if the server
    // rejects (e.g. insufficient token hold for a gated shard).
    let room = null;
    let lastErr = null;
    for (const shardId of this.shardCandidates) {
      try {
        room = await client.joinOrCreate('map', {
          mapId: this.mapId,
          shardId,
          token: this.token,
          spectate: false,
          queue: false,
        });
        this.shardId = shardId;
        break;
      } catch (e) {
        lastErr = e;
        this.log(`[room] shard ${shardId} rejected (${e?.message || e?.code || 'err'}), trying next`);
      }
    }
    if (!room) throw lastErr || new Error('no joinable shard');
    this.room = room;
    this._attempt = 0;
    this.lastCloseCode = null;

    // (re)attach all registered handlers
    for (const [type, fn] of this._handlers) room.onMessage(type, fn);
    // Zone-gate replies (gate_check → gate_result), keyed by map.
    room.onMessage('gate_result', (s) => {
      const w = this._gateWaiters.get(s?.map);
      if (w) {
        this._gateWaiters.delete(s.map);
        w(s);
      }
    });
    // Wildcard: observe every message (catches unknown transition/portal msgs).
    if (this.onAnyCb) room.onMessage('*', (type, message) => this.onAnyCb(type, message));

    room.onLeave((code) => {
      this.lastCloseCode = code;
      this.log(`[room] left (code ${code})`);
      this.room = null;
      if (!this._intentionalLeave) {
        // App-level close codes (>=4000) are rejections (e.g. anti-teleport
        // 4001 from a gated room) — retrying the SAME room just loops. Fall back
        // to the always-joinable home map so the bot self-heals instead.
        if (code >= 4000 && this.mapId !== this.homeMapId) {
          this.log(`[room] app-close ${code} on '${this.mapId}' → falling back to '${this.homeMapId}'`);
          this.mapId = this.homeMapId;
        }
        this.onLeaveCb?.(code);
        this._scheduleReconnect();
      }
    });
    room.onError((code, message) => this.log(`[room] error ${code}: ${message}`));

    this.log(`[room] joined map shard=${this.shardId} session=${room.sessionId}`);
    return room;
  }

  async _scheduleReconnect() {
    const delay = backoff(this._attempt++, { base: 2000, cap: 60000, jitterRatio: 0.3 });
    this.log(`[room] reconnecting in ${Math.round(delay)}ms (attempt ${this._attempt})`);
    await sleep(delay);
    if (this._intentionalLeave) return;
    try {
      await this.connect();
      this.onRejoinCb?.(this.shardId);
    } catch (e) {
      this.log(`[room] reconnect failed: ${e?.message}`);
      this._scheduleReconnect();
    }
  }

  // Ask the server whether we may enter `map` (zone gate: level / token hold).
  // Mirrors the live client's requestGate(): send gate_check, await gate_result,
  // resolve with a fallback (passable) result on timeout.
  requestGate(map) {
    const fallback = { map, ok: true, minLevel: 0, minHold: 0, failLevel: false, failHold: false, tokenActive: false, fallback: true };
    if (!this.connected) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      this._gateWaiters.set(map, resolve);
      this.room.send('gate_check', { map });
      setTimeout(() => {
        if (this._gateWaiters.get(map) === resolve) {
          this._gateWaiters.delete(map);
          resolve(fallback);
        }
      }, 4000);
    });
  }

  // Switch to another map by re-joining the room with a new mapId (each map is
  // its own Colyseus room). Mirrors the client's open(): AWAIT the old room's
  // leave so the server tears down our session before we re-join — otherwise the
  // duplicate session is kicked (close 4000/4001). Handlers re-attach in connect().
  async switchMap(mapId) {
    this.mapId = mapId;
    this._intentionalLeave = true;
    if (this.room) {
      const old = this.room;
      this.room = null;
      try {
        await old.leave(); // wait for the server to fully close the old session
      } catch {
        /* ignore */
      }
    }
    this._intentionalLeave = false;
    await this.connect();
    return this.shardId;
  }

  send(type, payload) {
    if (!this.connected) return false;
    try {
      this.room.send(type, payload);
      return true;
    } catch {
      return false;
    }
  }

  get state() {
    return this.room?.state ?? null;
  }

  leave() {
    this._intentionalLeave = true;
    try {
      this.room?.leave();
    } catch {
      /* ignore */
    }
    this.room = null;
  }
}
