// Read an SPL token balance for a wallet via a public Solana RPC (no auth).
// Returns the ui amount (number), 0 if no token account, or null on error.

export async function fetchTokenBalance({
  rpc = 'https://api.mainnet-beta.solana.com',
  owner,
  mint,
  fetchImpl,
} = {}) {
  const f = fetchImpl || globalThis.fetch;
  try {
    const res = await f(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [owner, { mint }, { encoding: 'jsonParsed' }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const accounts = j?.result?.value || [];
    if (!accounts.length) return 0;
    let total = 0;
    for (const a of accounts) {
      total += Number(a.account.data.parsed.info.tokenAmount.uiAmount) || 0;
    }
    return total;
  } catch {
    return null;
  }
}
