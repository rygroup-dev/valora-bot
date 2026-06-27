import { describe, it, expect, vi } from 'vitest';
import { Auth, isJwtExpired } from '../src/auth/Auth.js';

function makeJwt(expSecondsFromNow) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'PUB', iss: 'rustdays', aud: 'player', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

const wallet = {
  publicKey: 'PUB',
  signMessage: (msg, enc) => `sig-${enc}`,
};

function memStore() {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), del: (k) => m.delete(k) };
}

describe('isJwtExpired', () => {
  it('detects expired tokens (with skew)', () => {
    expect(isJwtExpired(makeJwt(-10))).toBe(true);
    expect(isJwtExpired(makeJwt(3600))).toBe(false);
  });
  it('treats malformed tokens as expired', () => {
    expect(isJwtExpired('garbage')).toBe(true);
    expect(isJwtExpired(null)).toBe(true);
  });
});

describe('Auth.login', () => {
  it('runs nonce -> sign -> verify and stores token', async () => {
    const jwt = makeJwt(3600);
    const rc = {
      requestNonce: vi.fn(async () => ({ message: 'Valora sign\nNonce: x' })),
      verify: vi.fn(async () => ({ ok: true, token: jwt, hasCharacter: true })),
      setToken: vi.fn(),
    };
    const store = memStore();
    const auth = new Auth({ rest: rc, wallet, store });
    const r = await auth.login();
    expect(r.ok).toBe(true);
    expect(r.hasCharacter).toBe(true);
    expect(rc.requestNonce).toHaveBeenCalledWith('PUB');
    expect(rc.setToken).toHaveBeenCalledWith(jwt);
    expect(store.get('rustdays:jwt:v1:PUB')).toBe(jwt);
  });

  it('falls back to base64 signature when base58 verify is rejected', async () => {
    const jwt = makeJwt(3600);
    const rc = {
      requestNonce: vi.fn(async () => ({ message: 'm' })),
      verify: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'bad_sig' })
        .mockResolvedValueOnce({ ok: true, token: jwt, hasCharacter: false }),
      setToken: vi.fn(),
    };
    const auth = new Auth({ rest: rc, wallet, store: memStore() });
    const r = await auth.login();
    expect(r.ok).toBe(true);
    expect(rc.verify).toHaveBeenCalledTimes(2);
    // second call used base64-encoded signature
    expect(rc.verify.mock.calls[1][1]).toBe('sig-base64');
  });

  it('returns error when nonce has no message', async () => {
    const rc = { requestNonce: vi.fn(async () => ({ error: 'rate_limited' })), verify: vi.fn(), setToken: vi.fn() };
    const auth = new Auth({ rest: rc, wallet, store: memStore() });
    const r = await auth.login();
    expect(r.ok).toBe(false);
    expect(rc.verify).not.toHaveBeenCalled();
  });
});

describe('Auth.ensureAuth', () => {
  it('reuses a cached, unexpired token without logging in', async () => {
    const jwt = makeJwt(3600);
    const store = memStore();
    store.set('rustdays:jwt:v1:PUB', jwt);
    const rc = { requestNonce: vi.fn(), verify: vi.fn(), setToken: vi.fn() };
    const auth = new Auth({ rest: rc, wallet, store });
    const r = await auth.ensureAuth();
    expect(r.ok).toBe(true);
    expect(rc.setToken).toHaveBeenCalledWith(jwt);
    expect(rc.requestNonce).not.toHaveBeenCalled();
  });

  it('re-logins when cached token is expired', async () => {
    const store = memStore();
    store.set('rustdays:jwt:v1:PUB', makeJwt(-100));
    const fresh = makeJwt(3600);
    const rc = {
      requestNonce: vi.fn(async () => ({ message: 'm' })),
      verify: vi.fn(async () => ({ ok: true, token: fresh, hasCharacter: true })),
      setToken: vi.fn(),
    };
    const auth = new Auth({ rest: rc, wallet, store });
    const r = await auth.ensureAuth();
    expect(r.ok).toBe(true);
    expect(rc.requestNonce).toHaveBeenCalled();
    expect(store.get('rustdays:jwt:v1:PUB')).toBe(fresh);
  });
});
