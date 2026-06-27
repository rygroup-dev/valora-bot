// Pure presentation helpers for the Telegram UI (tested separately from wiring).

export function modeBadge(mode, dryRun) {
  const base = mode === 'active' ? '⚡ ACTIVE' : '👁 OBSERVE';
  return dryRun ? `${base} · 🧪 dry-run` : base;
}

function btn(text, label, cmd) {
  return { text, callback_data: `cmd:${cmd}:${label}` };
}

// Per-agent control row.
export function agentRow(label) {
  return [
    btn(`📊 ${label}`, label, 'status'),
    btn('⚡', label, 'go'),
    btn('👁', label, 'observe'),
    btn('🛑', label, 'stop'),
  ];
}

// Full menu: global controls + a row per agent.
export function mainMenu(labels = []) {
  const rows = [
    [btn('📊 Status', 'all', 'status'), btn('💰 Balance', 'all', 'balance')],
    [btn('⚡ Start farming', 'all', 'go'), btn('👁 Watch only', 'all', 'observe')],
    [btn('🛑 Stop', 'all', 'stop'), btn('▶️ Resume', 'all', 'resume')],
    [btn('🧪 Safe-test mode', 'all', 'dryrun'), btn('📜 Activity log', 'all', 'log')],
    [btn('🪙 $VALORA', 'all', 'token'), btn('🌉 Bridge', 'all', 'bridge'), btn('📊 Economy', 'all', 'pulse')],
    [btn('❓ Help / Guide', 'all', 'help'), btn('🔄 Refresh', 'all', 'menu')],
  ];
  for (const l of labels) rows.push(agentRow(l));
  return { inline_keyboard: rows };
}

export function confirmKeyboard(id) {
  return {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `ok:${id}` },
      { text: '❌ Decline', callback_data: `no:${id}` },
    ]],
  };
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : n);

export function formatStatus(s) {
  const lines = [];
  const state = s.running ? '🟢 running' : '🔴 stopped';
  const link = s.connected ? '🔌 connected' : '⚪ offline';
  lines.push(`*${s.label}* — ${state} · ${link}`);
  lines.push(`${modeBadge(s.mode, s.dryRun)}`);
  if (s.shardId) lines.push(`🗺 shard \`${s.shardId}\` · 🎯 ${s.activity || 'idle'}`);
  if (s.level != null) {
    const hp = s.hp != null && s.maxHp != null ? ` · ❤️ ${s.hp}/${s.maxHp}` : '';
    lines.push(`🧙 lvl ${s.level} · 🪙 ${fmt(s.gold ?? 0)}${hp}`);
  }
  if (s.pubkey) lines.push(`👛 \`${s.pubkey.slice(0, 8)}…${s.pubkey.slice(-4)}\``);
  return lines.join('\n');
}

export function welcomeText(labels) {
  return [
    '🛡 *VALORA SENTINEL*',
    '_Your automated Valora farming bot._',
    '',
    `🤖 Managing *${labels.length}* wallet(s): ${labels.map((l) => `\`${l}\``).join(', ')}`,
    '',
    '*What it does:* signs in with your Solana wallet, joins the best',
    'server your token-hold qualifies for, then farms — combat, gathering,',
    'quests, crafting & economy — to grow gold and your character.',
    '',
    '👇 *Tap a button below.* New here? Press *❓ Help / Guide*.',
    '',
    '🔒 _Any action that spends tokens/gold asks you to Approve first._',
  ].join('\n');
}

// Plain-language guide to every control.
export function helpText() {
  return [
    '📖 *VALORA SENTINEL — GUIDE*',
    '',
    '*The two main modes:*',
    '👁 *Watch only* (`/observe`) — bot connects and watches the game but',
    '   makes *no* moves. Safe. This is the default.',
    '⚡ *Start farming* (`/go`) — bot plays actively (fights, gathers, etc.).',
    '',
    '*Buttons & commands:*',
    '📊 *Status* (`/status`) — what each bot is doing right now.',
    '💰 *Balance* (`/balance`) — gold, server tier & wallet.',
    '🛑 *Stop* (`/stop`) — emergency stop (kill-switch).',
    '▶️ *Resume* (`/resume`) — restart after a stop.',
    '🧪 *Safe-test mode* (`/dryrun`) — when ON, the bot *pretends* to act',
    '   and logs what it _would_ do, without really doing it. Great for testing.',
    '📜 *Activity log* (`/log`) — recent actions & events.',
    '🔄 *Refresh* (`/menu`) — reopen this panel.',
    '',
    '*Economy & token:*',
    '🪙 *$VALORA* (`/token`) — the game token: your balance + how to get it',
    '   (buy on pump.fun/Jupiter, or earn in-game via the Auction House).',
    '🌉 *Bridge* (`/bridge`) — gold ↔ $VALORA conversion status.',
    '📊 *Economy* (`/pulse`) — live players & circulating gold.',
    '🏆 *Top* (`/leaderboard [gold|arena]`) — richest / best players.',
    '🛒 *Market* (`/market`) — item index & holders.',
    '',
    '*Notifications you will get automatically:*',
    '• 🎉 Level ups & big gold gains',
    '• ⚔️ Fights won / lost',
    '• 🔌 Disconnects & reconnects',
    '• ⚠️ Errors or anything needing your approval',
    '',
    '💡 *Typical first run:* keep *Safe-test mode ON*, tap *Start farming*,',
    'watch the *Activity log*. Happy? Turn *Safe-test mode OFF* to play for real.',
  ].join('\n');
}
