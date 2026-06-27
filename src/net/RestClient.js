// REST client for the Valora game server.
// All methods are soft-failing (never throw) so the bot loop stays alive.

export class RestClient {
  constructor({ base = 'https://valora.gg/play', fetchImpl, userAgent } = {}) {
    this.base = base.replace(/\/$/, '');
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.userAgent =
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
    this.token = null;
    this.onUnauthorized = null; // hook set by Auth for 401 re-auth
  }

  setToken(t) {
    this.token = t;
  }

  async req(method, path, body, authed = false) {
    try {
      const headers = {
        'content-type': 'application/json',
        accept: '*/*',
        'user-agent': this.userAgent,
        origin: 'https://valora.gg',
        referer: 'https://valora.gg/play',
      };
      if (authed && this.token) headers.authorization = `Bearer ${this.token}`;
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* non-json */
      }
      if (authed && res.status === 401 && this.onUnauthorized) {
        await this.onUnauthorized();
      }
      return { status: res.status, ok: res.ok, json };
    } catch {
      return { status: 0, ok: false, json: null };
    }
  }

  // ---- public ----
  async health() {
    const r = await this.req('GET', '/health');
    return r.ok && !!r.json?.ok;
  }
  async accessConfig() {
    const r = await this.req('GET', '/config/access');
    return r.ok && r.json ? r.json : { tokenActive: false, minHoldToPlay: 0 };
  }
  async timeConfig() {
    const r = await this.req('GET', '/config/time');
    return r.ok && r.json ? r.json : null;
  }
  async shards() {
    const r = await this.req('GET', '/shards');
    return r.ok && Array.isArray(r.json?.shards) ? r.json.shards : [];
  }
  async requestNonce(pubkey) {
    return (await this.req('POST', '/auth/nonce', { pubkey })).json ?? { error: 'network' };
  }
  async verify(pubkey, signature) {
    const r = await this.req('POST', '/auth/verify', { pubkey, signature });
    if (r.ok && r.json?.token) {
      this.token = r.json.token;
      return { ok: true, token: r.json.token, hasCharacter: !!r.json.hasCharacter };
    }
    return { ok: false, error: r.json?.error ?? 'verify_failed' };
  }

  // ---- authed ----
  async accessCheck() {
    const r = await this.req('GET', '/access/check', undefined, true);
    return r.ok && r.json ? r.json : { tokenActive: false, minHold: 0, ok: false, error: r.json?.error };
  }
  async getCharacter() {
    const r = await this.req('GET', '/character', undefined, true);
    return r.ok ? (r.json?.character ?? null) : null;
  }
  async resumeCharacter() {
    const r = await this.req('GET', '/character', undefined, true);
    return r.ok && r.json
      ? { character: r.json.character ?? null, authedNoChar: r.json.character == null }
      : { character: null, authedNoChar: false };
  }
  async createCharacter(name, importSave, colors) {
    const r = await this.req('POST', '/character', { name, importSave, colors }, true);
    return r.ok && r.json?.character
      ? { ok: true, character: r.json.character }
      : { ok: false, error: r.json?.error ?? 'create_failed', detail: r.json?.detail };
  }
  async saveCharacter(save, expectedVersion) {
    const r = await this.req('PUT', '/character/save', { save, expectedVersion }, true);
    return r.ok && r.json
      ? { ok: true, version: r.json.version }
      : { ok: false, error: r.json?.error ?? 'save_failed', currentVersion: r.json?.currentVersion };
  }
  async combatStatus() {
    const r = await this.req('GET', '/combat/status', undefined, true);
    return r.ok && r.json ? r.json : { inFight: false, shardId: null, mapId: null };
  }
  async matchmake(mapId, shardId, { spectate = false, queue = false } = {}) {
    const r = await this.req(
      'POST',
      '/matchmake/joinOrCreate/map',
      { mapId, shardId, token: this.token, spectate, queue },
      true,
    );
    return r.ok && r.json ? r.json : { error: r.json?.error ?? 'matchmake_failed' };
  }
}
