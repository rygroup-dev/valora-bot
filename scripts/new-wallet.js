// Generate a fresh Solana wallet for the bot.
// Usage: node scripts/new-wallet.js [label]
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const label = process.argv[2] || 'main';
const kp = Keypair.generate();
const secretB58 = bs58.encode(kp.secretKey);

console.log('label   :', label);
console.log('pubkey  :', kp.publicKey.toBase58());
console.log('secret  :', secretB58);
console.log('\nAdd to data/wallets.json:');
console.log(JSON.stringify([{ label, key: secretB58 }], null, 2));
console.log('\n⚠️  Fund this wallet with the Valora gate token (minHold) before it can play.');
