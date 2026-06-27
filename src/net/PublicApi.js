// Read-only client for Valora's public stats API (`/play/api/public/v1`).
// Powers Telegram economy commands: /pulse, /leaderboard, /market.
// Soft-failing: returns empty values on error so commands never crash.

export class PublicApi {
  constructor({ base = 'https://valora.gg/play', fetchImpl } = {}) {
    this.base = base.replace(/\/$/, '') + '/api/public/v1';
    this.fetchImpl = fetchImpl || globalThis.fetch;
  }

  async _get(path, fallback) {
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { headers: { accept: 'application/json' } });
      if (!res.ok) return fallback;
      const j = await res.json();
      return j?.data ?? fallback;
    } catch {
      return fallback;
    }
  }

  async pulse() {
    return this._get('/pulse', {});
  }

  async leaderboard(kind = 'gold', limit = 10, offset = 0) {
    const d = await this._get(`/leaderboard/${kind}?limit=${limit}&offset=${offset}`, {});
    return d.rows || d.entries || d.list || (Array.isArray(d) ? d : []);
  }

  async items(category) {
    const d = await this._get(`/items${category ? `?category=${category}` : ''}`, {});
    return d.items || (Array.isArray(d) ? d : []);
  }
}

const n = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '?');

export function formatPulse(p = {}) {
  return [
    '📊 *Live economy*',
    `👥 online: ${n(p.online)} · characters: ${n(p.characters)}`,
    `📈 avg level: ${p.avgLevel != null ? Number(p.avgLevel).toFixed(2) : '?'}`,
    `🪙 circulating gold: ${n(p.circulatingGold)}`,
  ].join('\n');
}

export function formatLeaderboard(kind, rows = []) {
  if (!rows.length) return `🏆 *${kind} leaderboard*\n_no data_`;
  const lines = rows.slice(0, 10).map((r, i) => {
    const val = r.gold ?? r.rating ?? r.score ?? r.value ?? '';
    return `${i + 1}. ${r.name || r.hero || '?'} — ${typeof val === 'number' ? val.toLocaleString() : val}`;
  });
  return `🏆 *${kind} leaderboard*\n${lines.join('\n')}`;
}
