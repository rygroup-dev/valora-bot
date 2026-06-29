// Pure control-plane logic for the Telegram bot: owner gating, command parsing,
// and the inline-confirm registry for risky actions. Kept separate from the
// node-telegram-bot-api wiring so it can be tested without network.

export function isOwner(chatId, owners) {
  if (!owners || owners.length === 0) return false; // fail closed
  return owners.map(Number).includes(Number(chatId));
}

export function parseCommand(text) {
  if (typeof text !== 'string' || !text.startsWith('/')) return null;
  const [head, ...rest] = text.trim().slice(1).split(/\s+/);
  const cmd = head.split('@')[0];
  return { cmd, arg: rest[0], args: rest };
}

let _seq = 0;

export class ConfirmRegistry {
  constructor() {
    this._pending = new Map();
  }

  create({ action, detail, timeoutMs = 120000 } = {}) {
    const id = `c${++_seq}`;
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (this._pending.has(id)) {
              this._pending.delete(id);
              resolve({ confirmed: false, timedOut: true });
            }
          }, timeoutMs)
        : null;
    this._pending.set(id, { action, detail, resolve, timer });
    return { id, promise };
  }

  pending(id) {
    return this._pending.get(id);
  }

  _settle(id, value) {
    const entry = this._pending.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this._pending.delete(id);
    entry.resolve(value);
  }

  approve(id) {
    this._settle(id, { confirmed: true });
  }
  decline(id) {
    this._settle(id, { confirmed: false });
  }
}
