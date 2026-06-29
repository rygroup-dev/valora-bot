import { describe, it, expect } from 'vitest';
import { AccountManager } from '../src/multi/Accounts.js';
import { Wallet } from '../src/wallet/Wallet.js';
import { generateWallet } from '../src/wallet/generate.js';

function makeStore(withMain = true) {
  const m = new Map();
  let persisted = 0;
  if (withMain) {
    const main = new Wallet({ ...generateWallet({ label: 'main' }), priority: true });
    m.set('main', main);
  }
  return {
    get: (l) => m.get(l),
    add: (w) => { if (m.has(w.label)) return null; m.set(w.label, w); return w; },
    persist: () => { persisted += 1; return 'data/wallets.json'; },
    persistCount: () => persisted,
    map: m,
  };
}

function makeClient({ balance = 1000n * 1_000_000n, destExists = false } = {}) {
  const sent = [];
  return {
    sent,
    async getLatestBlockhash() { return '11111111111111111111111111111111'; },
    async getAccountInfo() { return destExists ? { owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' } : null; },
    async getTokenBalanceByAta() { return { amount: balance, decimals: 6, uiAmount: Number(balance) / 1e6 }; },
    async sendRawTransaction(tx) { sent.push(tx); return `SIG${sent.length}`; },
  };
}

function makeManager(opts = {}) {
  const store = opts.store || makeStore();
  const agents = new Map();
  const started = [];
  const mgr = new AccountManager({
    walletStore: store,
    agents,
    config: { cluster: 'mainnet-beta' },
    store: {},
    bot: {},
    client: opts.client || makeClient(opts.clientOpts),
    makeAgent: (w) => ({ label: w.label, start: async () => started.push(w.label) }),
  });
  return { mgr, store, agents, started };
}

describe('AccountManager.generate', () => {
  it('generates, registers and persists a sub wallet', () => {
    const { mgr, store } = makeManager();
    const r = mgr.generate('sub1');
    expect(r.label).toBe('sub1');
    expect(r.pubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(store.get('sub1')).toBeTruthy();
    expect(store.get('sub1').priority).toBe(false); // standard server
    expect(store.persistCount()).toBe(1);
  });

  it('rejects bad labels, the main label, and duplicates', () => {
    const { mgr } = makeManager();
    expect(() => mgr.generate('Bad Label')).toThrow();
    expect(() => mgr.generate('main')).toThrow();
    mgr.generate('sub1');
    expect(() => mgr.generate('sub1')).toThrow();
  });
});

describe('AccountManager funding', () => {
  it('funds VALORA main→sub and reports the amount', async () => {
    const { mgr } = makeManager();
    mgr.generate('sub1');
    const r = await mgr.fundVal('sub1', 110);
    expect(r.ok).toBe(true);
    expect(r.ui).toBe('110');
    expect(r.createdDestinationAta).toBe(true); // dest ATA did not exist
    expect(r.signature).toBe('SIG1');
  });

  it('skips when main lacks enough VALORA', async () => {
    const { mgr } = makeManager({ clientOpts: { balance: 5n * 1_000_000n } });
    mgr.generate('sub1');
    const r = await mgr.fundVal('sub1', 110);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_token');
  });

  it('funds SOL main→sub', async () => {
    const { mgr } = makeManager();
    mgr.generate('sub1');
    const r = await mgr.fundSol('sub1', '0.01');
    expect(r.ok).toBe(true);
    expect(r.sol).toBe('0.01');
  });
});

describe('AccountManager sweep', () => {
  it('sweeps sub→main leaving the gate hold by default', async () => {
    const { mgr } = makeManager();
    mgr.generate('sub1');
    const r = await mgr.sweepVal('sub1'); // balance 1000, leave 100 → sweep 900
    expect(r.ok).toBe(true);
    expect(r.ui).toBe('900');
  });

  it('refuses to sweep the main wallet', async () => {
    const { mgr } = makeManager();
    await expect(mgr.sweepVal('main')).rejects.toThrow();
  });
});

describe('AccountManager.createSub', () => {
  it('generates, funds and spawns a live sub in one shot', async () => {
    const { mgr, agents, started } = makeManager();
    const r = await mgr.createSub('sub1', { val: 110 });
    expect(r.ok).toBe(true);
    expect(r.val).toBe('110');
    expect(r.spawned).toBe(true);
    expect(agents.has('sub1')).toBe(true);
    expect(started).toContain('sub1');
  });

  it('does not spawn if funding fails', async () => {
    const { mgr, agents } = makeManager({ clientOpts: { balance: 1n } });
    const r = await mgr.createSub('sub1', { val: 110 });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('fundVal');
    expect(agents.has('sub1')).toBe(false);
  });
});
