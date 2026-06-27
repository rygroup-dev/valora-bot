// Test the full Solana sign-in flow for each configured wallet (no gameplay).
// Usage: node scripts/login.js
import { config } from '../src/config.js';
import { WalletStore } from '../src/wallet/WalletStore.js';
import { Store } from '../src/state/Store.js';
import { RestClient } from '../src/net/RestClient.js';
import { Auth } from '../src/auth/Auth.js';

const store = new Store('data/store.json');
const wallets = WalletStore.fromConfig({ WALLETS: config.wallets.inline, WALLETS_FILE: config.wallets.file });

for (const wallet of wallets.all()) {
  const rest = new RestClient({ base: config.base });
  const auth = new Auth({ rest, wallet, store, log: console.log });
  const r = await auth.login();
  if (!r.ok) {
    console.log(`❌ ${wallet.label} (${wallet.publicKey.slice(0, 8)}…): ${r.error}`);
    continue;
  }
  const access = await rest.accessCheck();
  const char = await rest.resumeCharacter();
  console.log(
    `✅ ${wallet.label} (${wallet.publicKey.slice(0, 8)}…): hasChar=${r.hasCharacter} gate.ok=${access.ok} minHold=${access.minHold} char=${char.character?.name ?? 'none'}`,
  );
}
