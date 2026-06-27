import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { WalletStore } from '../src/wallet/WalletStore.js';

function key(seedByte) {
  const kp = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(seedByte));
  return bs58.encode(kp.secretKey);
}

describe('WalletStore', () => {
  it('loads multiple wallets from an inline JSON array', () => {
    const json = JSON.stringify([
      { label: 'main', key: key(1) },
      { label: 'sub1', key: key(2) },
    ]);
    const store = WalletStore.fromConfig({ WALLETS: json });
    expect(store.size).toBe(2);
    expect(store.labels()).toEqual(['main', 'sub1']);
    expect(store.get('main').publicKey).not.toBe(store.get('sub1').publicKey);
  });

  it('auto-labels entries missing a label', () => {
    const json = JSON.stringify([{ key: key(3) }, { key: key(4) }]);
    const store = WalletStore.fromConfig({ WALLETS: json });
    expect(store.labels()).toEqual(['wallet1', 'wallet2']);
  });

  it('skips duplicate pubkeys (same key twice)', () => {
    const k = key(5);
    const json = JSON.stringify([
      { label: 'a', key: k },
      { label: 'b', key: k },
    ]);
    const store = WalletStore.fromConfig({ WALLETS: json });
    expect(store.size).toBe(1);
  });

  it('throws a clear error when no wallets are configured', () => {
    expect(() => WalletStore.fromConfig({})).toThrow(/no wallets/i);
  });

  it('throws when a wallet key is invalid', () => {
    const json = JSON.stringify([{ label: 'bad', key: 'nope' }]);
    expect(() => WalletStore.fromConfig({ WALLETS: json })).toThrow();
  });

  it('iterates all wallets via .all()', () => {
    const json = JSON.stringify([{ label: 'm', key: key(6) }, { label: 's', key: key(7) }]);
    const store = WalletStore.fromConfig({ WALLETS: json });
    expect(store.all().map((w) => w.label)).toEqual(['m', 's']);
  });
});
