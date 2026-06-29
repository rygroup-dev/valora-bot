import { Agent } from '../Agent.js';
import { Wallet } from '../wallet/Wallet.js';
import { generateWallet } from '../wallet/generate.js';
import { VALORA } from '../game/valora.js';
import {
  SolanaClient,
  associatedTokenAddress,
  sendSol as chainSendSol,
  sendSplToken,
  sweepSplToken,
  solToLamports,
  tokenUiToBaseUnits,
  formatToken,
  formatSol,
} from '../net/onchain.js';

const LABEL_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

// Orchestrates the main + sub-account fleet:
//  • generate a fresh sub wallet and persist it
//  • spawn it as a live Agent (its own session/JWT, standard server)
//  • move value on-chain: main→sub funding (SOL/VALORA) and sub→main sweep
//
// Every method is pure-ish and returns a structured result; the Telegram layer
// is responsible for confirmation prompts before any value actually moves.
// Dependencies are injected so the whole thing is unit-testable without network.
export class AccountManager {
  constructor({ walletStore, agents, config, store, bot, log = () => {}, client, makeAgent, mainLabel = 'main' }) {
    this.walletStore = walletStore;
    this.agents = agents; // Map<label, Agent> shared with the Bot
    this.config = config;
    this.store = store;
    this.bot = bot;
    this.log = log;
    this.mainLabel = mainLabel;
    this.client = client || new SolanaClient({ rpcUrl: config?.solanaRpc || undefined, cluster: config?.cluster });
    this._makeAgent = makeAgent || ((wallet) => new Agent({ wallet, config, store, bot, log }));
  }

  mainWallet() {
    const w = this.walletStore.get(this.mainLabel);
    if (!w) throw new Error(`no '${this.mainLabel}' wallet — cannot fund sub accounts`);
    return w;
  }

  // Generate a brand-new sub wallet, persist it to the gitignored wallet file.
  // Sub wallets are non-priority by default → they join standard servers.
  generate(label) {
    if (!LABEL_RE.test(label)) throw new Error('label must be a-z 0-9 _ - (max 24)');
    if (label === this.mainLabel) throw new Error('refusing to overwrite the main wallet');
    if (this.walletStore.get(label)) throw new Error(`wallet '${label}' already exists`);
    const wallet = new Wallet({ ...generateWallet({ label }), priority: false });
    const added = this.walletStore.add(wallet);
    if (!added) throw new Error(`could not add wallet '${label}' (duplicate key/label)`);
    this.walletStore.persist();
    this.log(`[accounts] generated sub wallet '${label}' (${wallet.publicKey})`);
    return { label, pubkey: wallet.publicKey };
  }

  // Bring a (already-persisted) wallet online as a live Agent.
  async spawn(label) {
    const wallet = this.walletStore.get(label);
    if (!wallet) throw new Error(`no wallet '${label}'`);
    if (this.agents.has(label)) return { ok: true, already: true, label };
    const agent = this._makeAgent(wallet);
    this.agents.set(label, agent);
    await agent.start();
    this.log(`[accounts] spawned agent '${label}' (priority=${wallet.priority})`);
    return { ok: true, label, agent };
  }

  // main → sub : SOL (covers rent/fees if the sub ever moves value itself).
  async fundSol(toLabel, amountSol) {
    const to = this.walletStore.get(toLabel);
    if (!to) throw new Error(`no wallet '${toLabel}'`);
    const lamports = solToLamports(amountSol);
    if (lamports <= 0n) throw new Error('amount must be > 0');
    const signature = await chainSendSol({ client: this.client, fromWallet: this.mainWallet(), to: to.publicKey, lamports });
    return { ok: true, signature, lamports, sol: formatSol(lamports), to: to.publicKey, label: toLabel };
  }

  // main → sub : VALORA (auto-creates the sub's ATA, paid by main).
  async fundVal(toLabel, amountUi) {
    const to = this.walletStore.get(toLabel);
    if (!to) throw new Error(`no wallet '${toLabel}'`);
    const amount = tokenUiToBaseUnits(amountUi);
    const res = await sendSplToken({ client: this.client, fromWallet: this.mainWallet(), toOwner: to.publicKey, amount });
    return { ...res, ui: formatToken(res.amount ?? 0n), to: to.publicKey, label: toLabel };
  }

  // sub → main : sweep VALORA, leaving `leaveUi` behind (default: the gate hold
  // so the sub keeps playing). Pass leaveUi=0 to fully drain a retired sub.
  // The sub signs + pays this tx, so it needs a little SOL for the fee.
  async sweepVal(fromLabel, leaveUi = VALORA.gateHold) {
    const from = this.walletStore.get(fromLabel);
    if (!from) throw new Error(`no wallet '${fromLabel}'`);
    if (fromLabel === this.mainLabel) throw new Error('refusing to sweep the main wallet');
    if (typeof this.client.getBalance === 'function') {
      const sol = await this.client.getBalance(from.publicKey);
      if (BigInt(sol) < 5000n) {
        return { ok: false, reason: 'no_sol', amount: 0n, hint: `fund a little SOL first: /sendsol ${fromLabel} 0.002` };
      }
    }
    const leaveBaseUnits = tokenUiToBaseUnits(leaveUi);
    const res = await sweepSplToken({
      client: this.client,
      fromWallet: from,
      toOwner: this.mainWallet().publicKey,
      leaveBaseUnits,
    });
    return { ...res, ui: formatToken(res.amount ?? 0n), from: from.publicKey, label: fromLabel };
  }

  // Wait until `toLabel`'s VALORA balance reaches `minBaseUnits` on-chain (the
  // funding tx must finalize before the sub can pass the play gate). Returns the
  // observed balance; resolves early once funded, gives up after the timeout.
  async awaitTokenFunded(toLabel, minBaseUnits, { tries = 20, intervalMs = 3000 } = {}) {
    const to = this.walletStore.get(toLabel);
    if (!to) throw new Error(`no wallet '${toLabel}'`);
    const ata = associatedTokenAddress(to.publicKey);
    for (let i = 0; i < tries; i++) {
      const bal = await this.client.getTokenBalanceByAta(ata);
      if (BigInt(bal.amount) >= BigInt(minBaseUnits)) return { ok: true, amount: bal.amount };
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    const bal = await this.client.getTokenBalanceByAta(ata);
    return { ok: BigInt(bal.amount) >= BigInt(minBaseUnits), amount: bal.amount };
  }

  // Full sub-account bring-up: generate → fund VALORA (default gate hold + buffer)
  // → wait for the funding to confirm on-chain → optionally fund SOL → spawn.
  // Waiting matters: spawning before the VALORA confirms makes the sub fail the
  // play gate ("insufficient hold") on its first join.
  async createSub(label, { val = VALORA.gateHold + 10, sol = 0, waitFunding = true } = {}) {
    const gen = this.generate(label);
    const funded = await this.fundVal(label, val);
    if (!funded.ok) {
      return { ok: false, step: 'fundVal', reason: funded.reason, ...gen, want: val };
    }
    let confirmed = true;
    if (waitFunding) {
      const wait = await this.awaitTokenFunded(label, tokenUiToBaseUnits(VALORA.gateHold));
      confirmed = wait.ok;
    }
    let solRes = null;
    if (Number(sol) > 0) solRes = await this.fundSol(label, sol);
    const spawn = await this.spawn(label);
    return { ok: true, ...gen, val: funded.ui, valSig: funded.signature, confirmed, sol: solRes?.sol, solSig: solRes?.signature, spawned: spawn.ok };
  }
}
