// Solana wallet sign-in for rustdays-server.
// Flow: POST /auth/nonce -> sign message (ed25519) -> POST /auth/verify -> JWT.
// JWT cached per-pubkey, reused until near expiry, re-auth on 401/expiry.

const JWT_KEY = (pubkey) => `rustdays:jwt:v1:${pubkey}`;
const SKEW_SEC = 120; // treat token as expired this many seconds early

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function isJwtExpired(token) {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() / 1000 >= payload.exp - SKEW_SEC;
}

export class Auth {
  constructor({ rest, wallet, store, log = () => {} }) {
    this.rest = rest;
    this.wallet = wallet;
    this.store = store;
    this.log = log;
    this.token = null;
    // Wire 401 re-auth so any authed REST call can recover.
    if (this.rest) this.rest.onUnauthorized = () => this.login();
  }

  get storeKey() {
    return JWT_KEY(this.wallet.publicKey);
  }

  async login() {
    const pubkey = this.wallet.publicKey;
    const nonce = await this.rest.requestNonce(pubkey);
    if (!nonce || !nonce.message) {
      return { ok: false, error: nonce?.error ?? 'nonce_failed' };
    }
    // Try base58 signature first (Solana convention), fall back to base64.
    for (const enc of ['base58', 'base64']) {
      const signature = this.wallet.signMessage(nonce.message, enc);
      const r = await this.rest.verify(pubkey, signature);
      if (r.ok && r.token) {
        this.token = r.token;
        this.rest.setToken(r.token);
        try {
          this.store.set(this.storeKey, r.token);
        } catch {
          /* ignore persist errors */
        }
        this.log(`[auth] ${this.wallet.label ?? pubkey} signed in (${enc})`);
        return { ok: true, hasCharacter: !!r.hasCharacter };
      }
    }
    return { ok: false, error: 'verify_failed' };
  }

  async ensureAuth() {
    let cached = this.token;
    if (!cached) {
      try {
        cached = this.store.get(this.storeKey);
      } catch {
        cached = null;
      }
    }
    if (cached && !isJwtExpired(cached)) {
      this.token = cached;
      this.rest.setToken(cached);
      return { ok: true, cached: true };
    }
    return this.login();
  }

  logout() {
    this.token = null;
    try {
      this.store.del(this.storeKey);
    } catch {
      /* ignore */
    }
    if (this.rest) this.rest.setToken(null);
  }
}
