import { isOwner, parseCommand, ConfirmRegistry } from './control.js';
import { mainMenu, confirmKeyboard, formatStatus, welcomeText, helpText } from './ui.js';
import { PublicApi, formatPulse, formatLeaderboard } from '../net/PublicApi.js';
import { VALORA } from '../game/valora.js';

// Tiny Telegram Bot API client using native fetch + long polling.
// Replaces node-telegram-bot-api/request stack to remove legacy dependency CVEs.
class NativeTelegramBot {
  constructor(token, { polling = false, log = console.log } = {}) {
    this.token = token;
    this.log = log;
    this.base = `https://api.telegram.org/bot${token}`;
    this.handlers = new Map();
    this.offset = 0;
    this.polling = false;
    if (polling) this.startPolling();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return this;
  }

  async _api(method, body = {}) {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      const msg = json.description || `${method} failed (${res.status})`;
      throw new Error(msg);
    }
    return json.result;
  }

  setMyCommands(commands) {
    return this._api('setMyCommands', { commands });
  }

  sendMessage(chatId, text, opts = {}) {
    return this._api('sendMessage', { chat_id: chatId, text, ...opts });
  }

  editMessageText(text, opts = {}) {
    return this._api('editMessageText', { text, ...opts });
  }

  answerCallbackQuery(id, opts = {}) {
    return this._api('answerCallbackQuery', { callback_query_id: id, ...opts });
  }

  startPolling() {
    if (this.polling) return;
    this.polling = true;
    this._pollLoop();
  }

  stopPolling() {
    this.polling = false;
  }

  async _pollLoop() {
    while (this.polling) {
      try {
        const updates = await this._api('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query'],
        });
        for (const u of updates || []) {
          this.offset = Math.max(this.offset, u.update_id + 1);
          if (u.message) this._emit('message', u.message);
          if (u.callback_query) this._emit('callback_query', u.callback_query);
        }
      } catch (e) {
        this.log(`[telegram] polling error: ${e?.message || e}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  _emit(type, payload) {
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(payload);
      } catch (e) {
        this.log(`[telegram] handler error: ${e?.message || e}`);
      }
    }
  }
}

// Owner-only Telegram control surface with inline-keyboard UI.
// Commands work as slash commands AND as tappable buttons. Commands address
// agents by label (default: all). Risky actions request inline confirmation.
export class Bot {
  constructor({ token, owners, agents, log = console.log, base = 'https://valora.gg/play', accounts = null }) {
    this.owners = owners;
    this.agents = agents; // Map<label, Agent>
    this.accounts = accounts; // AccountManager (multi-account fleet) — optional
    this.log = log;
    this.confirms = new ConfirmRegistry();
    this.api = new PublicApi({ base });
    this.tg = token ? new NativeTelegramBot(token, { polling: true, log }) : null;
    if (this.tg) {
      this._wire();
      this._setCommands();
    }
  }

  _setCommands() {
    this.tg.setMyCommands([
      { command: 'menu', description: '🎛 Control panel' },
      { command: 'status', description: '📊 Agent status' },
      { command: 'go', description: '⚡ Active mode (writes on)' },
      { command: 'observe', description: '👁 Observe mode (read-only)' },
      { command: 'stop', description: '🛑 Kill-switch' },
      { command: 'resume', description: '▶️ Resume' },
      { command: 'balance', description: '💰 Gold & wallet' },
      { command: 'dryrun', description: '🧪 Toggle dry-run' },
      { command: 'token', description: '🪙 $VALORA info & how to get it' },
      { command: 'bridge', description: '🌉 Gold ↔ $VALORA bridge status' },
      { command: 'pulse', description: '📊 Live economy' },
      { command: 'leaderboard', description: '🏆 Top players' },
      { command: 'market', description: '🛒 Item index' },
      { command: 'travel', description: '🚪 Travel to a map (e.g. /travel mine1)' },
      { command: 'subacc', description: '🧬 Create+fund+launch a sub account' },
      { command: 'genwallet', description: '🔑 Generate a sub wallet (no funding)' },
      { command: 'sendval', description: '🪙 Send $VALORA main→sub' },
      { command: 'sendsol', description: '◎ Send SOL main→sub' },
      { command: 'sweep', description: '🧹 Sweep $VALORA sub→main' },
      { command: 'help', description: 'ℹ️ Help' },
    ]).catch(() => {});
  }

  _labels() {
    return [...this.agents.keys()];
  }
  _agentsFor(arg) {
    if (!arg || arg === 'all') return [...this.agents.values()];
    const a = this.agents.get(arg);
    return a ? [a] : [];
  }

  _wire() {
    this.tg.on('message', (msg) => {
      const chatId = msg.chat.id;
      if (!isOwner(chatId, this.owners)) {
        this.tg.sendMessage(chatId, '⛔ Not authorized.').catch(() => {});
        return;
      }
      const parsed = parseCommand(msg.text || '');
      if (!parsed) return;
      this._run(chatId, parsed.cmd, parsed.arg, undefined, parsed.args).catch((e) => this.send(chatId, `error: ${e?.message}`));
    });

    this.tg.on('callback_query', (q) => {
      const chatId = q.from.id;
      if (!isOwner(chatId, this.owners)) {
        this.tg.answerCallbackQuery(q.id, { text: 'Not authorized' }).catch(() => {});
        return;
      }
      const parts = (q.data || '').split(':');
      const kind = parts[0];
      if (kind === 'ok') this.confirms.approve(parts[1]);
      else if (kind === 'no') this.confirms.decline(parts[1]);
      else if (kind === 'cmd') this._run(chatId, parts[1], parts[2], q.message?.message_id).catch(() => {});
      this.tg.answerCallbackQuery(q.id).catch(() => {});
    });
  }

  async _run(chatId, cmd, arg, editMsgId, args = [arg]) {
    const agents = this._agentsFor(arg);
    switch (cmd) {
      case 'start':
      case 'menu':
        return this.tg
          ? this.tg.sendMessage(chatId, welcomeText(this._labels()), {
              parse_mode: 'Markdown',
              reply_markup: mainMenu(this._labels()),
            }).catch(() => {})
          : this.send(chatId, welcomeText(this._labels()));
      case 'help':
        return this.send(chatId, helpText());
      case 'log': {
        if (!agents.length) return this.send(chatId, 'no such agent');
        for (const a of agents) this.send(chatId, a.logText());
        return;
      }
      case 'status': {
        if (!agents.length) return this.send(chatId, 'no such agent');
        const text = agents.map((a) => formatStatus(a.statusData())).join('\n\n');
        const opts = { parse_mode: 'Markdown', reply_markup: mainMenu(this._labels()) };
        if (editMsgId) {
          return this.tg
            .editMessageText(text, { chat_id: chatId, message_id: editMsgId, ...opts })
            .catch(() => this.tg.sendMessage(chatId, text, opts).catch(() => {}));
        }
        return this.tg.sendMessage(chatId, text, opts).catch(() => {});
      }
      case 'go':
        agents.forEach((a) => a.setMode('active'));
        return this.send(chatId, `⚡ active: ${agents.map((a) => a.label).join(', ')}`);
      case 'observe':
        agents.forEach((a) => a.setMode('observe'));
        return this.send(chatId, `👁 observe: ${agents.map((a) => a.label).join(', ')}`);
      case 'stop':
        agents.forEach((a) => a.kill('telegram'));
        return this.send(chatId, `🛑 stopped: ${agents.map((a) => a.label).join(', ')}`);
      case 'resume':
        agents.forEach((a) => a.resume());
        return this.send(chatId, `▶️ resumed: ${agents.map((a) => a.label).join(', ')}`);
      case 'dryrun': {
        const states = agents.map((a) => `${a.label}=${a.toggleDryRun() ? 'on' : 'off'}`);
        return this.send(chatId, `🧪 dry-run: ${states.join(', ')}`);
      }
      case 'balance':
        for (const a of agents) this.send(chatId, await a.balanceText());
        if (!agents.length) this.send(chatId, 'no such agent');
        return;
      case 'token': {
        const a = agents[0] || [...this.agents.values()][0];
        return this.send(chatId, a ? await a.tokenText() : 'no agent');
      }
      case 'bridge': {
        const a = agents[0] || [...this.agents.values()][0];
        return this.send(chatId, a ? await a.bridgeText() : 'no agent');
      }
      case 'pulse':
        return this.send(chatId, formatPulse(await this.api.pulse()));
      case 'leaderboard': {
        const kind = arg === 'arena' ? 'arena' : 'gold';
        return this.send(chatId, formatLeaderboard(kind, await this.api.leaderboard(kind, 10)));
      }
      case 'market': {
        const items = await this.api.items();
        const top = items.slice(0, 15).map((i) => `${i.emoji || '•'} ${i.name} _(${i.rarityLabel || i.rarity})_ — ${i.holders ?? '?'} holders`);
        return this.send(chatId, `🛒 *Item index* (${items.length})\n${top.join('\n') || '_no data_'}`);
      }
      case 'travel': {
        const a = agents.length ? agents[0] : [...this.agents.values()][0];
        if (!a) return this.send(chatId, 'no agent');
        const dest = arg && arg !== 'all' ? arg : 'mine1';
        this.send(chatId, `🚪 ${a.label}: attempting travel → *${dest}* (watch /log)`);
        const ok = await a.travelTo(dest);
        return this.send(chatId, ok ? `✅ ${a.label} now on *${dest}*` : `❌ ${a.label} travel to *${dest}* failed (see /log)`);
      }
      case 'genwallet': {
        if (!this.accounts) return this.send(chatId, 'multi-account not configured');
        const label = args[0];
        if (!label) return this.send(chatId, 'usage: `/genwallet <label>`');
        try {
          const r = this.accounts.generate(label);
          return this.send(chatId, `🔑 sub wallet *${r.label}* created\n\`${r.pubkey}\`\n\nFund + launch: \`/subacc ${r.label}\`  ·  or just fund: \`/sendval ${r.label} ${VALORA.gateHold + 10}\``);
        } catch (e) {
          return this.send(chatId, `❌ ${e.message}`);
        }
      }
      case 'sendsol': {
        if (!this.accounts) return this.send(chatId, 'multi-account not configured');
        const [label, amt] = args;
        if (!label || !amt) return this.send(chatId, 'usage: `/sendsol <label> <amount>`');
        const to = this.accounts.walletStore.get(label);
        if (!to) return this.send(chatId, `no wallet \`${label}\``);
        const conf = await this.requestConfirm({ label: 'treasury', action: 'send SOL (on-chain)', detail: `${amt} SOL → ${label}\n\`${to.publicKey}\`` });
        if (!conf.confirmed) return this.send(chatId, '✋ cancelled');
        try {
          const r = await this.accounts.fundSol(label, amt);
          return this.send(chatId, `✅ sent *${r.sol} SOL* → *${label}*\n🔗 https://solscan.io/tx/${r.signature}`);
        } catch (e) {
          return this.send(chatId, `❌ send failed: ${e.message}`);
        }
      }
      case 'sendval': {
        if (!this.accounts) return this.send(chatId, 'multi-account not configured');
        const [label, amt] = args;
        if (!label || !amt) return this.send(chatId, 'usage: `/sendval <label> <amount>`');
        const to = this.accounts.walletStore.get(label);
        if (!to) return this.send(chatId, `no wallet \`${label}\``);
        const conf = await this.requestConfirm({ label: 'treasury', action: 'send $VALORA (on-chain)', detail: `${amt} VALORA → ${label}\n\`${to.publicKey}\`` });
        if (!conf.confirmed) return this.send(chatId, '✋ cancelled');
        try {
          const r = await this.accounts.fundVal(label, amt);
          if (!r.ok) return this.send(chatId, `❌ not sent (${r.reason})`);
          return this.send(chatId, `✅ sent *${r.ui} VALORA* → *${label}*${r.createdDestinationAta ? ' (created ATA)' : ''}\n🔗 https://solscan.io/tx/${r.signature}`);
        } catch (e) {
          return this.send(chatId, `❌ send failed: ${e.message}`);
        }
      }
      case 'sweep': {
        if (!this.accounts) return this.send(chatId, 'multi-account not configured');
        const [label, leaveArg] = args;
        if (!label) return this.send(chatId, `usage: \`/sweep <label> [leave=${VALORA.gateHold}]\``);
        const from = this.accounts.walletStore.get(label);
        if (!from) return this.send(chatId, `no wallet \`${label}\``);
        const leave = leaveArg != null ? Number(leaveArg) : VALORA.gateHold;
        const conf = await this.requestConfirm({ label: 'treasury', action: 'sweep $VALORA (on-chain)', detail: `${label} → main\nleaving ${leave} VALORA on the sub` });
        if (!conf.confirmed) return this.send(chatId, '✋ cancelled');
        try {
          const r = await this.accounts.sweepVal(label, leave);
          if (!r.ok && r.reason === 'no_sol') return this.send(chatId, `⛽ *${label}* has no SOL to pay the sweep fee.\n${r.hint}`);
          if (!r.ok) return this.send(chatId, `ℹ️ nothing to sweep (${r.reason})`);
          return this.send(chatId, `✅ swept *${r.ui} VALORA* ${label} → main\n🔗 https://solscan.io/tx/${r.signature}`);
        } catch (e) {
          return this.send(chatId, `❌ sweep failed: ${e.message}`);
        }
      }
      case 'subacc': {
        if (!this.accounts) return this.send(chatId, 'multi-account not configured');
        const [label, valArg] = args;
        if (!label) return this.send(chatId, 'usage: `/subacc <label> [valoraAmount]`');
        const val = valArg != null ? Number(valArg) : VALORA.gateHold + 10;
        const conf = await this.requestConfirm({ label: 'treasury', action: 'create sub account', detail: `generate \`${label}\`, send ${val} VALORA from main, then go live on a standard server` });
        if (!conf.confirmed) return this.send(chatId, '✋ cancelled');
        this.send(chatId, `🧬 creating *${label}* …`);
        try {
          const r = await this.accounts.createSub(label, valArg != null ? { val } : {});
          if (!r.ok) {
            return this.send(chatId, `❌ *${label}*: ${r.step} failed (${r.reason})\nwallet exists \`${r.pubkey}\` — top up main, then \`/sendval ${label} ${val}\` + \`/subacc ${label}\``);
          }
          const liveLine = r.confirmed
            ? `✅ *${label}* is LIVE on a standard server`
            : `🟡 *${label}* created & funded — VALORA still confirming on-chain; it auto-retries the gate every 45s and goes live once it lands`;
          return this.send(chatId, `${liveLine}\n\`${r.pubkey}\`\n💰 funded *${r.val} VALORA*${r.sol ? ` + ${r.sol} SOL` : ''}\n🔗 https://solscan.io/tx/${r.valSig}\n\nIt plays with the same smart/profitable brain as main.\n_To sweep profit back later it needs a little SOL for fees: /sendsol ${label} 0.002_`);
        } catch (e) {
          return this.send(chatId, `❌ ${e.message}`);
        }
      }
      default:
        return this.send(chatId, `unknown command: ${cmd}`);
    }
  }

  // Risky-action approval requested by an agent.
  async requestConfirm({ label, action, detail }) {
    if (!this.tg || !this.owners.length) return { confirmed: false };
    const { id, promise } = this.confirms.create({ action, detail });
    const text = `⚠️ *Confirm action*\n\n🤖 agent: \`${label}\`\n🔧 action: *${action}*\n${detail ? `📋 ${detail}` : ''}`;
    const opts = { parse_mode: 'Markdown', reply_markup: confirmKeyboard(id) };
    for (const owner of this.owners) this.tg.sendMessage(owner, text, opts).catch(() => {});
    return promise;
  }

  send(chatId, text) {
    if (this.tg) this.tg.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(() => this.tg.sendMessage(chatId, text).catch(() => {}));
    else this.log(`[tg:${chatId}] ${text}`);
  }

  broadcast(text) {
    for (const owner of this.owners) this.send(owner, text);
  }
}
