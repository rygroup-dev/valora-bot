// Pure presentation helpers for the Telegram UI (tested separately from wiring).

export function modeBadge(mode, dryRun) {
  if (dryRun) return '🧪 SAFE TEST';
  return mode === 'active' ? '⚡ FARMING' : '⏸ READY';
}

function btn(text, label, cmd) {
  return { text, callback_data: `cmd:${cmd}:${label}` };
}

// Per-agent control row.
export function agentRow(label) {
  return [
    btn(`📊 ${label}`, label, 'status'),
    btn('▶️ Farm', label, 'go'),
    btn('🛑 Stop', label, 'stop'),
  ];
}

// Full menu: global controls + a row per agent.
export function mainMenu(labels = []) {
  const rows = [
    [btn('📊 Status', 'all', 'status'), btn('💰 Balance', 'all', 'balance')],
    [btn('▶️ Start Farming', 'all', 'go'), btn('🛑 Stop', 'all', 'stop')],
    [btn('📜 Activity Log', 'all', 'log'), btn('🔄 Refresh', 'all', 'menu')],
    [btn('🪙 $VALORA', 'all', 'token'), btn('🌉 Bridge', 'all', 'bridge'), btn('📊 Economy', 'all', 'pulse')],
    [btn('❓ Help', 'all', 'help')],
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

function formatHp(s) {
  const hp = Number(s.hp);
  const maxHp = Number(s.maxHp);
  if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0) {
    return ` · ❤️ ${hp}/${maxHp}`;
  }
  if (String(s.activity || '').includes('recover')) return ' · ❤️ recovering';
  if (s.hp != null || s.maxHp != null) return ' · ❤️ syncing';
  return '';
}

export function formatStatus(s) {
  const lines = [];
  const state = s.running ? '🟢 running' : '🔴 stopped';
  const link = s.connected ? '🔌 connected' : '⚪ offline';
  lines.push(`*${s.label}* — ${state} · ${link}`);
  lines.push(`${modeBadge(s.mode, s.dryRun)}`);
  if (s.shardId) lines.push(`🗺 shard \`${s.shardId}\` · 🎯 ${s.activity || 'idle'}`);
  if (s.level != null) {
    const hp = formatHp(s);
    lines.push(`🧙 lvl ${s.level} · 🪙 ${fmt(s.gold ?? 0)}${hp}`);
  }
  if (s.quest) lines.push(`📜 quest: \`${s.quest}\``);
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
    '👇 *Tap a button below.* New here? Press *❓ Help*.',
    '',
    '🔒 _Any action that spends tokens/gold asks you to Approve first._',
  ].join('\n');
}

// Plain-language guide to every control.
export function helpText() {
  return [
    '📖 *VALORA SENTINEL — GUIDE*',
    '',
    '*Buttons & commands:*',
    '▶️ *Start Farming* (`/go`) — bot plays actively (fights, gathers, etc.).',
    '🛑 *Stop* (`/stop`) — emergency stop (kill-switch). Tap *Start Farming* to resume.',
    '📊 *Status* (`/status`) — what each bot is doing right now.',
    '💰 *Balance* (`/balance`) — gold, server tier & wallet.',
    '📜 *Activity Log* (`/log`) — recent actions & events.',
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
    '💡 *Tip:* tap *Start Farming* to begin. Use *Stop* only as a kill-switch.',
  ].join('\n');
}
