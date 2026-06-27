import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Wallet } from '../src/wallet/Wallet.js';

// A deterministic 64-byte secret key for tests
const kp = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
const secret64 = new Uint8Array(64);
secret64.set(kp.secretKey); // tweetnacl secretKey is already 64 bytes
const base58Secret = bs58.encode(secret64);
const jsonArray = JSON.stringify(Array.from(secret64));
const expectedPubkey = bs58.encode(kp.publicKey);

describe('Wallet key loading', () => {
  it('loads from a base58 secret key string', () => {
    const w = new Wallet({ label: 'a', key: base58Secret });
    expect(w.publicKey).toBe(expectedPubkey);
  });

  it('loads from a JSON byte-array secret key', () => {
    const w = new Wallet({ label: 'b', key: jsonArray });
    expect(w.publicKey).toBe(expectedPubkey);
  });

  it('throws on an invalid key', () => {
    expect(() => new Wallet({ label: 'x', key: 'not-a-key' })).toThrow();
  });
});

describe('Wallet.signMessage', () => {
  it('produces a base58 signature that verifies against the pubkey', () => {
    const w = new Wallet({ label: 'a', key: base58Secret });
    const message = 'Valora — sign in to play\nWallet: X\nNonce: abc123';
    const sigB58 = w.signMessage(message); // default base58
    const sig = bs58.decode(sigB58);
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      sig,
      bs58.decode(expectedPubkey),
    );
    expect(ok).toBe(true);
    expect(sig.length).toBe(64);
  });

  it('can emit a base64 signature when asked', () => {
    const w = new Wallet({ label: 'a', key: base58Secret });
    const message = 'hello';
    const sigB64 = w.signMessage(message, 'base64');
    const sig = Buffer.from(sigB64, 'base64');
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      new Uint8Array(sig),
      bs58.decode(expectedPubkey),
    );
    expect(ok).toBe(true);
  });
});
