import crypto from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { VALORA } from '../game/valora.js';

export const LAMPORTS_PER_SOL = 1_000_000_000n;

export const PROGRAMS = {
  system: '11111111111111111111111111111111',
  token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // classic SPL Token (legacy)
  token2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022 (VALORA uses this)
  associatedToken: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  rent: 'SysvarRent111111111111111111111111111111111',
};

// VALORA is a Token-2022 mint; default all token ops to its program unless the
// caller passes a different one. Wrong program here = wrong ATA = lost funds.
const VALORA_TOKEN_PROGRAM = VALORA.tokenProgram || PROGRAMS.token2022;

export function clusterRpcUrl(cluster = 'mainnet-beta') {
  if (cluster === 'devnet') return 'https://api.devnet.solana.com';
  if (cluster === 'testnet') return 'https://api.testnet.solana.com';
  return 'https://api.mainnet-beta.solana.com';
}

export class SolanaClient {
  constructor({ rpcUrl, cluster = 'mainnet-beta', fetchImpl } = {}) {
    this.rpcUrl = rpcUrl || clusterRpcUrl(cluster);
    this.fetch = fetchImpl || globalThis.fetch;
  }

  async rpc(method, params = []) {
    const res = await this.fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || `rpc_${json.error.code || 'error'}`);
    return json.result;
  }

  async getLatestBlockhash() {
    const r = await this.rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
    return r?.value?.blockhash;
  }

  async getBalance(pubkey) {
    const r = await this.rpc('getBalance', [pubkey, { commitment: 'confirmed' }]);
    return BigInt(r?.value ?? 0);
  }

  async getAccountInfo(pubkey) {
    const r = await this.rpc('getAccountInfo', [pubkey, { commitment: 'confirmed', encoding: 'base64' }]);
    return r?.value || null;
  }

  async getTokenBalanceByAta(ata) {
    try {
      const r = await this.rpc('getTokenAccountBalance', [ata, { commitment: 'confirmed' }]);
      return {
        amount: BigInt(r?.value?.amount ?? 0),
        decimals: Number(r?.value?.decimals ?? VALORA.decimals),
        uiAmount: Number(r?.value?.uiAmount ?? 0),
      };
    } catch (e) {
      if (/could not find account|Invalid param|AccountNotFound/i.test(String(e?.message))) {
        return { amount: 0n, decimals: VALORA.decimals, uiAmount: 0 };
      }
      throw e;
    }
  }

  async sendRawTransaction(serialized) {
    return this.rpc('sendTransaction', [Buffer.from(serialized).toString('base64'), {
      encoding: 'base64',
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    }]);
  }
}

export function pubkeyBytes(pubkey) {
  const b = bs58.decode(pubkey);
  if (b.length !== 32) throw new Error(`invalid_pubkey_${pubkey}`);
  return Uint8Array.from(b);
}

function encShortVec(n) {
  const out = [];
  let rem = Number(n);
  while (true) {
    let elem = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      out.push(elem);
      break;
    }
    elem |= 0x80;
    out.push(elem);
  }
  return Buffer.from(out);
}

function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(Number(n));
  return b;
}

function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

function compileMessage({ payer, keys, instructions, recentBlockhash }) {
  const keyBytes = keys.map(pubkeyBytes);
  const ixBuffers = instructions.map((ix) => Buffer.concat([
    Buffer.from([ix.programIdIndex]),
    encShortVec(ix.accounts.length),
    Buffer.from(ix.accounts),
    encShortVec(ix.data.length),
    Buffer.from(ix.data),
  ]));
  return Buffer.concat([
    Buffer.from([1, 0, keys.readonlyUnsigned ?? 0]),
    encShortVec(keyBytes.length),
    ...keyBytes.map(Buffer.from),
    Buffer.from(pubkeyBytes(recentBlockhash)),
    encShortVec(ixBuffers.length),
    ...ixBuffers,
  ]);
}

function signLegacyMessage(wallet, message) {
  return nacl.sign.detached(Uint8Array.from(message), wallet.secretKeyBytes);
}

function serializeTx(signatures, message) {
  return Buffer.concat([
    encShortVec(signatures.length),
    ...signatures.map((s) => Buffer.from(s)),
    Buffer.from(message),
  ]);
}

export function solToLamports(sol) {
  if (typeof sol === 'bigint') return sol;
  const s = String(sol).trim();
  if (!/^\d+(\.\d{1,9})?$/.test(s)) throw new Error('invalid_sol_amount');
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt((frac + '000000000').slice(0, 9));
}

export function tokenUiToBaseUnits(amount, decimals = VALORA.decimals) {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('invalid_token_amount');
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}

export function formatSol(lamports) {
  const n = BigInt(lamports);
  const whole = n / LAMPORTS_PER_SOL;
  const frac = (n % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function formatToken(amount, decimals = VALORA.decimals) {
  const n = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function buildSolTransfer({ fromWallet, to, lamports, recentBlockhash }) {
  const from = fromWallet.publicKey;
  const keys = [from, to, PROGRAMS.system];
  keys.readonlyUnsigned = 1;
  const message = compileMessage({
    payer: from,
    keys,
    recentBlockhash,
    instructions: [{
      programIdIndex: 2,
      accounts: [0, 1],
      data: Buffer.concat([u32le(2), u64le(lamports)]),
    }],
  });
  return serializeTx([signLegacyMessage(fromWallet, message)], message);
}

// Ed25519 field check used by Solana PDA derivation. A PDA must not be a valid
// compressed Ed25519 point. This implementation is intentionally small and only
// answers "is this 32-byte value on curve?" for findProgramAddress.
const P = (1n << 255n) - 19n;
const D = mod(-121665n * inv(121666n));
const I = modPow(2n, (P - 1n) / 4n);

function mod(x) { const r = x % P; return r >= 0n ? r : r + P; }
function modPow(a, e) {
  let x = mod(a), y = 1n, n = e;
  while (n > 0n) {
    if (n & 1n) y = mod(y * x);
    x = mod(x * x);
    n >>= 1n;
  }
  return y;
}
function inv(x) { return modPow(x, P - 2n); }
function bytesToBigIntLE(bytes) {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) + BigInt(bytes[i]);
  return n;
}
function isOnCurve(bytes) {
  if (bytes.length !== 32) return false;
  const yBytes = Uint8Array.from(bytes);
  yBytes[31] &= 0x7f;
  const y = bytesToBigIntLE(yBytes);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  let x = modPow(mod(u * inv(v)), (P + 3n) / 8n);
  if (mod(x * x - u * inv(v)) !== 0n) x = mod(x * I);
  return mod(x * x - u * inv(v)) === 0n;
}

function createProgramAddress(seeds, programId) {
  const marker = Buffer.from('ProgramDerivedAddress');
  const data = Buffer.concat([...seeds.map(Buffer.from), Buffer.from(pubkeyBytes(programId)), marker]);
  const hash = crypto.createHash('sha256').update(data).digest();
  if (isOnCurve(hash)) throw new Error('address_on_curve');
  return bs58.encode(hash);
}

export function findProgramAddress(seeds, programId) {
  for (let bump = 255; bump >= 0; bump--) {
    try {
      return [createProgramAddress([...seeds, Uint8Array.from([bump])], programId), bump];
    } catch (e) {
      if (e?.message !== 'address_on_curve') throw e;
    }
  }
  throw new Error('pda_not_found');
}

export function associatedTokenAddress(owner, mint = VALORA.mint, tokenProgram = VALORA_TOKEN_PROGRAM) {
  return findProgramAddress([
    pubkeyBytes(owner),
    pubkeyBytes(tokenProgram),
    pubkeyBytes(mint),
  ], PROGRAMS.associatedToken)[0];
}

export function buildSplTokenTransfer({
  fromWallet,
  toOwner,
  amount,
  mint = VALORA.mint,
  decimals = VALORA.decimals,
  tokenProgram = VALORA_TOKEN_PROGRAM,
  recentBlockhash,
  createDestinationAta = false,
}) {
  const owner = fromWallet.publicKey;
  const fromAta = associatedTokenAddress(owner, mint, tokenProgram);
  const toAta = associatedTokenAddress(toOwner, mint, tokenProgram);
  const keys = createDestinationAta
    // owner/fee-payer, source ATA, destination ATA, destination owner, mint, system, token, ATA program
    ? [owner, fromAta, toAta, toOwner, mint, PROGRAMS.system, tokenProgram, PROGRAMS.associatedToken]
    // owner/fee-payer, source ATA, destination ATA, mint, token program
    : [owner, fromAta, toAta, mint, tokenProgram];
  // With a single signer, unsigned keys before the readonly tail are writable.
  // create ATA: fromAta+toAta writable, toOwner+mint+system+token+ATA-program readonly.
  // transfer only: fromAta+toAta writable, mint+token readonly.
  keys.readonlyUnsigned = createDestinationAta ? 5 : 2;

  const instructions = [];
  if (createDestinationAta) {
    instructions.push({
      programIdIndex: 7,
      accounts: [0, 2, 3, 4, 5, 6],
      data: Buffer.alloc(0),
    });
    instructions.push({
      programIdIndex: 6,
      accounts: [1, 4, 2, 0],
      data: Buffer.concat([Buffer.from([12]), u64le(amount), Buffer.from([decimals])]),
    });
  } else {
    instructions.push({
      programIdIndex: 4,
      accounts: [1, 3, 2, 0],
      data: Buffer.concat([Buffer.from([12]), u64le(amount), Buffer.from([decimals])]),
    });
  }

  const message = compileMessage({ payer: owner, keys, recentBlockhash, instructions });
  return serializeTx([signLegacyMessage(fromWallet, message)], message);
}

export async function sendSol({ client, fromWallet, to, lamports }) {
  const blockhash = await client.getLatestBlockhash();
  const tx = buildSolTransfer({ fromWallet, to, lamports, recentBlockhash: blockhash });
  return client.sendRawTransaction(tx);
}

// Send a fixed amount of an SPL token from one wallet to an owner, auto-creating
// the destination ATA (paid by the sender) when it doesn't exist yet.
export async function sendSplToken({ client, fromWallet, toOwner, amount, mint = VALORA.mint, decimals = VALORA.decimals, tokenProgram = VALORA_TOKEN_PROGRAM }) {
  const amt = BigInt(amount);
  if (amt <= 0n) return { ok: false, skipped: true, reason: 'zero_amount', amount: 0n };
  const fromAta = associatedTokenAddress(fromWallet.publicKey, mint, tokenProgram);
  const bal = await client.getTokenBalanceByAta(fromAta);
  if (bal.amount < amt) {
    return { ok: false, skipped: true, reason: 'insufficient_token', amount: 0n, have: bal.amount, want: amt };
  }
  const toAta = associatedTokenAddress(toOwner, mint, tokenProgram);
  const dest = await client.getAccountInfo(toAta);
  const blockhash = await client.getLatestBlockhash();
  const tx = buildSplTokenTransfer({
    fromWallet,
    toOwner,
    amount: amt,
    mint,
    decimals,
    tokenProgram,
    recentBlockhash: blockhash,
    createDestinationAta: !dest,
  });
  const signature = await client.sendRawTransaction(tx);
  return { ok: true, signature, amount: amt, decimals, fromAta, toAta, createdDestinationAta: !dest };
}

export async function sweepSplToken({ client, fromWallet, toOwner, mint = VALORA.mint, decimals = VALORA.decimals, tokenProgram = VALORA_TOKEN_PROGRAM, leaveBaseUnits = 0n }) {
  const fromAta = associatedTokenAddress(fromWallet.publicKey, mint, tokenProgram);
  const toAta = associatedTokenAddress(toOwner, mint, tokenProgram);
  const bal = await client.getTokenBalanceByAta(fromAta);
  const amount = bal.amount > BigInt(leaveBaseUnits) ? bal.amount - BigInt(leaveBaseUnits) : 0n;
  if (amount <= 0n) return { ok: false, skipped: true, reason: 'empty', amount: 0n, fromAta, toAta };
  const dest = await client.getAccountInfo(toAta);
  const blockhash = await client.getLatestBlockhash();
  const tx = buildSplTokenTransfer({
    fromWallet,
    toOwner,
    amount,
    mint,
    decimals,
    tokenProgram,
    recentBlockhash: blockhash,
    createDestinationAta: !dest,
  });
  const signature = await client.sendRawTransaction(tx);
  return { ok: true, signature, amount, decimals, fromAta, toAta, createdDestinationAta: !dest };
}
