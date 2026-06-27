// Colyseus room wrapper for the "map" room (rustdays-server).
// Handles authenticated matchmake, connect, reconnect with jittered backoff,
// an onMessage event bus, and a typed send() for the room protocol.
//
// NOTE: this is the live-network boundary. The pure logic it relies on
// (backoff, shard pick, decisions) is unit-tested separately.

import { Client } from 'colyseus.js';
import { backoff, sleep } from '../util/timing.js';

export class RoomClient {
  constructor({ base, token, mapId = 'city', shardId, shardCandidates, log = () => {}, onLeave, onRejoin }) {
    this.onLeaveCb = onLeave;
    this.onRejoinCb = onRejoin;
    // colyseus.js derives the matchmake HTTP endpoint from the ws endpoint.
    this.wsEndpoint = base.replace(/^http/, 'ws');
    this.token = token;
    this.mapId = mapId;
    // Ordered list to try (priority shard first). Falls back to single shardId.
    this.shardCandidates = shardCandidates && shardCandidates.length ? shardCandidates : [shardId];
    this.shardId = this.shardCandidates[0];
    this.log = log;
    this.room = null;
    this._handlers = new Map();
    this._attempt = 0;
    this._intentionalLeave = false;
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

    // (re)attach all registered handlers
    for (const [type, fn] of this._handlers) room.onMessage(type, fn);

    room.onLeave((code) => {
      this.log(`[room] left (code ${code})`);
      this.room = null;
      if (!this._intentionalLeave) {
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
