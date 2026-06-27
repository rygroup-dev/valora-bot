import fs from 'node:fs';
import { Wallet } from './Wallet.js';

// Holds N wallets, each becoming an independent Agent at runtime.
// Source order: WALLETS (inline JSON) > WALLETS_FILE (path to JSON array).
export class WalletStore {
  constructor(wallets) {
    this._wallets = wallets;
    this._byLabel = new Map(wallets.map((w) => [w.label, w]));
  }

  static fromConfig(env = {}) {
    let raw = null;
    if (env.WALLETS && env.WALLETS.trim()) {
      raw = env.WALLETS;
    } else if (env.WALLETS_FILE && fs.existsSync(env.WALLETS_FILE)) {
      raw = fs.readFileSync(env.WALLETS_FILE, 'utf8');
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
      const w = new Wallet({ label, key: e.key, telegramTag: e.telegramTag });
      if (seenPubkeys.has(w.publicKey)) continue; // skip dup key
      seenPubkeys.add(w.publicKey);
      wallets.push(w);
    }
    return new WalletStore(wallets);
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
}
