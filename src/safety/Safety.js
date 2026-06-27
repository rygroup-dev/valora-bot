import { backoff } from '../util/timing.js';

// Actions that move on-chain value or items — always require explicit
// confirmation (Telegram inline) before they may run. Zero-mistake gate.
export const RISKY_ACTIONS = [
  'hdv_buy',
  'hdv_token_confirm',
  'stat_reset_confirm',
  'bank_withdraw',
  'bank_destroy',
  'econ_destroy',
  'tradeConfirm',
  'token_transfer',
  'withdraw',
];

export class Safety {
  constructor({ mode = 'observe', dryRun = false } = {}) {
    this.mode = mode; // 'observe' | 'active'
    this.dryRun = dryRun;
    this.killed = false;
    this.killReason = null;
    this._denied = new Map();
  }

  // Returns { ok, reason?, dryRun? }
  canWrite(action, { confirmed = false } = {}) {
    if (this.killed) return { ok: false, reason: `kill-switch: ${this.killReason || 'stopped'}` };
    if (this.mode !== 'active') return { ok: false, reason: `mode=${this.mode} (read-only)` };
    if (RISKY_ACTIONS.includes(action) && !confirmed) {
      return { ok: false, reason: 'risky action requires confirmation' };
    }
    return { ok: true, dryRun: this.dryRun };
  }

  kill(reason = 'stopped') {
    this.killed = true;
    this.killReason = reason;
  }
  resume() {
    this.killed = false;
    this.killReason = null;
  }
  setMode(mode) {
    this.mode = mode;
  }

  recordDenied(action) {
    const n = (this._denied.get(action) || 0) + 1;
    this._denied.set(action, n);
    return backoff(n, { base: 1500, cap: 60000, jitterRatio: 0.2 });
  }
  recordSuccess(action) {
    this._denied.delete(action);
  }
  deniedCount(action) {
    return this._denied.get(action) || 0;
  }
}
