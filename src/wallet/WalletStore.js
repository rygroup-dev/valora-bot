import fs from 'node:fs';
import { Wallet } from './Wallet.js';

// Holds N wallets, each becoming an independent Agent at runtime.
// Source order: WALLETS (inline JSON) > WALLETS_FILE (path to JSON array).
export class WalletStore {
  constructor(wallets, { file = null } = {}) {
    this._wallets = wallets;
    this._byLabel = new Map(wallets.map((w) => [w.label, w]));
    this._file = file; // path used to persist newly generated wallets (/genwallet)
  }

  static fromConfig(env = {}) {
    let raw = null;
    let file = null;
    if (env.WALLETS && env.WALLETS.trim()) {
      raw = env.WALLETS;
    } else if (env.WALLETS_FILE && fs.existsSync(env.WALLETS_FILE)) {
      raw = fs.readFileSync(env.WALLETS_FILE, 'utf8');
      file = env.WALLETS_FILE;
    } else if (env.WALLETS_FILE) {
      // File configured but missing → start an empty store we can persist into.
      file = env.WALLETS_FILE;
    }
    if (!raw) throw new Error('no wallets configured (set WALLETS or WALLETS_FILE)');

    let entries;
    try {
      entries = JSON.parse(raw);
    } catch {
      throw new Error('WALLETS must be a JSON array of {label,key}');
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('no wallets configured (empty list)');
    }

    const wallets = [];
    const seenPubkeys = new Set();
    let auto = 0;
    for (const e of entries) {
      auto += 1;
      const label = e.label || `wallet${auto}`;
      const w = new Wallet({ label, key: e.key, telegramTag: e.telegramTag, priority: e.priority });
      if (seenPubkeys.has(w.publicKey)) continue; // skip dup key
      seenPubkeys.add(w.publicKey);
      wallets.push(w);
    }
    return new WalletStore(wallets, { file });
  }

  get size() {
    return this._wallets.length;
  }
  labels() {
    return this._wallets.map((w) => w.label);
  }
  get(label) {
    return this._byLabel.get(label);
  }
  all() {
    return [...this._wallets];
  }

  // Add an already-constructed Wallet (dedup by pubkey + label). Returns the
  // wallet or null if it duplicates an existing one.
  add(wallet) {
    if (this._byLabel.has(wallet.label)) return null;
    if (this._wallets.some((w) => w.publicKey === wallet.publicKey)) return null;
    this._wallets.push(wallet);
    this._byLabel.set(wallet.label, wallet);
    return wallet;
  }

  // Persist the full wallet list back to WALLETS_FILE (secrets included). This
  // is the only place secrets are written, and only to the gitignored file.
  persist() {
    if (!this._file) throw new Error('no WALLETS_FILE configured to persist into');
    const entries = this._wallets.map((w) => ({
      label: w.label,
      key: w.secretKeyB58,
      ...(w.telegramTag ? { telegramTag: w.telegramTag } : {}),
      ...(w.priority ? { priority: true } : {}),
    }));
    const tmp = `${this._file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
    fs.renameSync(tmp, this._file);
    return this._file;
  }
}
