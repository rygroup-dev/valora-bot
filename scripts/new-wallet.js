// Generate a fresh Solana ed25519 wallet for the bot (no @solana/web3.js dep).
// Usage: node scripts/new-wallet.js [label]
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const label = process.argv[2] || 'main';
const kp = nacl.sign.keyPair();
const secretB58 = bs58.encode(kp.secretKey); // 64-byte secret (Solana format)
const pubkey = bs58.encode(kp.publicKey);

console.log('label   :', label);
console.log('pubkey  :', pubkey);
console.log('secret  :', secretB58);
console.log('\nAdd to data/wallets.json:');
console.log(JSON.stringify([{ label, key: secretB58 }], null, 2));
console.log('\n⚠️  Fund this wallet with the Valora gate token (minHold) before it can play.');
