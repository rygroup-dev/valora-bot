import { describe, it, expect, vi } from 'vitest';
import { PublicApi, formatPulse, formatLeaderboard } from '../src/net/PublicApi.js';

function fakeFetch(routes) {
  return vi.fn(async (url) => {
    const u = new URL(url);
    const key = u.pathname.replace('/play/api/public/v1', '') + (u.search || '');
    const body = routes[key] ?? routes[u.pathname.replace('/play/api/public/v1', '')];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  });
}

describe('PublicApi', () => {
  it('fetches and unwraps pulse data', async () => {
    const api = new PublicApi({
      base: 'https://valora.gg/play',
      fetchImpl: fakeFetch({ '/pulse': { data: { online: 105, circulatingGold: 6070990 } } }),
    });
    const p = await api.pulse();
    expect(p.online).toBe(105);
    expect(p.circulatingGold).toBe(6070990);
  });

  it('fetches gold leaderboard', async () => {
    const api = new PublicApi({
      base: 'https://valora.gg/play',
      fetchImpl: fakeFetch({ '/leaderboard/gold?limit=5&offset=0': { data: { rows: [{ name: 'A', gold: 999 }] } } }),
    });
    const lb = await api.leaderboard('gold', 5);
    expect(lb[0].name).toBe('A');
  });

  it('returns a safe empty value on network error', async () => {
    const api = new PublicApi({ base: 'https://valora.gg/play', fetchImpl: vi.fn(async () => { throw new Error('x'); }) });
    expect(await api.pulse()).toEqual({});
    expect(await api.leaderboard('gold')).toEqual([]);
  });
});

describe('formatPulse', () => {
  it('renders live economy metrics', () => {
    const t = formatPulse({ online: 105, characters: 1993, avgLevel: 4.98, circulatingGold: 6070990 });
    expect(t).toContain('105');
    expect(t).toContain('6,070,990');
  });
});

describe('formatLeaderboard', () => {
  it('renders ranked rows', () => {
    const t = formatLeaderboard('gold', [{ name: 'Rich', gold: 50000 }, { name: 'Mid', gold: 200 }]);
    expect(t).toContain('Rich');
    expect(t).toContain('50,000');
    expect(t).toMatch(/1\./);
  });
  it('handles empty list', () => {
    expect(formatLeaderboard('gold', [])).toMatch(/no data/i);
  });
});
