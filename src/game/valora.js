// $VALORA token facts and how to obtain it (on-chain + in-game).
export const VALORA = {
  symbol: 'VALORA',
  mint: 'Fco8LmvTwsWi5A3TEhd9vQUnQ2BmVpYG4RjXatGUpump', // pump.fun launch, 6 decimals
  // VALORA is a Token-2022 mint (verified on-chain: owner program TokenzQdB…).
  // Using the classic Tokenkeg program here derives the WRONG ATA → lost funds.
  tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  decimals: 6,
  gateHold: 100, // min hold to play
  priorityHold: 30000, // min hold for the priority shard
  links: {
    pumpfun: 'https://pump.fun/coin/Fco8LmvTwsWi5A3TEhd9vQUnQ2BmVpYG4RjXatGUpump',
    jupiter: 'https://jup.ag/swap/SOL-Fco8LmvTwsWi5A3TEhd9vQUnQ2BmVpYG4RjXatGUpump',
    solscan: 'https://solscan.io/token/Fco8LmvTwsWi5A3TEhd9vQUnQ2BmVpYG4RjXatGUpump',
  },
};

// Human-readable "how to get $VALORA" guide for Telegram.
export function tokenGuide(balance) {
  const bal = balance == null ? null : Number(balance);
  const tier =
    bal == null
      ? ''
      : bal >= VALORA.priorityHold
        ? `\n✅ You hold *${bal.toLocaleString()}* — qualifies for the 👑 *priority* server.`
        : bal >= VALORA.gateHold
          ? `\n✅ You hold *${bal.toLocaleString()}* — enough to play (standard servers).`
          : `\n⚠️ You hold *${bal.toLocaleString()}* — need ≥${VALORA.gateHold} to play.`;
  return [
    '🪙 *$VALORA — the game token*',
    `Contract: \`${VALORA.mint}\``,
    '_Solana SPL token (6 decimals), launched on pump.fun._',
    tier,
    '',
    '*How to GET it:*',
    '',
    '🛒 *Buy on-chain* (fastest):',
    `• pump.fun → ${VALORA.links.pumpfun}`,
    `• Jupiter → ${VALORA.links.jupiter}`,
    '',
    '🎮 *Earn it in-game:*',
    '• *Auction House (HDV)* — list items "For sale ($VALORA)". When another',
    '  player buys, $VALORA is paid straight to your wallet (5% treasury fee).',
    '• Farm the *gather → craft → sell* loop for Gold, then convert via the',
    '  gold→$VALORA bridge when it is enabled.',
    '',
    '*Hold tiers:* 100 to play · 30,000 for the priority server.',
  ].filter(Boolean).join('\n');
}
