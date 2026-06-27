// On-chain SPL token transfers.
// RPC is proxied through the game server: `${serverUrl}/api/solana-rpc` with
// the player's Bearer JWT. Transfers are confirmed by polling until finalized
// (idempotent: a given signature is checked, never blindly re-sent).

import {
  Connection,
  PublicKey,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';

// Poll signature status until finalized / failed / timeout.
export async function pollConfirmation(
  connection,
  signature,
  { maxTries = 90, intervalMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  for (let i = 0; i < maxTries; i++) {
    const st = (await connection.getSignatureStatuses([signature])).value[0];
    if (st?.err) return { status: 'failed', signature, err: st.err };
    if (st?.confirmationStatus === 'finalized') return { status: 'finalized', signature };
    if (i < maxTries - 1) await sleep(intervalMs);
  }
  return { status: 'timeout', signature };
}

function rpcConnection(serverUrl, authToken) {
  const endpoint = serverUrl.replace(/\/$/, '') + '/api/solana-rpc';
  return new Connection(endpoint, {
    commitment: 'confirmed',
    httpHeaders: { Authorization: `Bearer ${authToken ?? ''}` },
  });
}

function keypairFromWallet(wallet) {
  return Keypair.fromSecretKey(Uint8Array.from(wallet.secretKeyBytes));
}

// Build + send a multi-recipient transferChecked tx (e.g. HDV buy: seller + treasury).
// `transfers`: [{ destAta, destOwner, amount }]. Returns { ok, signature } or { ok:false, error }.
export async function sendTokenTransfer(
  { serverUrl, authToken, wallet, mint, programId, decimals, transfers },
  { log = () => {} } = {},
) {
  try {
    const connection = rpcConnection(serverUrl, authToken);
    const mintPk = new PublicKey(mint);
    const programPk = new PublicKey(programId);
    const buyer = new PublicKey(wallet.publicKey);
    const buyerAta = getAssociatedTokenAddressSync(mintPk, buyer, false, programPk);

    const ix = [];
    for (const t of transfers) {
      const destAta = new PublicKey(t.destAta);
      ix.push(
        createAssociatedTokenAccountIdempotentInstruction(
          buyer,
          destAta,
          new PublicKey(t.destOwner),
          mintPk,
          programPk,
        ),
      );
    }
    for (const t of transfers) {
      ix.push(
        createTransferCheckedInstruction(
          buyerAta,
          mintPk,
          new PublicKey(t.destAta),
          buyer,
          BigInt(t.amount),
          decimals,
          [],
          programPk,
        ),
      );
    }

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    const msg = new TransactionMessage({
      payerKey: buyer,
      recentBlockhash: blockhash,
      instructions: ix,
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([keypairFromWallet(wallet)]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    log(`[solana] sent ${signature}`);
    const conf = await pollConfirmation(connection, signature);
    if (conf.status === 'finalized') return { ok: true, signature };
    return { ok: false, error: `tx_${conf.status}`, signature };
  } catch (e) {
    return { ok: false, error: e?.message || 'tx_error' };
  }
}
