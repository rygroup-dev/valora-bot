import TelegramBot from 'node-telegram-bot-api';
import { isOwner, parseCommand, ConfirmRegistry } from './control.js';
import { mainMenu, confirmKeyboard, formatStatus, welcomeText, helpText } from './ui.js';

// Owner-only Telegram control surface with inline-keyboard UI.
// Commands work as slash commands AND as tappable buttons. Commands address
// agents by label (default: all). Risky actions request inline confirmation.
export class Bot {
  constructor({ token, owners, agents, log = console.log }) {
    this.owners = owners;
    this.agents = agents; // Map<label, Agent>
    this.log = log;
    this.confirms = new ConfirmRegistry();
    this.tg = token ? new TelegramBot(token, { polling: true }) : null;
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
      this._run(chatId, parsed.cmd, parsed.arg).catch((e) => this.send(chatId, `error: ${e?.message}`));
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

  async _run(chatId, cmd, arg, editMsgId) {
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
