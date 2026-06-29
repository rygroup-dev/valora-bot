// Minimal Solana RPC helpers used by tests/status code.
//
// The old implementation imported @solana/web3.js + @solana/spl-token solely to
// construct outbound SPL-token transfers. That dependency chain currently ships
// known audit issues. Runtime autopilot does not call token transfers; all risky
// on-chain movement is guarded elsewhere and should stay explicit-confirm only.
//
// Keep confirmation polling dependency-free. If token transfers are re-enabled,
// do it behind a fresh audited Solana client and tests for transaction building.

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

export function rpcConnection(serverUrl, authToken, { fetchImpl } = {}) {
  const endpoint = serverUrl.replace(/\/$/, '') + '/api/solana-rpc';
  const f = fetchImpl || globalThis.fetch;
  return {
    async _rpc(method, params) {
      const res = await f(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${authToken ?? ''}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`rpc_http_${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'rpc_error');
      return j.result;
    },
    async getSignatureStatuses(signatures) {
      return this._rpc('getSignatureStatuses', [signatures]);
    },
  };
}

// Disabled intentionally: production code currently never imports/calls this.
// Keeping the export avoids hard crashes for accidental imports while refusing
// to move value until the transfer builder is reimplemented with audited deps.
export async function sendTokenTransfer() {
  return { ok: false, error: 'token_transfer_disabled_security_upgrade' };
}
