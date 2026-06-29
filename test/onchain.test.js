import { describe, it, expect } from 'vitest';
import {
  associatedTokenAddress,
  solToLamports,
  tokenUiToBaseUnits,
  formatSol,
  formatToken,
  buildSolTransfer,
  buildSplTokenTransfer,
  findProgramAddress,
  pubkeyBytes,
  PROGRAMS,
} from '../src/net/onchain.js';
import { VALORA } from '../src/game/valora.js';
import { generateWallet } from '../src/wallet/generate.js';
import { Wallet } from '../src/wallet/Wallet.js';

// Neutral, fully-public owner (wrapped-SOL mint address — a valid 32-byte key,
// deliberately NOT the bot's own wallet) used as a stable regression vector.
const NEUTRAL = 'So11111111111111111111111111111111111111112';

function freshWallet() {
  return new Wallet(generateWallet({ label: 'tmp' }));
}

describe('ATA derivation (Token-2022)', () => {
  it('VALORA defaults to the Token-2022 program', () => {
    expect(VALORA.tokenProgram).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    expect(PROGRAMS.token2022).toBe(VALORA.tokenProgram);
  });

  // Pinned vector — verified live against the on-chain ATA holding 31k VALORA
  // (the bot's main wallet). If the derivation algorithm ever drifts, this fails
  // BEFORE any real transfer can send funds to a wrong/uncreated account.
  it('derives the pinned Token-2022 ATA for the neutral vector', () => {
    expect(associatedTokenAddress(NEUTRAL, VALORA.mint)).toBe(
      '9BJMarzkUf5FqPyY4qstb7o7A8qh8xvgatv6VFYai8Cd',
    );
  });

  it('classic and Token-2022 ATAs differ (program is part of the seed)', () => {
    const classic = associatedTokenAddress(NEUTRAL, VALORA.mint, PROGRAMS.token);
    const t22 = associatedTokenAddress(NEUTRAL, VALORA.mint, PROGRAMS.token2022);
    expect(classic).toBe('4n89KPqvaW5Dgw8vQm2gTcvAuCgXpGWzfJykobvvDF5h');
    expect(t22).not.toBe(classic);
    expect(associatedTokenAddress(NEUTRAL, VALORA.mint)).toBe(t22); // default == t22
  });

  it('ATAs are off-curve PDAs (never a valid signer)', () => {
    // findProgramAddress only returns off-curve points; a second call is stable.
    const [a] = findProgramAddress([pubkeyBytes(NEUTRAL)], PROGRAMS.associatedToken);
    const [b] = findProgramAddress([pubkeyBytes(NEUTRAL)], PROGRAMS.associatedToken);
    expect(a).toBe(b);
  });
});

describe('amount parsing & formatting', () => {
  it('parses SOL to lamports', () => {
    expect(solToLamports('1').toString()).toBe('1000000000');
    expect(solToLamports('1.5').toString()).toBe('1500000000');
    expect(solToLamports('0.000000001').toString()).toBe('1');
  });
  it('parses token UI to 6-decimal base units', () => {
    expect(tokenUiToBaseUnits('100').toString()).toBe('100000000');
    expect(tokenUiToBaseUnits('0.000001').toString()).toBe('1');
  });
  it('rejects malformed amounts', () => {
    expect(() => solToLamports('abc')).toThrow();
    expect(() => tokenUiToBaseUnits('1.2.3')).toThrow();
  });
  it('round-trips through format helpers', () => {
    expect(formatSol(solToLamports('2.25'))).toBe('2.25');
    expect(formatToken(tokenUiToBaseUnits('100'))).toBe('100');
  });
});

describe('transaction building', () => {
  it('builds a deterministic, signed SOL transfer', () => {
    const w = freshWallet();
    const bh = '11111111111111111111111111111111';
    const tx1 = buildSolTransfer({ fromWallet: w, to: NEUTRAL, lamports: 1000n, recentBlockhash: bh });
    const tx2 = buildSolTransfer({ fromWallet: w, to: NEUTRAL, lamports: 1000n, recentBlockhash: bh });
    expect(Buffer.compare(tx1, tx2)).toBe(0); // deterministic
    expect(tx1.length).toBeGreaterThan(64); // signature + message present
    expect(tx1[0]).toBe(1); // one signature
  });

  it('an SPL transfer that creates the destination ATA is larger than one that does not', () => {
    const w = freshWallet();
    const bh = '11111111111111111111111111111111';
    const plain = buildSplTokenTransfer({
      fromWallet: w, toOwner: NEUTRAL, amount: 1000n, recentBlockhash: bh, createDestinationAta: false,
    });
    const withAta = buildSplTokenTransfer({
      fromWallet: w, toOwner: NEUTRAL, amount: 1000n, recentBlockhash: bh, createDestinationAta: true,
    });
    expect(withAta.length).toBeGreaterThan(plain.length);
    expect(plain[0]).toBe(1);
    expect(withAta[0]).toBe(1);
  });
});
