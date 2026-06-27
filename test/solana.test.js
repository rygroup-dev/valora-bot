import { describe, it, expect, vi } from 'vitest';
import { pollConfirmation } from '../src/net/SolanaRpc.js';

function conn(sequence) {
  let i = 0;
  return {
    getSignatureStatuses: vi.fn(async () => ({ value: [sequence[Math.min(i++, sequence.length - 1)]] })),
  };
}
const noSleep = () => Promise.resolve();

describe('pollConfirmation', () => {
  it('returns finalized when the tx finalizes', async () => {
    const c = conn([null, { confirmationStatus: 'confirmed' }, { confirmationStatus: 'finalized' }]);
    const r = await pollConfirmation(c, 'SIG', { maxTries: 10, sleep: noSleep });
    expect(r).toEqual({ status: 'finalized', signature: 'SIG' });
  });

  it('returns failed immediately when the tx errors on-chain', async () => {
    const c = conn([{ err: { InstructionError: [0, 'x'] } }]);
    const r = await pollConfirmation(c, 'SIG', { maxTries: 10, sleep: noSleep });
    expect(r.status).toBe('failed');
  });

  it('returns timeout when never finalized within maxTries', async () => {
    const c = conn([{ confirmationStatus: 'confirmed' }]);
    const r = await pollConfirmation(c, 'SIG', { maxTries: 3, sleep: noSleep });
    expect(r.status).toBe('timeout');
    expect(c.getSignatureStatuses).toHaveBeenCalledTimes(3);
  });
});
