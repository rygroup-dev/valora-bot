import { describe, it, expect, vi } from 'vitest';
import { RestClient } from '../src/net/RestClient.js';

function fakeFetch(routes) {
  return vi.fn(async (url, opts = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/play/, '');
    const key = `${opts.method || 'GET'} ${path}`;
    const handler = routes[key];
    if (!handler) return { ok: false, status: 404, json: async () => ({ error: 'nf' }) };
    const res = handler({ url, opts, body: opts.body ? JSON.parse(opts.body) : undefined });
    return { ok: res.status < 400, status: res.status, json: async () => res.json };
  });
}

const base = 'https://valora.gg/play';

describe('RestClient', () => {
  it('GET /health returns parsed body', async () => {
    const fetchImpl = fakeFetch({ 'GET /health': () => ({ status: 200, json: { ok: true } }) });
    const rc = new RestClient({ base, fetchImpl });
    expect(await rc.health()).toBe(true);
  });

  it('attaches Bearer token only on authed calls', async () => {
    let seenAuth;
    const fetchImpl = fakeFetch({
      'GET /character': ({ opts }) => {
        seenAuth = opts.headers.authorization;
        return { status: 200, json: { character: { id: '1' } } };
      },
    });
    const rc = new RestClient({ base, fetchImpl });
    rc.setToken('JWT123');
    const c = await rc.getCharacter();
    expect(seenAuth).toBe('Bearer JWT123');
    expect(c.id).toBe('1');
  });

  it('does NOT attach auth header on public calls', async () => {
    let seenAuth = 'unset';
    const fetchImpl = fakeFetch({
      'GET /shards': ({ opts }) => {
        seenAuth = opts.headers.authorization;
        return { status: 200, json: { shards: [{ id: '1', playing: 3 }] } };
      },
    });
    const rc = new RestClient({ base, fetchImpl });
    rc.setToken('JWT123');
    await rc.shards();
    expect(seenAuth).toBeUndefined();
  });

  it('requestNonce posts pubkey and returns message', async () => {
    const fetchImpl = fakeFetch({
      'POST /auth/nonce': ({ body }) => ({
        status: 200,
        json: { message: `sign ${body.pubkey}` },
      }),
    });
    const rc = new RestClient({ base, fetchImpl });
    const r = await rc.requestNonce('PUB');
    expect(r.message).toBe('sign PUB');
  });

  it('verify stores token on success', async () => {
    const fetchImpl = fakeFetch({
      'POST /auth/verify': () => ({ status: 200, json: { token: 'JWT', hasCharacter: true } }),
    });
    const rc = new RestClient({ base, fetchImpl });
    const r = await rc.verify('PUB', 'SIG');
    expect(r.ok).toBe(true);
    expect(r.hasCharacter).toBe(true);
    expect(rc.token).toBe('JWT');
  });

  it('saveCharacter surfaces optimistic-lock conflict', async () => {
    const fetchImpl = fakeFetch({
      'PUT /character/save': () => ({ status: 409, json: { error: 'version_conflict', currentVersion: 5 } }),
    });
    const rc = new RestClient({ base, fetchImpl });
    rc.setToken('J');
    const r = await rc.saveCharacter({ foo: 1 }, 4);
    expect(r.ok).toBe(false);
    expect(r.currentVersion).toBe(5);
  });

  it('network failure returns a soft error, never throws', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('boom'); });
    const rc = new RestClient({ base, fetchImpl });
    const r = await rc.health();
    expect(r).toBe(false);
  });
});
