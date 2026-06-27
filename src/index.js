import { config } from './config.js';
import { WalletStore } from './wallet/WalletStore.js';
import { Store } from './state/Store.js';
import { Agent } from './Agent.js';
import { Bot } from './telegram/Bot.js';
import { acquireLock, releaseLock } from './util/singleton.js';

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const LOCK = 'data/bot.lock';

async function main() {
  // Single-instance guard: never run doubled (avoids Telegram 409 + double login).
  if (!acquireLock(LOCK)) {
    log('another valora-bot instance is already running — exiting to avoid a double.');
    process.exit(0);
  }
  process.on('exit', () => releaseLock(LOCK));
  log(`Valora bot starting (mode=${config.mode}, dryRun=${config.dryRun})`);

  const walletStore = WalletStore.fromConfig({
    WALLETS: config.wallets.inline,
    WALLETS_FILE: config.wallets.file,
  });
  log(`loaded ${walletStore.size} wallet(s): ${walletStore.labels().join(', ')}`);

  const store = new Store('data/store.json');
  const agents = new Map();

  // Telegram first so agents can request confirmations during startup.
  const bot = new Bot({ token: config.telegram.token, owners: config.telegram.owners, agents, log, base: config.base });
  if (!config.telegram.token) log('telegram disabled (no token) — control via process only');

  for (const wallet of walletStore.all()) {
    const agent = new Agent({ wallet, config, store, bot, log });
    agents.set(wallet.label, agent);
  }

  // Start agents sequentially with small spacing (anti-ban: not all at once).
  for (const agent of agents.values()) {
    try {
      await agent.start();
    } catch (e) {
      log(`[${agent.label}] start failed: ${e?.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000));
  }

  bot.broadcast(`✅ Valora bot up: ${[...agents.keys()].join(', ')} (mode=${config.mode})`);

  const shutdown = () => {
    log('shutting down…');
    for (const a of agents.values()) a.kill('shutdown');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
