// Persists character state via PUT /character/save with optimistic locking.
// On a version conflict, adopt the server's currentVersion and retry. The bot
// owns the full character state in a single session, so adopting + retrying is
// safe and prevents lost saves.

export class SaveManager {
  constructor({ rest, version = 0, maxRetries = 3 }) {
    this.rest = rest;
    this.version = version;
    this.maxRetries = maxRetries;
  }

  setVersion(v) {
    if (typeof v === 'number') this.version = v;
  }

  async save(save) {
    let attempt = 0;
    while (true) {
      const r = await this.rest.saveCharacter(save, this.version);
      if (r.ok) {
        this.version = r.version;
        return { ok: true, version: r.version };
      }
      const conflict = r.error === 'version_conflict' && typeof r.currentVersion === 'number';
      if (!conflict || attempt >= this.maxRetries) {
        return { ok: false, error: r.error, currentVersion: r.currentVersion };
      }
      this.version = r.currentVersion;
      attempt += 1;
    }
  }
}
